const cloud = require('wx-server-sdk')
const { ok, fail } = require('./response.js')
const {
  LEAVE_TIME_ACTIVE, getActiveMember, getTeamById
} = require('./team-utils.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return fail('未登录')

  try {
    const member = await getActiveMember(db, openid)
    if (!member || member.role !== 'leader') return fail('仅队长可解散战队')

    const team = await getTeamById(db, member.teamId)
    if (!team || team.status !== 'active') return fail('战队不存在')

    const teamId = member.teamId
    const now = Date.now()

    await db.runTransaction(async (transaction) => {
      const teamRes = await transaction.collection('teams').where({ teamId }).get()
      if (!teamRes.data.length) throw new Error('战队不存在')
      await transaction.collection('teams').doc(teamRes.data[0]._id).update({
        data: { status: 'dissolved', updatedAt: now }
      })

      const memRes = await transaction.collection('team_members').where({
        teamId,
        leaveTime: LEAVE_TIME_ACTIVE
      }).get()
      for (const m of memRes.data) {
        await transaction.collection('team_members').doc(m._id).update({
          data: { leaveTime: String(now) }
        })
      }
    })

    return ok({ teamId }, '战队已解散')
  } catch (e) {
    console.error('[disbandTeam]', e)
    return fail(e.message || String(e))
  }
}
