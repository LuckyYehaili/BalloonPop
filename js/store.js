const STORAGE_KEY = 'balloon_hot_v2';
const { BALLOON_TYPES } = require('./balloons');

const MOCK_TEAM_NAMES = [
  '糖果冲锋队', '霓虹突击者', '熔岩霸主', '神殿守卫者',
  '气球小分队', '充气大师团', '爆炸艺术家', '传说收集者',
  '指尖风暴', '压力掌控者', '完美充气团', '粉色泡泡糖',
  '紫色闪电', '金色传说', '暗夜冲锋', '星河战队',
  '彩虹联盟', '超级充气王', '梦幻气球团', '巅峰挑战者'
];

function _generateMockTeams(count) {
  const teams = [];
  for (let i = 0; i < count; i++) {
    const memberCount = 8 + Math.floor(Math.random() * 13);
    const dailyClears = Math.floor(Math.random() * 500) + 50;
    teams.push({
      id: 'mock_team_' + (i + 1),
      name: MOCK_TEAM_NAMES[i % MOCK_TEAM_NAMES.length],
      leaderName: '玩家' + (i + 100),
      memberCount,
      dailyTotalClears: dailyClears,
      avgClears: Math.round(dailyClears / memberCount * 100) / 100,
      createdAt: Date.now() - Math.random() * 86400000 * 30
    });
  }
  return teams;
}

function getDefaultData() {
  const now = Date.now();
  const today = _todayStr();
  return {
    user: { avatar: '', nickName: '玩家', openid: 'mock_' + Math.random().toString(36).slice(2, 10), isFirstTime: true, notificationAuthorized: false, lastNotificationPrompt: 0 },
    unlockedLevels: [1],
    lastPlayedLevel: 1,
    progress: { currentLevel: 1, completedBalloons: 0, balloonIndex: 0 },
    freeRetries: { level1: 3, level2: 3, level3: 3, level4: 3 },
    fullClearCount: 0,
    lastFullClearTime: 0,
    violation: { count: 0, date: '', bannedToday: false },
    ownedBalloons: {},
    equippedLegend: { level1: null, level2: null, level3: null, level4: null },
    /** 传奇气球已在哪些关卡完成第十个（关卡号 1–4，与气球束一致） */
    legendUsedByLevel: {},
    clearHistory: [],
    /** 从本轮首次通关第 1 关起计时，至第 4 关通关写入记录后清零 */
    fullRunAnchorMs: 0,
    bouquetCollection: [],
    transactions: [],
    pendingGifts: [],
    dailyCounters: { date: today, adWatchCount: 0, giftSendCount: 0, giftReceiveCount: 0, createTeamCount: 0, joinTeamCount: 0, leaveTeamCount: 0, renameTeamCount: 0, adSkipCount: 0 },
    team: null,
    allTeams: _generateMockTeams(20),
    rankCache: [],
    settings: { soundOn: true, musicOn: true, vibrationOn: true, notificationOn: false, showStatsInTeam: true },
    _lastActiveDate: today,
    _lastRankSettleDate: '',
    _rankRewardsClaimed: {}
  };
}

function _todayStr() { const d = new Date(); const Y = d.getFullYear(); const M = String(d.getMonth()+1).padStart(2,'0'); const D = String(d.getDate()).padStart(2,'0'); return Y+'-'+M+'-'+D; }
function _now() { return Date.now(); }
/** iOS 不支持 "yyyy-MM-dd HH:mm:ss"（中间空格），用 ISO 子集 yyyy-MM-ddTHH:mm:ss */
function _timestamp() { return new Date().toISOString().slice(0, 19); }
/** 解析存档时间：兼容旧数据空格格式与新数据 T 格式 */
function parseStoredTime(str) {
  if (str == null || str === '') return 0;
  if (typeof str === 'number') return str;
  const s = String(str).trim();
  if (!s) return 0;
  const normalized = s.indexOf('T') >= 0 ? s : s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T');
  const t = new Date(normalized).getTime();
  return isNaN(t) ? 0 : t;
}
function _deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

let _cache = null;

