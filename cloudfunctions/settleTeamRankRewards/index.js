/**
 * 周日 9:00（UTC+8）检查周榜前 5，结算上一自然周（周日~周六）并发放传奇气球
 */
const cloud = require('wx-server-sdk')
const { ok, fail } = require('./response.js')
const {
  LEAVE_TIME_ACTIVE,
  SETTLED_AT_NONE,
  GRANT_TIME_NONE,
  chinaParts,
  getPreviousWeekPeriod,
  pickLegendBalloonIds,
  grantBalloonInventory
} = require('./team-utils.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const TOP_N = 5

function rewardCountForRank(rank) {
  return rank === 1 ? 2 : 1
}

exports.main = async (event) => {
  try {
    const now = Date.now()
    const parts = chinaParts(now)
    const manualKey = event && event.periodKey ? String(event.periodKey) : ''

    if (!manualKey) {
      if (parts.dow !== 0 || parts.hour < 9) {
        return ok({ skipped: true, reason: '非周日 9:00 结算窗口' }, 'skipped')
      }
    }

    const period = manualKey
      ? { periodKey: manualKey }
      : getPreviousWeekPeriod(now)
    const periodKey = period.periodKey

    const statsRes = await db.collection('team_period_stats')
      .where({ periodKey, settled: false })
      .orderBy('totalClears', 'desc')
      .limit(TOP_N)
      .get()

    const topTeams = statsRes.data || []
    if (!topTeams.length) {
      return ok({ periodKey, settledTeams: 0 }, '无待结算数据')
    }

    let grantedUsers = 0
    const results = []

    for (let i = 0; i < topTeams.length; i++) {
      const stat = topTeams[i]
      const rank = i + 1
      const teamId = stat.teamId
      const balloonCount = rewardCountForRank(rank)
      const balloonIds = pickLegendBalloonIds(balloonCount)

      const membersRes = await db.collection('team_members').where({
        teamId,
        leaveTime: LEAVE_TIME_ACTIVE
      }).get()
      const members = membersRes.data || []

      await db.runTransaction(async (transaction) => {
        const statFresh = await transaction.collection('team_period_stats').where({
          teamId,
          periodKey
        }).get()
        if (!statFresh.data.length || statFresh.data[0].settled) return

        await transaction.collection('team_period_stats').doc(statFresh.data[0]._id).update({
          data: {
            settled: true,
            settledAt: String(now),
            rank
          }
        })

        for (const m of members) {
          const exist = await transaction.collection('team_rank_rewards').where({
            openid: m.openid,
            periodKey
          }).get()
          if (exist.data.length) continue

          await transaction.collection('team_rank_rewards').add({
            data: {
              openid: m.openid,
              teamId,
              periodKey,
              rank,
              balloonIds,
              status: 'pending',
              grantTime: GRANT_TIME_NONE
            }
          })

          for (let b = 0; b < balloonIds.length; b++) {
            await grantBalloonInventory(transaction, db, _, m.openid, balloonIds[b], 1)
          }

          const rewardRow = await transaction.collection('team_rank_rewards').where({
            openid: m.openid,
            periodKey
          }).get()
          if (rewardRow.data.length) {
            await transaction.collection('team_rank_rewards').doc(rewardRow.data[0]._id).update({
              data: {
                status: 'granted',
                grantTime: String(now)
              }
            })
          }
        }
      })

      grantedUsers += members.length
      results.push({ teamId, rank, members: members.length, balloonIds })
    }

    return ok({
      periodKey,
      settledTeams: topTeams.length,
      grantedUsers,
      results
    }, '结算完成')
  } catch (e) {
    console.error('[settleTeamRankRewards]', e)
    return fail(e.message || String(e))
  }
}
