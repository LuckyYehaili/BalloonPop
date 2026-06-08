// Battle Scene (PRD 3.x)
// 昨天恢复的关键改动（before 2026-05-09 19:00）：
//   1. 顶部「充气挑战」标题栏 + 单一「本关进度」大卡片（含进度格）
//   2. 进度小方框 cardShrink=8、cardGap=12、panelInnerPadY=10；小气球在方框中居中
//   3. 仪表盘 +30% 放大，gaugeCY 距底部安全区 32+ 距离
//   4. 圆形按钮 hit-test、tip「按住圆形按钮充气哦」；失败先出原文案弹窗，取消后置灰，再点圆形出「继续挑战」
//   5. 「充气过头」改为「气球炸了！」，失败弹窗参考完美充气紫红主题
//   6. 完美充气改为绿色矢量气球 + 大按钮 + 进度圆点同行计数
//   7. 全局弹窗左右各 40（宽 W-80）；标题 ≤18 / 正文与按钮 14 / 辅助 12
//   8. 重开 toast 统一 90% 不透明 / 14px
const { drawText, drawEmojiCentered, drawButton, drawButtonGradient, drawImage, getImage, loadImages, showToast, showModal, closeModal, gradientPink, gradientGold, gradientGreen, roundRect, measureText, measureWrappedTextHeight, beginScrollView, endScrollView, drawWrappedText, drawModalBackground, drawToggle } = require('../engine/canvas-ui');
const { drawBattleAmbient } = require('../engine/battle-ambient');
const { pathsFor, isSoundOn, vibrateFor, syncBgmFromSettings } = require('../audio');
const { drawBalloon, drawBalloonShape, drawExplosionBurst, spawnExplosion, resetParticles, getBalloonCenter } = require('../engine/balloon-renderer');
const { drawBouquetCompletionAnim } = require('../engine/bouquet-renderer');
const { drawGauge } = require('../engine/gauge-renderer');
const { getCapsuleLayout, centerModalY } = require('../layout-safe');
const store = require('../store');
const {
  toastIfLegendPurchaseBlocked,
  getLegendPurchaseConfirmCopy,
  runLegendPurchase,
  LEGEND_PRICE_YUAN_DEFAULT
} = require('../legend-purchase');
const { LEVELS, BALLOON_TYPES } = require('../balloons');
const { getSequence } = require('../emoji-sequences');
const { shareBouquetAsImage, normalizeBalloonList } = require('../bouquet-share');
const legalModal = require('../engine/legal-modal');

const AD_RESTART_GRANT = 2;
const MAX_CUMULATIVE_RETRIES = 5;

/** 二次确认弹窗正文统一：14px / 行距 20 / 常规字重 */
const CONFIRM_BODY = { fs: 14, lh: 20, color: 'rgba(255,255,255,0.88)', fw: 400 };

/** 通关分享文案：按关卡随机一条（索引 = 关卡号 1~4） */
const SHARE_TITLES_BY_LEVEL = {
  1: [
    '解锁可爱气球，实现气球自由，玩着超开心～',
    '送你一束传奇气球，愿你今天拥有彩虹般的好心情！ ✨',
    '一起来玩呀～简单小挑战，气球超好看，等你来拿！',
    '气球赏心悦目，玩着玩着就笑出声了。',
    '入门小菜一碟，这束气球我先抱走啦！'
  ],
  2: [
    '难度悄悄上来，全程小心翼翼，生怕气球突然爆开。',
    '节奏变得紧张，我猜你未必能轻松过关哦～',
    '送你一束心跳气球，愿你紧张中也保持好心情！ 😄',
    '敢来接受挑战吗？气球岌岌可危，一起来护住它们！ 🔥',
    '考验十足，时刻紧盯气球，玩得格外刺激。',
    '好不容易闯过，心跳加速，稍有失误就会爆炸。'
  ],
  3: [
    '险象环生，好几次惊险避险，气球差点就爆开了！',
    '全程神经紧绷，坚持下来太不容易啦，你能撑得住吗？',
    '送你一束勇气气球，愿你在惊险中也能遇见好运气！ 🎈',
    '一起来挑战吧！难度拉满，看你能否守护到底～',
    '危机不断袭来，每一步都忐忑，一般人可顶不住。',
    '惊心动魄的守护战，闯关体验超带感！'
  ],
  4: [
    '一路闯到终点，气球全部保住，成就感直接拉满！',
    '圆满通关，这点挑战对我来说就是小 case～',
    '送你一束胜利气球，愿你心情如气球般轻盈飞扬！ 🌈',
    '惊险旅程落幕，气球自由稳稳拿捏，一起来玩呀！',
    '终于闯完所有关卡，全程有惊无险，快来试试通关吧。',
    '一路有惊无险，收获满满气球！送你一束好心情，一起来玩呀！'
  ]
};

/** 取该关卡的随机分享文案；无对应关卡时回退到通用文案 */
function _pickShareTitle(level) {
  const list = SHARE_TITLES_BY_LEVEL[level];
  if (list && list.length) {
    return list[Math.floor(Math.random() * list.length)];
  }
  return '我通关了第' + level + '关，快来看看这束气球！';
}
const AUDIO_SRC = {
  pump: pathsFor('pump'),
  explode: pathsFor('explode'),
  louqi: pathsFor('louqi'),
  mofa: pathsFor('mofa'),
  chenggong: pathsFor('chenggong')
};

function _paidBalloonTypesOrdered() {
  const list = BALLOON_TYPES.filter(b => b.isPaid);
  const order = new Map(list.map((b, i) => [b.id, i]));
  return list.slice().sort((a, b) => {
    const qa = store.getBalloonQuantity(a.id) || 0;
    const qb = store.getBalloonQuantity(b.id) || 0;
    const oa = qa > 0, ob = qb > 0;
    if (oa !== ob) return oa ? -1 : 1;
    if (oa && ob && qa !== qb) return qb - qa;
    return (order.get(a.id) || 0) - (order.get(b.id) || 0);
  });
}

/** 第十格未装备时轮播展示的传奇预览（按关卡稳定取一只） */
function _legendShowcaseForLevel(levelIdx) {
  const paid = BALLOON_TYPES.filter(b => b.isPaid);
  if (!paid.length) return { emoji: '👑', name: '传奇气球' };
  return paid[Math.abs(levelIdx) % paid.length];
}

function _normalizeBouquetBalloon(item) {
  const meta = item && item.balloonId ? BALLOON_TYPES.find(b => b.id === item.balloonId) : null;
  if (!meta) return item || {};
  return Object.assign({}, item, {
    emoji: item.emoji || meta.emoji,
    shape: item.shape || meta.shape,
    color: item.color || meta.color,
    glowColor: item.glowColor || meta.glowColor
  });
}

let state = {
  currentLevelIdx: 0, level: LEVELS[0], bgKey: 'candy',
  pressure: 0, isHolding: false, gameState: 'idle', isGameActive: true,
  isExploding: false, flashWhite: false,
  isPerfect: false,
  balloonInLevel: 0, completedInLevel: 0, completedBalloonsList: [],
  currentColor: '#ff6eb4', currentGlow: '#ff6eb4', currentShape: 'round', currentEmoji: '🎈',
  restartChances: 3, failCount: 0, failTitle: '', failDesc: '', failSamplePressure: null, failChoiceMode: 'hasRestart', failReason: 'low',
  showLevelComplete: false, levelBonusPts: 0,
  showSettings: false, soundOn: true, showLegendSelect: false, legendBalloons: [],
  showLegendPayConfirm: false, legendPayBalloonId: null,
  legendSelectScrollY: 0,
  _legendSelectDrag: null,
  showLegendSlotChoice: false, legendSlot10ChoiceDone: false, legendSlot10OpenedPurchase: false,
  /** 第十格弹窗：purchase=无可用传奇；owned=已有可装备传奇 */
  legendSlot10Mode: 'purchase',
  legendSlot10AutoEquipId: null,
  showAbandonConfirm: false, showResetChallengeConfirm: false, showSharePreview: false,   showTutorial: false, tutorialStep: 0,
  showAdRestartModal: false, adRestartModalContent: '',
  failHelpOpen: false,
  failFresh: false,
  showRestartDoneToast: false, restartDoneToastRemain: 0, toastTimer: null,
  time: 0, gaugeHidden: false, paidBalloonUsed: false,
  shareTextIndex: 0, bouquetReady: false,
  bouquetAnimStartMs: 0,
  synInflateRun: false,
  synInflateComplete: false,
  synSelections: null,
  synInflateQueue: [],
  synAllBalloons: [],
  synPumpStartIdx: 0,
  synQueueIdx: 0,
  synTotalCount: 0,
  // 圆形按钮 hit-test & 提示
  pumpDisabled: false,
  showPumpTip: false,
  pumpTipTimer: null
};