function _load() {
  if (_cache) return _cache;
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const def = getDefaultData();
      for (const k in def) { if (data[k] === undefined) data[k] = def[k]; }
      if (!data.dailyCounters) data.dailyCounters = def.dailyCounters;
      if (!data.violation) data.violation = def.violation;
      if (!data.progress) data.progress = def.progress;
      if (!data.freeRetries) data.freeRetries = def.freeRetries;
      if (!data.settings) data.settings = def.settings;
      if (!data.ownedBalloons) data.ownedBalloons = {};
      for (const id of Object.keys(data.ownedBalloons)) {
        const e = data.ownedBalloons[id];
        if (!e) continue;
        if (e.frozenQuantity === undefined) e.frozenQuantity = e.frozen ? Math.min(1, e.quantity || 0) : 0;
        if (!Array.isArray(e.frozenGiftIds)) e.frozenGiftIds = e.frozenGiftId ? [e.frozenGiftId] : [];
        e.frozen = (e.frozenQuantity || 0) > 0;
        e.frozenGiftId = e.frozenGiftIds[0] || null;
      }
      if (!data.equippedLegend) data.equippedLegend = def.equippedLegend;
      if (!data.legendUsedByLevel) data.legendUsedByLevel = def.legendUsedByLevel;
      if (!data.user) data.user = def.user;
      _cache = data;
      return data;
    }
  } catch (e) { console.warn('[store] load failed', e); }
  _cache = getDefaultData();
  return _cache;
}

function _save() {
  if (!_cache) return;
  try { _cache._lastActiveDate = _todayStr(); wx.setStorageSync(STORAGE_KEY, JSON.stringify(_cache)); }
  catch (e) { console.warn('[store] save failed', e); }
}

function _get(key) { return _load()[key]; }
function _set(key, val) { const d = _load(); d[key] = val; _save(); }

function checkDailyReset() {
  const data = _load();
  const today = _todayStr();
  const lastDate = data._lastActiveDate || '';
  if (lastDate !== today) {
    data.freeRetries = { level1: 3, level2: 3, level3: 3, level4: 3 };
    data.fullClearCount = 0;
    data.lastFullClearTime = 0;
    data.dailyCounters = { date: today, adWatchCount: 0, giftSendCount: 0, giftReceiveCount: 0, createTeamCount: 0, joinTeamCount: 0, leaveTeamCount: 0, renameTeamCount: 0, adSkipCount: 0 };
    if (data.violation.date !== today) { data.violation.count = 0; data.violation.date = today; data.violation.bannedToday = false; }
    if (data.team && data.team.members) { data.team.members.forEach(m => { m.dailyClears = 0; }); data.team.dailyTotalClears = 0; }
    data.progress.completedBalloons = 0;
    data.progress.balloonIndex = 0;
    _checkRankSettle(today, lastDate);
    data._lastActiveDate = today;
    _save();
    _regenerateMockData(data);
    return true;
  }
  return false;
}

function _checkRankSettle(today, lastDate) {
  const data = _load();
  if (data._rankRewardsClaimed[today]) return;
  const now = new Date();
  if (now.getHours() < 9) return;
  const ranked = getRankedTeams().slice(0, 5);
  if (data.team) {
    const myRank = ranked.findIndex(t => t.id === data.team.id);
    if (myRank >= 0 && myRank < 5) {
      const rank = myRank + 1;
      const rewardCount = rank === 1 ? 2 : 1;
      const rewards = _grantRankReward(data, rewardCount);
      data._rankRewardsClaimed[today] = { teamId: data.team.id, rank, rewards };
      rewards.forEach(r => { data.transactions.push({ type: 'rank_reward', balloonId: r.id, quantity: 1, counterparty: '', time: _timestamp(), status: 'success' }); });
    }
  }
}

