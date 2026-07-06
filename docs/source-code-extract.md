# 不准爆！— 源程序节选

> 项目总代码量：19551 行
> 本文档包含前 2000 行和后 2000 行源程序代码

---

## 前 2000 行

> 共 2000 行

### game.js

```javascript
// game.js - 不准爆！微信小游戏主入口

// ─── 云开发（须最先初始化，等同小程序 app.js onLaunch）────────
if (typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.init === 'function') {
  wx.cloud.init({
    env: 'cloud1-d2geerzff38fc214b',
    traceUser: true
  });
}
const cloud = require('./js/cloud');
cloud.markInitialized();
const db = (typeof wx !== 'undefined' && wx.cloud) ? wx.cloud.database() : null;

const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');
const sysInfo = wx.getSystemInfoSync();
const W = sysInfo.windowWidth;
const H = sysInfo.windowHeight;
const dpr = Math.min(sysInfo.pixelRatio || 1, 2.5);

canvas.width = W * dpr;
canvas.height = H * dpr;

// ─── 初始化 Store ───────────────────────────
const store = require('./js/store');
const { loadNumericFont, setNumericFontSourceUrl, showToast } = require('./js/engine/canvas-ui');

store.checkDailyReset();
store.expireGifts();
store.applyColdStart();

// 静默云登录（拉取/创建 users，失败不阻断进游戏）
try {
  require('./js/cloud-login').cloudLogin();
} catch (e) {
  console.warn('[game] cloudLogin skipped:', e && e.message);
}

// 软著/商户号未就绪：开发版默认模拟支付，无需 SUB_MCH_ID
try {
  const { useMockPay, isDevelopEnv } = require('./js/platform');
  if (useMockPay()) {
    console.log('[BalloonPop] 当前为模拟支付模式（mock_pay）'
      + (isDevelopEnv() ? '：开发/体验版自动开启' : '：启动参数 mockPay=1')
      + '。配好商户号后可用 realPay=1 测真支付。');
  }
} catch (_) { /* ignore */ }

// 全局音频：iOS 静音键、首次触摸激活
const { applyInnerAudioOption, syncBgmFromSettings, pauseBgm, resumeBgm } = require('./js/audio');
applyInnerAudioOption();

let _audioTouchUnlocked = false;

// 数字字体 DIN Alternate：远程地址就绪后取消下一行注释，并在小程序后台配置 downloadFile 域名
// setNumericFontSourceUrl('https://你的域名/fonts/DINAlternate.ttf');
loadNumericFont(() => {});

// ─── 创建场景管理器 ─────────────────────────
const { SceneManager } = require('./js/scenes/scene-manager');
const manager = new SceneManager(canvas, ctx, W, H);

// ─── 注册所有场景 ───────────────────────────
const scenes = {
  home: require('./js/scenes/home'),
  battle: require('./js/scenes/battle'),
  collection: require('./js/scenes/collection'),
  team: require('./js/scenes/team'),
  'team-detail': require('./js/scenes/team-detail'),
  'team-rank': require('./js/scenes/team-rank'),
  profile: require('./js/scenes/profile'),
  'order-list': require('./js/scenes/order-list'),
  'cloud-test': require('./js/scenes/cloud-test')
};

Object.keys(scenes).forEach(name => manager.register(name, scenes[name]));

// ─── 首屏：支持开发者工具「自定义编译」启动参数直达调试态 ──
// 工具栏「编译」旁下拉 → 添加编译模式 → 启动参数填：debugLevelComplete=1
function _readLaunchQuery() {
  try {
    if (typeof wx === 'undefined' || !wx.getLaunchOptionsSync) return {};
    return wx.getLaunchOptionsSync().query || {};
  } catch (_) {
    return {};
  }
}
(function _initialSceneFromLaunch() {
  const q = _readLaunchQuery();
  const cloudLoginApi = require('./js/cloud-login');
  /** 深链/领取等需 OPENID 同步后再调云函数，避免与静默 login 竞态 */
  function _whenLoggedIn(fn) {
    return cloudLoginApi.cloudLogin().finally(fn);
  }
  if (q.teamId) {
    _whenLoggedIn(() => {
      manager.switchTo('team', {
        autoJoinTeamId: String(q.teamId),
        inviteToken: q.inviteToken ? String(q.inviteToken) : ''
      });
    });
    return;
  }
  const bouquetShare = require('./js/bouquet-share').parseBouquetShareFromQuery(q);
  if (bouquetShare) {
    manager.switchTo('home', { bouquetShare });
    return;
  }
  if (q.giftId) {
    manager.switchTo('collection', { incomingGiftId: String(q.giftId) });
    return;
  }
  if (q.scene === 'collection') {
    manager.switchTo('collection', { activeTab: 'legend' });
    return;
  }
  // 微信后台「订单中心」path 配置为 scene=orders，满足虚拟支付合规的订单查询入口
  if (q.scene === 'orders' || q.scene === 'orderList') {
    _whenLoggedIn(() => manager.switchTo('order-list'));
    return;
  }
  if (q.cloudTest === '1' || q.scene === 'cloudTest') {
    manager.switchTo('cloud-test');
    return;
  }
  const wantLevelComplete =
    String(q.debugLevelComplete) === '1' ||
    String(q.debugLevelComplete) === 'true' ||
    q.debug === 'levelComplete';
  if (wantLevelComplete) {
    manager.switchTo('battle', { debugLevelComplete: true });
    return;
  }
  manager.switchTo('home');
})();

// ─── 触摸事件 ───────────────────────────────
let _touchStartPos = null;

wx.onTouchStart(e => {
  if (!_audioTouchUnlocked) {
    _audioTouchUnlocked = true;
    applyInnerAudioOption();
    syncBgmFromSettings();
  }
  const t = e.touches[0];
  if (!t) return;
  const tx = t.clientX, ty = t.clientY;
  _touchStartPos = { x: tx, y: ty };
  manager.handleTouch('start', tx, ty);
});

wx.onTouchMove(e => {
  const t = e.touches[0];
  if (!t) return;
  manager.handleTouch('move', t.clientX, t.clientY);
});

wx.onTouchEnd(e => {
  const t = e.changedTouches[0];
  if (!t) return;
  const tx = t.clientX, ty = t.clientY;
  // 判断是否为点击（短距离）
  if (_touchStartPos) {
    const dx = Math.abs(tx - _touchStartPos.x);
    const dy = Math.abs(ty - _touchStartPos.y);
    if (dx < 15 && dy < 15) {
      console.log('[touch] tap 检测: x=' + tx + ' y=' + ty);
      manager.handleTouch('tap', tx, ty);
    }
  }
  _touchStartPos = null;
  manager.handleTouch('end', tx, ty);
});

// ─── 主循环 ─────────────────────────────────
const { createRaf } = require('./js/raf');
const raf = createRaf();

let _debugPollFrame = 0;
function gameLoop(time) {
  // 开发者工具：控制台执行 wx.setStorageSync('__BP_DEBUG_LEVEL_COMPLETE','1') 时，下一帧打开关卡完成弹窗
  if ((++_debugPollFrame % 20) === 0 && typeof wx !== 'undefined' && wx.getStorageSync && wx.removeStorageSync) {
    try {
      if (wx.getStorageSync('__BP_DEBUG_LEVEL_COMPLETE')) {
        wx.removeStorageSync('__BP_DEBUG_LEVEL_COMPLETE');
        manager.switchTo('battle', { debugLevelComplete: true });
      }
    } catch (_) {}
  }

  // 重置变换并清空画布（物理像素）
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 渲染当前场景（内部按 dpr 缩放）
  try {
    manager.render(time);
  } catch (e) {
    console.error('[gameLoop] 渲染崩溃:', e.message, '\n堆栈:', e.stack);
  }

  raf.requestAnimationFrame(gameLoop);
}

raf.requestAnimationFrame(gameLoop);

// ─── 开发者工具：见下方 setTimeout 打印的说明（控制台与 game 可能不在同一 JS 上下文） ──
(function attachDebugLevelComplete() {
  const run = () => manager.switchTo('battle', { debugLevelComplete: true });
  function put(obj, key) {
    if (!obj) return;
    try {
      obj[key] = run;
    } catch (_) {}
  }
  put(typeof wx !== 'undefined' ? wx : null, '__BALLOON_DEBUG_LEVEL_COMPLETE');
  put(typeof GameGlobal !== 'undefined' ? GameGlobal : null, '__BALLOON_DEBUG_LEVEL_COMPLETE');
  put(typeof globalThis !== 'undefined' ? globalThis : null, '__BALLOON_DEBUG_LEVEL_COMPLETE');
  put(typeof window !== 'undefined' ? window : null, '__BALLOON_DEBUG_LEVEL_COMPLETE');
})();

setTimeout(function () {
  try {
    console.log(
      '[BalloonPop] 调试「关卡完成」弹窗：\n' +
        '  ① 开发者工具 → 编译旁下拉 → 添加编译模式 → 启动参数填 debugLevelComplete=1 → 选该模式点编译\n' +
        '  ② wx.__BALLOON_DEBUG_LEVEL_COMPLETE() 或 wx.setStorageSync("__BP_DEBUG_LEVEL_COMPLETE","1")\n' +
        '  ③ 云连通测试：编译模式启动参数 cloudTest=1\n' +
        '  （控制台若报未定义：调试器顶部「JavaScript 上下文」选游戏逻辑线程）'
    );
  } catch (_) {}
}, 1200);

// ─── 生命周期 ───────────────────────────────
wx.onShow(() => {
  store.checkDailyReset();
  store.expireGifts();
  resumeBgm();
  // 前台恢复（如分享/拉起后返回）：优先用 onResume，避免把 onShow 当成"重新进入场景"而重置进度/弹窗
  const s = manager.currentScene;
  if (s) {
    if (typeof s.onResume === 'function') s.onResume();
    else if (typeof s.onShow === 'function') s.onShow();
  }
});

wx.onHide(() => {
  pauseBgm();
  if (manager.currentScene && manager.currentScene.onHide) {
    manager.currentScene.onHide();
  }
});

if (typeof wx !== 'undefined' && wx.onBackButtonClick) {
  wx.onBackButtonClick(() => {
    manager.handleBackButton();
  });
}

// 音频中断恢复
if (wx.onAudioInterruptionEnd) {
  wx.onAudioInterruptionEnd(() => {
    resumeBgm();
  });
}

// 窗口大小变化
wx.onWindowResize && wx.onWindowResize(res => {
  const nw = res.windowWidth;
  const nh = res.windowHeight;
  canvas.width = nw * dpr;
  canvas.height = nh * dpr;
  manager.resize(nw, nh);
});
```