module.exports = {

  onShow(data) {
    const settings = store.getSettings();
    state.soundOn = settings.soundOn !== false;

    const user = store.getUser();
    const firstTime = !!user.isFirstTime;
    if (firstTime) {
      store.updateUser({ isFirstTime: false });
    }

    try { loadImages(['images/ui/setting.png'], () => {}); } catch (_) {}

    // 进场就提前创建两个音频实例，开始后台加载，首次按下不丢首声
    this._ensurePumpAudio();
    this._ensureExplodeAudio();
    this._ensureOneShotBattleAudio('louqi');
    this._ensureOneShotBattleAudio('mofa');
    this._ensureOneShotBattleAudio('chenggong');

    if (data && data.synInflateRun) {
      if (state.pumpTipTimer) { clearTimeout(state.pumpTipTimer); state.pumpTipTimer = null; }
      state.showPumpTip = false;
      state.showTutorial = false;
      this._initSynInflateRun(data);
      return;
    }

    this._initLevel();

    if (data && data.isNewGame) { /* First time flow */ }

    if (firstTime) {
      state.showTutorial = true;
    } else {
      this._showPumpTipFor(3000);
    }

    if (data && data.debugLevelComplete) {
      if (state.pumpTipTimer) { clearTimeout(state.pumpTipTimer); state.pumpTipTimer = null; }
      state.showPumpTip = false;
      state.showTutorial = false;
      this.__debugApplyLevelCompleteModal();
    }
  },

  /** 开发者工具控制台调试用：打开「关卡完成」弹窗（需先 switchTo('battle',{debugLevelComplete:true})） */
  __debugApplyLevelCompleteModal() {
    const seq = getSequence(state.level.id);
    state.completedBalloonsList = seq.slice(0, 10).map((item, i) => ({
      emoji: item.emoji,
      shape: item.shape,
      color: item.color,
      glowColor: item.glowColor,
      isPaid: i === 9
    }));
    state.showLevelComplete = true;
    state.levelBonusPts = (state.currentLevelIdx + 1) * 500;
    state.gameState = 'idle';
    state.isGameActive = false;
    state.balloonInLevel = 0;
    state.completedInLevel = 10;
    state.failHelpOpen = false;
    state.showSettings = false;
    state.showLegendSelect = false;
    state.showLegendPayConfirm = false;
    state.showLegendSlotChoice = false;
    state.legendSlot10ChoiceDone = false;
    state.legendSlot10OpenedPurchase = false;
    state.legendSlot10Mode = 'purchase';
    state.legendSlot10AutoEquipId = null;
    state.showAbandonConfirm = false;
    state.showSharePreview = false;
    state.showAdRestartModal = false;
    state.pumpDisabled = false;
    state.bouquetAnimStartMs = Date.now();
    this._modalVibrate('mofa');
    this._playOneShotBattleAudio('mofa', 48);
    try { console.log('[debug] Level complete modal'); } catch (_) {}
  },

  // 前台恢复（分享后返回、被拉起后返回等）：仅恢复音频与设置，
  // 严禁重置关卡或关闭弹窗——保留通关气球束弹窗等当前状态，不自动进入下一关。
  onResume() {
    const settings = store.getSettings();
    state.soundOn = settings.soundOn !== false;
    this._ensurePumpAudio();
    this._ensureExplodeAudio();
    this._ensureOneShotBattleAudio('louqi');
    this._ensureOneShotBattleAudio('mofa');
    this._ensureOneShotBattleAudio('chenggong');
  },

  onHide() {
    if (state.toastTimer) { clearTimeout(state.toastTimer); state.toastTimer = null; }
    if (this._pumpTimer) { clearInterval(this._pumpTimer); this._pumpTimer = null; }
    if (state.pumpTipTimer) { clearTimeout(state.pumpTipTimer); state.pumpTipTimer = null; }
    if (this._explosionSoundTimer) {
      try { clearTimeout(this._explosionSoundTimer); } catch (_) {}
      this._explosionSoundTimer = null;
    }
    if (this._louqiSoundTimer) {
      try { clearTimeout(this._louqiSoundTimer); } catch (_) {}
      this._louqiSoundTimer = null;
    }
    if (this._mofaSoundTimer) {
      try { clearTimeout(this._mofaSoundTimer); } catch (_) {}
      this._mofaSoundTimer = null;
    }
    if (this._chenggongSoundTimer) {
      try { clearTimeout(this._chenggongSoundTimer); } catch (_) {}
      this._chenggongSoundTimer = null;
    }
    state.isHolding = false;
    state.showPumpTip = false;
    this._stopPumpAudio();
  },

  _clearSynInflateState() {
    state.synInflateRun = false;
    state.synInflateComplete = false;
    state.synSelections = null;
    state.synInflateQueue = [];
    state.synAllBalloons = [];
    state.synPumpStartIdx = 0;
    state.synQueueIdx = 0;
    state.synTotalCount = 0;
  },

  _initSynInflateRun(data) {
    const lv2 = LEVELS[1];
    this._clearSynInflateState();
    state.synInflateRun = true;
    state.synSelections = data.selections || {};
    state.synInflateQueue = (data.queue || []).slice();
    state.synAllBalloons = (data.allBalloons || []).slice();
    state.synPumpStartIdx = 0;
    state.synTotalCount = data.total || state.synAllBalloons.length;
    state.synQueueIdx = 0;
    state.currentLevelIdx = 1;
    state.level = lv2;
    state.bgKey = lv2.background || 'neon';
    state.restartChances = store.getFreeRetries(2) || 3;
    state.paidBalloonUsed = false;
    state.pressure = 0;
    state.isHolding = false;
    state.gameState = 'idle';
    state.isGameActive = true;
    state.isExploding = false;
    state.flashWhite = false;
    state.completedBalloonsList = [];
    state.completedInLevel = 0;
    state.balloonInLevel = 0;
    state.failCount = 0;
    state.showLevelComplete = false;
    state.showSettings = false;
    state.showLegendSelect = false;
    state.showTutorial = false;
    state.showAbandonConfirm = false;
    state.showResetChallengeConfirm = false;
    state.showSharePreview = false;
    state.showAdRestartModal = false;
    state.showLegendSlotChoice = false;
    state.legendSlot10ChoiceDone = true;
    state.legendSlot10OpenedPurchase = false;
    state.legendSlot10Mode = 'purchase';
    state.legendSlot10AutoEquipId = null;
    state.pumpDisabled = false;
    state.failFresh = false;
    state.failSamplePressure = null;
    state.showPumpTip = false;
    resetParticles();
    this._syncDerived({});
    if (!state.synInflateQueue.length) {
      showToast('请先选择要合成的气球');
      this._clearSynInflateState();
      this.manager.switchTo('collection', { activeTab: 'bouquet' });
      return;
    }
    this._showPumpTipFor(3000);
  },

  _finishSynInflateRun() {
    const selections = state.synSelections || {};
    const total = Object.keys(selections).reduce((s, id) => s + (selections[id] || 0), 0);
    for (const id of Object.keys(selections)) {
      if (!store.removeBalloon(id, selections[id])) {
        showToast('扣除失败，请重试');
        this._clearSynInflateState();
        this.manager.switchTo('collection', { activeTab: 'bouquet' });
        return;
      }
    }
    const names = [];
    Object.keys(selections).forEach(id => {
      const m = BALLOON_TYPES.find(b => b.id === id);
      if (m) names.push(m.name);
    });
    const balloonList = (state.completedBalloonsList || []).slice();
    store.addBouquet({
      level: 0,
      hasLegend: true,
      isSynthesized: true,
      sourceBalloonIds: Object.keys(selections),
      sourceBalloonName: names.join('·'),
      balloons: balloonList
    });
    store.addTransaction({
      type: 'synthesize',
      balloonId: Object.keys(selections).join(','),
      quantity: -total,
      counterparty: '',
      status: 'success'
    });
    state.synInflateComplete = true;
    state.showLevelComplete = true;
    state.gameState = 'idle';
    state.isGameActive = false;
    state.bouquetReady = false;
    state.bouquetAnimStartMs = Date.now();
    this._modalVibrate('mofa');
    this._playOneShotBattleAudio('mofa', 48);
  },

  _handleSynNextBalloon() {
    const item = state.synInflateQueue[state.synQueueIdx];
    if (!item) {
      this._finishSynInflateRun();
      return;
    }
    state.completedBalloonsList = (state.completedBalloonsList || []).concat([{
      balloonId: item.balloonId,
      name: item.name,
      emoji: item.emoji,
      shape: item.shape,
      color: item.color,
      glowColor: item.glowColor,
      isPaid: true
    }]);
    state.completedInLevel = state.completedBalloonsList.length;
    state.synQueueIdx += 1;
    state.pumpDisabled = false;
    if (state.synQueueIdx >= state.synInflateQueue.length) {
      this._finishSynInflateRun();
      return;
    }
    state.balloonInLevel = state.synPumpStartIdx + state.synQueueIdx;
    state.pressure = 0;
    state.gameState = 'idle';
    this._syncDerived({});
    resetParticles();
  },

  _initLevel() {
    this._clearSynInflateState();
    const lastLevel = store.getLastPlayedLevel();
    const unlocked = store.getUnlockedLevels();
    const maxUnlocked = Math.max(...unlocked);
    const validLevel = lastLevel <= maxUnlocked ? lastLevel : maxUnlocked;
    const levelIdx = validLevel - 1;
    const retries = store.getFreeRetries(validLevel);
    const equippedId = store.getEquippedLegend(levelIdx);

    state.currentLevelIdx = levelIdx;
    state.restartChances = retries;
    state.paidBalloonUsed = !!equippedId;
    store.validateEquippedLegends();
    this._syncDerived({ currentLevelIdx: levelIdx });
    state.pressure = 0; state.isHolding = false; state.gameState = 'idle';
    state.isGameActive = true; state.isExploding = false; state.flashWhite = false;
    state.balloonInLevel = 0; state.completedInLevel = 0; state.completedBalloonsList = [];
    state.failCount = 0; state.showLevelComplete = false; state.showSettings = false;
    state.showLegendSelect = false; state.showTutorial = false;
    state.showAbandonConfirm = false; state.showResetChallengeConfirm = false; state.showSharePreview = false;
    state.showAdRestartModal = false;
    state.showLegendSlotChoice = false;
    state.legendSlot10ChoiceDone = false;
    state.legendSlot10OpenedPurchase = false;
    state.legendSlot10Mode = 'purchase';
    state.legendSlot10AutoEquipId = null;
    state.pumpDisabled = false;
    state.failFresh = false;
    state.failSamplePressure = null;
    state.showPumpTip = false;
    if (state.pumpTipTimer) { clearTimeout(state.pumpTipTimer); state.pumpTipTimer = null; }
  },

  _syncDerived(next) {
    if (state.synInflateRun) {
      const idx = state.synPumpStartIdx + state.synQueueIdx;
      const item = state.synInflateQueue[state.synQueueIdx] || state.synAllBalloons[idx] || {};
      state.currentColor = item.color || '#b388ff';
      state.currentGlow = item.glowColor || '#7c4dff';
      state.currentShape = item.shape || 'round';
      state.currentEmoji = item.emoji || '🎈';
      return;
    }
    const idx = next && next.currentLevelIdx !== undefined ? next.currentLevelIdx : state.currentLevelIdx;
    const lv = LEVELS[idx % LEVELS.length];
    const bg = lv.background || 'candy';
    const seq = getSequence(lv.id);
    const balloonIdx = state.balloonInLevel;
    const equippedId = balloonIdx === 9 ? store.getEquippedLegend(idx) : '';
    const equippedMeta = equippedId ? BALLOON_TYPES.find(b => b.id === equippedId) : null;
    const currentSeqItem = equippedMeta || seq[balloonIdx] || seq[0];

    state.level = lv;
    state.bgKey = bg;
    state.currentColor = currentSeqItem.color;
    state.currentGlow = currentSeqItem.glowColor;
    state.currentShape = currentSeqItem.shape;
    state.currentEmoji = currentSeqItem.emoji || '🎈';
    state.gaugeHidden = (bg === 'temple' && state.gameState === 'playing');
  },

  _refreshFlags() {
    return {
      disabledHold: !state.isGameActive || state.gameState === 'success' || state.showLevelComplete || state.showSettings || state.showLegendSlotChoice || state.showLegendSelect || state.showAbandonConfirm || state.showResetChallengeConfirm || state.showSharePreview || state.showAdRestartModal,
      maskNative: state.gameState === 'fail' || state.showLevelComplete || state.showSettings || state.showLegendSlotChoice || state.showLegendSelect || state.showAbandonConfirm || state.showResetChallengeConfirm || state.showSharePreview || state.showAdRestartModal
    };
  },

  // 任意会挡住「按住充气」交互的弹窗 / 提示是否在场
  _anyModalBlockingPumpTip() {
    return !!(state.gameState === 'fail' || state.showLevelComplete || state.showSettings || state.showLegendSlotChoice || state.showLegendSelect || state.showAbandonConfirm || state.showResetChallengeConfirm || state.showSharePreview || state.showAdRestartModal || state.showTutorial || legalModal.isLegalModalOpen() || state.failHelpOpen);
  },

  /** 是否绘制全屏黑蒙层（仅弹窗，不含会自动消失的 toast） */
  _battleDimBackdrop() {
    if (state.synInflateRun) {
      return !!(this._anyModalBlockingPumpTip()
        || (state.gameState === 'success' && !state.showLevelComplete));
    }
    return !!(this._anyModalBlockingPumpTip()
      || (state.gameState === 'success' && state.balloonInLevel < 9 && !state.showLevelComplete));
  },

  _showPumpTipFor(ms) {
    if (this._anyModalBlockingPumpTip() || state.pumpDisabled) return;
    state.showPumpTip = true;
    if (state.pumpTipTimer) clearTimeout(state.pumpTipTimer);
    state.pumpTipTimer = setTimeout(() => { state.showPumpTip = false; state.pumpTipTimer = null; }, ms || 2000);
  },

  // ─── Render ──────────────────────────────────────
  render(ctx, W, H) {
    state.time += 0.04;
    drawBattleAmbient(ctx, W, H, state.bgKey, state.time);
    const flags = this._refreshFlags();
    const UI = this;
    const L = getCapsuleLayout();

    // ─── 顶部导航栏（充气挑战 + 副标题） ─────────────
    const navTitleY = Math.max(L.navTitleY || 32, 32);
    drawIconBtn(ctx, 14, navTitleY - 22, 44, 'images/ui/setting.png', UI, 'openSettings');

    ctx.save();
    ctx.shadowColor = 'rgba(244,114,182,0.4)';
    ctx.shadowBlur = 8;
    drawText(ctx, '充气挑战', W / 2, navTitleY, '#ffffff', 22, 'center', undefined, 800);
    ctx.shadowBlur = 0;
    ctx.restore();

    const subY = navTitleY + 22;
    const subText = state.synInflateRun
      ? '🚩 合成气球束关卡'
      : ('🚩 第 ' + (state.currentLevelIdx + 1) + ' 关 ｜ ' + state.level.name);
    drawText(ctx, subText, W / 2, subY, 'rgba(255,255,255,0.55)', 12, 'center', undefined, 400);

    // ─── 「本关进度」大卡片（标题区 + 进度格） ─────────
    // 纵向均匀布局：上边距 = 标题↔卡片间距 = 下边距（3 段相等）
    const panelTop = subY + 18;
    const panelInnerPadX = 12;
    const headerH = 26;          // 标题/pill 内容行实际高度（pill 高 26）
    const cardCount = 5;
    const cardGap = 12;
    const cardPadBase = 14 + panelInnerPadX;
    const fitSize = Math.floor((W - cardPadBase * 2 - (cardCount - 1) * cardGap) / cardCount);
    const cardShrink = 8;
    const cardSize = Math.max(40, fitSize - cardShrink);
    const cardPad = cardPadBase + Math.floor((fitSize - cardSize) * cardCount / 2);
    const cardsBlockH = cardSize * 2 + cardGap;
    const panelGap = 14;          // 三段相等的纵向间距
    const panelH = panelGap * 3 + headerH + cardsBlockH;

    ctx.save();
    roundRect(ctx, 12, panelTop, W - 24, panelH, 18);
    const panelGrad = ctx.createLinearGradient(0, panelTop, 0, panelTop + panelH);
    panelGrad.addColorStop(0, 'rgba(6,4,18,0.92)');
    panelGrad.addColorStop(1, 'rgba(3,2,12,0.92)');
    ctx.fillStyle = panelGrad; ctx.fill();
    ctx.strokeStyle = 'rgba(180,60,200,0.28)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();

    // 头部：本关进度 / 重开次数 / 进度 pill —— 左右与小卡片区严格对齐
    const cardsLeft = cardPad;
    const cardsRight = cardPad + cardCount * cardSize + (cardCount - 1) * cardGap;
    const cardsCenterX = (cardsLeft + cardsRight) / 2;
    const headerY = panelTop + panelGap;
    const headerCY = headerY + headerH / 2;
    drawText(ctx, state.synInflateRun ? '合成进度' : '本关进度', cardsLeft, headerCY, '#ffffff', 14, 'left', undefined, 700);
    drawText(ctx, '重开次数 ' + state.restartChances, cardsCenterX, headerCY, 'rgba(255,255,255,0.7)', 12, 'center', undefined, 500);

    const progressTotal = state.synInflateRun ? state.synTotalCount : 10;
    const pillText = '✦ ' + state.completedInLevel + '/' + progressTotal;
    const pillTW = measureText(ctx, pillText, 12, 600);
    const pillW = Math.max(72, Math.ceil(pillTW + 22));
    const pillX = cardsRight - pillW;
    const pillY = headerCY - 13;
    ctx.save();
    roundRect(ctx, pillX, pillY, pillW, 26, 13);
    const pg = ctx.createLinearGradient(pillX, pillY, pillX, pillY + 26);
    pg.addColorStop(0, 'rgba(255,215,0,0.18)'); pg.addColorStop(1, 'rgba(30,8,50,0.7)');
    ctx.fillStyle = pg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,0,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
    drawText(ctx, pillText, pillX + pillW / 2, pillY + 13, '#ffd740', 12, 'center', undefined, 600);
    if (!state.synInflateRun && (state.balloonInLevel < 9 || state.legendSlot10ChoiceDone)) {
      UI.manager.addTouchable(pillX, pillY, pillW, 26, 'openLegendSelect');
    }

    // ─── 进度方格（2×5） ────────────────────
    const slots = this._buildSlots();
    const row1Y = headerY + headerH + panelGap;   // 标题↔卡片 = panelGap
    const row2Y = row1Y + cardSize + cardGap;
    [0, 1].forEach(row => {
      const rowY = row === 0 ? row1Y : row2Y;
      const rowSlots = slots.slice(row * cardCount, (row + 1) * cardCount);
      rowSlots.forEach((s, col) => {
        const cx = cardPad + col * (cardSize + cardGap) + cardSize / 2;
        const cy = rowY + cardSize / 2;

        ctx.save();
        roundRect(ctx, cx - cardSize / 2, rowY, cardSize, cardSize, cardSize * 0.22);
        if (s.isPaid) {
          if (s.isBought) {
            ctx.fillStyle = 'rgba(255,215,0,0.1)'; ctx.fill();
            ctx.strokeStyle = 'rgba(255,215,0,0.7)'; ctx.lineWidth = 2.5;
            ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
          } else if (s.status === 'current') {
            ctx.fillStyle = 'rgba(255,109,0,0.2)'; ctx.fill();
            ctx.strokeStyle = 'rgba(255,109,0,0.8)'; ctx.lineWidth = 2.5;
            ctx.shadowColor = '#ff6d00'; ctx.shadowBlur = 14;
            ctx.stroke(); ctx.shadowBlur = 0;
          } else {
            ctx.fillStyle = s.status === 'done' ? 'rgba(255,215,0,0.15)' : 'rgba(255,215,0,0.06)';
            ctx.fill();
            ctx.strokeStyle = s.status === 'done' ? 'rgba(255,215,0,0.7)' : 'rgba(255,215,0,0.45)';
            ctx.lineWidth = s.status === 'done' ? 2.5 : 1.5;
            ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
          }
        } else if (s.status === 'done') {
          ctx.fillStyle = 'rgba(0,230,118,0.08)'; ctx.fill();
          ctx.strokeStyle = 'rgba(0,230,118,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.beginPath(); ctx.arc(cx + cardSize * 0.28, cy - cardSize * 0.28, cardSize * 0.12, 0, Math.PI * 2);
          ctx.fillStyle = '#00e676'; ctx.shadowColor = '#00e676'; ctx.shadowBlur = 6;
          ctx.fill(); ctx.shadowBlur = 0;
          drawText(ctx, '✓', cx + cardSize * 0.28, cy - cardSize * 0.28, '#fff', cardSize * 0.18, 'center');
        } else if (s.status === 'current') {
          ctx.fillStyle = 'rgba(244,114,182,0.1)'; ctx.fill();
          ctx.strokeStyle = 'rgba(244,114,182,0.45)'; ctx.lineWidth = 2.5;
          ctx.shadowColor = s.color || '#f472b6'; ctx.shadowBlur = 8;
          ctx.stroke(); ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.restore();

        // 进度格 emoji；第十格未装备传奇时默认球与预览传奇轮播
        const emojiFs = Math.max(20, cardSize * 0.42);
        const baseAlpha = s.status === 'empty' ? 0.35 : 1;
        if (s.carouselDefault && s.carouselLegend) {
          const phase = (Math.sin(state.time * 2.6) + 1) / 2;
          ctx.save();
          ctx.globalAlpha = baseAlpha * (1 - phase);
          drawEmojiCentered(ctx, s.carouselDefault.emoji || '🔶', cx, cy, '#ffffff', emojiFs, undefined, 500);
          ctx.globalAlpha = baseAlpha * phase;
          drawEmojiCentered(ctx, s.carouselLegend.emoji || '👑', cx, cy, '#ffffff', emojiFs, undefined, 500);
          ctx.restore();
        } else {
          ctx.save();
          ctx.globalAlpha = baseAlpha;
          drawEmojiCentered(ctx, s.emoji || (s.isPaid ? '🔶' : '🎈'), cx, cy, '#ffffff', emojiFs, undefined, 500);
          ctx.restore();
        }

        if (s.isPaid) {
          const badgeR = cardSize * 0.16;
          const bx = cx + cardSize / 2 - badgeR * 0.6;
          const by = rowY + badgeR * 0.6;
          ctx.save();
          const bgGrad = ctx.createLinearGradient(bx - badgeR, by - badgeR, bx + badgeR, by + badgeR);
          bgGrad.addColorStop(0, '#ffd700'); bgGrad.addColorStop(1, '#ff9100');
          ctx.beginPath(); ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
          ctx.fillStyle = bgGrad; ctx.shadowColor = 'rgba(255,215,0,0.6)'; ctx.shadowBlur = 6;
          ctx.fill(); ctx.shadowBlur = 0;
          ctx.restore();
          const crownImg = this.canvasUI.getImage && this.canvasUI.getImage('images/ui/crown.png');
          if (crownImg) {
            const ciSize = badgeR * 1.3;
            drawImage(ctx, 'images/ui/crown.png', bx - ciSize / 2, by - ciSize / 2, ciSize, ciSize);
          } else {
            drawText(ctx, '👑', bx, by, '#fff', badgeR * 1.2, 'center');
          }
          if (!state.synInflateRun && (state.balloonInLevel < 9 || state.legendSlot10ChoiceDone)) {
            UI.manager.addTouchable(cx - cardSize / 2, rowY, cardSize, cardSize, 'openLegendSelect');
          }
        }
      });
    });

    // 传奇购买提示（第十格前提示；第十格用轮播 + 弹窗引导）
    const panelBottom = panelTop + panelH;
    let belowY = panelBottom + 8;
    const hintH = (!state.synInflateRun && (state.paidBalloonUsed || state.balloonInLevel >= 9)) ? 0 : (state.synInflateRun ? 0 : 18);
    if (!state.synInflateRun && !state.paidBalloonUsed && state.balloonInLevel < 9) {
      drawText(ctx, '可以购买传奇气球替换第十个气球', W / 2,
        belowY + 6, 'rgba(255,255,255,0.7)', 12, 'center');
      UI.manager.addTouchable(W / 2 - 110, belowY - 4, 220, 22, 'openLegendSelect');
      belowY += hintH + 6;
    }

    // ─── 仪表盘 / 圆形按钮（约 +20% 尺寸，更贴近底边） ──
    const safeBottom = (L.safeBottomInset || 0);
    const GAUGE_LAYOUT_SCALE = 1.2;
    const padBelowArc = Math.max(10, safeBottom + 6);
    const gaugeSize = Math.min(W * 1.26 * 1.3 * GAUGE_LAYOUT_SCALE, 562, W - 12);
    const arcR = gaugeSize * 0.55 * 0.5;
    const gaugeCY = H - padBelowArc - arcR + 28;
    const gaugeCX = W / 2;

    // 中心球区域 = 顶部内容下方 ~ 仪表盘上方
    const gameTop = belowY + 4;
    const gameBottom = gaugeCY - arcR - 6;
    const gameH = Math.max(140, gameBottom - gameTop);

    // Ambient glow（气球区背景，略加强以便与气球光晕衔接）
    const ambCX = W / 2, ambCY = gameTop + gameH * 0.5;
    const ambGrad = ctx.createRadialGradient(ambCX, ambCY, gameH * 0.05, ambCX, ambCY, gameH * 0.55);
    ambGrad.addColorStop(0, 'rgba(255,80,200,0.08)');
    ambGrad.addColorStop(0.5, 'rgba(255,80,200,0.03)');
    ambGrad.addColorStop(1, 'rgba(255,80,200,0)');
    ctx.save(); ctx.beginPath(); ctx.arc(ambCX, ambCY, gameH * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = ambGrad; ctx.fill(); ctx.restore();

    if (!flags.maskNative) {
      drawBalloon(ctx, W, gameTop, gameH, state.pressure, state.currentColor, state.currentGlow, state.currentShape, state.isExploding, state.gameState === 'success', this.dpr, state.currentEmoji);
    }

    // Gauge（带 isDisabled 置灰）
    if (!flags.maskNative) {
      drawGauge(
        ctx, gaugeCX, gaugeCY, gaugeSize * 0.55,
        state.pressure, state.level.targetMin, state.level.targetMax,
        state.gaugeHidden, state.isHolding, state.time,
        state.pumpDisabled
      );
    }
    // 记录圆形按钮 hit-test 区域（gauge-renderer 内部按钮半径 = SIZE * 0.21；SIZE = gaugeSize * 0.55）
    this._pumpBtn = {
      cx: gaugeCX, cy: gaugeCY,
      r: (gaugeSize * 0.55) * 0.21,
      visible: !flags.maskNative
    };

    // Flash
    if (state.flashWhite) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(0, 0, W, H);
    }

    // 充气提示（仅在没有弹窗、未置灰时展示）
    if (state.showPumpTip && !this._anyModalBlockingPumpTip() && !state.pumpDisabled && !flags.maskNative) {
      this._drawPumpTip(ctx, W, H, gaugeCX, gaugeCY - arcR);
    }

    // ─── Modals ─────────────────────────────────
    if (this._battleDimBackdrop()) drawModalBackground(ctx, W, H);
    if (state.showTutorial) this._drawTutorialModal(ctx, W, H);
    if (state.gameState === 'fail') this._drawFailModal(ctx, W, H);
    if (state.showLevelComplete) this._drawLevelCompleteModal(ctx, W, H);
    if (state.showSettings) this._drawSettingsModal(ctx, W, H);
    if (state.showLegendSlotChoice) this._drawLegendSlotChoiceModal(ctx, W, H);
    if (state.showLegendSelect) {
      this._drawLegendSelect(ctx, W, H);
      if (state.showLegendPayConfirm) this._drawLegendPayConfirm(ctx, W, H);
    }
    if (state.showRestartDoneToast) this._drawRestartToast(ctx, W, H);
    if (state.showAdRestartModal) this._drawAdRestartModal(ctx, W, H);
    if (state.showAbandonConfirm) this._drawAbandonConfirm(ctx, W, H);
    if (state.showResetChallengeConfirm) this._drawResetChallengeConfirm(ctx, W, H);
    if (legalModal.isLegalModalOpen()) {
      legalModal.drawLegalModal(ctx, this, W, H, { borderColor: 'rgba(255,80,200,0.4)', closeHandler: 'closeLegalModal' });
    }
    if (state.gameState === 'success' && !state.showLevelComplete
      && (state.synInflateRun || state.balloonInLevel < 9)) {
      this._drawSuccessModal(ctx, W, H);
    }
  },

  // ─── Progress slots builder ────────────────
  _buildSlots() {
    if (state.synInflateRun) {
      const all = state.synAllBalloons || [];
      const currentIdx = state.synPumpStartIdx + state.synQueueIdx;
      const successIdx = state.gameState === 'success'
        ? Math.min(all.length, currentIdx + 1)
        : state.completedInLevel;
      const slots = all.map((item, i) => ({
        id: i,
        emoji: item.emoji,
        shape: item.shape,
        color: item.color,
        glowColor: item.glowColor,
        status: i < successIdx ? 'done' : (i === currentIdx ? 'current' : 'empty'),
        isPaid: true,
        isBought: true,
        carouselDefault: null,
        carouselLegend: null
      }));
      while (slots.length < 10) {
        slots.push({
          id: slots.length,
          emoji: '',
          status: 'empty',
          isPaid: false,
          isBought: false,
          carouselDefault: null,
          carouselLegend: null
        });
      }
      return slots;
    }
    const seq = getSequence(state.level.id);
    const equippedId = store.getEquippedLegend(state.currentLevelIdx);
    const equippedMeta = equippedId ? BALLOON_TYPES.find(b => b.id === equippedId) : null;
    const showcase = !equippedMeta ? _legendShowcaseForLevel(state.currentLevelIdx) : null;
    // 当前关刚刚完美/成功时，立即把当前格视作 done（避免视觉上还停留在 current）
    const successIdx = (state.gameState === 'success') ? state.balloonInLevel + 1 : state.completedInLevel;
    return seq.map((item, i) => {
      const slotItem = (i === 9 && equippedMeta) ? equippedMeta : item;
      const carousel = i === 9 && !equippedMeta;
      return {
        id: i,
        emoji: slotItem.emoji,
        shape: slotItem.shape,
        color: slotItem.color,
        glowColor: slotItem.glowColor,
        status: i < successIdx ? 'done' : (i === state.balloonInLevel ? 'current' : 'empty'),
        isPaid: i === 9, isBought: state.paidBalloonUsed && i === 9,
        carouselDefault: carousel ? item : null,
        carouselLegend: carousel ? showcase : null
      };
    });
  },

  // ─── Touch handling ────────────────────────
  onTouch(type, x, y) {
    if (legalModal.handleLegalModalTouch(type, x, y)) return true;
    if (legalModal.isLegalModalOpen()) return false;

    const Wm = this.manager.width;
    const Hm = this.manager.height;

    // 选择传奇气球：列表区域上下滑动（拖动反向滚动，符合移动端直觉）
    if (state.showLegendSelect && !state.showLegendPayConfirm) {
      const L = this._getLegendSelectLayout(Wm, Hm);
      if (L && L.scrollMax > 0) {
        if (type === 'start' || type === 'begin') {
          if (x >= L.mx && x <= L.mx + L.mw && y >= L.gridY && y <= L.gridY + L.viewportH) {
            state._legendSelectDrag = { y0: y, scroll0: state.legendSelectScrollY };
            return true;
          }
        } else if (type === 'move' && state._legendSelectDrag) {
          let ns = state._legendSelectDrag.scroll0 - (y - state._legendSelectDrag.y0);
          if (ns < 0) ns = 0;
          if (ns > L.scrollMax) ns = L.scrollMax;
          state.legendSelectScrollY = ns;
          return true;
        } else if (type === 'end' || type === 'tap') {
          state._legendSelectDrag = null;
        }
      } else if (type === 'end' || type === 'tap') {
        state._legendSelectDrag = null;
      }
    }

    // 弹窗打开：屏蔽 start/begin（保留 tap/end 让按钮能命中），并清除提示
    const blocked = this._anyModalBlockingPumpTip();
    if (blocked) {
      if (type === 'start' || type === 'begin') {
        if (state.showPumpTip) {
          state.showPumpTip = false;
          if (state.pumpTipTimer) { clearTimeout(state.pumpTipTimer); state.pumpTipTimer = null; }
        }
        return true;
      }
      // 让 SceneManager 把 tap 派发给 addTouchable
      return false;
    }

    if (type === 'start' || type === 'begin') {
      if (!state.synInflateRun && state.balloonInLevel === 9 && !state.legendSlot10ChoiceDone) return true;
      if (!state.isGameActive || state.gameState === 'success' || state.isHolding) return true;

      // 置灰态：再次唤起「继续挑战」弹窗，不进入充气
      if (state.pumpDisabled) {
        state.gameState = 'fail';
        return true;
      }

      // hit-test 圆形按钮（容差 1.5 倍半径）
      const btn = this._pumpBtn;
      if (btn && btn.visible) {
        const dx = x - btn.cx, dy = y - btn.cy;
        const within = (dx * dx + dy * dy) <= (btn.r * 1.5) * (btn.r * 1.5);
        if (within) {
          state.isHolding = true;
          state.gameState = 'playing';
          state.showPumpTip = false;
          if (state.pumpTipTimer) { clearTimeout(state.pumpTipTimer); state.pumpTipTimer = null; }
          this._startPump();
          return true;
        }
      }
      // 按到了别的位置 —— 显示「按住圆形按钮充气哦」
      this._showPumpTipFor(2000);
      return true;
    }

    if (type === 'end' || type === 'tap') {
      if (state.isHolding) { state.isHolding = false; this._stopPump(); this._checkPressure(); }
      // 置灰时部分机型只触发 tap/end 不触发 start：点在圆形充气区仍打开继续挑战弹窗
      if (state.pumpDisabled && !state.isHolding && (type === 'tap' || type === 'end')) {
        const btn = this._pumpBtn;
        if (btn && btn.visible) {
          const dx = x - btn.cx, dy = y - btn.cy;
          if ((dx * dx + dy * dy) <= (btn.r * 1.5) * (btn.r * 1.5)) {
            state.gameState = 'fail';
            return true;
          }
        }
      }
      // 关键：返回 false 让 SceneManager 派发 tap 给 addTouchable 注册的按钮
      return false;
    }
    return false;
  },

  _startPump() {
    if (this._pumpTimer) clearInterval(this._pumpTimer);
    this._startPumpAudio();
    this._pumpTimer = setInterval(() => {
      const next = Math.min(state.pressure + (0.8 + Math.random() * 0.4), 100);
      state.pressure = next;
      if (next >= 100) {
        clearInterval(this._pumpTimer);
        this._pumpTimer = null;
        this._failPump('explode', 100);
      }
    }, 50);
  },

  _stopPump() {
    if (this._pumpTimer) { clearInterval(this._pumpTimer); this._pumpTimer = null; }
    this._stopPumpAudio();
  },

  /** 弹窗反馈震动（须在 touchend 同步链路内调用） */
  _modalVibrate(kind) {
    vibrateFor(kind);
  },

  /** 成功/失败弹窗出现前：立刻停掉打气循环音（含定时器与按住态） */
  _haltPumpSoundImmediately() {
    if (this._pumpTimer) {
      clearInterval(this._pumpTimer);
      this._pumpTimer = null;
    }
    state.isHolding = false;
    this._stopPumpAudio();
  },

  // ─── 充气音效（按下→松开循环播放）──────────────────────
  // 单例 wx.createInnerAudioContext + loop=true；按下 play()，松手 stop()。
  // 关键坑：① 不要在 play 前调 seek，未就绪时 seek 会让随后的 play 不响；
  //        ② iOS 必须 obeyMuteSwitch=false，否则静音键开着就没声；
  //        ③ 在 onShow 里就 ensure，让加载提前，首次按下不延迟。
  _ensurePumpAudio() {
    if (this._pumpAudio) return;
    if (typeof wx === 'undefined' || typeof wx.createInnerAudioContext !== 'function') return;
    try {
      const audio = wx.createInnerAudioContext();
      this._pumpAudioSrcIndex = 0;
      audio.src = AUDIO_SRC.pump[this._pumpAudioSrcIndex];
      audio.loop = true;
      audio.obeyMuteSwitch = false;
      audio.volume = 1.0;
      if (audio.onCanplay) audio.onCanplay(() => { console.log('[battle.pumpAudio] canplay:', audio.src); });
      if (audio.onPlay)    audio.onPlay(()    => { console.log('[battle.pumpAudio] playing:', audio.src); });
      if (audio.onStop)    audio.onStop(()    => { console.log('[battle.pumpAudio] stopped'); });
      if (audio.onError)   audio.onError((err)=> {
        console.warn('[battle.pumpAudio] onError:', audio.src, err && (err.errMsg || err));
        const next = (this._pumpAudioSrcIndex || 0) + 1;
        if (next < AUDIO_SRC.pump.length) {
          this._pumpAudioSrcIndex = next;
          audio.src = AUDIO_SRC.pump[next];
          console.log('[battle.pumpAudio] retry src:', audio.src);
          try { if (state.isHolding && typeof audio.play === 'function') audio.play(); } catch (_) {}
        }
      });
      this._pumpAudio = audio;
    } catch (e) {
      console.warn('[battle.pumpAudio] init failed:', e && e.message);
    }
  },
  _startPumpAudio() {
    if (!isSoundOn()) return;
    this._ensurePumpAudio();
    const a = this._pumpAudio;
    if (!a) return;
    try {
      // stop 之后 position 已经回到 0，无需 seek；
      // 直接 play()，没就绪也会先缓冲再播，不会丢声。
      if (typeof a.play === 'function') a.play();
    } catch (e) {
      console.warn('[battle.pumpAudio] play failed:', e && e.message);
    }
  },
  _stopPumpAudio() {
    const a = this._pumpAudio;
    if (!a) return;
    try { if (typeof a.stop === 'function') a.stop(); } catch (_) {}
  },

  // 爆炸音效（单次播放，不循环）
  _ensureExplodeAudio() {
    if (this._explodeAudio) return;
    if (typeof wx === 'undefined' || typeof wx.createInnerAudioContext !== 'function') return;
    try {
      const audio = wx.createInnerAudioContext();
      this._explodeAudioSrcIndex = 0;
      audio.src = AUDIO_SRC.explode[this._explodeAudioSrcIndex];
      audio.loop = false;
      audio.obeyMuteSwitch = false;
      audio.volume = 1.0;
      if (audio.onCanplay) audio.onCanplay(() => {
        console.log('[battle.explodeAudio] canplay:', audio.src);
        try {
          if (this._explodeAudioPendingPlay && typeof audio.play === 'function') audio.play();
        } catch (_) {}
      });
      if (audio.onPlay)    audio.onPlay(()    => { console.log('[battle.explodeAudio] playing:', audio.src); });
      if (audio.onEnded)   audio.onEnded(()   => { this._explodeAudioPendingPlay = false; console.log('[battle.explodeAudio] ended'); });
      if (audio.onError)   audio.onError((err)=> {
        console.warn('[battle.explodeAudio] onError:', audio.src, err && (err.errMsg || err));
        const next = (this._explodeAudioSrcIndex || 0) + 1;
        if (next < AUDIO_SRC.explode.length) {
          this._explodeAudioSrcIndex = next;
          audio.src = AUDIO_SRC.explode[next];
          console.log('[battle.explodeAudio] retry src:', audio.src);
          try { if (this._explodeAudioPendingPlay && typeof audio.play === 'function') audio.play(); } catch (_) {}
        }
      });
      this._explodeAudio = audio;
    } catch (e) {
      console.warn('[battle.explodeAudio] init failed:', e && e.message);
    }
  },
  _playExplosionAudio() {
    this._haltPumpSoundImmediately();
    this._ensureExplodeAudio();
    if (this._explosionSoundTimer) {
      try { clearTimeout(this._explosionSoundTimer); } catch (_) {}
      this._explosionSoundTimer = null;
    }
    const self = this;
    const fire = () => {
      self._explosionSoundTimer = null;
      if (!isSoundOn()) return;
      const a = self._explodeAudio;
      if (!a) return;
      try {
        if (typeof a.stop === 'function') a.stop();
        self._explodeAudioPendingPlay = true;
        if (typeof a.play === 'function') a.play();
      } catch (e) {
        console.warn('[battle.explodeAudio] play failed:', e && e.message);
      }
    };
    // 泵声刚停、失败弹窗刚出现时，同帧抢播爆炸音在部分机型会无声；短延迟与弹窗首帧对齐且避开音频切换竞态。
    if (typeof setTimeout === 'function') {
      this._explosionSoundTimer = setTimeout(fire, 48);
    } else {
      fire();
    }
  },

  /** 单次短音效（充气不足 louqi、通关花束 mofa、成功充气 chenggong 等），与爆炸音相同：canplay 补播 + 短延迟对齐弹窗 */
  _ensureOneShotBattleAudio(kind) {
    const audioKey = '_' + kind + 'Audio';
    if (this[audioKey]) return;
    if (typeof wx === 'undefined' || typeof wx.createInnerAudioContext !== 'function') return;
    const urls = AUDIO_SRC[kind];
    if (!urls || !urls.length) return;
    const scene = this;
    const pendingKey = '_' + kind + 'AudioPendingPlay';
    const srcIndexKey = '_' + kind + 'AudioSrcIndex';
    try {
      const audio = wx.createInnerAudioContext();
      this[srcIndexKey] = 0;
      audio.src = urls[this[srcIndexKey]];
      audio.loop = false;
      audio.obeyMuteSwitch = false;
      audio.volume = 1.0;
      if (audio.onCanplay) audio.onCanplay(() => {
        try {
          if (scene[pendingKey] && typeof audio.play === 'function') audio.play();
        } catch (_) {}
      });
      if (audio.onPlay) audio.onPlay(() => { try { console.log('[battle.' + kind + 'Audio] playing:', audio.src); } catch (_) {} });
      if (audio.onEnded) audio.onEnded(() => { scene[pendingKey] = false; });
      if (audio.onError) audio.onError((err) => {
        console.warn('[battle.' + kind + 'Audio] onError:', audio.src, err && (err.errMsg || err));
        const next = (scene[srcIndexKey] || 0) + 1;
        if (next < urls.length) {
          scene[srcIndexKey] = next;
          audio.src = urls[next];
          try { if (scene[pendingKey] && typeof audio.play === 'function') audio.play(); } catch (_) {}
        }
      });
      this[audioKey] = audio;
    } catch (e) {
      console.warn('[battle.' + kind + 'Audio] init failed:', e && e.message);
    }
  },
  _playOneShotBattleAudio(kind, delayMs) {
    this._haltPumpSoundImmediately();
    this._ensureOneShotBattleAudio(kind);
    const a = this['_' + kind + 'Audio'];
    const timerKey = '_' + kind + 'SoundTimer';
    if (this[timerKey]) {
      try { clearTimeout(this[timerKey]); } catch (_) {}
      this[timerKey] = null;
    }
    const scene = this;
    const pendingKey = '_' + kind + 'AudioPendingPlay';
    const fire = () => {
      scene[timerKey] = null;
      if (!isSoundOn()) return;
      if (!a) return;
      try {
        if (typeof a.stop === 'function') a.stop();
        scene[pendingKey] = true;
        if (typeof a.play === 'function') a.play();
      } catch (e) {
        console.warn('[battle.' + kind + 'Audio] play failed:', e && e.message);
      }
    };
    const d = delayMs == null ? 48 : delayMs;
    if (typeof setTimeout === 'function') {
      this[timerKey] = setTimeout(fire, d);
    } else {
      fire();
    }
  },

  _checkPressure() {
    const p = state.pressure;
    const { targetMin, targetMax } = state.level;
    if (p >= targetMin && p <= targetMax) {
      state.isPerfect = p >= targetMin + 0.5 && p <= targetMax - 0.5;
      if (state.synInflateRun) {
        const isLast = state.synQueueIdx >= state.synInflateQueue.length - 1;
        if (isLast) {
          this._haltPumpSoundImmediately();
          this._modalVibrate('mofa');
          state.gameState = 'success';
          setTimeout(() => this._handleNextBalloon(), 80);
          return;
        }
        this._modalVibrate('chenggong');
        this._playOneShotBattleAudio('chenggong', 0);
        state.gameState = 'success';
        return;
      }
      // 第 10 个：不播成功弹窗音，通关气球束弹窗在 _handleNextBalloon 里播 mofa
      if (state.balloonInLevel === 9) {
        this._haltPumpSoundImmediately();
        this._modalVibrate('mofa');
        state.gameState = 'success';
        setTimeout(() => this._handleNextBalloon(), 80);
        return;
      }
      this._modalVibrate('chenggong');
      this._playOneShotBattleAudio('chenggong', 0);
      state.gameState = 'success';
      return;
    }
    if (p > targetMax) { this._failPump('high', p); return; }
    this._failPump('low', p);
  },

  _failPump(reason, p) {
    this._haltPumpSoundImmediately();
    state.isExploding = reason === 'explode';
    state.flashWhite = reason === 'explode';
    state.pressure = 0; state.gameState = 'fail'; state.isGameActive = false;
    state.failCount++; state.failReason = reason;
    state.failSamplePressure = Math.round(p);
    state.failChoiceMode = state.restartChances > 0 ? 'hasRestart' : 'adOnly';
    const { targetMin, targetMax } = state.level;
    if (reason === 'explode') { state.failTitle = '气球炸了！'; state.failDesc = ''; }
    else if (reason === 'high') { state.failTitle = '气球炸了！'; state.failDesc = ''; }
    else { state.failTitle = '充气不足'; state.failDesc = ''; }
    if (reason === 'explode') { setTimeout(() => state.flashWhite = false, 150); setTimeout(() => state.isExploding = false, 520); }
    if (reason === 'explode') { const c = getBalloonCenter(); spawnExplosion(c.x, c.y); }
    if (reason === 'low') {
      this._modalVibrate('louqi');
      this._playOneShotBattleAudio('louqi', 48);
    } else {
      this._modalVibrate('explode');
      this._playExplosionAudio();
    }
    state.failFresh = true;
  },

  _resetInLevel() {
    if (state.synInflateRun) {
      const pre = (state.synAllBalloons || []).slice(0, state.synPumpStartIdx).map(item => ({
        balloonId: item.balloonId,
        name: item.name,
        emoji: item.emoji,
        shape: item.shape,
        color: item.color,
        glowColor: item.glowColor,
        isPaid: true
      }));
      state.pressure = 0;
      state.isHolding = false;
      state.isExploding = false;
      state.flashWhite = false;
      state.gameState = 'idle';
      state.isGameActive = true;
      state.failCount = 0;
      state.synQueueIdx = 0;
      state.completedBalloonsList = pre;
      state.completedInLevel = pre.length;
      state.balloonInLevel = state.synPumpStartIdx;
      state.pumpDisabled = false;
      state.failFresh = false;
      state.failSamplePressure = null;
      resetParticles();
      this._syncDerived({});
      return;
    }
    const lv = state.currentLevelIdx + 1;
    const retries = store.getFreeRetries(lv);
    state.pressure = 0; state.isHolding = false; state.isExploding = false; state.flashWhite = false;
    state.gameState = 'idle'; state.isGameActive = true; state.failCount = 0;
    state.completedInLevel = 0; state.balloonInLevel = 0; state.completedBalloonsList = [];
    state.restartChances = retries;
    state.pumpDisabled = false;
    state.failFresh = false;
    state.failSamplePressure = null;
    state.showLegendSlotChoice = false;
    state.legendSlot10ChoiceDone = false;
    state.legendSlot10OpenedPurchase = false;
    state.legendSlot10Mode = 'purchase';
    state.legendSlot10AutoEquipId = null;
    resetParticles();
    this._syncDerived({ balloonInLevel: 0, completedInLevel: 0 });
  },

  _handleNextBalloon() {
    if (state.synInflateRun) {
      this._handleSynNextBalloon();
      return;
    }
    const nextCompleted = state.completedInLevel + 1;
    const nextBalloon = state.balloonInLevel + 1;
    const seq = getSequence(state.level.id);
    const seqItem = seq[state.balloonInLevel] || seq[0];
    const equippedId = store.getEquippedLegend(state.currentLevelIdx);
    const isPaidSlot = state.balloonInLevel === 9 && !!equippedId;
    const equippedMeta = isPaidSlot ? BALLOON_TYPES.find(b => b.id === equippedId) : null;
    const completedMeta = equippedMeta || seqItem;
    if (!isPaidSlot && seqItem.balloonId) {
      store.addBalloon(seqItem.balloonId, 1, 'challenge');
    }
    const list = (state.completedBalloonsList || []).concat([{
      balloonId: completedMeta.balloonId || completedMeta.id,
      name: completedMeta.name,
      emoji: completedMeta.emoji,
      shape: completedMeta.shape,
      color: completedMeta.color,
      glowColor: completedMeta.glowColor,
      isPaid: isPaidSlot
    }]);

    state.pumpDisabled = false;

    if (nextBalloon === 9) {
      state.completedBalloonsList = list;
      state.completedInLevel = nextCompleted;
      state.balloonInLevel = 9;
      state.pressure = 0;
      state.gameState = 'idle';
      state.legendSlot10ChoiceDone = false;
      this._prepareLegendSlot10Choice();
      this._syncDerived({ balloonInLevel: 9, completedInLevel: nextCompleted });
      resetParticles();
      return;
    }

    if (nextBalloon >= 10) {
      const bonusPts = (state.currentLevelIdx + 1) * 500;
      const clearedLevel = state.currentLevelIdx + 1;
      store.unlockLevel(state.currentLevelIdx + 2);
      store.setLastPlayedLevel(Math.min(state.currentLevelIdx + 2, 4));
      store.addBouquet({ level: clearedLevel, hasLegend: isPaidSlot, balloons: list });
      if (clearedLevel === 1) {
        try { store.setFullRunAnchorIfNeeded(); } catch (_) {}
      }
      if (clearedLevel === 4) {
        const anchor = store.getFullRunAnchorMs ? store.getFullRunAnchorMs() : 0;
        const durationMs = anchor ? (Date.now() - anchor) : 0;
        store.addClearRecord({ isFullRun: true, durationMs, hasLegend: isPaidSlot });
        try { store.recordFullClear(); } catch (_) {}
        try { store.clearFullRunAnchor(); } catch (_) {}
        try {
          require('../cloud-team').recordFullClear('level_04')
            .then((r) => {
              if (r && r.success) return require('../cloud-team').syncTeamFromCloud();
            })
            .catch((e) => { console.warn('[battle] recordFullClear', e); });
        } catch (_) {}
      }
      state.completedBalloonsList = list; state.completedInLevel = 10; state.balloonInLevel = 0;
      state.showLevelComplete = true; state.levelBonusPts = bonusPts;
      this._playOneShotBattleAudio('mofa', 48);
      state.bouquetReady = false; state.bouquetAnimStartMs = Date.now();
      this._syncDerived({ completedInLevel: 10, balloonInLevel: 0 });
      resetParticles();
      return;
    }

    state.completedBalloonsList = list; state.completedInLevel = nextCompleted;
    state.balloonInLevel = nextBalloon; state.pressure = 0; state.gameState = 'idle';
    state.isGameActive = true; state.failCount = 0;
    this._syncDerived({ balloonInLevel: nextBalloon, completedInLevel: nextCompleted });
    resetParticles();
  },

  // ─── Pump tip（按住圆形按钮充气哦） ─────────────
  _drawPumpTip(ctx, W, H, anchorX, anchorY) {
    const text = '按住圆形按钮充气哦';
    const padX = 14, padY = 9;
    const fontSize = 14;
    const tw = measureText(ctx, text, fontSize, 600);
    const bw = Math.ceil(tw + padX * 2);
    const bh = Math.ceil(fontSize + padY * 2);
    const arrowH = 8;
    const arrowHalfW = 7;
    const r = 12;
    let bx = Math.round(anchorX - bw / 2);
    let by = Math.round(anchorY - bh - arrowH - 8);
    if (by < 80) by = 80;
    bx = Math.max(12, Math.min(W - 12 - bw, bx));

    const arrowX = Math.max(bx + r + arrowHalfW, Math.min(bx + bw - r - arrowHalfW, anchorX));
    const baseY = by + bh;
    const tipY = baseY + arrowH;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + bw - r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + r, r);
    ctx.lineTo(bx + bw, baseY - r);
    ctx.arcTo(bx + bw, baseY, bx + bw - r, baseY, r);
    ctx.lineTo(arrowX + arrowHalfW, baseY);
    ctx.lineTo(arrowX, tipY);
    ctx.lineTo(arrowX - arrowHalfW, baseY);
    ctx.lineTo(bx + r, baseY);
    ctx.arcTo(bx, baseY, bx, baseY - r, r);
    ctx.lineTo(bx, by + r);
    ctx.arcTo(bx, by, bx + r, by, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(17,24,39,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,200,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    drawText(ctx, text, bx + bw / 2, by + bh / 2, '#ffffff', fontSize, 'center', undefined, 600);
  },

  // ─── Modal background helper ─────────────────
  _drawModalBg(ctx, x, y, w, h, borderColor, radius) {
    ctx.save();
    roundRect(ctx, x, y, w, h, radius || 22);
    const grad = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
    grad.addColorStop(0, 'rgba(20,5,40,0.98)');
    grad.addColorStop(1, 'rgba(10,2,25,0.98)');
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = borderColor || 'rgba(255,80,200,0.35)';
    ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  },

  _drawSecondModalBackdrop(ctx, W, H) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.80)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },

  // ─── Tutorial Modal（左右各 40，标题 18 / 正文 14） ──
  _drawTutorialModal(ctx, W, H) {
    const mw = W - 80, mx = 40;
    const py = 22, px = 20;
    const heroH = 100, gap = 12, titleH = 22, descH = 50, btnH = 50;
    const mh = py + heroH + gap + titleH + gap + descH + gap + btnH + py;
    const my = (H - mh) / 2;

    ctx.save();
    this._drawModalBg(ctx, mx, my, mw, mh, 'rgba(255,80,200,0.4)');

    const heroImg = this.canvasUI.getImage && this.canvasUI.getImage('images/ui/balloon.png');
    if (heroImg) drawImage(ctx, 'images/ui/balloon.png', W / 2 - heroH / 2, my + py, heroH, heroH);
    else drawText(ctx, '🎈', W / 2, my + py + heroH / 2, '#ffffff', 56, 'center');

    drawText(ctx, '欢迎来到不准爆！', W / 2, my + py + heroH + gap + titleH / 2, '#ffffff', 18, 'center', undefined, 700);
    drawWrappedText(ctx, '长按圆形按钮为气球打气，在绿色区域及时松开，否则气球会爆炸哦～', mx + px, my + py + heroH + gap + titleH + gap, mw - px * 2, 22, 'rgba(255,255,255,0.7)', 14);

    const btn = drawButtonGradient(ctx, mx + px, my + mh - py - btnH, mw - px * 2, btnH, '开始吧', gradientPink, '#fff', 14, 14, undefined, 700);
    this.manager.addTouchable(btn.x, btn.y, btn.w, btn.h, 'closeTutorial');
    ctx.restore();
  },
  closeTutorial() {
    state.showTutorial = false;
    this._showPumpTipFor(3000);
  },

  // ─── Fail Modal：首次为「充气不足 / 气球炸了」；取消置灰后再点为「继续挑战」
  _drawFailModal(ctx, W, H) {
    const mw = W - 80, mx = 40;
    const py = 18, px = 18;
    const heroH = 72, gap = 8, titleH = 24, btnH = 46;
    const isAdOnly = state.failChoiceMode !== 'hasRestart';
    const hasSecondary = true;
    const helpBtnH = 20;
    const { targetMin, targetMax } = state.level;

    const pv = state.failSamplePressure != null ? state.failSamplePressure : '—';
    const detailFresh = '本关目标压力区间：' + targetMin + '~' + targetMax + '，本次：' + pv;
    const titleText = state.failFresh ? state.failTitle : '继续挑战';
    /** 标题 ↔ 压力行 ↔ 首按钮 等距（仅首次失败有压力行） */
    const midGap = 16;
    const bodyH = state.failFresh ? 22 : 0;
    const mh = state.failFresh
      ? py + helpBtnH + gap + heroH + gap + titleH + midGap + bodyH + midGap + btnH + gap + btnH + gap + 26 + py
      : py + helpBtnH + gap + heroH + gap + titleH + midGap + btnH + gap + btnH + gap + 26 + py;
    const my = (H - mh) / 2;

    const adLabel = '看广告再试一次';
    const resetLabel = isAdOnly ? '重置挑战' : '重新开始本关';
    const failBtnFs = 14;

    ctx.save();
    this._drawModalBg(ctx, mx, my, mw, mh, 'rgba(244,114,182,0.45)', 24);
    ctx.shadowColor = 'rgba(244,114,182,0.28)';
    ctx.shadowBlur = 14;
    roundRect(ctx, mx, my, mw, mh, 24);
    ctx.strokeStyle = 'rgba(244,114,182,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0;

    const helpW = 56, helpX = mx + mw - px - helpW;
    const helpY = my + py;
    ctx.save(); roundRect(ctx, helpX, helpY, helpW, helpBtnH, helpBtnH / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    drawText(ctx, '说明', helpX + helpW / 2, helpY + helpBtnH / 2, 'rgba(255,255,255,0.85)', 12, 'center', undefined, 500);
    this.manager.addTouchable(helpX, helpY, helpW, helpBtnH, 'openFailHelp');

    const heroY = my + py + helpBtnH + gap;
    const bounce = (Math.sin(state.time * 3) * 0.05 + 1);
    const isBurstFail = state.failReason === 'explode' || state.failReason === 'high'
      || state.failTitle === '气球炸了！';
    ctx.save();
    ctx.translate(W / 2, heroY + heroH / 2);
    ctx.scale(bounce, bounce);
    if (isBurstFail) {
      drawExplosionBurst(ctx, 0, 0, heroH);
    } else {
      drawBalloonShape(ctx, 'round', 0, 0, heroH * 0.42,
        '#f472b6', '#a78bfa', 0, 60, false, state.time, this.dpr, true);
    }
    ctx.restore();

    const titleY = heroY + heroH + gap;
    ctx.save();
    ctx.shadowColor = 'rgba(244,114,182,0.45)';
    ctx.shadowBlur = 10;
    drawText(ctx, titleText, W / 2, titleY + titleH / 2, '#f472b6', 18, 'center', undefined, 900);
    ctx.shadowBlur = 0;
    ctx.restore();

    const bodyY = titleY + titleH + midGap;
    if (state.failFresh) {
      drawText(ctx, detailFresh, W / 2, bodyY + bodyH / 2, 'rgba(255,255,255,0.82)', 14, 'center', undefined, 400);
    }

    const btnX = mx + px, btnW = mw - px * 2;
    const actionsTop = state.failFresh ? (bodyY + bodyH + midGap) : (titleY + titleH + midGap);

    ctx.save();
    roundRect(ctx, btnX, actionsTop, btnW, btnH, 16);
    const mg = ctx.createLinearGradient(btnX, actionsTop, btnX + btnW, actionsTop + btnH);
    mg.addColorStop(0, '#f472b6'); mg.addColorStop(1, '#a78bfa');
    ctx.fillStyle = mg; ctx.fill();
    ctx.shadowColor = 'rgba(244,114,182,0.32)'; ctx.shadowBlur = 10;
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.restore();
    drawText(ctx, adLabel, W / 2, actionsTop + btnH / 2, '#ffffff', failBtnFs, 'center', 'rgba(0,0,0,0.25)', 700);
    this.manager.addTouchable(btnX, actionsTop, btnW, btnH, 'watchAdContinue');

    if (hasSecondary) {
      const sy = actionsTop + btnH + gap;
      ctx.save();
      roundRect(ctx, btnX, sy, btnW, btnH, 16);
      ctx.fillStyle = 'rgba(244,114,182,0.06)'; ctx.fill();
      ctx.strokeStyle = 'rgba(244,114,182,0.42)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
      drawText(ctx, resetLabel, W / 2, sy + btnH / 2, '#f472b6', failBtnFs, 'center', undefined, 600);
      this.manager.addTouchable(btnX, sy, btnW, btnH, isAdOnly ? 'openResetChallengeConfirm' : 'restartFromFail');
    }

    const cancelY = actionsTop + btnH + (hasSecondary ? btnH + gap : 0) + gap;
    drawText(ctx, '取消', W / 2, cancelY + 13, 'rgba(255,255,255,0.7)', failBtnFs, 'center', undefined, 500);
    this.manager.addTouchable(btnX, cancelY, btnW, 28, 'cancelFailModal');
    ctx.restore();

    if (state.failHelpOpen) this._drawFailHelpPopup(ctx, W, H);
  },

  cancelFailModal() {
    if (this._explosionSoundTimer) {
      try { clearTimeout(this._explosionSoundTimer); } catch (_) {}
      this._explosionSoundTimer = null;
    }
    if (this._louqiSoundTimer) {
      try { clearTimeout(this._louqiSoundTimer); } catch (_) {}
      this._louqiSoundTimer = null;
    }
    if (this._mofaSoundTimer) {
      try { clearTimeout(this._mofaSoundTimer); } catch (_) {}
      this._mofaSoundTimer = null;
    }
    if (this._chenggongSoundTimer) {
      try { clearTimeout(this._chenggongSoundTimer); } catch (_) {}
      this._chenggongSoundTimer = null;
    }
    if (state.gameState === 'fail') {
      state.failHelpOpen = false;
      state.gameState = 'idle';
      state.isGameActive = false;
      state.pressure = 0;
      state.pumpDisabled = true;
      state.failFresh = false;
    }
  },
  openFailHelp() { state.failHelpOpen = true; },
  closeFailHelp() { state.failHelpOpen = false; },
  _drawFailHelpPopup(ctx, W, H) {
    const pw = W - 80, mx = 40;
    const py = 22, px = 20, gap = 12;
    const titleH = 22, lineGap = 22, btnH = 44;
    const isAdOnly = state.failChoiceMode !== 'hasRestart';
    const bodyLines = isAdOnly
      ? [
          '看广告再试一次：',
          '仅重打当前气球；',
          '重置挑战：',
          '清空闯关进度，从第 1 关重新开始。'
        ]
      : [
          '看广告再试一次：',
          '仅重打当前气球；',
          '重新开始本关：',
          '每次消耗1次重开机会；剩余重开次数 ' + state.restartChances + ' 次。'
        ];
    const ph = py + titleH + gap + bodyLines.length * lineGap + gap + btnH + py;
    const my = (H - ph) / 2;
    this._drawSecondModalBackdrop(ctx, W, H);
    this.manager.addTouchable(0, 0, W, H, () => {});
    ctx.save();
    this._drawModalBg(ctx, mx, my, pw, ph, 'rgba(255,80,200,0.5)');
    drawText(ctx, '规则说明', W / 2, my + py + titleH / 2, '#ffffff', 18, 'center', undefined, 700);
    const bodyColor = 'rgba(255,255,255,0.75)';
    const bodyFs = 14;
    let ly = my + py + titleH + gap + lineGap / 2;
    bodyLines.forEach((line) => {
      drawText(ctx, line, mx + px, ly, bodyColor, bodyFs, 'left', undefined, 400);
      ly += lineGap;
    });
    const btn = drawButtonGradient(ctx, mx + px, my + ph - py - btnH, pw - px * 2, btnH, '知道了', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.85)', 14, 14, undefined, 600);
    this.manager.addTouchable(btn.x, btn.y, btn.w, btn.h, 'closeFailHelp');
    ctx.restore();
  },
  watchAdContinue() {
    showToast('模拟观看广告...');
    setTimeout(() => {
      store.incrementCounter('adWatchCount');
      state.pressure = 0; state.isHolding = false; state.isExploding = false; state.flashWhite = false;
      state.gameState = 'idle'; state.isGameActive = true; state.failCount = 0;
      state.pumpDisabled = false;
      state.failFresh = false;
      resetParticles();
      showToast('广告完成，继续当前气球');
    }, 500);
  },
  restartFromFail() {
    if (state.restartChances <= 0) { showToast('重开次数不足'); return; }
    store.useFreeRetry(state.currentLevelIdx + 1);
    const next = store.getFreeRetries(state.currentLevelIdx + 1);
    this._resetInLevel();
    this._showRestartToast(next);
  },
  watchAdRetry() {
    showToast('模拟观看广告...');
    setTimeout(() => {
      store.incrementCounter('adWatchCount');
      this._resetInLevel();
      showToast('广告完成，已重置关卡');
    }, 500);
  },
  _showRestartToast(remain) {
    state.showRestartDoneToast = true; state.restartDoneToastRemain = remain;
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { state.showRestartDoneToast = false; }, 3000);
  },

  // 重开成功后的局内 toast（90% 不透明，14px）
  _drawRestartToast(ctx, W, H) {
    const fontSize = 14;
    const lineHeight = 20;
    const padX = 16, padY = 12;
    const line1 = '已从本关第 1 只气球重新开始';
    const line2 = '剩余 ' + state.restartDoneToastRemain + ' 次重开机会';
    const tw1 = measureText(ctx, line1, fontSize, 600);
    const tw2 = measureText(ctx, line2, fontSize, 400);
    const bw = Math.min(W - 32, Math.max(220, Math.ceil(Math.max(tw1, tw2) + padX * 2)));
    const bh = padY * 2 + lineHeight * 2;
    const bx = (W - bw) / 2, by = H * 0.55;
    ctx.save();
    roundRect(ctx, bx, by, bw, bh, 14);
    ctx.fillStyle = 'rgba(17,24,39,0.90)';
    ctx.fill();
    ctx.restore();
    drawText(ctx, line1, W / 2, by + padY + lineHeight / 2, '#ffffff', fontSize, 'center', undefined, 600);
    drawText(ctx, line2, W / 2, by + padY + lineHeight + lineHeight / 2, 'rgba(255,255,255,0.85)', fontSize, 'center', undefined, 400);
  },

  // ─── Success Modal（深蓝绿 + 绿色矢量气球 + 大按钮） ──
  _drawSuccessModal(ctx, W, H) {
    const mw = W - 80, mx = 40;
    const py = 24, px = 20;
    const heroH = 96, gap = 12, titleH = 28, descH = 18, btnH = 50;
    const dotsH = 22;
    const mh = py + heroH + gap + titleH + gap + dotsH + gap + descH + gap * 2 + btnH + py;
    const my = (H - mh) / 2;

    ctx.save();
    // 深蓝绿渐变背景（柔化绿色边框 + 半弱外发光）
    roundRect(ctx, mx, my, mw, mh, 24);
    const sg = ctx.createLinearGradient(mx, my, mx, my + mh);
    sg.addColorStop(0, 'rgba(8,40,30,0.98)');
    sg.addColorStop(1, 'rgba(4,20,18,0.98)');
    ctx.fillStyle = sg; ctx.fill();
    ctx.strokeStyle = 'rgba(134,239,172,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowColor = 'rgba(134,239,172,0.28)'; ctx.shadowBlur = 14;
    ctx.stroke(); ctx.shadowBlur = 0;
    ctx.restore();

    // 矢量绿色气球（柔和绿，弹跳）
    const heroY = my + py;
    const bounce = (Math.sin(state.time * 3) * 0.05 + 1);
    ctx.save();
    ctx.translate(W / 2, heroY + heroH / 2);
    ctx.scale(bounce, bounce);
    drawBalloonShape(ctx, 'round', 0, 0, heroH * 0.42,
      '#86efac', '#4ade80', 0, 60, false, state.time, this.dpr, true);
    ctx.restore();

    // 标题（柔和绿，弱发光）
    const titleY = heroY + heroH + gap;
    ctx.save();
    ctx.shadowColor = 'rgba(134,239,172,0.45)';
    ctx.shadowBlur = 10;
    drawText(ctx, state.isPerfect ? '完美充气！' : '充气成功！', W / 2, titleY + titleH / 2, '#86efac', 18, 'center', undefined, 900);
    ctx.shadowBlur = 0;
    ctx.restore();

    let curY = titleY + titleH + gap;

    // 进度圆点 + 计数同行
    const totalDots = state.synInflateRun ? state.synTotalCount : 10;
    const dotR = 4, dotOnR = 6, dotGap = 6;
    const dotsWidth = totalDots * (dotR * 2 + dotGap) - dotGap;
    const cntVal = state.synInflateRun
      ? (state.gameState === 'success'
        ? state.synPumpStartIdx + state.synQueueIdx + 1
        : state.completedInLevel)
      : (state.balloonInLevel + 1);
    const cnt = cntVal + ' / ' + totalDots;
    const cntFS = 14;
    const cntTW = measureText(ctx, cnt, cntFS, 700);
    const inlineW = dotsWidth + 16 + cntTW;
    const inlineX = W / 2 - inlineW / 2;
    for (let i = 0; i < totalDots; i++) {
      const dx = inlineX + i * (dotR * 2 + dotGap) + dotR;
      const dy = curY + dotsH / 2;
      const isOn = i < cntVal;
      ctx.save();
      ctx.beginPath();
      ctx.arc(dx, dy, isOn ? dotOnR : dotR, 0, Math.PI * 2);
      ctx.fillStyle = isOn ? '#86efac' : 'rgba(255,255,255,0.2)';
      ctx.fill();
      if (isOn) { ctx.shadowColor = '#86efac'; ctx.shadowBlur = 4; ctx.fill(); }
      ctx.restore();
    }
    drawText(ctx, cnt, inlineX + dotsWidth + 16, curY + dotsH / 2, '#86efac', cntFS, 'left', undefined, 700);
    curY += dotsH + gap;

    // 描述
    const remain = state.synInflateRun
      ? Math.max(0, state.synTotalCount - state.completedInLevel)
      : (9 - state.balloonInLevel);
    if (remain > 0) {
      drawText(ctx, state.synInflateRun
        ? ('还剩 ' + remain + ' 个传奇气球，继续加油！')
        : ('还剩 ' + remain + ' 个气球，继续加油！'), W / 2, curY + descH / 2, 'rgba(255,255,255,0.7)', 14, 'center', undefined, 400);
    }
    curY += descH + gap * 2;

    // 主按钮（柔绿青渐变，50px 高）
    ctx.save();
    roundRect(ctx, mx + px, curY, mw - px * 2, btnH, 16);
    const bgg = ctx.createLinearGradient(mx + px, curY, mx + mw - px, curY + btnH);
    bgg.addColorStop(0, '#86efac'); bgg.addColorStop(1, '#7dd3c0');
    ctx.fillStyle = bgg; ctx.fill();
    ctx.shadowColor = 'rgba(134,239,172,0.34)'; ctx.shadowBlur = 10;
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.restore();
    drawText(ctx, '继续充气 →', W / 2, curY + btnH / 2, '#0b2018', 14, 'center', 'rgba(255,255,255,0.4)', 700);
    this.manager.addTouchable(mx + px, curY, mw - px * 2, btnH, 'nextBalloon');
  },
  nextBalloon() { this._handleNextBalloon(); },

  // ─── Settings Modal（左右各 40；每行读各自 key） ──
  _drawSettingsModal(ctx, W, H) {
    const mw = W - 80, mx = 40;
    const py = 22, px = 20;
    const titleH = 22, gap = 10, rowH = 40, actionH = 44;
    const footerLineH = 16;
    const footerText = '儿童隐私保护声明及监护人须知';
    const footerTextH = measureWrappedTextHeight(ctx, footerText, mw - px * 2, footerLineH, 12, 400);
    const footerH = Math.max(28, footerTextH + 4);
    const settings = store.getSettings();
    const actions = [
      { text: state.synInflateRun ? '放弃合成' : '放弃挑战', style: 'rgba(255,23,68,0.2)', color: '#ff1744', h: 'abandonChallenge' }
    ];
    const actionsBlockH = actions.length * actionH + (actions.length - 1) * gap;
    const mh = py + titleH + gap + rowH * 3 + gap + actionsBlockH + footerH + py;
    const my = (H - mh) / 2;

    ctx.save();
    this._drawModalBg(ctx, mx, my, mw, mh, 'rgba(255,80,200,0.4)');

    drawText(ctx, '✕', mx + mw - 22, my + py + 8, 'rgba(255,255,255,0.5)', 14, 'center');
    this.manager.addTouchable(mx + mw - 44, my + py - 4, 44, 32, 'closeSettings');

    drawText(ctx, '设置', W / 2, my + py + titleH / 2, '#ffffff', 18, 'center', undefined, 700);

    const toggles = [
      { label: '音效', key: 'soundOn', handler: 'toggleSound' },
      { label: '音乐', key: 'musicOn', handler: 'toggleMusic' },
      { label: '震动', key: 'vibrationOn', handler: 'toggleVibration' }
    ];
    toggles.forEach((t, i) => {
      const ry = my + py + titleH + gap + i * rowH;
      drawText(ctx, t.label, mx + px, ry + rowH / 2, 'rgba(255,255,255,0.85)', 14, 'left', undefined, 500);
      const tw = 50, th = 30;
      const tx = mx + mw - px - tw;
      const ty = ry + (rowH - th) / 2;
      drawToggle(ctx, tx, ty, !!settings[t.key]);
      this.manager.addTouchable(tx - 8, ty - 8, tw + 16, th + 16, t.handler);
    });

    const actionsY = my + py + titleH + gap + rowH * 3 + gap;
    actions.forEach((a, i) => {
      const ay = actionsY + i * (actionH + gap);
      const btn = drawButtonGradient(ctx, mx + px, ay, mw - px * 2, actionH, a.text, a.style, a.color, 14, 12, undefined, 500);
      this.manager.addTouchable(btn.x, btn.y, btn.w, btn.h, a.h);
    });

    const footerY = actionsY + actionsBlockH + gap;
    drawText(
      ctx, footerText,
      W / 2, footerY + footerLineH / 2,
      'rgba(255,255,255,0.5)', 12, 'center', undefined, 400
    );
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(mx + px, footerY - 4); ctx.lineTo(mx + mw - px, footerY - 4); ctx.stroke();
    ctx.restore();
    this.manager.addTouchable(mx + px, footerY - 2, mw - px * 2, footerH + 4, 'openPrivacy');
    ctx.restore();
  },
  openPrivacy() { legalModal.openChildrenPrivacy(); },
  closeLegalModal() { legalModal.closeLegalModal(); },
  _legalModalAbsorb() { /* 阻断穿透 */ },

  // ─── Level Complete Modal（配色与「完美充气」成功弹窗一致：深绿底 + 薄荷描边 + 绿青主按钮） ──
  _drawLevelCompleteModal(ctx, W, H) {
    const mw = W - 80, mx = 40;
    let pyTop = 10;
    let pyBottom = 24;
    const px = 10;
    let bannerH = 50;
    const gapBannerBouquet = 24;
    const statsGap = 2;
    let statsH = 54;
    const gapStatsActions = 12;
    let btn1H = 42;
    const btnGap = 12;
    let btn2H = 48;
    const maxModalH = Math.floor(H * 0.6);
    const minBouquet = 64;
    const packFixed = () =>
      pyTop + bannerH + gapBannerBouquet + statsGap + statsH + gapStatsActions + btn1H + btnGap + btn2H + pyBottom;
    let fixedH = packFixed();
    while (fixedH + minBouquet > maxModalH && statsH > 44) {
      statsH -= 2;
      fixedH = packFixed();
    }
    while (fixedH + minBouquet > maxModalH && bannerH > 42) {
      bannerH -= 2;
      fixedH = packFixed();
    }
    while (fixedH + minBouquet > maxModalH && (btn2H > 38 || btn1H > 36)) {
      if (btn2H > 38) btn2H -= 2;
      if (btn1H > 36) btn1H -= 2;
      fixedH = packFixed();
    }
    while (fixedH + minBouquet > maxModalH && pyTop > 6) {
      pyTop -= 1;
      fixedH = packFixed();
    }
    while (fixedH > maxModalH - 52) {
      if (statsH > 38) { statsH -= 2; fixedH = packFixed(); continue; }
      if (bannerH > 38) { bannerH -= 2; fixedH = packFixed(); continue; }
      if (btn2H > 32) { btn2H -= 2; btn1H -= 2; fixedH = packFixed(); continue; }
      break;
    }
    const bouquetCap = 200;
    let bouquetH = Math.max(minBouquet, Math.min(bouquetCap, maxModalH - fixedH));
    let mh = Math.min(maxModalH, fixedH + bouquetH);
    bouquetH = mh - fixedH;
    if (bouquetH < minBouquet) {
      while (fixedH + minBouquet > maxModalH && statsH > 40) {
        statsH -= 2;
        fixedH = packFixed();
      }
      bouquetH = Math.max(44, Math.min(bouquetCap, maxModalH - fixedH));
      mh = Math.min(maxModalH, fixedH + bouquetH);
      bouquetH = mh - fixedH;
    }
    const my = centerModalY(H, mh, { padTop: 10, padBottom: Math.max(16, (getCapsuleLayout().safeBottomInset || 0) + 12) });

    ctx.save();
    roundRect(ctx, mx, my, mw, mh, 24);
    const cardGrad = ctx.createLinearGradient(mx, my, mx, my + mh);
    cardGrad.addColorStop(0, 'rgba(8,40,30,0.98)');
    cardGrad.addColorStop(1, 'rgba(4,20,18,0.98)');
    ctx.fillStyle = cardGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(134,239,172,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowColor = 'rgba(134,239,172,0.28)';
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    const bannerY = my + pyTop;
    const trophySize = 22, trophyGap = 8;
    const bannerText = state.synInflateComplete
      ? '合成气球束完成！'
      : ('第 ' + (state.currentLevelIdx + 1) + ' 关全部完成！');
    const bannerTW = measureText(ctx, bannerText, 18, 700);
    const bannerTotalW = trophySize + trophyGap + bannerTW + trophyGap + trophySize;
    const bannerStartX = W / 2 - bannerTotalW / 2;
    const trophyImg = this.canvasUI.getImage && this.canvasUI.getImage('images/ui/trophy.png');
    if (trophyImg) {
      drawImage(ctx, 'images/ui/trophy.png', bannerStartX, bannerY + 6, trophySize, trophySize);
      drawImage(ctx, 'images/ui/trophy.png', bannerStartX + trophySize + trophyGap + bannerTW + trophyGap, bannerY + 6, trophySize, trophySize);
    } else {
      drawText(ctx, '🏆', bannerStartX + trophySize / 2, bannerY + 18, '#86efac', 22, 'center');
      drawText(ctx, '🏆', bannerStartX + trophySize + trophyGap + bannerTW + trophyGap + trophySize / 2, bannerY + 18, '#86efac', 22, 'center');
    }
    ctx.save();
    ctx.shadowColor = 'rgba(134,239,172,0.45)';
    ctx.shadowBlur = 10;
    drawText(ctx, bannerText, W / 2, bannerY + 18, '#86efac', 18, 'center', undefined, 800);
    ctx.shadowBlur = 0;
    ctx.restore();
    const bannerSub = state.synInflateComplete
      ? ('消耗 ' + state.synTotalCount + ' 个传奇气球 · 全部充气成功！')
      : (state.level.name + ' · 10 个气球全部充气成功！');
    drawText(ctx, bannerSub, W / 2, bannerY + 42, 'rgba(255,255,255,0.65)', 12, 'center');

    const bqX = mx + px;
    const bqY = my + pyTop + bannerH + gapBannerBouquet;
    const bqW = mw - px * 2;
    const elapsedSec = (Date.now() - (state.bouquetAnimStartMs || Date.now())) / 1000;
    drawBouquetCompletionAnim(
      ctx,
      (state.completedBalloonsList || []).map(_normalizeBouquetBalloon),
      bqX, bqY, bqW, bouquetH, elapsedSec,
      { layout: 'centered' }
    );

    const statsY = bqY + bouquetH + statsGap;
    const statGap = 8;
    const statW = (mw - px * 2 - statGap) / 2;
    const statIcons = ['images/ui/balloon.png', 'images/ui/crown.png'];
    const statNums = state.synInflateComplete
      ? [String(state.synTotalCount), '合成']
      : ['10', '第' + (state.currentLevelIdx + 1) + '关'];
    const statLabels = state.synInflateComplete
      ? ['完成气球', '类型']
      : ['完成气球', '关卡'];
    const iconSize = Math.min(20, Math.max(16, Math.floor(statsH * 0.32)));
    const iconTop = statsY + Math.max(2, statsH * 0.08);
    const numCy = statsY + statsH * 0.52;
    const labCy = statsY + statsH * 0.8;
    [0, 1].forEach(i => {
      const sx = mx + px + i * (statW + statGap);
      ctx.save();
      roundRect(ctx, sx, statsY, statW, statsH, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(134,239,172,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      const statIconImg = this.canvasUI.getImage && this.canvasUI.getImage(statIcons[i]);
      if (statIconImg) {
        drawImage(ctx, statIcons[i], sx + statW / 2 - iconSize / 2, iconTop, iconSize, iconSize);
      } else {
        drawText(ctx, ['🎈', '👑'][i], sx + statW / 2, statsY + statsH * 0.22, '#86efac', Math.min(16, iconSize), 'center');
      }
      drawText(ctx, statNums[i], sx + statW / 2, numCy, '#ecfdf5', 14, 'center', undefined, 700);
      drawText(ctx, statLabels[i], sx + statW / 2, labCy, 'rgba(167,243,208,0.55)', 12, 'center', undefined, 400);
    });

    const actionsY = statsY + statsH + gapStatsActions;
    const btnW = mw - px * 2;
    const shareGrad = (c, gx, gy, gw, gh) => {
      const g = c.createLinearGradient(gx, gy, gx, gy + gh);
      g.addColorStop(0, 'rgba(134,239,172,0.14)');
      g.addColorStop(1, 'rgba(125,211,192,0.08)');
      return g;
    };
    const b1 = drawButtonGradient(ctx, mx + px, actionsY, btnW, btn1H, '分享气球束', shareGrad, '#a7f3d0', 14, 12, 'rgba(134,239,172,0.25)', 500);
    this.manager.addTouchable(b1.x, b1.y, b1.w, b1.h, 'openSharePreview');
    const b2text = state.synInflateComplete
      ? '完成'
      : (state.currentLevelIdx < 3 ? '下一关' : '返回首页');
    const b2h = state.synInflateComplete ? 'synInflateDone' : (state.currentLevelIdx < 3 ? 'levelCompleteNext' : 'levelCompleteHome');
    const mainGrad = (c, gx, gy, gw, gh) => {
      const g = c.createLinearGradient(gx, gy, gx + gw, gy + gh);
      g.addColorStop(0, '#86efac');
      g.addColorStop(1, '#7dd3c0');
      return g;
    };
    const b2 = drawButtonGradient(ctx, mx + px, actionsY + btn1H + btnGap, btnW, btn2H, b2text, mainGrad, '#0b2018', 14, 14, 'rgba(134,239,172,0.35)', 700);
    this.manager.addTouchable(b2.x, b2.y, b2.w, b2.h, b2h);
  },
  levelCompleteNext() {
    const nextIdx = state.currentLevelIdx + 1;
    if (nextIdx >= LEVELS.length) { this.manager.switchTo('home'); return; }
    if (!store.isLevelUnlocked(nextIdx + 1)) store.unlockLevel(nextIdx + 1);
    store.setLastPlayedLevel(nextIdx + 1);
    const retries = store.getFreeRetries(nextIdx + 1);
    state.showLevelComplete = false; state.currentLevelIdx = nextIdx; state.completedInLevel = 0;
    state.balloonInLevel = 0; state.completedBalloonsList = []; state.pressure = 0; state.gameState = 'idle';
    state.isGameActive = true; state.restartChances = retries; state.failCount = 0; state.bouquetReady = false;
    state.pumpDisabled = false;
    state.showLegendSlotChoice = false;
    state.legendSlot10ChoiceDone = false;
    state.legendSlot10OpenedPurchase = false;
    state.legendSlot10Mode = 'purchase';
    state.legendSlot10AutoEquipId = null;
    resetParticles(); this._syncDerived({ currentLevelIdx: nextIdx, balloonInLevel: 0, completedInLevel: 0 });
  },
  levelCompleteHome() { this.manager.switchTo('home'); },
  synInflateDone() {
    state.showLevelComplete = false;
    this._clearSynInflateState();
    this.manager.switchTo('collection', { activeTab: 'bouquet' });
  },
  openSharePreview() {
    if (state.synInflateComplete) {
      const balloons = normalizeBalloonList(
        (state.completedBalloonsList || []).map(_normalizeBouquetBalloon)
      );
      showToast('正在生成分享图…');
      shareBouquetAsImage({
        balloons,
        shareTitle: '我收集了传奇合成气球束，快来看看！',
        posterTitle: '传奇合成气球束',
        subtitle: '消耗 ' + state.synTotalCount + ' 个传奇 · 合成专属',
        viewerLanding: true
      });
      return;
    }
    const level = state.currentLevelIdx + 1;
    const levelName = state.level && state.level.name ? state.level.name : '';
    const balloons = normalizeBalloonList(
      (state.completedBalloonsList || []).map(_normalizeBouquetBalloon)
    );
    const shareTitle = _pickShareTitle(level);
    const posterTitle = '第 ' + level + ' 关气球束';
    const subtitle = levelName ? levelName + ' · 10 个气球全部充气成功' : '10 个气球全部充气成功';
    showToast('正在生成分享图…');
    shareBouquetAsImage({
      balloons,
      shareTitle,
      posterTitle,
      subtitle,
      viewerLanding: true
    });
  },

  // ─── 第十个气球：默认 / 购买传奇 / 已有可装备 ──
  _getSlot10EquippableLegends() {
    const levelIdx = state.currentLevelIdx;
    const legends = _paidBalloonTypesOrdered();
    const list = [];
    for (const l of legends) {
      if (store.getBalloonQuantity(l.id) < 1) continue;
      if (store.canEquipLegend(levelIdx, l.id).ok) list.push(l);
    }
    return list;
  },

  _prepareLegendSlot10Choice() {
    const levelIdx = state.currentLevelIdx;
    const equippable = this._getSlot10EquippableLegends();
    const already = store.getEquippedLegend(levelIdx);
    let autoId = null;
    if (equippable.length > 0) {
      const pick = already && equippable.some(l => l.id === already)
        ? equippable.find(l => l.id === already)
        : equippable[0];
      autoId = pick.id;
    }
    state.legendSlot10Mode = equippable.length > 0 ? 'owned' : 'purchase';
    state.legendSlot10AutoEquipId = autoId;
    state.showLegendSlotChoice = true;
    state.isGameActive = false;
  },

  _finishLegendSlot10Choice() {
    state.legendSlot10ChoiceDone = true;
    state.showLegendSlotChoice = false;
    state.isGameActive = true;
    state.legendSlot10OpenedPurchase = false;
    state.legendSlot10Mode = 'purchase';
    state.legendSlot10AutoEquipId = null;
  },

  _drawLegendSlotChoiceModal(ctx, W, H) {
    if (state.legendSlot10Mode === 'owned') {
      this._drawLegendSlotOwnedModal(ctx, W, H);
      return;
    }
    this._drawSecondModalBackdrop(ctx, W, H);
    this.manager.addTouchable(0, 0, W, H, () => {});

    const mw = W - 80;
    const mx = 40;
    const py = 18;
    const px = 18;
    const heroH = 72;
    const gap = 16;
    const titleH = 24;
    const body = '本关挑战即将完成，第十个气球允许装备传奇气球，请选择需要装备的气球：';
    const bodyH = CONFIRM_BODY.lh * 3;
    const btnH = 46;
    const mh = py + heroH + gap + titleH + gap + bodyH + gap + btnH + gap + btnH + py;
    const my = (H - mh) / 2;

    ctx.save();
    this._drawModalBg(ctx, mx, my, mw, mh, 'rgba(244,114,182,0.45)', 24);
    ctx.shadowColor = 'rgba(244,114,182,0.28)';
    ctx.shadowBlur = 14;
    roundRect(ctx, mx, my, mw, mh, 24);
    ctx.strokeStyle = 'rgba(244,114,182,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    const heroY = my + py;
    const bounce = (Math.sin(state.time * 3) * 0.05 + 1);
    ctx.save();
    ctx.translate(W / 2, heroY + heroH / 2);
    ctx.scale(bounce, bounce);
    drawBalloonShape(ctx, 'round', 0, 0, heroH * 0.42,
      '#ffd740', '#f472b6', 0, 60, false, state.time, this.dpr, true);
    ctx.restore();

    const titleY = heroY + heroH + gap;
    ctx.save();
    ctx.shadowColor = 'rgba(244,114,182,0.45)';
    ctx.shadowBlur = 10;
    drawText(ctx, '传奇气球', W / 2, titleY + titleH / 2, '#f472b6', 18, 'center', undefined, 900);
    ctx.shadowBlur = 0;
    ctx.restore();

    const bodyY = titleY + titleH + gap;
    drawWrappedText(ctx, body, mx + px, bodyY, mw - px * 2, CONFIRM_BODY.lh, 'rgba(255,255,255,0.82)', CONFIRM_BODY.fs, CONFIRM_BODY.fw);

    const btnX = mx + px;
    const btnW = mw - px * 2;
    const actionsTop = bodyY + bodyH + gap;

    // 次要：默认气球（描边，同失败弹窗「重新开始」）
    ctx.save();
    roundRect(ctx, btnX, actionsTop, btnW, btnH, 16);
    ctx.fillStyle = 'rgba(244,114,182,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(244,114,182,0.42)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, '默认气球', W / 2, actionsTop + btnH / 2, '#f472b6', 14, 'center', undefined, 600);
    this.manager.addTouchable(btnX, actionsTop, btnW, btnH, 'chooseDefaultLegendSlot');

    const buyY = actionsTop + btnH + gap;
    // 主操作：购买传奇气球（粉紫渐变，同失败弹窗「看广告再试一次」）
    ctx.save();
    roundRect(ctx, btnX, buyY, btnW, btnH, 16);
    const mg = ctx.createLinearGradient(btnX, buyY, btnX + btnW, buyY + btnH);
    mg.addColorStop(0, '#f472b6');
    mg.addColorStop(1, '#a78bfa');
    ctx.fillStyle = mg;
    ctx.fill();
    ctx.shadowColor = 'rgba(244,114,182,0.32)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    drawText(ctx, '购买传奇气球', W / 2, buyY + btnH / 2, '#ffffff', 14, 'center', 'rgba(0,0,0,0.25)', 700);
    this.manager.addTouchable(btnX, buyY, btnW, btnH, 'choosePurchaseLegendSlot');
    ctx.restore();
  },

  _drawLegendSlotOwnedModal(ctx, W, H) {
    this._drawSecondModalBackdrop(ctx, W, H);
    this.manager.addTouchable(0, 0, W, H, () => {});

    const meta = state.legendSlot10AutoEquipId
      ? BALLOON_TYPES.find(b => b.id === state.legendSlot10AutoEquipId)
      : null;
    const legendName = (meta && meta.name) || '传奇气球';

    const mw = W - 80;
    const mx = 40;
    const py = 18;
    const px = 18;
    const heroH = 72;
    const gap = 16;
    const titleH = 24;
    const body = '您已经购买「' + legendName + '」的传奇气球，将自动装备上';
    const bodyH = CONFIRM_BODY.lh * 2;
    const btnH = 46;
    const btnGap = 12;
    const mh = py + heroH + gap + titleH + gap + bodyH + gap + btnH + btnGap + btnH + btnGap + btnH + py;
    const my = (H - mh) / 2;

    ctx.save();
    this._drawModalBg(ctx, mx, my, mw, mh, 'rgba(244,114,182,0.45)', 24);
    ctx.shadowColor = 'rgba(244,114,182,0.28)';
    ctx.shadowBlur = 14;
    roundRect(ctx, mx, my, mw, mh, 24);
    ctx.strokeStyle = 'rgba(244,114,182,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    const heroY = my + py;
    const bounce = (Math.sin(state.time * 3) * 0.05 + 1);
    ctx.save();
    ctx.translate(W / 2, heroY + heroH / 2);
    ctx.scale(bounce, bounce);
    const heroEmoji = (meta && meta.emoji) || '👑';
    drawText(ctx, heroEmoji, 0, 0, '#ffffff', 36, 'center');
    ctx.restore();

    const titleY = heroY + heroH + gap;
    ctx.save();
    ctx.shadowColor = 'rgba(244,114,182,0.45)';
    ctx.shadowBlur = 10;
    drawText(ctx, '传奇气球', W / 2, titleY + titleH / 2, '#f472b6', 18, 'center', undefined, 900);
    ctx.shadowBlur = 0;
    ctx.restore();

    const bodyY = titleY + titleH + gap;
    drawWrappedText(ctx, body, mx + px, bodyY, mw - px * 2, CONFIRM_BODY.lh, 'rgba(255,255,255,0.82)', CONFIRM_BODY.fs, CONFIRM_BODY.fw);

    const btnX = mx + px;
    const btnW = mw - px * 2;
    let actionsTop = bodyY + bodyH + gap;

    const drawOutlineBtn = (y, label, action) => {
      ctx.save();
      roundRect(ctx, btnX, y, btnW, btnH, 16);
      ctx.fillStyle = 'rgba(244,114,182,0.06)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(244,114,182,0.42)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      drawText(ctx, label, W / 2, y + btnH / 2, '#f472b6', 14, 'center', undefined, 600);
      this.manager.addTouchable(btnX, y, btnW, btnH, action);
    };

    ctx.save();
    roundRect(ctx, btnX, actionsTop, btnW, btnH, 16);
    const mg = ctx.createLinearGradient(btnX, actionsTop, btnX + btnW, actionsTop + btnH);
    mg.addColorStop(0, '#f472b6');
    mg.addColorStop(1, '#a78bfa');
    ctx.fillStyle = mg;
    ctx.fill();
    ctx.shadowColor = 'rgba(244,114,182,0.32)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    drawText(ctx, '好的', W / 2, actionsTop + btnH / 2, '#ffffff', 14, 'center', 'rgba(0,0,0,0.25)', 700);
    this.manager.addTouchable(btnX, actionsTop, btnW, btnH, 'confirmOwnedLegendSlot10');

    actionsTop += btnH + btnGap;
    drawOutlineBtn(actionsTop, '另外购买一个', 'choosePurchaseLegendSlot');

    actionsTop += btnH + btnGap;
    drawOutlineBtn(actionsTop, '装备普通气球', 'chooseDefaultLegendSlot');
    ctx.restore();
  },

  confirmOwnedLegendSlot10() {
    const bId = state.legendSlot10AutoEquipId;
    if (bId) {
      if (!store.equipLegend(state.currentLevelIdx, bId)) {
        const check = store.canEquipLegend(state.currentLevelIdx, bId);
        showToast((check && check.reason) || '装备失败');
        return;
      }
      state.paidBalloonUsed = true;
      this._syncDerived({});
    }
    this._finishLegendSlot10Choice();
    this._showPumpTipFor(2500);
  },

  chooseDefaultLegendSlot() {
    store.unequipLegend(state.currentLevelIdx);
    state.paidBalloonUsed = false;
    this._syncDerived({});
    this._finishLegendSlot10Choice();
    this._showPumpTipFor(2500);
  },

  choosePurchaseLegendSlot() {
    state.legendSlot10OpenedPurchase = true;
    state.showLegendSlotChoice = false;
    this.openLegendSelect();
  },

  // ─── Legend Select Modal ──
  /** 与绘制、触摸滚动共用：列表可视高度、滚动上限、格子尺寸等 */
  _getLegendSelectLayout(W, H) {
    const mw = W - 80, mx = 40;
    const py = 22, px = 20;
    const titleH = 22, btnH = 44;
    const gridMaxH = H * 0.55;
    const legends = _paidBalloonTypesOrdered();
    const cols = 2, cellH = 90, cellGap = 8;
    const rows = Math.ceil(legends.length / cols);
    const rawGrid = rows * cellH + (rows - 1) * cellGap;
    const viewportH = Math.min(rawGrid, gridMaxH) + 10;
    const contentH = 4 + rawGrid + 4;
    const scrollMax = Math.max(0, contentH - viewportH);
    const mh = py + titleH + 6 + viewportH + 10 + btnH + py;
    const my = Math.max(20, (H - mh) / 2);
    const gridY = my + py + titleH + 6;
    const cellW = (mw - px * 2 - cellGap) / cols;
    return {
      mx, my, mw, mh, px, py, titleH, btnH, gridY, viewportH, contentH, scrollMax,
      cols, rows, cellW, cellH, cellGap, legends
    };
  },

  _drawLegendSelect(ctx, W, H) {
    const L = this._getLegendSelectLayout(W, H);
    const { mx, my, mw, mh, px, py, titleH, btnH, gridY, viewportH, scrollMax, cellW, cellH, cellGap, cols, legends } = L;
    const owned = store.getOwnedBalloonList();
    let scrollY = state.legendSelectScrollY;
    if (scrollY < 0) scrollY = 0;
    if (scrollY > scrollMax) scrollY = scrollMax;
    state.legendSelectScrollY = scrollY;

    ctx.save();
    this._drawModalBg(ctx, mx, my, mw, mh, 'rgba(255,80,200,0.4)');

    drawText(ctx, '✕', mx + mw - 22, my + py + 8, 'rgba(255,255,255,0.5)', 14, 'center');
    this.manager.addTouchable(mx + mw - 44, my + py - 4, 44, 32, 'closeLegendSelect');

    drawText(ctx, '选择传奇气球', W / 2, my + py + titleH / 2, '#ffd700', 18, 'center', 'rgba(255,215,0,0.7)', 700);

    beginScrollView(ctx, mx, gridY, mw, viewportH, scrollY);
    legends.forEach((l, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const gx = mx + px + col * (cellW + cellGap);
      const gy = gridY + 4 + row * (cellH + cellGap);
      const own = owned.find(o => o.id === l.id), hasIt = own && own.quantity > 0;
      const equipCheck = hasIt ? store.canEquipLegend(state.currentLevelIdx, l.id) : { ok: false };
      const inflated = hasIt && !equipCheck.ok && equipCheck.reason === '已充气';
      let subLabel = '未拥有';
      if (hasIt) {
        if (inflated) subLabel = '已充气';
        else subLabel = '已拥有 ' + own.quantity;
      }
      ctx.save();
      roundRect(ctx, gx, gy, cellW, cellH, 12);
      ctx.fillStyle = inflated ? 'rgba(255,255,255,0.03)' : (hasIt ? 'rgba(255,215,0,0.06)' : 'rgba(255,255,255,0.04)');
      ctx.fill();
      ctx.strokeStyle = inflated ? 'rgba(255,255,255,0.12)' : (hasIt ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.08)');
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.arc(gx + cellW / 2, gy + 24, 22, 0, Math.PI * 2);
      ctx.strokeStyle = inflated ? 'rgba(255,255,255,0.2)' : (hasIt ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.15)');
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = inflated ? 0.55 : 1;
      drawText(ctx, l.emoji, gx + cellW / 2, gy + 24, '#ffffff', 22, 'center');
      drawText(ctx, l.name, gx + cellW / 2, gy + 56, inflated ? 'rgba(255,255,255,0.45)' : '#ffffff', 14, 'center', undefined, 600);
      drawText(ctx, subLabel, gx + cellW / 2, gy + 76, inflated ? 'rgba(255,152,0,0.85)' : (hasIt ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)'), 12, 'center');
      ctx.globalAlpha = 1;
      ctx.restore();
      if (!state.showLegendPayConfirm && !inflated) {
        const hitTop = gy - scrollY;
        const hitBottom = hitTop + cellH;
        if (hitBottom > gridY && hitTop < gridY + viewportH) {
          this.manager.addTouchable(gx, hitTop, cellW, cellH, 'onLegendCellTap', l.id);
        }
      }
    });
    endScrollView(ctx);

    // 滚动条指示（仅当列表超出可视区时）
    if (scrollMax > 0) {
      const trackW = 3;
      const trackX = mx + mw - 8;
      const trackY = gridY + 6;
      const trackH = viewportH - 12;
      const barH = Math.max(24, trackH * (viewportH / L.contentH));
      const barY = trackY + (scrollY / scrollMax) * (trackH - barH);
      ctx.save();
      roundRect(ctx, trackX, trackY, trackW, trackH, trackW / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
      roundRect(ctx, trackX, barY, trackW, barH, trackW / 2);
      ctx.fillStyle = 'rgba(255,215,0,0.55)'; ctx.fill();
      ctx.restore();
    }

    const cb = drawButtonGradient(ctx, mx + px, my + mh - py - btnH, mw - px * 2, btnH, '关闭', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.85)', 14, 12, undefined, 500);
    if (!state.showLegendPayConfirm) {
      this.manager.addTouchable(cb.x, cb.y, cb.w, cb.h, 'closeLegendSelect');
    }
    ctx.restore();
  },

  /** 购买传奇气球确认（叠在选择弹窗之上，文案与图鉴一致） */
  _drawLegendPayConfirm(ctx, W, H) {
    const bId = state.legendPayBalloonId;
    const meta = bId && BALLOON_TYPES.find(b => b.id === bId);
    if (!meta) return;

    ctx.save();
    this._drawSecondModalBackdrop(ctx, W, H);
    this.manager.addTouchable(0, 0, W, H, 'cancelLegendPay');

    const mw = W - 88;
    const mx = 44;
    const py = 18;
    const px = 18;
    const titleH = 20;
    const gap = 10;
    const btnH = 42;
    const extraDesc = '支付成功后将自动装备到本关第10个气球位。';
    const copy = getLegendPurchaseConfirmCopy(meta, extraDesc);
    const bodyMaxW = mw - px * 2;
    const descH = Math.max(48, measureWrappedTextHeight(ctx, copy.desc, bodyMaxW, 20, CONFIRM_BODY.fs, CONFIRM_BODY.fw));
    const mh = py + titleH + gap + descH + gap + btnH + py;
    const my = centerModalY(H, mh, { minTop: 48, bottomInset: 24 });

    this._drawModalBg(ctx, mx, my, mw, mh, 'rgba(255,80,200,0.55)', 22);
    drawText(ctx, copy.title, W / 2, my + py + titleH / 2, '#ffffff', 16, 'center', undefined, 700);
    drawWrappedText(ctx, copy.desc, mx + px, my + py + titleH + gap, bodyMaxW, 20, CONFIRM_BODY.color, CONFIRM_BODY.fs, CONFIRM_BODY.fw);
    const btnY = my + py + titleH + gap + descH + gap;
    const halfW = (mw - px * 3) / 2;
    const cb = drawButtonGradient(ctx, mx + px, btnY, halfW, btnH, '取消', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.85)', 14, 12, undefined, 500);
    this.manager.addTouchable(cb.x, cb.y, cb.w, cb.h, 'cancelLegendPay');
    const db = drawButtonGradient(ctx, mx + px * 2 + halfW, btnY, halfW, btnH, copy.confirmLabel, gradientPink, '#fff', 14, 12, undefined, 600);
    this.manager.addTouchable(db.x, db.y, db.w, db.h, 'confirmLegendPay');
    ctx.restore();
  },

  onLegendCellTap(bId) {
    if (state.showLegendPayConfirm) return;
    if (!bId) return;
    if (store.hasBalloon(bId)) {
      const check = store.canEquipLegend(state.currentLevelIdx, bId);
      if (!check.ok) {
        showToast(check.reason || '无法装备');
        return;
      }
      this._equipLegendFromModal(bId);
      return;
    }
    if (toastIfLegendPurchaseBlocked(showToast)) return;
    state.legendPayBalloonId = bId;
    state.showLegendPayConfirm = true;
    state._legendSelectDrag = null;
  },

  _equipLegendFromModal(bId) {
    if (!store.hasBalloon(bId)) return;
    if (!store.equipLegend(state.currentLevelIdx, bId)) {
      const check = store.canEquipLegend(state.currentLevelIdx, bId);
      showToast((check && check.reason) || '装备失败');
      return;
    }
    state.paidBalloonUsed = true;
    this._syncDerived({});
    showToast('传奇气球已装上');
    state.showLegendSelect = false;
    state.showLegendPayConfirm = false;
    state.legendPayBalloonId = null;
    if (state.balloonInLevel === 9) this._finishLegendSlot10Choice();
  },

  cancelLegendPay() {
    state.showLegendPayConfirm = false;
    state.legendPayBalloonId = null;
    state._legendSelectDrag = null;
  },

  confirmLegendPay() {
    const bId = state.legendPayBalloonId;
    if (!bId || store.hasBalloon(bId)) {
      state.showLegendPayConfirm = false;
      state.legendPayBalloonId = null;
      return;
    }
    const meta = BALLOON_TYPES.find(b => b.id === bId);
    const scene = this;
    runLegendPurchase({
      balloonId: bId,
      meta,
      priceYuan: LEGEND_PRICE_YUAN_DEFAULT,
      showToast,
      onSuccess() {
        store.equipLegend(state.currentLevelIdx, bId);
        state.paidBalloonUsed = true;
        state.showLegendPayConfirm = false;
        state.legendPayBalloonId = null;
        scene._syncDerived({});
        state.showLegendSelect = false;
        if (state.balloonInLevel === 9) scene._finishLegendSlot10Choice();
      }
    }).catch((err) => {
      if (err && err.message) {
        console.warn('[battle.confirmLegendPay]', err);
        showToast(err.message || '支付失败');
      }
    });
  },

  // ─── Reset Challenge Confirm ──
  _drawResetChallengeConfirm(ctx, W, H) {
    const mw = W - 80, mx = 40;
    const py = 22, px = 20;
    const titleH = 22, gap = 12, descH = 60, btnH = 48;
    const mh = py + titleH + gap + descH + gap + btnH + py;
    const my = (H - mh) / 2;

    this._drawSecondModalBackdrop(ctx, W, H);
    this.manager.addTouchable(0, 0, W, H, () => {});

    ctx.save();
    this._drawModalBg(ctx, mx, my, mw, mh, 'rgba(244,114,182,0.45)');
    drawText(ctx, '确认重置挑战？', W / 2, my + py + titleH / 2, '#ffffff', 18, 'center', undefined, 700);
    drawWrappedText(ctx, '将重置挑战进度，从第 1 关开始挑战，确定重置挑战吗？', mx + px, my + py + titleH + gap, mw - px * 2, CONFIRM_BODY.lh, CONFIRM_BODY.color, CONFIRM_BODY.fs, CONFIRM_BODY.fw);
    const btnY = my + py + titleH + gap + descH + gap;
    const halfW = (mw - px * 3) / 2;
    const cb = drawButtonGradient(ctx, mx + px, btnY, halfW, btnH, '取消', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.85)', 14, 12, undefined, 500);
    this.manager.addTouchable(cb.x, cb.y, cb.w, cb.h, 'cancelResetChallenge');
    const db = drawButtonGradient(ctx, mx + px * 2 + halfW, btnY, halfW, btnH, '确认重置', 'rgba(255,23,68,0.2)', '#ff1744', 14, 12, undefined, 700);
    this.manager.addTouchable(db.x, db.y, db.w, db.h, 'confirmResetChallenge');
    ctx.restore();
  },
  openResetChallengeConfirm() {
    state.failHelpOpen = false;
    state.showResetChallengeConfirm = true;
  },
  cancelResetChallenge() {
    state.showResetChallengeConfirm = false;
  },
  confirmResetChallenge() {
    store.resetChallengeProgress();
    store.reunlockLevelsFromOwnedCommonBalloons();
    state.showResetChallengeConfirm = false;
    state.gameState = 'idle';
    state.pumpDisabled = false;
    state.isExploding = false;
    state.flashWhite = false;
    state.failHelpOpen = false;
    resetParticles();
    this._initLevel();
    showToast('挑战已重置，从第 1 关开始');
  },

  // ─── Abandon Confirm ──────
  _drawAbandonConfirm(ctx, W, H) {
    const mw = W - 80, mx = 40;
    const py = 22, px = 20;
    const titleH = 22, gap = 12, descH = 92, btnH = 48;
    const mh = py + titleH + gap + descH + gap + btnH + py;
    const my = (H - mh) / 2;

    ctx.save();
    this._drawModalBg(ctx, mx, my, mw, mh, 'rgba(255,80,200,0.4)');
    drawText(ctx, '放弃挑战', W / 2, my + py + titleH / 2, '#ffffff', 18, 'center', undefined, 700);
    drawWrappedText(ctx, '放弃挑战将重置闯关关卡进度，已获得的普通气球不会消失。确定放弃挑战？', mx + px, my + py + titleH + gap, mw - px * 2, CONFIRM_BODY.lh, CONFIRM_BODY.color, CONFIRM_BODY.fs, CONFIRM_BODY.fw);
    const btnY = my + py + titleH + gap + descH + gap;
    const halfW = (mw - px * 3) / 2;
    const cb = drawButtonGradient(ctx, mx + px, btnY, halfW, btnH, '取消', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.85)', 14, 12, undefined, 500);
    this.manager.addTouchable(cb.x, cb.y, cb.w, cb.h, 'cancelAbandon');
    const db = drawButtonGradient(ctx, mx + px * 2 + halfW, btnY, halfW, btnH, '确认放弃', 'rgba(255,23,68,0.2)', '#ff1744', 14, 12, undefined, 700);
    this.manager.addTouchable(db.x, db.y, db.w, db.h, 'confirmAbandon');
    ctx.restore();
  },
  closeSettings() { state.showSettings = false; },
  toggleSound() {
    const s = store.getSettings();
    store.updateSettings({ soundOn: !s.soundOn });
    state.soundOn = !s.soundOn;
  },
  toggleMusic() {
    const s = store.getSettings();
    store.updateSettings({ musicOn: !s.musicOn });
    syncBgmFromSettings();
  },
  toggleVibration() { const s = store.getSettings(); store.updateSettings({ vibrationOn: !s.vibrationOn }); },
  resetLevel() {
    if (state.restartChances <= 0) { showToast('免费重开次数已用完'); return; }
    store.useFreeRetry(state.currentLevelIdx + 1);
    const next = store.getFreeRetries(state.currentLevelIdx + 1);
    this._resetInLevel(); this._showRestartToast(next); state.showSettings = false;
  },
  watchAdGetRetries() {
    showToast('模拟观看广告...');
    setTimeout(() => {
      store.addFreeRetries(state.currentLevelIdx + 1, AD_RESTART_GRANT, MAX_CUMULATIVE_RETRIES);
      state.restartChances = store.getFreeRetries(state.currentLevelIdx + 1);
      showToast('获得 ' + AD_RESTART_GRANT + ' 次重开机会');
    }, 500);
  },
  abandonChallenge() { state.showAbandonConfirm = true; },
  confirmAbandon() {
    state.showAbandonConfirm = false;
    state.showSettings = false;
    if (state.synInflateRun) {
      this._clearSynInflateState();
      this.manager.switchTo('collection', { activeTab: 'bouquet' });
      return;
    }
    store.abandonChallengeResetProgress();
    this.manager.switchTo('home');
  },
  cancelAbandon() { state.showAbandonConfirm = false; },
  openSettings() { state.showSettings = true; },


  openLegendSelect() {
    const userBalloons = store.getOwnedBalloonList();
    const wearables = userBalloons.filter(b => b.wearable && b.quantity > 0 && !b.frozen && b.id.startsWith('legend_'));
    state.legendBalloons = BALLOON_TYPES.filter(b => b.isPaid).map(l => { const o = wearables.find(w => w.id === l.id); return { ...l, owned: !!o, quantity: o ? o.quantity : 0 }; });
    state.showLegendPayConfirm = false;
    state.legendPayBalloonId = null;
    state.legendSelectScrollY = 0;
    state._legendSelectDrag = null;
    state.showLegendSelect = true;
  },
  closeLegendSelect() {
    state.showLegendSelect = false;
    state.showLegendPayConfirm = false;
    state.legendPayBalloonId = null;
    state.legendSelectScrollY = 0;
    state._legendSelectDrag = null;
    if (state.balloonInLevel === 9 && !state.legendSlot10ChoiceDone) {
      this._prepareLegendSlot10Choice();
    }
  },

  // ─── Ad Restart Modal ────────────
  _drawAdRestartModal(ctx, W, H) {
    const mw = W - 80, mx = 40;
    const py = 22, px = 20;
    const titleH = 22, gap = 12, descH = 60, btnH = 44;
    const mh = py + titleH + gap + descH + gap + btnH + py;
    const my = (H - mh) / 2;
    ctx.save();
    this._drawModalBg(ctx, mx, my, mw, mh, 'rgba(134,239,172,0.45)');
    drawText(ctx, '获取成功', W / 2, my + py + titleH / 2, '#86efac', 18, 'center', 'rgba(134,239,172,0.45)', 700);
    if (state.adRestartModalContent) drawWrappedText(ctx, state.adRestartModalContent, mx + px, my + py + titleH + gap, mw - px * 2, CONFIRM_BODY.lh, CONFIRM_BODY.color, CONFIRM_BODY.fs, CONFIRM_BODY.fw);
    const btnY = my + py + titleH + gap + descH + gap;
    const halfW = (mw - px * 3) / 2;
    const cb = drawButtonGradient(ctx, mx + px, btnY, halfW, btnH, '稍后', 'rgba(255,255,255,0.08)', '#fff', 14, 12, undefined, 500);
    this.manager.addTouchable(cb.x, cb.y, cb.w, cb.h, 'onAdRestartCancel');
    const db = drawButtonGradient(ctx, mx + px * 2 + halfW, btnY, halfW, btnH, '立即重开', gradientPink, '#fff', 14, 12, undefined, 700);
    this.manager.addTouchable(db.x, db.y, db.w, db.h, 'onAdRestartConfirm');
    ctx.restore();
  },
  onAdRestartConfirm() { state.showAdRestartModal = false; this._resetInLevel(); },
  onAdRestartCancel() { state.showAdRestartModal = false; state.isGameActive = false; },

  handleBackButton() {
    if (state.showResetChallengeConfirm) {
      state.showResetChallengeConfirm = false;
      return true;
    }
    if (state.showAbandonConfirm) {
      state.showAbandonConfirm = false;
      return true;
    }
    if (state.showAdRestartModal) {
      state.showAdRestartModal = false;
      return true;
    }
    if (state.showRestartDoneToast) {
      state.showRestartDoneToast = false;
      return true;
    }
    if (state.showLegendPayConfirm) {
      state.showLegendPayConfirm = false;
      state.legendPayBalloonId = null;
      return true;
    }
    if (state.showLegendSelect) {
      this.closeLegendSelect();
      return true;
    }
    if (state.showLegendSlotChoice) {
      state.showLegendSlotChoice = false;
      return true;
    }
    if (state.showSettings) {
      this.closeSettings();
      return true;
    }
    if (state.showTutorial) {
      this.closeTutorial();
      return true;
    }
    if (state.failHelpOpen) {
      this.closeFailHelp();
      return true;
    }
    if (state.showLevelComplete) {
      state.showLevelComplete = false;
      return true;
    }
    return false;
  },

};

// ─── Nav icon button helper（支持传入 PNG 路径或 emoji 文本） ──
function drawIconBtn(ctx, x, y, size, icon, scene, handler) {
  ctx.save(); roundRect(ctx, x, y, size, size, size * 0.3);
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,80,200,0.3)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  const isImg = typeof icon === 'string' && /\.(png|jpe?g|webp)$/i.test(icon);
  const img = isImg ? getImage(icon) : null;
  if (img) {
    const s = Math.round(size * 0.6);
    drawImage(ctx, icon, x + (size - s) / 2, y + (size - s) / 2, s, s);
  } else {
    drawText(ctx, icon, x + size / 2, y + size / 2 + 2, '#ffffff', size * 0.45, 'center');
  }
  scene.manager.addTouchable(x, y, size, size, handler || 'openSettings');
}
