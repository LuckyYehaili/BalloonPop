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