### js/cloud.js

```javascript
// 微信云开发 — 对应小程序 App.onLaunch 里的 wx.cloud.init
const CLOUD_ENV = 'cloud1-d2geerzff38fc214b';

let _inited = false;
let _db = null;

/** game.js 已先执行 wx.cloud.init 时调用，避免重复 init */
function markInitialized() {
  _inited = true;
}

/** ① 全局初始化（game.js 最前面已 init 时可不调；否则调用一次） */
function initCloud() {
  if (_inited) return true;
  if (typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.init !== 'function') {
    console.error('[cloud] 请使用 2.2.3 或以上基础库，并开通云开发');
    return false;
  }
  try {
    wx.cloud.init({
      env: CLOUD_ENV,
      traceUser: true
    });
    _inited = true;
    console.log('☁️ 云开发初始化完成', CLOUD_ENV);
    return true;
  } catch (e) {
    console.error('[cloud] init 失败:', e && (e.message || e));
    return false;
  }
}

/** 云数据库实例（init 之后调用） */
function getDatabase() {
  if (!initCloud()) return null;
  if (!_db) _db = wx.cloud.database();
  return _db;
}

/** ② 连通测试：读 users 集合（对应 pages/index/index.js 的 testConnect） */
function testConnectUsers(openid) {
  const id = openid || 'test_user_001';
  const db = getDatabase();
  if (!db) {
    return Promise.resolve({
      ok: false,
      msg: '❌ 连接失败：wx.cloud 不可用',
      user: null
    });
  }
  return db.collection('users').where({ openid: id }).get()
    .then((res) => {
      if (res.data && res.data.length > 0) {
        console.log('用户数据：', res.data[0]);
        return {
          ok: true,
          msg: '✅ 连通成功！读到用户数据',
          user: res.data[0]
        };
      }
      return {
        ok: true,
        msg: '⚠️ 连通成功，但未找到 ' + id,
        user: null
      };
    })
    .catch((err) => {
      console.error(err);
      const errMsg = (err && err.errMsg) || (err && err.message) || String(err);
      return {
        ok: false,
        msg: '❌ 连接失败：' + errMsg,
        user: null
      };
    });
}

/** 按 openid 读取单条用户（业务用） */
function fetchUserByOpenid(openid) {
  return testConnectUsers(openid).then((r) => r.user);
}

const dbApi = require('./cloud-db');
const cloudPay = require('./cloud-pay');
const cloudLoginApi = require('./cloud-login');

module.exports = {
  CLOUD_ENV,
  markInitialized,
  initCloud,
  getDatabase,
  testConnectUsers,
  fetchUserByOpenid,
  // 增删改查（见 js/cloud-db.js）
  add: dbApi.add,
  queryWhere: dbApi.queryWhere,
  getById: dbApi.getById,
  updateById: dbApi.updateById,
  removeById: dbApi.removeById,
  createUser: dbApi.createUser,
  findUsersByOpenid: dbApi.findUsersByOpenid,
  updateUser: dbApi.updateUser,
  updateUserByOpenid: dbApi.updateUserByOpenid,
  getTeamsByLeaderOpenid: dbApi.getTeamsByLeaderOpenid,
  createOrder: cloudPay.createOrder,
  createLegendOrder: cloudPay.createLegendOrder,
  purchaseLegendBalloon: cloudPay.purchaseLegendBalloon,
  canUseRealPay: cloudPay.canUseRealPay,
  cloudLogin: cloudLoginApi.cloudLogin
};
```

### js/cloud-login.js

```javascript
/**
 * 云函数 login：拉取/创建 users 记录，并同步到本地 store
 * 登录后拉取 balloon_inventory，合并本人购买库存（跨设备可赠送）
 */
const store = require('./store');
const { syncTeamFromCloud } = require('./cloud-team');

function syncBalloonInventoryFromCloud() {
  if (typeof wx === 'undefined' || !wx.cloud) {
    return Promise.resolve({ ok: false, reason: 'wx.cloud 不可用' });
  }
  const db = wx.cloud.database();
  if (!db) return Promise.resolve({ ok: false, reason: '数据库不可用' });
  return db.collection('balloon_inventory').limit(100).get()
    .then((res) => {
      const list = res.data || [];
      store.mergeInventoryFromCloud(list);
      return { ok: true, count: list.length };
    })
    .catch((err) => {
      console.warn('[cloud-login] syncBalloonInventory', err);
      return { ok: false, reason: (err && err.errMsg) || String(err) };
    });
}

function cloudLogin(options) {
  const opts = options || {};
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return Promise.resolve({ ok: false, reason: 'wx.cloud 不可用' });
  }
  const prev = store.getUser() || {};
  const markLoggedIn = opts.explicit === true || !!prev.isLoggedIn;
  return wx.cloud.callFunction({ name: 'login' })
    .then((res) => {
      const result = res.result || {};
      const userInfo = result.userInfo || {};
      const openid = result.openid || userInfo.openid || '';
      store.updateUser({
        openid,
        nickName: userInfo.nickName || userInfo.nickname || prev.nickName || '微信用户',
        avatar: userInfo.avatar || userInfo.avatarUrl || prev.avatar || '',
        isLoggedIn: markLoggedIn,
        isFirstTime: markLoggedIn ? false : !!prev.isFirstTime
      });
      if (!markLoggedIn) {
        return { ok: true, openid, userInfo, silent: true };
      }
      return syncBalloonInventoryFromCloud()
        .then((sync) => syncTeamFromCloud().then((teamSync) => ({
          ok: true,
          openid,
          userInfo,
          inventorySync: sync,
          teamSync
        })));
    })
    .catch((err) => {
      console.warn('[cloud-login]', err);
      return { ok: false, reason: (err && err.errMsg) || String(err) };
    });
}

module.exports = { cloudLogin, syncBalloonInventoryFromCloud };
```

