/**
 * 账号注销：删除当前 OPENID 关联的全部云端数据
 * - 用户资料、库存、订单、反馈、礼物
 * - 战队：队长自动解散；队员自动退队
 * - 待领取礼物（toOpenid=本人）：退回赠送人后再删
 */
const cloud = require('wx-server-sdk')
const { ok, fail } = require('./response.js')
const { restoreSenderInventory } = require('./gift-utils.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const LEAVE_TIME_ACTIVE = '0'
const BATCH = 100

async function removeWhere(collection, where) {
  let removed = 0
  while (true) {
    const res = await db.collection(collection).where(where).limit(BATCH).get()
    const rows = res.data || []
    if (!rows.length) break
    for (const row of rows) {
      await db.collection(collection).doc(row._id).remove()
      removed++
    }
    if (rows.length < BATCH) break
  }
  return removed
}

async function resolveTeamMembership(openid) {
  const memRes = await db.collection('team_members').where({
    openid,
    leaveTime: LEAVE_TIME_ACTIVE
  }).limit(1).get()
  const member = memRes.data[0]
  if (!member) return null

  const teamId = member.teamId
  const now = Date.now()

  if (member.role === 'leader') {
    await db.runTransaction(async (transaction) => {
      const teamRes = await transaction.collection('teams').where({ teamId }).get()
      if (teamRes.data.length) {
        await transaction.collection('teams').doc(teamRes.data[0]._id).update({
          data: { status: 'dissolved', updatedAt: now }
        })
      }
      const allMem = await transaction.collection('team_members').where({
        teamId,
        leaveTime: LEAVE_TIME_ACTIVE
      }).get()
      for (const m of allMem.data) {
        await transaction.collection('team_members').doc(m._id).update({
          data: { leaveTime: String(now) }
        })
      }
    })
    return { action: 'disbanded', teamId }
  }

  await db.runTransaction(async (transaction) => {
    await transaction.collection('team_members').doc(member._id).update({
      data: { leaveTime: String(now) }
    })
    const teamRes = await transaction.collection('teams').where({ teamId }).get()
    if (teamRes.data.length) {
      await transaction.collection('teams').doc(teamRes.data[0]._id).update({
        data: {
          memberCount: _.inc(-1),
          updatedAt: now
        }
      })
    }
  })
  return { action: 'left', teamId }
}

async function returnPendingGiftsToSenders(openid) {
  let returned = 0
  while (true) {
    const res = await db.collection('gifts').where({
      toOpenid: openid,
      status: 'pending'
    }).limit(BATCH).get()
    const rows = res.data || []
    if (!rows.length) break

    for (const gift of rows) {
      try {
        await db.runTransaction(async (transaction) => {
          const fresh = await transaction.collection('gifts').doc(gift._id).get()
          const row = fresh.data
          if (!row || row.status !== 'pending') return

          await transaction.collection('gifts').doc(gift._id).update({
            data: {
              status: 'expired',
              expiredAt: Date.now(),
              expireReason: 'recipient_account_deleted'
            }
          })

          if (row.fromOpenid && row.fromOpenid !== openid) {
            await restoreSenderInventory(
              transaction, db, _, row.fromOpenid, row.balloonId, row.count || 1
            )
          }
        })
        returned++
      } catch (e) {
        console.warn('[deleteUserData] return gift', gift.giftId, e)
      }
    }

    if (rows.length < BATCH) break
  }
  return returned
}

async function deleteFeedbackFiles(openid) {
  const fileIds = []
  let skip = 0
  while (true) {
    const res = await db.collection('user_feedback').where({ openid }).skip(skip).limit(BATCH).get()
    const rows = res.data || []
    if (!rows.length) break
    for (const row of rows) {
      if (row.imageFileId && typeof row.imageFileId === 'string') {
        fileIds.push(row.imageFileId)
      }
    }
    skip += rows.length
    if (rows.length < BATCH) break
  }
  if (!fileIds.length) return 0
  let deleted = 0
  for (let i = 0; i < fileIds.length; i += 50) {
    try {
      const chunk = fileIds.slice(i, i + 50)
      await cloud.deleteFile({ fileList: chunk })
      deleted += chunk.length
    } catch (e) {
      console.warn('[deleteUserData] deleteFile chunk', e)
    }
  }
  return deleted
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return fail('未登录')

  if (!event || event.confirm !== true) {
    return fail('请确认注销操作（confirm: true）')
  }

  const stats = {
    team: null,
    giftsReturned: 0,
    feedbackFiles: 0,
    removed: {}
  }

  try {
    stats.team = await resolveTeamMembership(openid)
    stats.giftsReturned = await returnPendingGiftsToSenders(openid)
    stats.feedbackFiles = await deleteFeedbackFiles(openid)

    const collections = [
      ['users', { openid }],
      ['balloon_inventory', { openid }],
      ['orders', { openid }],
      ['order_list', { openid }],
      ['user_feedback', { openid }],
      ['team_members', { openid }],
      ['team_daily_actions', { openid }],
      ['team_rank_rewards', { openid }],
      ['team_clear_logs', { openid }],
      ['team_invites', { fromOpenid: openid }],
      ['gifts', { fromOpenid: openid }],
      ['gifts', { toOpenid: openid }]
    ]

    for (const [name, where] of collections) {
      stats.removed[name] = (stats.removed[name] || 0) + await removeWhere(name, where)
    }

    return ok(stats, '账号已注销，云端数据已删除')
  } catch (e) {
    console.error('[deleteUserData]', e)
    return fail(e.message || String(e), stats)
  }
}