function _grantRankReward(data, count) {
  const { BALLOON_TYPES } = require('./balloons');
  const legends = BALLOON_TYPES.filter(b => b.isPaid);
  const owned = data.ownedBalloons || {};
  const unowned = legends.filter(l => !owned[l.id] || owned[l.id].quantity === 0);
  const pool = unowned.length > 0 ? unowned : legends;
  const rewards = [];
  for (let i = 0; i < count; i++) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    _addBalloonRaw(data, pick.id, 1, 'rank_reward');
    rewards.push(pick);
  }
  return rewards;
}

function _regenerateMockData(data) {
  data.allTeams = _generateMockTeams(20);
  if (data.team) {
    data.allTeams.push({
      id: data.team.id, name: data.team.name, leaderName: data.user.nickName,
      memberCount: data.team.members ? data.team.members.length : 1,
      dailyTotalClears: data.team.dailyTotalClears || 0,
      avgClears: data.team.members ? Math.round((data.team.dailyTotalClears||0)/data.team.members.length*100)/100 : 0,
      createdAt: data.team.createdAt
    });
  }
}

function _addBalloonRaw(data, balloonId, quantity, source) {
  if (!data.ownedBalloons) data.ownedBalloons = {};
  if (!data.ownedBalloons[balloonId]) {
    data.ownedBalloons[balloonId] = { quantity: 0, source: source||'purchase', acquiredAt: _timestamp(), giftable: source==='purchase', wearable: true, craftable: true, frozen: false, frozenGiftId: null, frozenQuantity: 0, frozenGiftIds: [] };
  }
  data.ownedBalloons[balloonId].quantity += quantity;
  data.ownedBalloons[balloonId].acquiredAt = _timestamp();
  if (source === 'purchase') data.ownedBalloons[balloonId].giftable = true;
  return data.ownedBalloons[balloonId];
}

function _frozenQty(e) { return e ? Math.max(0, e.frozenQuantity || (e.frozen ? 1 : 0)) : 0; }
function _availableQty(e) { return e ? Math.max(0, (e.quantity || 0) - _frozenQty(e)) : 0; }
function _syncFrozenFields(e) {
  if (!e) return;
  if (!Array.isArray(e.frozenGiftIds)) e.frozenGiftIds = e.frozenGiftId ? [e.frozenGiftId] : [];
  e.frozenQuantity = Math.min(e.quantity || 0, _frozenQty(e));
  e.frozen = e.frozenQuantity > 0;
  e.frozenGiftId = e.frozenGiftIds[0] || null;
}

function getOwnedBalloons() { return _deepClone(_get('ownedBalloons')||{}); }
function getOwnedBalloonList() { const d=_load(); const m=d.ownedBalloons||{}; return Object.keys(m).map(id=>({id,...m[id]})); }
function addBalloon(bId,qty,src) { const d=_load(); _addBalloonRaw(d,bId,qty,src); _save(); }
function removeBalloon(bId,qty) { const d=_load(); const e=d.ownedBalloons&&d.ownedBalloons[bId]; if(!e||_availableQty(e)<qty)return false; e.quantity-=qty; _syncFrozenFields(e); if(e.quantity<=0){delete d.ownedBalloons[bId];for(const k in d.equippedLegend){if(d.equippedLegend[k]===bId)d.equippedLegend[k]=null;}} else if(_availableQty(e)<=0){for(const k in d.equippedLegend){if(d.equippedLegend[k]===bId)d.equippedLegend[k]=null;}}_save();return true; }
function hasBalloon(bId) { const d=_load(); const e=d.ownedBalloons&&d.ownedBalloons[bId]; return e&&e.quantity>0; }
function getBalloonQuantity(bId) { const d=_load(); const e=d.ownedBalloons&&d.ownedBalloons[bId]; return e?e.quantity:0; }

function _legendUsedLevelsFromBouquets(d, bId) {
  const levels = [];
  for (const bq of d.bouquetCollection || []) {
    const lv = bq.level;
    if (!lv) continue;
    for (const b of bq.balloons || []) {
      if (!b.isPaid) continue;
      const id = b.balloonId;
      if (id === bId && !levels.includes(lv)) levels.push(lv);
    }
  }
  return levels.sort((a, b) => a - b);
}

