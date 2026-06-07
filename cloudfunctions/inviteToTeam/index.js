const cloud = require('wx-server-sdk')
const { ok, fail } = require('./response.js')
const {
  INVITE_TTL_MS, genInviteId, genInviteToken, getActiveMember, getTeamById
} = require('./team-utils.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return fail('未登录')

  const teamId = event && event.teamId ? String(event.teamId) : ''

  try {
    const member = await getActiveMember(db, openid)
    if (!member || member.teamId !== teamId) return fail('非本队成员')
    if (member.role !== 'leader' && member.role !== 'member') return fail('无权邀请')

    const team = await getTeamById(db, teamId)
    if (!team || team.status !== 'active') return fail('战队不存在')

    const inviteId = genInviteId()
    const inviteToken = genInviteToken()
    const now = Date.now()
    const expireTime = now + INVITE_TTL_MS

    await db.collection('team_invites').add({
      data: {
        inviteId,
        teamId,
        fromOpenid: openid,
        inviteToken,
        status: 'active',
        maxUses: 1,
        usedCount: 0,
        createTime: now,
        expireTime
      }
    })

    return ok({ inviteId, inviteToken, teamId, expireTime }, '邀请已生成')
  } catch (e) {
    console.error('[inviteToTeam]', e)
    return fail(e.message || String(e))
  }
}
