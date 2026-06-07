/**
 * 战队云函数客户端 + 云端数据同步
 */
const store = require('./store')

function _call(name, data) {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return Promise.resolve({ success: false, msg: 'wx.cloud 不可用', data: {} })
  }
  return wx.cloud.callFunction({ name, data })
    .then((res) => res.result || { success: false, msg: '空响应', data: {} })
    .catch((err) => ({
      success: false,
      msg: (err && err.errMsg) || (err && err.message) || String(err),
      data: {}
    }))
}

function _userPayload() {
  const u = store.getUser() || {}
  return {
    nickName: u.nickName || '微信用户',
    avatar: u.avatar || ''
  }
}

function _mapTeamDoc(team, members) {
  if (!team) return null
  const list = (members || []).map((m) => ({
    openid: m.openid,
    nickName: m.nickName,
    avatar: m.avatar,
    joinedAt: m.joinTime,
    isLeader: m.role === 'leader',
    periodClears: m.periodClears || 0,
    showStats: m.showStats !== false,
    notifyOn: !!m.notifyOn
  }))
  return {
    id: team.teamId,
    teamId: team.teamId,
    name: team.name,
    description: team.description || '',
    leaderId: team.leaderOpenid,
    leaderOpenid: team.leaderOpenid,
    joinType: team.joinType || 'open',
    memberCount: team.memberCount || list.length,
    maxMembers: team.maxMembers || 20,
    periodClears: team.periodClears || 0,
    totalClears: team.totalClears || 0,
    iconKey: team.iconKey,
    status: team.status,
    createdAt: team.createTime,
    members: list
  }
}

function _mapRankRow(team, stat, rank) {
  const mc = team.memberCount || 1
  const clears = (stat && stat.totalClears != null) ? stat.totalClears : (team.periodClears || 0)
  return {
    id: team.teamId,
    teamId: team.teamId,
    name: team.name,
    joinType: team.joinType || 'open',
    memberCount: mc,
    periodClears: clears,
    avgClears: mc ? Math.round(clears / mc * 100) / 100 : 0,
    rank: rank || 0,
    leaderName: team.leaderOpenid
  }
}

function _weekPeriodKey() {
  const offset = 8 * 3600000
  const d = new Date(Date.now() + offset)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  const dow = d.getUTCDay()
  const sundayUtc = Date.UTC(y, m, day - dow)
  const jan1Utc = Date.UTC(y, 0, 1)
  const jan1Dow = new Date(jan1Utc + offset).getUTCDay()
  const firstSundayUtc = jan1Utc - jan1Dow * 86400000
  const weekNum = Math.floor((sundayUtc - firstSundayUtc) / 86400000 / 7) + 1
  return y + '-W' + String(Math.max(1, weekNum)).padStart(2, '0')
}

/** 周榜 + 可加入的公开战队（仅云端真实数据） */
function _loadPublicTeamLists(db, periodKey) {
  const maxMembers = 20
  return db.collection('team_period_stats')
    .where({ periodKey })
    .orderBy('totalClears', 'desc')
    .limit(50)
    .get()
    .then((statsRes) => {
      const stats = statsRes.data || []
      const teamIds = stats.map((s) => s.teamId)
      const rankedP = teamIds.length
        ? db.collection('teams').where({
          teamId: db.command.in(teamIds),
          status: 'active'
        }).get()
        : Promise.resolve({ data: [] })
      const recommendP = db.collection('teams').where({
        status: 'active',
        joinType: 'open'
      }).limit(50).get()
      return Promise.all([rankedP, recommendP]).then(([teamsRes, openRes]) => {
        const teamMap = {}
        ;(teamsRes.data || []).forEach((t) => { teamMap[t.teamId] = t })
        const ranked = stats
          .filter((s) => teamMap[s.teamId])
          .map((s, i) => _mapRankRow(teamMap[s.teamId], s, i + 1))
        const recommend = (openRes.data || [])
          .filter((t) => (t.memberCount || 0) < (t.maxMembers || maxMembers))
          .map((t) => _mapRankRow(t, null, 0))
        return { ranked, recommend }
      })
    })
}

function _loadMyTeam(db, myMem) {
  return db.collection('teams').where({ teamId: myMem.teamId, status: 'active' }).limit(1).get()
    .then((teamRes) => {
      const teamDoc = teamRes.data && teamRes.data[0]
      if (!teamDoc) return null
      return db.collection('team_members').where({ teamId: teamDoc.teamId, leaveTime: '0' }).get()
        .then((allMem) => _mapTeamDoc(teamDoc, allMem.data || []))
    })
}

function syncTeamFromCloud() {
  if (typeof wx === 'undefined' || !wx.cloud) {
    return Promise.resolve({ ok: false })
  }
  const db = wx.cloud.database()
  const user = store.getUser() || {}
  const openid = user.openid
  if (!openid) return Promise.resolve({ ok: false })

  const periodKey = _weekPeriodKey()

  return db.collection('team_members').where({ openid, leaveTime: '0' }).limit(1).get()
    .then((memRes) => {
      const myMem = memRes.data && memRes.data[0]
      const myTeamP = myMem ? _loadMyTeam(db, myMem) : Promise.resolve(null)
      const listsP = _loadPublicTeamLists(db, periodKey)
      return Promise.all([myTeamP, listsP]).then(([team, lists]) => {
        store.applyCloudTeamSync({
          team,
          ranked: lists.ranked,
          recommend: lists.recommend,
          teamsFromCloud: true
        })
        return { ok: true, hasTeam: !!team }
      })
    })
    .catch((err) => {
      console.warn('[cloud-team.sync]', err)
      return { ok: false }
    })
}

function createTeam(payload) {
  return _call('createTeam', Object.assign({}, _userPayload(), payload || {}))
    .then((r) => syncTeamFromCloud().then(() => r))
}

function joinTeam(teamId, inviteToken) {
  return _call('joinTeam', Object.assign({ teamId, inviteToken: inviteToken || '' }, _userPayload()))
    .then((r) => syncTeamFromCloud().then(() => r))
}

function leaveTeam() {
  return _call('leaveTeam', {})
    .then((r) => syncTeamFromCloud().then(() => r))
}

function inviteToTeam(teamId) {
  return _call('inviteToTeam', { teamId })
}

function handleTeamInvite(inviteToken, action) {
  return _call('handleTeamInvite', Object.assign({ inviteToken, action: action || 'accept' }, _userPayload()))
    .then((r) => syncTeamFromCloud().then(() => r))
}

function recordFullClear(level) {
  return _call('recordFullClear', { level: level || 'level_04', isFullRun: true })
}

function renameTeam(name) {
  return _call('renameTeam', { name }).then((r) => syncTeamFromCloud().then(() => r))
}

function disbandTeam() {
  return _call('disbandTeam', {}).then((r) => syncTeamFromCloud().then(() => r))
}

module.exports = {
  syncTeamFromCloud,
  createTeam,
  joinTeam,
  leaveTeam,
  inviteToTeam,
  handleTeamInvite,
  recordFullClear,
  renameTeam,
  disbandTeam
}