function getLegendUsedLevels(bId) {
  const d = _load();
  const levels = new Set();
  const stored = d.legendUsedByLevel && d.legendUsedByLevel[bId];
  if (stored != null) {
    (Array.isArray(stored) ? stored : [stored]).forEach((lv) => {
      if (lv >= 1 && lv <= 4) levels.add(lv);
    });
  }
  _legendUsedLevelsFromBouquets(d, bId).forEach((lv) => levels.add(lv));
  return Array.from(levels).sort((a, b) => a - b);
}

function canEquipLegend(levelIndex, bId) {
  const d = _load();
  const e = d.ownedBalloons && d.ownedBalloons[bId];
  if (!e || _availableQty(e) < 1) return { ok: false, reason: '未拥有' };
  const levelNum = levelIndex + 1;
  const used = getLegendUsedLevels(bId);
  const avail = _availableQty(e);
  if (used.includes(levelNum)) return { ok: false, reason: '已充气' };
  if (used.length >= avail) return { ok: false, reason: '已充气' };
  return { ok: true };
}

function markLegendUsedInLevel(bId, levelNum) {
  if (!bId || !levelNum) return;
  const d = _load();
  if (!d.legendUsedByLevel) d.legendUsedByLevel = {};
  if (!d.legendUsedByLevel[bId]) d.legendUsedByLevel[bId] = [];
  const arr = d.legendUsedByLevel[bId];
  if (!arr.includes(levelNum)) arr.push(levelNum);
  validateEquippedLegends();
  _save();
}

function validateEquippedLegends() {
  const d = _load();
  let changed = false;
  for (let i = 0; i < 4; i++) {
    const k = 'level' + (i + 1);
    const id = d.equippedLegend[k];
    if (!id) continue;
    if (!canEquipLegend(i, id).ok) {
      d.equippedLegend[k] = null;
      changed = true;
    }
  }
  if (changed) _save();
}

function getEquippedLegend(levelIndex) { const k='level'+(levelIndex+1); const d=_load(); return d.equippedLegend[k]||null; }
function equipLegend(levelIndex,bId) {
  if (!canEquipLegend(levelIndex, bId).ok) return false;
  const d=_load();
  const k='level'+(levelIndex+1);
  d.equippedLegend[k]=bId;
  _save();
  return true;
}
function unequipLegend(levelIndex) { const d=_load(); const k='level'+(levelIndex+1); d.equippedLegend[k]=null; _save(); }

function getUnlockedLevels() { return _deepClone(_get('unlockedLevels')||[1]); }
function unlockLevel(lv) { const d=_load(); if(!d.unlockedLevels.includes(lv)){d.unlockedLevels.push(lv);d.unlockedLevels.sort((a,b)=>a-b);_save();} }
function isLevelUnlocked(lv) { const d=_load(); return d.unlockedLevels.includes(lv); }
function getLastPlayedLevel() { return _get('lastPlayedLevel')||1; }
function setLastPlayedLevel(lv) { _set('lastPlayedLevel',lv); }
function getProgress() { return _deepClone(_get('progress')||{currentLevel:1,completedBalloons:0,balloonIndex:0}); }
function setProgress(p) { const d=_load(); d.progress={...d.progress,...p}; _save(); }
function resetInLevelProgress() { const d=_load(); d.progress.completedBalloons=0; d.progress.balloonIndex=0; _save(); }

/** 冷启动：进程重启后清空进行中的关卡进度（PRD 7.1 / 3.3.2） */
function applyColdStart() { resetInLevelProgress(); }

/** 重置整个挑战进度：解锁关卡仅留第 1 关、当前回到第 1 关、清空局内进度、重置重开次数与装备的传奇气球。
 *  保留：已拥有的气球库存、账号、战队、流水等。 */
function resetChallengeProgress() {
  const d = _load();
  d.unlockedLevels = [1];
  d.lastPlayedLevel = 1;
  d.progress = { currentLevel: 1, completedBalloons: 0, balloonIndex: 0 };
  d.freeRetries = { level1: 3, level2: 3, level3: 3, level4: 3 };
  d.equippedLegend = { level1: null, level2: null, level3: null, level4: null };
  d.fullRunAnchorMs = 0;
  _save();
}