### js/auth-guard.js

```javascript
/**
 * 登录态判断（排除 mock_ openid 占位）
 */
const store = require('./store');

function isUserLoggedIn(user) {
  const u = user || store.getUser() || {};
  if (!u.isLoggedIn) return false;
  const openid = String(u.openid || '');
  if (!openid || openid.indexOf('mock_') === 0) return false;
  return true;
}

module.exports = { isUserLoggedIn };
```

### js/platform.js

```javascript
/** 平台能力检测（iOS 虚拟支付、调试开关等） */

function readIOS() {
  try {
    const sys = wx.getSystemInfoSync();
    const p = (sys.platform || '').toLowerCase();
    const sysName = (sys.system || '').toLowerCase();
    return p === 'ios' || sysName.indexOf('ios') >= 0;
  } catch (_) {
    return false;
  }
}

function readLaunchQuery() {
  try {
    if (typeof wx === 'undefined' || !wx.getLaunchOptionsSync) return {};
    return wx.getLaunchOptionsSync().query || {};
  } catch (_) {
    return {};
  }
}

/** 开发版 / 体验版（未配商户号、等软著期间默认模拟支付） */
function isDevelopEnv() {
  try {
    if (typeof wx === 'undefined' || !wx.getAccountInfoSync) return true;
    const v = wx.getAccountInfoSync().miniProgram.envVersion;
    return v === 'develop' || v === 'trial';
  } catch (_) {
    return true;
  }
}

/**
 * 是否走模拟支付（不调 createOrder / 微信收银台）
 * - mockPay=1：强制模拟
 * - realPay=1：强制真支付（商户号配好后用）
 * - 开发版/体验版：默认模拟；正式版 release 才走真支付
 */
function useMockPay() {
  const q = readLaunchQuery();
  if (String(q.realPay) === '1' || String(q.real_pay) === '1') return false;
  if (String(q.mockPay) === '1' || String(q.mock_pay) === '1') return true;
  return isDevelopEnv();
}

module.exports = {
  readIOS,
  readLaunchQuery,
  isDevelopEnv,
  useMockPay
};
```

### js/store.js

```javascript
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
    const periodClears = Math.floor(Math.random() * 500) + 50;
    teams.push({
      id: 'mock_team_' + (i + 1),
      name: MOCK_TEAM_NAMES[i % MOCK_TEAM_NAMES.length],
      leaderName: '玩家' + (i + 100),
      memberCount,
      periodClears: periodClears,
      avgClears: Math.round(periodClears / memberCount * 100) / 100,
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
    // 战队周期积分按自然周统计，不在日切清零（见 team_period_stats）
    data.progress.completedBalloons = 0;
    data.progress.balloonIndex = 0;
    data._lastActiveDate = today;
    _save();
    return true;
  }
  return false;
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

/** 登录后合并云端 balloon_inventory（含 purchase / gift） */
function mergeInventoryFromCloud(records) {
  if (!records || !records.length) return;
  const d = _load();
  let changed = false;
  for (const rec of records) {
    const bId = rec.balloonId;
    if (!bId) continue;
    const cloudCount = Math.max(0, rec.count != null ? rec.count : (rec.quantity || 0));
    if (cloudCount <= 0) continue;
    const isPurchase = rec.source === 'purchase';
    const giftable = rec.giftable === true;
    const src = isPurchase ? 'purchase' : 'gift_received';
    const e = d.ownedBalloons && d.ownedBalloons[bId];
    if (!e) {
      _addBalloonRaw(d, bId, cloudCount, src);
      d.ownedBalloons[bId].giftable = isPurchase && giftable;
      changed = true;
    } else {
      let rowChanged = false;
      if (e.quantity !== cloudCount) {
        e.quantity = cloudCount;
        rowChanged = true;
      }
      const wantGiftable = isPurchase && giftable;
      if (!!e.giftable !== wantGiftable) {
        e.giftable = wantGiftable;
        rowChanged = true;
      }
      if (rowChanged) {
        _syncFrozenFields(e);
        changed = true;
      }
    }
  }
  if (changed) {
    validateEquippedLegends();
    _save();
  }
}

/** @deprecated 使用 mergeInventoryFromCloud */
function mergePurchasedInventoryFromCloud(records) {
  mergeInventoryFromCloud(records);
}

function removeBalloon(bId,qty) { const d=_load(); const e=d.ownedBalloons&&d.ownedBalloons[bId]; if(!e||_availableQty(e)<qty)return false; e.quantity-=qty; _syncFrozenFields(e); if(e.quantity<=0){delete d.ownedBalloons[bId];for(const k in d.equippedLegend){if(d.equippedLegend[k]===bId)d.equippedLegend[k]=null;}} else if(_availableQty(e)<=0){for(const k in d.equippedLegend){if(d.equippedLegend[k]===bId)d.equippedLegend[k]=null;}}_save();return true; }
function hasBalloon(bId) { const d=_load(); const e=d.ownedBalloons&&d.ownedBalloons[bId]; return e&&e.quantity>0; }
function getBalloonQuantity(bId) { const d=_load(); const e=d.ownedBalloons&&d.ownedBalloons[bId]; return e?e.quantity:0; }

/** 手动合成可选数量：已拥有且未冻结即可，关卡充气/通关气球束不影响 */
function getSynEligibleQuantity(bId) {
  const d = _load();
  const e = d.ownedBalloons && d.ownedBalloons[bId];
  return _availableQty(e);
}

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
  const used = getLegendUsedLevels(bId);
  const avail = _availableQty(e);
  // 纯数量检查：已使用次数 < 拥有数量 → 还有可用副本
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
function recordFullClear() { const c=canRecordFullClear(); if(!c.ok)return c; const d=_load(); d.fullClearCount++; d.lastFullClearTime=_now(); if(d.team){d.team.periodClears=(d.team.periodClears||0)+1;const me=d.team.members.find(m=>m.openid===d.user.openid);if(me)me.periodClears=(me.periodClears||0)+1;}_save();return {ok:true,count:d.fullClearCount}; }

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
  if (bq.hasLegend && bq.balloons && !bq.isSynthesized && bq.level >= 1) {
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

function createTeam(name) { const d=_load(); if(d.team)return{ok:false,reason:'已加入战队'}; if((d.dailyCounters.createTeamCount||0)>=1)return{ok:false,reason:'今日创建次数已达上限'}; const tid='team_'+_now()+'_'+Math.random().toString(36).slice(2,6); d.team={id:tid,name,description:'',leaderId:d.user.openid,createdAt:_now(),memberCount:1,periodClears:0,qrCode:'',members:[{openid:d.user.openid,nickName:d.user.nickName,joinedAt:_now(),isLeader:true,periodClears:0,showStats:true,notifyOn:d.settings.notificationOn||false}]}; d.dailyCounters.createTeamCount=(d.dailyCounters.createTeamCount||0)+1; d.lastPlayedLevel=1; _save(); return{ok:true,teamId:tid}; }
function joinTeam(tid) { const d=_load(); if(d.team)return{ok:false,reason:'已加入战队'}; if((d.dailyCounters.joinTeamCount||0)>=1)return{ok:false,reason:'今日加入次数已达上限'}; const t=d.allTeams.find(t=>t.id===tid); if(!t)return{ok:false,reason:'战队不存在'}; if(t.memberCount>=20)return{ok:false,reason:'战队人数已满'}; d.team={id:t.id,name:t.name,description:'',leaderId:t.leaderName||'unknown',createdAt:t.createdAt||_now(),memberCount:t.memberCount+1,periodClears:t.periodClears||0,qrCode:'',members:[{openid:d.user.openid,nickName:d.user.nickName,joinedAt:_now(),isLeader:false,periodClears:0,showStats:true,notifyOn:d.settings.notificationOn||false}]}; d.dailyCounters.joinTeamCount=(d.dailyCounters.joinTeamCount||0)+1; _save(); return{ok:true}; }
function leaveTeam() { const d=_load(); if(!d.team)return{ok:false,reason:'未加入战队'}; if((d.dailyCounters.leaveTeamCount||0)>=1)return{ok:false,reason:'今日退出次数已达上限'}; d.dailyCounters.leaveTeamCount=(d.dailyCounters.leaveTeamCount||0)+1; d.team=null; _save(); return{ok:true}; }
function _isMockTeamId(id) {
  return !id || String(id).indexOf('mock_team_') === 0;
}

function applyCloudTeamSync(payload) {
  const d = _load();
  const p = payload || {};
  d._cloudTeam = p.team != null ? p.team : null;
  d._cloudRanked = p.ranked || [];
  d._cloudRecommendTeams = p.recommend != null ? p.recommend : (p.allTeams || []);
  d._teamsFromCloud = p.teamsFromCloud !== false;
  d.team = d._cloudTeam;
  _save();
}

function getTeam() {
  const d = _load();
  if (d._cloudTeam !== undefined) return d._cloudTeam ? _deepClone(d._cloudTeam) : null;
  return _deepClone(d.team || null);
}
function getAllTeams() {
  return getRecommendTeams();
}
function getRankedTeams() {
  const d = _load();
  if (d._teamsFromCloud) return _deepClone(d._cloudRanked || []);
  const ts = (d.allTeams || []).slice().filter((t) => !_isMockTeamId(t.id));
  const e = ts.filter(t => (t.memberCount || 0) >= 1);
  e.sort((a, b) => {
    if ((b.periodClears || 0) !== (a.periodClears || 0)) return (b.periodClears || 0) - (a.periodClears || 0);
    return (b.avgClears || 0) - (a.avgClears || 0);
  });
  return e.map((t, i) => Object.assign({}, t, { rank: i + 1 }));
}
function getRecommendTeams() {
  const d = _load();
  if (d._teamsFromCloud) return _deepClone(d._cloudRecommendTeams || []);
  return (d.allTeams || []).slice().filter((t) => !_isMockTeamId(t.id) && (t.joinType || 'open') === 'open');
}
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
  getOwnedBalloons, getOwnedBalloonList, addBalloon, removeBalloon, hasBalloon, getBalloonQuantity, getSynEligibleQuantity,
  mergeInventoryFromCloud,
  mergePurchasedInventoryFromCloud,
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
  createTeam, joinTeam, leaveTeam, getTeam, getAllTeams, getRankedTeams, getRecommendTeams, applyCloudTeamSync, updateTeamName, updateTeamDescription, transferLeader,
  getSettings, updateSettings,
  getUser, updateUser,
  incrementCounter, getCounter, canDoAction,
  getLegendTotalCollected, getHighestLevel, getTodayClears,
  setNotificationAuthorized, isNotificationAuthorized,
  requestAccountDeletion,
  parseStoredTime
};
```

