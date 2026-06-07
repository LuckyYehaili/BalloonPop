const cloud = require('wx-server-sdk')
const { ok, fail } = require('./response.js')
const {
  MAX_MEMBERS, chinaDateStr, genTeamId, getActiveMember,
  bumpDailyAction, ensurePeriodStats
} = require('./team-utils.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return fail('未登录')

  const name = (event && event.name ? String(event.name) : '').trim()
  const description = (event && event.description ? String(event.description) : '').trim()
  const joinType = event && event.joinType === 'invite' ? 'invite' : 'open'
  const iconKey = event && event.iconKey ? String(event.iconKey) : 'icon_balloon_01'
  const nickName = event && event.nickName ? String(event.nickName) : '微信用户'
  const avatar = event && event.avatar ? String(event.avatar) : ''

  if (!name || name.length < 2 || name.length > 16) return fail('战队名称需为 2-16 个字符')

  try {
    const active = await getActiveMember(db, openid)
    if (active) return fail('已加入战队')

    const dup = await db.collection('teams').where({ name }).limit(1).get()
    if (dup.data.length) return fail('战队名称已存在')

    const date = chinaDateStr()
    const teamId = genTeamId()
    const now = Date.now()

    await db.runTransaction(async (transaction) => {
      await bumpDailyAction(transaction, db, openid, date, 'createTeamCount', 1)

      await transaction.collection('teams').add({
        data: {
          teamId,
          name,
          description,
          leaderOpenid: openid,
          joinType,
          memberCount: 1,
          maxMembers: MAX_MEMBERS,
          periodClears: 0,
          totalClears: 0,
          iconKey,
          status: 'active',
          createTime: now,
          updatedAt: now
        }
      })

      await transaction.collection('team_members').add({
        data: {
          teamId,
          openid,
          nickName,
          avatar,
          role: 'leader',
          periodClears: 0,
          totalClears: 0,
          showStats: true,
          notifyOn: true,
          joinTime: now,
          leaveTime: '0'
        }
      })

      await ensurePeriodStats(transaction, db, teamId, 1)
    })

    return ok({ teamId, name, joinType }, '创建成功')
  } catch (e) {
    console.error('[createTeam]', e)
    return fail(e.message || String(e))
  }
}