/** 根据已拥有的普通气球，恢复其对应章节解锁（不修改库存）。 */
function reunlockLevelsFromOwnedCommonBalloons() {
  const d = _load();
  const owned = d.ownedBalloons || {};
  const u = new Set(d.unlockedLevels && d.unlockedLevels.length ? d.unlockedLevels : [1]);
  for (const id of Object.keys(owned)) {
    const e = owned[id];
    if (!e || e.quantity <= 0) continue;
    const b = BALLOON_TYPES.find(t => t.id === id && !t.isPaid);
    if (b && typeof b.level === 'number') u.add(b.level);
  }
  d.unlockedLevels = Array.from(u).sort((a, b) => a - b);
  _save();
}

/** 放弃挑战：重置闯关关卡数据（同 resetChallengeProgress），已获得的普通气球不删，其对应关卡保持解锁。 */
function abandonChallengeResetProgress() {
  resetChallengeProgress();
  reunlockLevelsFromOwnedCommonBalloons();
}

function getFreeRetries(lv) { const d=_load(); const k='level'+lv; return d.freeRetries[k]||0; }
function useFreeRetry(lv) { const d=_load(); const k='level'+lv; if((d.freeRetries[k]||0)<=0)return false; d.freeRetries[k]--; _save(); return true; }
function addFreeRetries(lv,count,maxTotal) { const d=_load(); const k='level'+lv; const cur=d.freeRetries[k]||0; d.freeRetries[k]=Math.min(cur+count,maxTotal||5); _save(); return d.freeRetries[k]; }

function canRecordFullClear() { const d=_load(); const elapsed=_now()-(d.lastFullClearTime||0); if(elapsed<10*60*1000)return {ok:false,reason:'间隔不足10分钟'}; if(d.fullClearCount>=20)return {ok:false,reason:'今日已达20次上限'}; if(d.violation.bannedToday)return {ok:false,reason:'今日已被封禁排名资格'}; return {ok:true}; }
function recordFullClear() { const c=canRecordFullClear(); if(!c.ok)return c; const d=_load(); d.fullClearCount++; d.lastFullClearTime=_now(); if(d.team){d.team.dailyTotalClears=(d.team.dailyTotalClears||0)+1;const me=d.team.members.find(m=>m.openid===d.user.openid);if(me)me.dailyClears=(me.dailyClears||0)+1;}_save();return {ok:true,count:d.fullClearCount}; }

function checkViolation() { const d=_load(); if(d.fullClearCount>=3&&d.lastFullClearTime>0){d.violation.count=(d.violation.count||0)+1;if(d.violation.count>=5)d.violation.bannedToday=true;_save();} }
function isBanned() { const d=_load(); return d.violation.bannedToday||false; }

function addClearRecord(rec) { const d=_load(); if(!d.clearHistory)d.clearHistory=[]; d.clearHistory.unshift({...rec,time:_timestamp(),id:'clear_'+_now()+'_'+Math.random().toString(36).slice(2,6)}); if(d.clearHistory.length>200)d.clearHistory=d.clearHistory.slice(0,200); _save(); }
function getClearHistory(filter) { const d=_load(); let list=d.clearHistory||[]; if(filter){if(filter.level)list=list.filter(r=>r.level===filter.level);if(filter.days){const c=_now()-filter.days*86400000;list=list.filter(r=>parseStoredTime(r.time)>=c);}} return _deepClone(list); }
function getFullClearRunHistory() { const d=_load(); return _deepClone((d.clearHistory||[]).filter(r => r.isFullRun)); }

function setFullRunAnchorIfNeeded() {
  const d = _load();
  if (d.fullRunAnchorMs) return;
  d.fullRunAnchorMs = _now();
  _save();
}
function clearFullRunAnchor() {
  const d = _load();
  d.fullRunAnchorMs = 0;
  _save();
}
function getFullRunAnchorMs() {
  return _load().fullRunAnchorMs || 0;
}