### js/balloons.js

```javascript
// Ballon-hot 气球皮肤数据配置
// 4 关 × 10 普通气球 + 30 传奇限定。
//
// 普通气球顺序严格按设计稿排版（编辑顺序即关内顺序，emoji-sequences.js 会按
// level 顺序逐个 slice(0, 10) 取出）。每关第 10 个固定为传奇位 🔶（占位）：
//   - 装备了传奇气球：第 10 个由所选传奇覆盖（battle.js 中按 balloonIdx===9 判定）；
//   - 未装备传奇：使用关卡对应的 🔶 占位作为「将出现传奇的位置」。
// 编辑指引：
//   - 仅修改 _LEVEL_BALLOONS / _LEGEND_BALLOONS 即可改名 / 改色 / 改 shape。
//   - 顺序变更会直接影响 emoji-sequences.js 关内 10 个气球的排布，谨慎调整。

const RARITY_COMMON = { rarity: '普通', color: '#aaaaaa' };
const RARITY_RARE   = { rarity: '稀有', color: '#4fc3f7' };
const RARITY_EPIC   = { rarity: '史诗', color: '#ce93d8' };
const RARITY_LEGEND = { rarity: '传说', color: '#ffd700' };

// 普通气球行格式：[id, name, emoji, shape, color, glowColor, level, rarity, unlocked]
const _LEVEL_BALLOONS = [
  // ── 第 1 关 · 糖果乐园 ─────────────────────────
  ['l1_orange',           '蜜橙圆球',     '🟠',     'round',   '#ff9800', '#ffb74d', 1, RARITY_COMMON, true],
  ['l1_star',             '闪耀甜星',     '⭐',     'star',    '#ffd740', '#ffea00', 1, RARITY_COMMON, true],
  ['l1_lollipop',         '棒棒糖',       '🍭',     'twist',   '#ff80ab', '#f06292', 1, RARITY_COMMON, true],
  ['l1_strawberry',       '红心草莓',     '🍓',     'heart',   '#ff5252', '#e53935', 1, RARITY_RARE,   true],
  ['l1_peach',            '蜜桃熊宝',     '🍑',     'animal',  '#ffcc80', '#ffab40', 1, RARITY_RARE,   true],
  ['l1_watermelon',       '西瓜冰沙',     '🍉',     'round',   '#66bb6a', '#43a047', 1, RARITY_RARE,   true],
  ['l1_candy',            '晶糖棉花云',   '🍬',     'cloud',   '#e1bee7', '#ba68c8', 1, RARITY_RARE,   true],
  ['l1_donut',            '甜甜圈钻',     '🍩',     'diamond', '#ffe082', '#ffb74d', 1, RARITY_EPIC,   true],
  ['l1_cherry',           '樱桃双旋',     '🍒',     'twist',   '#e53935', '#ff8a80', 1, RARITY_EPIC,   true],
  ['l1_legend_slot',      '蜜橙幻芒',     '🔶',     'crown',   '#ffd740', '#ffea00', 1, RARITY_LEGEND, false],

  // ── 第 2 关 · 霓虹街道 ─────────────────────────
  ['l2_purple_heart',     '紫电闪心',     '💜',     'heart',   '#b388ff', '#7c4dff', 2, RARITY_COMMON, true],
  ['l2_thunder',          '雷霆闪电',     '⚡',     'long',    '#ffeb3b', '#fbc02d', 2, RARITY_COMMON, true],
  ['l2_neon_star',        '霓虹之星',     '🌟',     'star',    '#fff176', '#fbc02d', 2, RARITY_COMMON, true],
  ['l2_magic_wand',       '魔法权杖',     '🪄',     'long',    '#b388ff', '#9575cd', 2, RARITY_RARE,   true],
  ['l2_alley_cat',        '街角小猫',     '🐱',     'animal',  '#ffa726', '#fb8c00', 2, RARITY_RARE,   true],
  ['l2_beer',             '麦芽气泡',     '🍺',     'cloud',   '#ffd54f', '#ffa000', 2, RARITY_RARE,   true],
  ['l2_rainbow',          '霓虹彩虹',     '🌈',     'twist',   '#ff8a80', '#7c4dff', 2, RARITY_RARE,   true],
  ['l2_hibiscus',         '霓虹蕊红',     '🌺',     'flower',  '#ec407a', '#ad1457', 2, RARITY_EPIC,   true],
  ['l2_night_strawberry', '夜市草莓',     '🍓',     'heart',   '#d81b60', '#880e4f', 2, RARITY_EPIC,   true],
  ['l2_legend_slot',      '霓虹幻芒',     '🔶',     'crown',   '#ffd740', '#ffea00', 2, RARITY_LEGEND, false],

  // ── 第 3 关 · 暗红熔炉 ─────────────────────────
  ['l3_firecracker',      '爆裂炮仗',     '🧨',     'long',    '#d32f2f', '#b71c1c', 3, RARITY_COMMON, true],
  ['l3_burning_heart',    '燃心炽焰',     '❤️',     'heart',   '#ff5252', '#b71c1c', 3, RARITY_COMMON, true],
  ['l3_flame',            '灼热火焰',     '🔥',     'long',    '#ff6f00', '#bf360c', 3, RARITY_COMMON, true],
  ['l3_swords',           '双锋利刃',     '⚔️',     'twist',   '#e53935', '#7f0000', 3, RARITY_RARE,   true],
  ['l3_shield',           '烈焰守护',     '🛡️',     'diamond', '#ffab00', '#bf360c', 3, RARITY_RARE,   true],
  ['l3_dust',             '灰烬之雾',     '💨',     'cloud',   '#9e9e9e', '#616161', 3, RARITY_RARE,   true],
  ['l3_red_gem',          '流火宝晶',     '💠',     'diamond', '#ef5350', '#b71c1c', 3, RARITY_RARE,   true],
  ['l3_spiral',           '熔岩漩涡',     '🌀',     'twist',   '#ff5722', '#bf360c', 3, RARITY_EPIC,   true],
  ['l3_jack',             '烈焰南瓜',     '🎃',     'round',   '#f57c00', '#e65100', 3, RARITY_EPIC,   true],
  ['l3_legend_slot',      '熔焰幻芒',     '🔶',     'crown',   '#ffd740', '#ffea00', 3, RARITY_LEGEND, false],

  // ── 第 4 关 · 云端神殿 ─────────────────────────
  ['l4_moon',             '银月之光',     '🌙',     'round',   '#e1f5fe', '#90caf9', 4, RARITY_COMMON, true],
  ['l4_white_heart',      '纯洁白心',     '🤍',     'heart',   '#ffffff', '#cfd8dc', 4, RARITY_COMMON, true],
  ['l4_rocket',           '神殿火箭',     '🚀',     'long',    '#b3e5fc', '#0288d1', 4, RARITY_COMMON, true],
  ['l4_glow_heart',       '神圣之心',     '💖',     'heart',   '#f8bbd0', '#ec407a', 4, RARITY_RARE,   true],
  ['l4_cloudy',           '云层余光',     '⛅',     'cloud',   '#cfd8dc', '#90a4ae', 4, RARITY_RARE,   true],
  ['l4_crystal',          '神谕水晶',     '🔮',     'diamond', '#ce93d8', '#7b1fa2', 4, RARITY_RARE,   true],
  ['l4_tornado',          '神殿龙卷',     '🌪️',     'twist',   '#b39ddb', '#7e57c2', 4, RARITY_RARE,   true],
  ['l4_ice',              '冻结晶体',     '🧊',     'diamond', '#80deea', '#0097a7', 4, RARITY_EPIC,   true],
  ['l4_sun_behind',       '破云朝阳',     '🌤️',     'cloud',   '#ffe082', '#ffa000', 4, RARITY_EPIC,   true],
  ['l4_legend_slot',      '神殿幻芒',     '🔶',     'crown',   '#ffd740', '#ffea00', 4, RARITY_LEGEND, false]
];

// 传奇气球行格式：[id, name, emoji, shape, color, glowColor]
const _LEGEND_BALLOONS = [
  ['legend_royal_crown',     '至尊王冠',   '👑', 'crown',   '#ffd700', '#ff8f00'],
  ['legend_bubble_aurora',   '极光气泡',   '🫧', 'cloud',   '#80deea', '#00acc1'],
  ['legend_dazzling_spark',  '璀璨闪光',   '✨', 'star',    '#fff176', '#fdd835'],
  ['legend_trophy',          '冠军奖杯',   '🏆', 'crown',   '#ffca28', '#fb8c00'],
  ['legend_unicorn',         '独角神兽',   '🦄', 'animal',  '#ce93d8', '#ab47bc'],
  ['legend_lion',            '雄狮之王',   '🦁', 'animal',  '#ffa726', '#ef6c00'],
  ['legend_eagle',           '苍穹之鹰',   '🦅', 'animal',  '#8d6e63', '#4e342e'],
  ['legend_wolf',            '月光之狼',   '🐺', 'animal',  '#b0bec5', '#607d8b'],
  ['legend_crocodile',       '沼泽鳄王',   '🐊', 'animal',  '#66bb6a', '#2e7d32'],
  ['legend_peacock',         '流羽孔雀',   '🦚', 'animal',  '#26c6da', '#00838f'],
  ['legend_whale',           '深海巨鲸',   '🐳', 'animal',  '#4fc3f7', '#0277bd'],
  ['legend_dolphin',         '灵动海豚',   '🐬', 'animal',  '#4dd0e1', '#00838f'],
  ['legend_bee',             '蜜糖蜜蜂',   '🐝', 'animal',  '#ffd54f', '#ff8f00'],
  ['legend_ladybug',         '幸运瓢虫',   '🐞', 'animal',  '#ef5350', '#c62828'],
  ['legend_crystal_ball',    '占卜水晶',   '🔮', 'diamond', '#ba68c8', '#6a1b9a'],
  ['legend_galaxy_spin',     '星河旋转',   '💫', 'twist',   '#b388ff', '#7c4dff'],
  ['legend_love_gift',       '爱意礼盒',   '💝', 'heart',   '#ec407a', '#ad1457'],
  ['legend_wind_chime',      '风铃叮咚',   '🎐', 'long',    '#4dd0e1', '#0097a7'],
  ['legend_saturn',          '土星之环',   '🪐', 'diamond', '#ffd54f', '#ef6c00'],
  ['legend_snowflake',       '永恒雪花',   '❄️', 'star',    '#e3f2fd', '#90caf9'],
  ['legend_blueberry',       '蓝莓琥珀',   '🫐', 'round',   '#5c6bc0', '#283593'],
  ['legend_evil_eye',        '守护之眼',   '🧿', 'diamond', '#29b6f6', '#01579b'],
  ['legend_tiger',           '兽王虎影',   '🐯', 'animal',  '#ffb74d', '#e65100'],
  ['legend_falling_star',    '流星陨光',   '💫', 'twist',   '#fff59d', '#f57f17'],
  ['legend_diamond',         '永恒钻石',   '💎', 'diamond', '#80d8ff', '#40c4ff'],
  ['legend_party_popper',    '庆典礼炮',   '🎉', 'long',    '#ff5252', '#d50000'],
  ['legend_confetti_ball',   '五彩礼球',   '🎊', 'round',   '#ec407a', '#c2185b'],
  ['legend_gift_box',        '神秘礼盒',   '🎁', 'heart',   '#ff80ab', '#ad1457'],
  ['legend_ribbon',          '缎带蝴蝶',   '🎀', 'flower',  '#f48fb1', '#e91e63'],
  ['legend_cake',            '至福蛋糕',   '🎂', 'round',   '#ffcdd2', '#ec407a']
];

function _buildCommon(rows) {
  return rows.map(function (row, idx) {
    const id = row[0], name = row[1], emoji = row[2];
    const shape = row[3], color = row[4], glow = row[5];
    const level = row[6], r = row[7], unlocked = row[8];
    const slot = (idx % 10) + 1;
    const unlockCondition = slot === 10
      ? '装备传奇气球后激活该位置'
      : '第' + level + '关第' + slot + '个';
    return {
      id: id,
      name: name,
      emoji: emoji,
      rarity: r.rarity,
      rarityColor: r.color,
      unlockCondition: unlockCondition,
      unlocked: unlocked,
      isPaid: false,
      price: null,
      color: color,
      glowColor: glow,
      level: level,
      shape: shape
    };
  });
}

function _buildLegend(rows) {
  return rows.map(function (row) {
    return {
      id: row[0],
      name: row[1],
      emoji: row[2],
      rarity: RARITY_LEGEND.rarity,
      rarityColor: RARITY_LEGEND.color,
      unlockCondition: '限定付费解锁',
      unlocked: false,
      isPaid: true,
      price: '¥6',
      color: row[4],
      glowColor: row[5],
      level: 0,
      shape: row[3]
    };
  });
}

const BALLOON_TYPES = _buildCommon(_LEVEL_BALLOONS).concat(_buildLegend(_LEGEND_BALLOONS));

const LEVELS = [
  { id: 1, name: "糖果乐园", targetMin: 70, targetMax: 85, background: "candy",  description: "甜蜜的开始",         difficulty: 1, zoneWidth: 15, emojiSeq: "candy",
    balloonRanges: [[72,79],[74,81],[71,78],[75,82],[73,80],[70,77],[74,81],[72,79],[75,82],[71,78]] },
  { id: 2, name: "霓虹街道", targetMin: 78, targetMax: 88, background: "neon",   description: "城市的夜晚",         difficulty: 2, zoneWidth: 10, emojiSeq: "neon",
    balloonRanges: [[79,82],[81,84],[78,81],[82,85],[80,83],[77,80],[81,84],[79,82],[82,85],[78,81]] },
  { id: 3, name: "暗红熔炉", targetMin: 80, targetMax: 87, background: "lava",   description: "极限高温挑战",       difficulty: 3, zoneWidth: 7,  emojiSeq: "lava",
    balloonRanges: [[81,83],[83,85],[80,82],[84,86],[82,84],[79,81],[83,85],[81,83],[84,86],[80,82]] },
  { id: 4, name: "云端神殿", targetMin: 83, targetMax: 86, background: "temple", description: "隐藏指针，感受气息", difficulty: 4, zoneWidth: 3,  emojiSeq: "temple",
    balloonRanges: [[83,83],[85,85],[82,82],[86,86],[84,84],[81,81],[85,85],[83,83],[86,86],[82,82]] }
];

const TEAM_MEMBERS = [
  { rank: 1, avatar: "", avatarColor: "#ff6eb4", name: "糖果小仙女", score: 2840, isLeader: true },
  { rank: 2, avatar: "", avatarColor: "#40c4ff", name: "霓虹战士",   score: 2310 },
  { rank: 3, avatar: "", avatarColor: "#b388ff", name: "星河漫游者", score: 1980 },
  { rank: 4, avatar: "", avatarColor: "#ff6d00", name: "烈焰骑士",   score: 1750 },
  { rank: 5, avatar: "", avatarColor: "#69ff47", name: "薄荷冰淇淋", score: 1620 }
];

module.exports = { BALLOON_TYPES, LEVELS, TEAM_MEMBERS };
```

