const cloud = require('wx-server-sdk')
const { ok, fail } = require('./response.js')
const {
  chinaDateStr, getActiveMember, getTeamById, bumpDailyAction
} = require('./team-utils.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return fail('未登录')

  const name = (event && event.name ? String(event.name) : '').trim()
  if (!name || name.length < 2 || name.length > 16) return fail('战队名称需为 2-16 个字符')

  try {
    const member = await getActiveMember(db, openid)
    if (!member || member.role !== 'leader') return fail('仅队长可修改名称')

    const team = await getTeamById(db, member.teamId)
    if (!team || team.status !== 'active') return fail('战队不存在')

    const dup = await db.collection('teams').where({ name }).limit(1).get()
    if (dup.data.length && dup.data[0].teamId !== member.teamId) return fail('战队名称已存在')

    const date = chinaDateStr()
    const now = Date.now()

    await db.runTransaction(async (transaction) => {
      await bumpDailyAction(transaction, db, openid, date, 'renameTeamCount', 1)
      const teamRes = await transaction.collection('teams').where({ teamId: member.teamId }).get()
      if (!teamRes.data.length) throw new Error('战队不存在')
      await transaction.collection('teams').doc(teamRes.data[0]._id).update({
        data: { name, updatedAt: now }
      })
    })

    return ok({ teamId: member.teamId, name }, '修改成功')
  } catch (e) {
    console.error('[renameTeam]', e)
    return fail(e.message || String(e))
  }
}