function addBouquet(bq) {
  const d=_load();
  if(!d.bouquetCollection)d.bouquetCollection=[];
  d.bouquetCollection.unshift({...bq,sn:'bq_'+_now()+'_'+Math.random().toString(36).slice(2,6),time:_timestamp(),starred:false});
  if(d.bouquetCollection.length>100)d.bouquetCollection=d.bouquetCollection.slice(0,100);
  if (bq.hasLegend && bq.balloons) {
    const paid = bq.balloons.find(b => b.isPaid && b.balloonId);
    if (paid && paid.balloonId) markLegendUsedInLevel(paid.balloonId, bq.level);
  }
  _save();
}
function getBouquets() { return _deepClone(_get('bouquetCollection')||[]); }
function toggleBouquetStar(sn) { const d=_load(); const bq=(d.bouquetCollection||[]).find(b=>b.sn===sn); if(bq){bq.starred=!bq.starred;_save();} }

function addTransaction(tx) { const d=_load(); if(!d.transactions)d.transactions=[]; d.transactions.unshift({...tx,time:_timestamp()}); const c=_now()-30*86400000; d.transactions=d.transactions.filter(t=>parseStoredTime(t.time)>=c); if(d.transactions.length>200)d.transactions=d.transactions.slice(0,200); _save(); }
function getTransactions(filter) { const d=_load(); let list=d.transactions||[]; if(filter&&filter.type)list=list.filter(t=>t.type===filter.type); return _deepClone(list); }

function createGift(balloonIds,toOpenid,note) { const d=_load(); if(balloonIds.length>10)return{ok:false,reason:'批量赠送最多10个'}; if((d.dailyCounters.giftSendCount||0)>=20)return{ok:false,reason:'今日赠送已达上限(20个)'}; for(const bid of balloonIds){const e=d.ownedBalloons&&d.ownedBalloons[bid];if(!e||_availableQty(e)<1)return{ok:false,reason:'可赠送气球不足:'+bid};if(!e.giftable)return{ok:false,reason:'该气球不可转赠:'+bid};} const giftId='gift_'+_now()+'_'+Math.random().toString(36).slice(2,8); for(const bid of balloonIds){const e=d.ownedBalloons[bid];if(!Array.isArray(e.frozenGiftIds))e.frozenGiftIds=[];e.frozenQuantity=_frozenQty(e)+1;e.frozenGiftIds.push(giftId);_syncFrozenFields(e);} if(!d.pendingGifts)d.pendingGifts=[]; d.pendingGifts.push({giftId,balloonIds,from:d.user.openid,fromName:d.user.nickName,to:toOpenid||null,note:note||'送你专属气球',createdAt:_now(),expiresAt:_now()+24*3600000,status:'pending'}); d.dailyCounters.giftSendCount=(d.dailyCounters.giftSendCount||0)+balloonIds.length; _save(); return{ok:true,giftId}; }

function claimGift(giftId) { const d=_load(); const g=(d.pendingGifts||[]).find(g=>g.giftId===giftId); if(!g)return{ok:false,reason:'赠送链接不存在'}; if(g.status!=='pending')return{ok:false,reason:'链接已失效'}; if(_now()>g.expiresAt){g.status='expired';_unfreezeGiftBalloons(d,g);_save();return{ok:false,reason:'链接已过期'};} if((d.dailyCounters.giftReceiveCount||0)>=20)return{ok:false,reason:'今日接收已达上限(20个)'}; _consumeGiftBalloons(d,g); for(const bid of g.balloonIds){_addBalloonRaw(d,bid,1,'gift_received');d.ownedBalloons[bid].giftable=false;} g.status='claimed'; d.dailyCounters.giftReceiveCount=(d.dailyCounters.giftReceiveCount||0)+g.balloonIds.length; _save(); return{ok:true,balloonIds:g.balloonIds}; }