### js/audio.js

```javascript
/**
 * 音效路径与开关（资源在 audio/ 下，扩展名统一小写 .mp3，真机 Android 区分大小写）
 */
const store = require('./store');

const MUSIC_PATH = 'audio/music.mp3';

const FILES = {
  pump: 'daqisheng',
  explode: 'baozha',
  louqi: 'louqi',
  mofa: 'mofa',
  chenggong: 'chenggong'
};

let _bgm = null;
let _bgmWantPlay = false;

/** 返回音效路径（真机 Android 区分大小写，统一用小写 .mp3） */
function pathsFor(kind) {
  const base = FILES[kind];
  if (!base) return [];
  return ['audio/' + base + '.mp3'];
}

function isSoundOn() {
  try {
    const s = store.getSettings && store.getSettings();
    return !s || s.soundOn !== false;
  } catch (_) {
    return true;
  }
}

function isVibrationOn() {
  try {
    const s = store.getSettings && store.getSettings();
    return !s || s.vibrationOn !== false;
  } catch (_) {
    return true;
  }
}

function isMusicOn() {
  try {
    const s = store.getSettings && store.getSettings();
    return !s || s.musicOn !== false;
  } catch (_) {
    return true;
  }
}

function _ensureBgm() {
  if (_bgm) return _bgm;
  if (typeof wx === 'undefined' || typeof wx.createInnerAudioContext !== 'function') return null;
  try {
    const audio = wx.createInnerAudioContext();
    audio.src = MUSIC_PATH;
    audio.loop = true;
    audio.obeyMuteSwitch = false;
    audio.volume = 0.55;
    if (audio.onError) {
      audio.onError((err) => {
        console.warn('[audio] bgm onError:', MUSIC_PATH, err && (err.errMsg || err));
      });
    }
    _bgm = audio;
    return audio;
  } catch (e) {
    console.warn('[audio] bgm init failed:', e && e.message);
    return null;
  }
}

function startBgm() {
  _bgmWantPlay = true;
  if (!isMusicOn()) return;
  const audio = _ensureBgm();
  if (!audio) return;
  try {
    if (typeof audio.play === 'function') audio.play();
  } catch (e) {
    console.warn('[audio] bgm play failed:', e && e.message);
  }
}

function stopBgm() {
  _bgmWantPlay = false;
  const audio = _bgm;
  if (!audio) return;
  try {
    if (typeof audio.stop === 'function') audio.stop();
    else if (typeof audio.pause === 'function') audio.pause();
  } catch (_) { /* ignore */ }
}

function pauseBgm() {
  const audio = _bgm;
  if (!audio) return;
  try {
    if (typeof audio.pause === 'function') audio.pause();
  } catch (_) { /* ignore */ }
}

function resumeBgm() {
  if (!isMusicOn() || !_bgmWantPlay) return;
  const audio = _ensureBgm();
  if (!audio) return;
  try {
    if (typeof audio.play === 'function') audio.play();
  } catch (e) {
    console.warn('[audio] bgm resume failed:', e && e.message);
  }
}

function syncBgmFromSettings() {
  if (isMusicOn()) startBgm();
  else stopBgm();
}

/** 与 FILES 键一致：pump / explode / louqi / mofa / chenggong */
const VIBRATION_FOR = {
  pump: 'light',
  explode: 'heavy',
  louqi: 'medium',
  mofa: 'medium',
  chenggong: 'light'
};

function _callVibrateLong() {
  if (typeof wx === 'undefined' || typeof wx.vibrateLong !== 'function') return false;
  try {
    wx.vibrateLong({});
    return true;
  } catch (e) {
    console.warn('[audio] vibrateLong failed:', e && e.message);
    return false;
  }
}

/**
 * iOS 的 wx.vibrateShort 必须带合法 type（heavy/medium/light），否则异步 fail 不震；
 * 失败时用 fail 回调兜底到 vibrateLong（安卓多数机型支持）。
 */
function _callVibrateShort(type) {
  if (typeof wx === 'undefined' || typeof wx.vibrateShort !== 'function') return false;
  try {
    wx.vibrateShort({
      type: type || 'medium',
      fail: (e) => {
        console.warn('[audio] vibrateShort fail:', e && (e.errMsg || e.message || e));
        _callVibrateLong();
      }
    });
    return true;
  } catch (e) {
    console.warn('[audio] vibrateShort throw:', type || 'default', e && e.message);
    return false;
  }
}

/** 须在用户手势回调内同步调用（勿包 setTimeout），否则真机可能不震 */
function vibrateFor(kind) {
  if (!isVibrationOn()) return;
  if (typeof wx === 'undefined') return;
  const type = VIBRATION_FOR[kind] || 'medium';
  if (!_callVibrateShort(type)) {
    _callVibrateLong();
  }
}

function applyInnerAudioOption() {
  if (typeof wx === 'undefined' || typeof wx.setInnerAudioOption !== 'function') return;
  try {
    wx.setInnerAudioOption({ obeyMuteSwitch: false, mixWithOther: false });
  } catch (e) {
    console.warn('[audio] setInnerAudioOption failed:', e && e.message);
  }
}

module.exports = {
  pathsFor,
  isSoundOn,
  isMusicOn,
  isVibrationOn,
  vibrateFor,
  applyInnerAudioOption,
  startBgm,
  stopBgm,
  pauseBgm,
  resumeBgm,
  syncBgmFromSettings,
  MUSIC_PATH,
  FILES
};
```

