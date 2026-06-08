/**
 * 战队模块共用：周期（周日~周六）、日限、库存发放、查询
 */
const cloud = require('wx-server-sdk')

const MAX_MEMBERS = 20
const INVITE_TTL_MS = 24 * 3600000
const CLEAR_INTERVAL_MS = 10 * 60 * 1000
const LEAVE_TIME_ACTIVE = '0'
const SETTLED_AT_NONE = '0'
const GRANT_TIME_NONE = '0'

const LEGEND_BALLOON_IDS = [
  'legend_royal_crown', 'legend_bubble_aurora', 'legend_dazzling_spark', 'legend_trophy',
  'legend_unicorn', 'legend_love_gift', 'legend_crystal_ball', 'legend_diamond',
  'legend_galaxy_spin', 'legend_party_popper', 'legend_gift_box'
]

function chinaDateStr(ts) {
  const d = new Date((ts != null ? ts : Date.now()) + 8 * 3600000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

function chinaParts(ts) {
  const d = new Date((ts != null ? ts : Date.now()) + 8 * 3600000)
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    day: d.getUTCDate(),
    dow: d.getUTCDay(),
    hour: d.getUTCHours()
  }
}

function formatPeriodKey(y, sundayStartUtcMs) {
  const jan1Utc = Date.UTC(y, 0, 1)
  const jan1Dow = new Date(jan1Utc + 8 * 3600000).getUTCDay()
  const firstSundayUtc = jan1Utc - jan1Dow * 86400000
  const weekNum = Math.floor((sundayStartUtcMs - firstSundayUtc) / 86400000 / 7) + 1
  return y + '-W' + String(Math.max(1, weekNum)).padStart(2, '0')
}

/** 自然周：周日 00:00 ~ 周六 23:59:59.999（UTC+8） */
function getWeekPeriod(ts) {
  const now = ts != null ? ts : Date.now()
  const { y, m, day, dow } = chinaParts(now)
  const sundayUtc = Date.UTC(y, m, day - dow)
  const periodStart = sundayUtc - 8 * 3600000
  const periodEnd = periodStart + 7 * 86400000 - 1
  const periodKey = formatPeriodKey(y, sundayUtc)
  return { periodKey, periodStart, periodEnd }
}

function getPreviousWeekPeriod(ts) {
  const cur = getWeekPeriod(ts)
  return getWeekPeriod(cur.periodStart - 86400000)
}

function genTeamId() {
  return 'team_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
}

function genInviteId() {
  return 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
}

function genInviteToken() {
  return 'invite_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function pickLegendBalloonIds(count) {
  const list = []
  for (let i = 0; i < count; i++) {
    list.push(LEGEND_BALLOON_IDS[Math.floor(Math.random() * LEGEND_BALLOON_IDS.length)])
  }
  return list
}

async function getDailyActions(db, openid, date) {
  const res = await db.collection('team_daily_actions').where({ openid, date }).limit(1).get()
  return res.data[0] || null
}

async function ensureDailyActions(transaction, db, openid, date) {
  const res = await transaction.collection('team_daily_actions').where({ openid, date }).get()
  if (res.data.length) return res.data[0]
  const row = {
    openid,
    date,
    createTeamCount: 0,
    joinTeamCount: 0,
    leaveTeamCount: 0,
    renameTeamCount: 0
  }
  const addRes = await transaction.collection('team_daily_actions').add({ data: row })
  row._id = addRes && addRes._id
  if (!row._id) {
    const again = await transaction.collection('team_daily_actions').where({ openid, date }).get()
    if (again.data.length) return again.data[0]
    throw new Error('日限记录初始化失败')
  }
  return row
}

async function bumpDailyAction(transaction, db, openid, date, field, max) {
  const row = await ensureDailyActions(transaction, db, openid, date)
  const cur = (row && row[field]) || 0
  if (cur >= max) {
    throw new Error('今日操作次数已达上限')
  }
  const patch = {}
  patch[field] = cur + 1
  await transaction.collection('team_daily_actions').where({ openid, date }).update({ data: patch })
}

async function getActiveMember(db, openid) {
  const res = await db.collection('team_members').where({
    openid,
    leaveTime: LEAVE_TIME_ACTIVE
  }).limit(1).get()
  return res.data[0] || null
}

async function getTeamById(db, teamId) {
  const res = await db.collection('teams').where({ teamId }).limit(1).get()
  return res.data[0] || null
}

async function ensurePeriodStats(transaction, db, teamId, memberCountSnapshot) {
  const period = getWeekPeriod()
  const res = await transaction.collection('team_period_stats').where({
    teamId,
    periodKey: period.periodKey
  }).get()
  if (res.data.length) return res.data[0]
  const row = {
    teamId,
    periodKey: period.periodKey,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    totalClears: 0,
    memberCountSnapshot: memberCountSnapshot || 1,
    rank: 0,
    settled: false,
    settledAt: SETTLED_AT_NONE
  }
  await transaction.collection('team_period_stats').add({ data: row })
  return row
}

async function grantBalloonInventory(transaction, db, _, openid, balloonId, quantity) {
  const invRes = await transaction.collection('balloon_inventory').where({
    openid,
    balloonId
  }).get()
  const now = Date.now()
  if (invRes.data.length > 0) {
    await transaction.collection('balloon_inventory').doc(invRes.data[0]._id).update({
      data: {
        count: _.inc(quantity),
        source: 'purchase',
        giftable: true,
        updatedAt: now
      }
    })
    return
  }
  await transaction.collection('balloon_inventory').add({
    data: {
      openid,
      balloonId,
      count: quantity,
      source: 'purchase',
      giftable: true,
      updatedAt: now
    }
  })
}

/** 核心入队逻辑（事务内） */
async function addMemberToTeam(transaction, db, _, params) {
  const {
    teamId, teamDoc, openid, nickName, avatar, role, date, skipJoinDailyLimit
  } = params
  if (!skipJoinDailyLimit) {
    await bumpDailyAction(transaction, db, openid, date, 'joinTeamCount', 1)
  }
  const now = Date.now()
  await transaction.collection('team_members').add({
    data: {
      teamId,
      openid,
      nickName: nickName || '微信用户',
      avatar: avatar || '',
      role: role || 'member',
      periodClears: 0,
      totalClears: 0,
      showStats: true,
      notifyOn: true,
      joinTime: now,
      leaveTime: LEAVE_TIME_ACTIVE
    }
  })
  const nextCount = (teamDoc.memberCount || 0) + 1
  await transaction.collection('teams').doc(teamDoc._id).update({
    data: {
      memberCount: nextCount,
      updatedAt: now
    }
  })
  await ensurePeriodStats(transaction, db, teamId, nextCount)
}

module.exports = {
  MAX_MEMBERS,
  INVITE_TTL_MS,
  CLEAR_INTERVAL_MS,
  LEAVE_TIME_ACTIVE,
  SETTLED_AT_NONE,
  GRANT_TIME_NONE,
  LEGEND_BALLOON_IDS,
  chinaDateStr,
  chinaParts,
  getWeekPeriod,
  getPreviousWeekPeriod,
  genTeamId,
  genInviteId,
  genInviteToken,
  pickLegendBalloonIds,
  getDailyActions,
  ensureDailyActions,
  bumpDailyAction,
  getActiveMember,
  getTeamById,
  ensurePeriodStats,
  grantBalloonInventory,
  addMemberToTeam
}