function expireGifts() { const d=_load(); const gs=d.pendingGifts||[]; let c=false; for(const g of gs){if(g.status==='pending'&&_now()>g.expiresAt){g.status='expired';_unfreezeGiftBalloons(d,g);c=true;}} if(c)_save(); }
function _unfreezeGiftBalloons(d,g) { for(const bid of g.balloonIds){const e=d.ownedBalloons&&d.ownedBalloons[bid];if(e){e.frozenQuantity=Math.max(0,_frozenQty(e)-1);if(Array.isArray(e.frozenGiftIds))e.frozenGiftIds=e.frozenGiftIds.filter(id=>id!==g.giftId);_syncFrozenFields(e);}} }
function _consumeGiftBalloons(d,g) { for(const bid of g.balloonIds){const e=d.ownedBalloons&&d.ownedBalloons[bid];if(e&&Array.isArray(e.frozenGiftIds)&&e.frozenGiftIds.includes(g.giftId)){e.frozenQuantity=Math.max(0,_frozenQty(e)-1);e.frozenGiftIds=e.frozenGiftIds.filter(id=>id!==g.giftId);e.quantity=Math.max(0,(e.quantity||0)-1);_syncFrozenFields(e);if(e.quantity<=0)delete d.ownedBalloons[bid];}} }
function getPendingGifts() { return _deepClone(_get('pendingGifts')||[]); }

function createTeam(name) { const d=_load(); if(d.team)return{ok:false,reason:'已加入战队'}; if((d.dailyCounters.createTeamCount||0)>=1)return{ok:false,reason:'今日创建次数已达上限'}; const tid='team_'+_now()+'_'+Math.random().toString(36).slice(2,6); d.team={id:tid,name,description:'',leaderId:d.user.openid,createdAt:_now(),memberCount:1,dailyTotalClears:0,qrCode:'',members:[{openid:d.user.openid,nickName:d.user.nickName,joinedAt:_now(),isLeader:true,dailyClears:0,showStats:true,notifyOn:d.settings.notificationOn||false}]}; d.dailyCounters.createTeamCount=(d.dailyCounters.createTeamCount||0)+1; d.lastPlayedLevel=1; _save(); return{ok:true,teamId:tid}; }
function joinTeam(tid) { const d=_load(); if(d.team)return{ok:false,reason:'已加入战队'}; if((d.dailyCounters.joinTeamCount||0)>=1)return{ok:false,reason:'今日加入次数已达上限'}; const t=d.allTeams.find(t=>t.id===tid); if(!t)return{ok:false,reason:'战队不存在'}; if(t.memberCount>=20)return{ok:false,reason:'战队人数已满'}; d.team={id:t.id,name:t.name,description:'',leaderId:t.leaderName||'unknown',createdAt:t.createdAt||_now(),memberCount:t.memberCount+1,dailyTotalClears:t.dailyTotalClears||0,qrCode:'',members:[{openid:d.user.openid,nickName:d.user.nickName,joinedAt:_now(),isLeader:false,dailyClears:0,showStats:true,notifyOn:d.settings.notificationOn||false}]}; d.dailyCounters.joinTeamCount=(d.dailyCounters.joinTeamCount||0)+1; _save(); return{ok:true}; }
function leaveTeam() { const d=_load(); if(!d.team)return{ok:false,reason:'未加入战队'}; if((d.dailyCounters.leaveTeamCount||0)>=1)return{ok:false,reason:'今日退出次数已达上限'}; d.dailyCounters.leaveTeamCount=(d.dailyCounters.leaveTeamCount||0)+1; d.team=null; _save(); return{ok:true}; }
function getTeam() { return _deepClone(_get('team')); }
function getAllTeams() { return _deepClone(_get('allTeams')||[]); }
function getRankedTeams() { const d=_load(); const ts=(d.allTeams||[]).slice(); const e=ts.filter(t=>t.memberCount>=10); e.sort((a,b)=>{if(b.dailyTotalClears!==a.dailyTotalClears)return b.dailyTotalClears-a.dailyTotalClears;return b.avgClears-a.avgClears;}); return e.map((t,i)=>({...t,rank:i+1})); }
function updateTeamName(name) { const d=_load(); if(!d.team)return{ok:false,reason:'未加入战队'}; const me=d.team.members.find(m=>m.openid===d.user.openid); if(!me||!me.isLeader)return{ok:false,reason:'仅队长可修改队名'}; if((d.dailyCounters.renameTeamCount||0)>=1)return{ok:false,reason:'今日修改次数已达上限'}; d.team.name=name; d.dailyCounters.renameTeamCount=(d.dailyCounters.renameTeamCount||0)+1; _save(); return{ok:true}; }
function updateTeamDescription(desc) { const d=_load(); if(!d.team)return; const me=d.team.members.find(m=>m.openid===d.user.openid); if(!me||!me.isLeader)return; d.team.description=desc; _save(); }
function transferLeader(newL) { const d=_load(); if(!d.team)return{ok:false,reason:'未加入战队'}; const me=d.team.members.find(m=>m.openid===d.user.openid); if(!me||!me.isLeader)return{ok:false,reason:'仅队长可转让'}; const nl=d.team.members.find(m=>m.openid===newL); if(!nl)return{ok:false,reason:'成员不存在'}; me.isLeader=false; nl.isLeader=true; d.team.leaderId=newL; _save(); return{ok:true}; }