### js/raf.js

```javascript
function now() {
  return Date.now();
}

function createRaf() {
  let id = 0;
  const timers = new Map();
  // 用模块加载时刻作为时间原点，回调接收"自启动累计的毫秒数"，
  // 对齐浏览器 requestAnimationFrame(DOMHighResTimeStamp) 语义，
  // 这样基于 time 做相位计算的动画（首页粒子/装饰气球/Logo float、战队页粒子等）才会真正动起来。
  const origin = now();

  function requestAnimationFrame(cb) {
    id += 1;
    const handle = id;
    const timer = setTimeout(() => {
      timers.delete(handle);
      cb(now() - origin);
    }, 16);
    timers.set(handle, timer);
    return handle;
  }

  function cancelAnimationFrame(handle) {
    const timer = timers.get(handle);
    if (timer) clearTimeout(timer);
    timers.delete(handle);
  }

  return { requestAnimationFrame, cancelAnimationFrame };
}

module.exports = { createRaf };
```

### js/ui-theme.js

```javascript
/**
 * 全局 UI 令牌 — 微信小游戏 Canvas 2D
 * 方向：深空冷底 + 青紫高光 + 克制粉（仅强调/危险）
 * 字体：系统中文栈（无需额外字体文件）
 */
module.exports = {
  font: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',

  // 文本层级
  text: '#eef2ff',
  textMuted: 'rgba(238,242,255,0.58)',
  textDim: 'rgba(238,242,255,0.38)',
  textInverse: '#0b1020',

  // 品牌高光（主交互、描边）—— 整体下调饱和度，避免真机显示过艳
  accent: '#7dd3fc',
  accentDeep: '#38bdf8',
  violet: '#a78bfa',
  violetDeep: '#818cf8',
  danger: '#f87171',
  success: '#86efac',
  successDeep: '#4ade80',
  gold: '#fcd34d',
  // amber 用于「超压」填充与超压辉光：换成浅红 (light rose)，避免与目标区绿色冲突显黄
  amber: '#fda4af',

  // 线框 / 玻璃
  stroke: 'rgba(125,211,252,0.22)',
  strokeSoft: 'rgba(148,163,184,0.14)',
  strokeViolet: 'rgba(167,139,250,0.32)',
  glass: 'rgba(15,23,42,0.72)',
  glassLight: 'rgba(255,255,255,0.06)',

  // 常用整串（Canvas 直接用）
  shadowTitle: 'rgba(56,189,248,0.35)',
  shadowAccent: 'rgba(167,139,250,0.4)',
  panelStroke: 'rgba(125,211,252,0.18)',
  pillGoldStroke: 'rgba(252,211,77,0.42)',
  ambientBalloon: 'rgba(56,189,248,0.06)',
  cardCurrentFill: 'rgba(56,189,248,0.1)',
  cardCurrentStroke: 'rgba(125,211,252,0.45)',
  cardEmptyStroke: 'rgba(148,163,184,0.12)',
  cardDoneStroke: 'rgba(74,222,128,0.38)',
  cardDoneFill: 'rgba(34,197,94,0.1)'
};
```

