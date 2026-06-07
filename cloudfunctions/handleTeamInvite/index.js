const cloud = require('wx-server-sdk')
const { ok, fail } = require('./response.js')
const {
  MAX_MEMBERS, chinaDateStr, getActiveMember, getTeamById, addMemberToTeam
} = require('./team-utils.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return fail('未登录')

  const inviteToken = event && event.inviteToken ? String(event.inviteToken) : ''
  const action = event && event.action ? String(event.action) : 'accept'
  const nickName = event && event.nickName ? String(event.nickName) : '微信用户'
  const avatar = event && event.avatar ? String(event.avatar) : ''

  if (!inviteToken) return fail('缺少 inviteToken')

  if (action === 'reject') {
    return ok({}, '已拒绝邀请')
  }

  if (action !== 'accept') return fail('无效操作')

  try {
    const active = await getActiveMember(db, openid)
    if (active) return fail('已加入战队')

    const invRes = await db.collection('team_invites').where({
      inviteToken,
      status: 'active'
    }).limit(1).get()
    if (!invRes.data.length) return fail('邀请无效或已失效')
    const inv = invRes.data[0]
    if (inv.expireTime && inv.expireTime <= Date.now()) return fail('邀请已过期')
    if ((inv.usedCount || 0) >= (inv.maxUses || 1)) return fail('邀请已使用')

    const teamId = inv.teamId
    const team = await getTeamById(db, teamId)
    if (!team || team.status !== 'active') return fail('战队不存在或已解散')
    if ((team.memberCount || 0) >= MAX_MEMBERS) return fail('战队人数已满')

    const date = chinaDateStr()

    await db.runTransaction(async (transaction) => {
      const invFresh = await transaction.collection('team_invites').where({
        inviteToken,
        status: 'active'
      }).get()
      if (!invFresh.data.length) throw new Error('邀请已失效')
      const invDoc = invFresh.data[0]

      const teamRes = await transaction.collection('teams').where({ teamId }).get()
      if (!teamRes.data.length) throw new Error('战队不存在')
      const teamDoc = teamRes.data[0]
      if (teamDoc.status !== 'active') throw new Error('战队已解散')
      if ((teamDoc.memberCount || 0) >= MAX_MEMBERS) throw new Error('战队人数已满')

      const exist = await transaction.collection('team_members').where({
        openid,
        leaveTime: '0'
      }).get()
      if (exist.data.length) throw new Error('已加入战队')

      await addMemberToTeam(transaction, db, _, {
        teamId,
        teamDoc,
        openid,
        nickName,
        avatar,
        role: 'member',
        date
      })

      await transaction.collection('team_invites').doc(invDoc._id).update({
        data: {
          status: 'used',
          usedCount: (invDoc.usedCount || 0) + 1
        }
      })
    })

    return ok({ teamId, name: team.name }, '加入成功')
  } catch (e) {
    console.error('[handleTeamInvite]', e)
    return fail(e.message || String(e))
  }
}