function getSettings() { return _deepClone(_get('settings')||{}); }
function updateSettings(partial) { const d=_load(); d.settings={...d.settings,...partial}; _save(); }
function getUser() { return _deepClone(_get('user')||{}); }
function updateUser(partial) { const d=_load(); d.user={...d.user,...partial}; _save(); }
function incrementCounter(k,amt) { const d=_load(); d.dailyCounters[k]=(d.dailyCounters[k]||0)+(amt||1); _save(); }
function getCounter(k) { const d=_load(); return d.dailyCounters[k]||0; }
function canDoAction(k,max) { return getCounter(k)<max; }

function getLegendTotalCollected() { const d=_load(); const o=d.ownedBalloons||{}; return Object.keys(o).filter(id=>o[id].quantity>0).length; }
function getHighestLevel() { const d=_load(); return Math.max(...(d.unlockedLevels||[1])); }
function getTodayClears() { const d=_load(); return d.fullClearCount||0; }
function setNotificationAuthorized(val) { const d=_load(); d.user.notificationAuthorized=val; d.settings.notificationOn=val; _save(); }
function isNotificationAuthorized() { const d=_load(); return d.user.notificationAuthorized||false; }
function requestAccountDeletion() { try{wx.removeStorageSync(STORAGE_KEY);_cache=null;}catch(e){console.warn('[store] deletion failed',e);} }

module.exports = {
  checkDailyReset,
  getOwnedBalloons, getOwnedBalloonList, addBalloon, removeBalloon, hasBalloon, getBalloonQuantity,
  getEquippedLegend, equipLegend, unequipLegend,
  getLegendUsedLevels, canEquipLegend, markLegendUsedInLevel, validateEquippedLegends,
  getUnlockedLevels, unlockLevel, isLevelUnlocked, getLastPlayedLevel, setLastPlayedLevel,
  getProgress, setProgress, resetInLevelProgress, applyColdStart, resetChallengeProgress,
  reunlockLevelsFromOwnedCommonBalloons, abandonChallengeResetProgress,
  getFreeRetries, useFreeRetry, addFreeRetries,
  canRecordFullClear, recordFullClear, checkViolation, isBanned,
  addClearRecord, getClearHistory, getFullClearRunHistory,
  setFullRunAnchorIfNeeded, clearFullRunAnchor, getFullRunAnchorMs,
  addBouquet, getBouquets, toggleBouquetStar,
  addTransaction, getTransactions,
  createGift, claimGift, expireGifts, getPendingGifts,
  createTeam, joinTeam, leaveTeam, getTeam, getAllTeams, getRankedTeams, updateTeamName, updateTeamDescription, transferLeader,
  getSettings, updateSettings,
  getUser, updateUser,
  incrementCounter, getCounter, canDoAction,
  getLegendTotalCollected, getHighestLevel, getTodayClears,
  setNotificationAuthorized, isNotificationAuthorized,
  requestAccountDeletion,
  parseStoredTime
};