### js/layout-safe.js

```javascript
/**
 * 顶栏与微信胶囊对齐（逻辑像素，与 game.js canvas 尺寸一致）。
 * getCapsuleLayout() 可在每帧调用；内部为轻量同步 API。
 */
function getCapsuleLayout() {
  const fallback = {
    top: 28,
    bottom: 64,
    height: 32,
    left: 280,
    width: 88,
    statusBar: 24,
    windowWidth: 375,
    windowHeight: 812
  };

  if (typeof wx === 'undefined' || !wx.getSystemInfoSync) {
    const capsuleCenterY = fallback.top + fallback.height / 2;
    const contentTop = fallback.bottom + 10;
    const safeBottomInset = 20;
    return Object.assign({}, fallback, {
      capsuleCenterY,
      contentTop,
      innerTitleY: capsuleCenterY,
      navTitleY: capsuleCenterY,
      safeBottomInset
    });
  }

  const sys = wx.getSystemInfoSync();
  const statusBar = Number(sys.statusBarHeight) || 24;
  const windowWidth = Number(sys.windowWidth) || 375;
  const windowHeight = Number(sys.windowHeight) || Number(sys.screenHeight) || 667;

  let top = statusBar + 4;
  let bottom = statusBar + 36;
  let height = 32;
  let left = windowWidth - 96;
  let width = 88;

  if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
    try {
      const m = wx.getMenuButtonBoundingClientRect();
      if (m && typeof m.top === 'number' && typeof m.height === 'number' && m.height > 0) {
        top = m.top;
        bottom = m.bottom;
        height = m.height;
        if (typeof m.left === 'number') left = m.left;
        if (typeof m.width === 'number') width = m.width;
      }
    } catch (e) { /* 模拟器或异常时保持估算 */ }
  }

  const capsuleCenterY = top + height / 2;
  const contentTop = bottom + 10;

  /** 底部非安全区高度（如 Home 指示条），用于把操作钮整体上移 */
  let safeBottomInset = 0;
  if (sys.safeArea && typeof sys.safeArea.bottom === 'number') {
    safeBottomInset = Math.max(0, windowHeight - sys.safeArea.bottom);
  }
  safeBottomInset = Math.min(48, Math.round(safeBottomInset));

  return {
    top,
    bottom,
    height,
    left,
    width,
    statusBar,
    windowWidth,
    windowHeight,
    capsuleCenterY,
    contentTop,
    innerTitleY: capsuleCenterY,
    navTitleY: capsuleCenterY,
    safeBottomInset
  };
}

/** 弹窗在可视区内垂直居中，上下留空对称（含底部 Home 指示条安全区） */
function centerModalY(windowH, modalH, options) {
  const o = options || {};
  const layout = getCapsuleLayout();
  const h = Number(windowH) || layout.windowHeight || 667;
  const mh = Math.max(0, Number(modalH) || 0);
  const padTop = o.padTop != null ? o.padTop : 12;
  const padBottom = o.padBottom != null
    ? o.padBottom
    : Math.max(12, (layout.safeBottomInset || 0) + 10);
  const avail = h - padTop - padBottom;
  return padTop + Math.max(0, Math.round((avail - mh) / 2));
}

module.exports = { getCapsuleLayout, centerModalY };
```

### js/emoji-sequences.js

```javascript
const { BALLOON_TYPES } = require('./balloons');

const _byLevel = {};
BALLOON_TYPES.forEach(b => {
  if (!b.isPaid && b.level >= 1 && b.level <= 4) {
    if (!_byLevel[b.level]) _byLevel[b.level] = [];
    _byLevel[b.level].push(b);
  }
});

const EMOJI_SEQUENCES = {};
for (let lv = 1; lv <= 4; lv++) {
  const list = (_byLevel[lv] || []).slice(0, 10);
  EMOJI_SEQUENCES[lv] = list.map((b, i) => ({
    index: i,
    emoji: b.emoji,
    shape: b.shape,
    color: b.color,
    glowColor: b.glowColor,
    name: b.name,
    isLegendSlot: i === 9,
    balloonId: b.id
  }));
}

function getSequence(levelNum) {
  return EMOJI_SEQUENCES[levelNum] || EMOJI_SEQUENCES[1];
}

function getBalloonAt(levelNum, index) {
  const seq = getSequence(levelNum);
  return seq[index] || seq[seq.length - 1];
}

module.exports = { EMOJI_SEQUENCES, getSequence, getBalloonAt };
```

### js/cloud-db.js

