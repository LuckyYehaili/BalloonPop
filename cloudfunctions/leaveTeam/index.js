const cloud = require('wx-server-sdk')
const { ok, fail } = require('./response.js')
const {
  LEAVE_TIME_ACTIVE, chinaDateStr, getActiveMember, getTeamById, bumpDailyAction
} = require('./team-utils.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return fail('未登录')

  try {
    const member = await getActiveMember(db, openid)
    if (!member) return fail('未加入战队')
    if (member.role === 'leader') return fail('队长不可直接退队，请先转让队长或解散战队')

    const team = await getTeamById(db, member.teamId)
    if (!team) return fail('战队不存在')

    const date = chinaDateStr()
    const now = Date.now()

    await db.runTransaction(async (transaction) => {
      await bumpDailyAction(transaction, db, openid, date, 'leaveTeamCount', 1)

      const memRes = await transaction.collection('team_members').where({
        teamId: member.teamId,
        openid,
        leaveTime: LEAVE_TIME_ACTIVE
      }).get()
      if (!memRes.data.length) throw new Error('未加入战队')

      await transaction.collection('team_members').doc(memRes.data[0]._id).update({
        data: { leaveTime: String(now) }
      })

      const teamRes = await transaction.collection('teams').where({ teamId: member.teamId }).get()
      if (teamRes.data.length) {
        const t = teamRes.data[0]
        await transaction.collection('teams').doc(t._id).update({
          data: {
            memberCount: _.inc(-1),
            updatedAt: now
          }
        })
      }
    })

    return ok({ teamId: member.teamId }, '已退出战队')
  } catch (e) {
    console.error('[leaveTeam]', e)
    return fail(e.message || String(e))
  }
}
