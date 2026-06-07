const cloud = require('wx-server-sdk')
const { ok, fail } = require('./response.js')
const {
  CLEAR_INTERVAL_MS, LEAVE_TIME_ACTIVE, getWeekPeriod, getActiveMember, ensurePeriodStats
} = require('./team-utils.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return fail('未登录')

  const isFullRun = !!(event && event.isFullRun)
  const level = event && event.level ? String(event.level) : 'level_04'

  if (!isFullRun) return fail('仅完整4关通关可计分')

  try {
    const member = await getActiveMember(db, openid)
    if (!member) return fail('未加入战队，不计入战队积分')

    const since = Date.now() - CLEAR_INTERVAL_MS
    const recent = await db.collection('team_clear_logs').where({
      openid,
      isFullRun: true,
      clearTime: _.gte(since)
    }).limit(1).get()
    if (recent.data.length) return fail('通关计分间隔不足10分钟')

    const teamId = member.teamId
    const now = Date.now()
    const period = getWeekPeriod(now)

    await db.runTransaction(async (transaction) => {
      const memRes = await transaction.collection('team_members').where({
        teamId,
        openid,
        leaveTime: LEAVE_TIME_ACTIVE
      }).get()
      if (!memRes.data.length) throw new Error('未加入战队')

      await transaction.collection('team_clear_logs').add({
        data: {
          openid,
          teamId,
          clearTime: now,
          level,
          isFullRun: true,
          accepted: true
        }
      })

      await transaction.collection('team_members').doc(memRes.data[0]._id).update({
        data: {
          periodClears: _.inc(1),
          totalClears: _.inc(1)
        }
      })

      const teamRes = await transaction.collection('teams').where({ teamId }).get()
      if (teamRes.data.length) {
        await transaction.collection('teams').doc(teamRes.data[0]._id).update({
          data: {
            periodClears: _.inc(1),
            totalClears: _.inc(1),
            updatedAt: now
          }
        })
      }

      const statsRes = await transaction.collection('team_period_stats').where({
        teamId,
        periodKey: period.periodKey
      }).get()
      if (statsRes.data.length) {
        await transaction.collection('team_period_stats').doc(statsRes.data[0]._id).update({
          data: { totalClears: _.inc(1) }
        })
      } else {
        await ensurePeriodStats(transaction, db, teamId, teamRes.data[0] && teamRes.data[0].memberCount)
        const again = await transaction.collection('team_period_stats').where({
          teamId,
          periodKey: period.periodKey
        }).get()
        if (again.data.length) {
          await transaction.collection('team_period_stats').doc(again.data[0]._id).update({
            data: { totalClears: _.inc(1) }
          })
        }
      }
    })

    return ok({ teamId, periodKey: period.periodKey }, '计分成功')
  } catch (e) {
    console.error('[recordFullClear]', e)
    return fail(e.message || String(e))
  }
}