```javascript
/**
 * 云数据库增删改查封装（小游戏端）
 *
 * 用法示例：
 *   const dbApi = require('./cloud-db');
 *   dbApi.createUser('oXXX', { nickName: '微信用户', level: 1, score: 0 });
 *   dbApi.queryWhere('teams', { leaderOpenid: 'oXXX' });
 *   dbApi.updateById('users', '记录_id', { score: 100 });
 */
const cloud = require('./cloud');

function _getDb() {
  const db = cloud.getDatabase();
  if (!db) throw new Error('云数据库未初始化，请确认 game.js 已 wx.cloud.init');
  return db;
}

function _errMsg(err) {
  return (err && err.errMsg) || (err && err.message) || String(err);
}

// ─── 通用 CRUD ─────────────────────────────────────────────

/** 新增一条记录，返回 { _id, errMsg, stats } */
function add(collection, data) {
  return _getDb().collection(collection).add({ data });
}

/** 条件查询，返回记录数组 */
function queryWhere(collection, where, options) {
  const limit = (options && options.limit) || 20;
  const skip = (options && options.skip) || 0;
  const orderBy = options && options.orderBy;
  const order = (options && options.order) || 'desc';

  let q = _getDb().collection(collection).where(where);
  if (orderBy) q = q.orderBy(orderBy, order);
  return q.skip(skip).limit(limit).get().then((res) => res.data || []);
}

/** 按文档 _id 查单条 */
function getById(collection, docId) {
  return _getDb().collection(collection).doc(docId).get()
    .then((res) => (res.data || null));
}

/** 按 _id 更新（部分字段） */
function updateById(collection, docId, data) {
  return _getDb().collection(collection).doc(docId).update({ data });
}

/** 按 _id 删除 */
function removeById(collection, docId) {
  return _getDb().collection(collection).doc(docId).remove();
}

// ─── users 业务示例 ─────────────────────────────────────────

/** 4.1 创建用户 */
function createUser(openid, fields) {
  const f = fields || {};
  return add('users', {
    openid,
    nickName: f.nickName != null ? f.nickName : '微信用户',
    level: f.level != null ? f.level : 1,
    score: f.score != null ? f.score : 0,
    createTime: Date.now(),
    updatedAt: Date.now()
  });
}

/** 按 openid 查用户（数组，通常 0 或 1 条） */
function findUsersByOpenid(openid) {
  return queryWhere('users', { openid: openid });
}

/** 4.3 按文档 _id 改分数等字段 */
function updateUser(docId, data) {
  return updateById('users', docId, Object.assign({}, data, { updatedAt: Date.now() }));
}

/** 按 openid 更新（先查再改，省去手动拿 _id） */
function updateUserByOpenid(openid, data) {
  return findUsersByOpenid(openid).then((list) => {
    if (!list.length) return Promise.reject(new Error('用户不存在: ' + openid));
    return updateUser(list[0]._id, data);
  });
}

// ─── teams 业务示例 ─────────────────────────────────────────

/** 4.2 查自己当队长的队伍 */
function getTeamsByLeaderOpenid(leaderOpenid) {
  return queryWhere('teams', { leaderOpenid: leaderOpenid });
}

module.exports = {
  add,
  queryWhere,
  getById,
  updateById,
  removeById,
  createUser,
  findUsersByOpenid,
  updateUser,
  updateUserByOpenid,
  getTeamsByLeaderOpenid,
  _errMsg
};
```

### js/cloud-team.js

```javascript
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
```

### js/cloud-pay.js

```javascript
/**
 * 云支付：createOrder → 调起支付 → 轮询发货（单个传奇）
 */
const { useMockPay, readIOS, isDevelopEnv } = require('./platform');

const LEGEND_PRICE_YUAN_DEFAULT = 1.99;

function createOrder({ totalFee, body, balloonId, goodsName, goodsContent }) {
  if (!balloonId) return Promise.reject(new Error('balloonId 必填'));
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return Promise.reject(new Error('wx.cloud 不可用'));
  }
  return wx.cloud.callFunction({
    name: 'createOrder',
    data: { totalFee, body, balloonId, goodsName, goodsContent }
  }).then((res) => {
    const result = res.result || {};
    if (!result.success) {
      return Promise.reject(new Error(result.errMsg || '创建订单失败'));
    }
    return result;
  });
}

function createLegendOrder(balloonId, options) {
  const opts = options || {};
  const totalFee = opts.totalFee != null
    ? opts.totalFee
    : Math.round((opts.priceYuan != null ? opts.priceYuan : LEGEND_PRICE_YUAN_DEFAULT) * 100);
  const legendName = (opts.meta && opts.meta.name) ? opts.meta.name : '传奇气球';
  const body = opts.body || (opts.meta && opts.meta.name ? '传奇·' + opts.meta.name : '传奇气球');
  const goodsName = opts.goodsName || '传奇气球礼包';
  const goodsContent = opts.goodsContent || (legendName + '×1');
  return createOrder({ totalFee, body, balloonId, goodsName, goodsContent });
}

/** 云开发统一下单返回的 payment 调起微信支付 */
function invokeCloudPayment(payment) {
  return new Promise((resolve, reject) => {
    if (!payment) {
      reject(new Error('payment 为空'));
      return;
    }
    if (typeof wx.requestPayment !== 'function') {
      reject(new Error('当前环境不支持 wx.requestPayment，请用 mockPay=1 调试'));
      return;
    }
    const opts = Object.assign({}, payment, {
      success: resolve,
      fail: reject
    });
    wx.requestPayment(opts);
  });
}

function getOrderByNo(outTradeNo) {
  return wx.cloud.callFunction({
    name: 'getOrder',
    data: { outTradeNo }
  }).then((res) => {
    const r = res.result || {};
    if (!r.ok) return null;
    return r.order;
  });
}

/** 等待 payNotify 把订单标为已发货 */
function pollOrderDelivered(outTradeNo, options) {
  const maxAttempts = (options && options.maxAttempts) || 20;
  const intervalMs = (options && options.intervalMs) || 800;
  let attempts = 0;

  function tick() {
    return getOrderByNo(outTradeNo).then((order) => {
      if (order && (order.deliverStatus === 'DELIVERED' || order.balloonSent === true)) {
        return order;
      }
      attempts += 1;
      if (attempts >= maxAttempts) {
        return Promise.reject(new Error('支付成功，发货确认超时，请稍后在图鉴查看'));
      }
      return new Promise((r) => setTimeout(r, intervalMs)).then(tick);
    });
  }
  return tick();
}

function canUseRealPay() {
  if (readIOS()) return false;
  if (useMockPay()) return false;
  return typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callFunction === 'function';
}

/**
 * 购买单个传奇：真支付或 mock
 * @returns {Promise<{ channel: 'cloud_pay'|'mock_pay', outTradeNo?: string, order?: object }>}
 */
function purchaseLegendBalloon(balloonId, options) {
  const opts = options || {};
  if (!canUseRealPay()) {
    if (useMockPay() && typeof console !== 'undefined') {
      console.log('[cloud-pay] 模拟支付 mock_pay（无需商户号） balloonId=', balloonId);
    }
    return Promise.resolve({ channel: 'mock_pay' });
  }
```

---

## 后 2000 行

> 共 2000 行

### cloudfunctions/leaveTeam/team-utils.js

```javascript
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
```

### cloudfunctions/disbandTeam/index.js

```javascript
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
```

### cloudfunctions/disbandTeam/team-utils.js

```javascript
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
```

### cloudfunctions/inviteToTeam/index.js

```javascript
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
```

### cloudfunctions/inviteToTeam/team-utils.js

```javascript
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
```

### cloudfunctions/handleTeamInvite/index.js

```javascript
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
```

### cloudfunctions/handleTeamInvite/team-utils.js

```javascript
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
```

### cloudfunctions/renameTeam/index.js

```javascript
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
```

### cloudfunctions/renameTeam/team-utils.js

```javascript
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
```

### cloudfunctions/recordFullClear/index.js

```javascript
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
```

### cloudfunctions/recordFullClear/team-utils.js

```javascript
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
```

### cloudfunctions/settleTeamRankRewards/index.js

```javascript
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
```

### cloudfunctions/settleTeamRankRewards/team-utils.js

```javascript
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
```

### cloudfunctions/clearExpiredInvite/index.js

```javascript
const cloud = require('wx-server-sdk')
const { ok, fail } = require('./response.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const BATCH = 50

exports.main = async () => {
  try {
    const now = Date.now()
    const res = await db.collection('team_invites').where({
      status: 'active',
      expireTime: _.lte(now)
    }).limit(BATCH).get()

    const list = res.data || []
    let updated = 0
    for (const row of list) {
      await db.collection('team_invites').doc(row._id).update({
        data: { status: 'expired' }
      })
      updated += 1
    }

    return ok({ processed: list.length, expired: updated }, 'ok')
  } catch (e) {
    console.error('[clearExpiredInvite]', e)
    return fail(e.message || String(e))
  }
}
```

