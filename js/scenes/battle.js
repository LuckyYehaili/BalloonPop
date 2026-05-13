// Battle Scene (PRD 3.x)
// 昨天恢复的关键改动（before 2026-05-09 19:00）：
//   1. 顶部「充气挑战」标题栏 + 单一「本关进度」大卡片（含进度格）
//   2. 进度小方框 cardShrink=8、cardGap=12、panelInnerPadY=10；小气球在方框中居中
//   3. 仪表盘 +30% 放大，gaugeCY 距底部安全区 32+ 距离
//   4. 圆形按钮 hit-test、tip「按住圆形按钮充气哦」、置灰态再次唤起失败弹窗
//   5. 「充气过头」改为「气球炸了！」，失败弹窗参考完美充气紫红主题
//   6. 完美充气改为绿色矢量气球 + 大按钮 + 进度圆点同行计数
//   7. 全局弹窗左右各 40（宽 W-80）；标题 ≤18 / 正文与按钮 14 / 辅助 12
//   8. 重开 toast 统一 90% 不透明 / 14px
const { drawBackground, drawText, drawButton, drawButtonGradient, drawImage, getImage, loadImages, showToast, showModal, closeModal, gradientPink, gradientGold, gradientGreen, roundRect, measureText, LEVEL_BG, beginScrollView, endScrollView, drawWrappedText, drawModalBackground, drawToggle } = require('../engine/canvas-ui');
const { drawBalloon, drawBalloonShape, spawnExplosion, resetParticles, getBalloonCenter } = require('../engine/balloon-renderer');
const { drawBouquetCompletionAnim } = require('../engine/bouquet-renderer');
const { drawGauge } = require('../engine/gauge-renderer');
const { getCapsuleLayout } = require('../layout-safe');
const store = require('../store');
const { LEVELS, BALLOON_TYPES } = require('../balloons');
const { getSequence } = require('../emoji-sequences');

const AD_RESTART_GRANT = 2;
const MAX_CUMULATIVE_RETRIES = 5;
/** 传奇气球单价（元） */
const LEGEND_PRICE_YUAN = 1.99;

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

let state = {
  currentLevelIdx: 0, level: LEVELS[0], bgKey: 'candy',
  pressure: 0, isHolding: false, gameState: 'idle', isGameActive: true,
  isExploding: false, flashWhite: false,
  isPerfect: false,
  balloonInLevel: 0, completedInLevel: 0, completedBalloonsList: [],
  currentColor: '#ff6eb4', currentGlow: '#ff6eb4', currentShape: 'round',
  restartChances: 3, failCount: 0, failTitle: '', failDesc: '', failChoiceMode: 'hasRestart', failReason: 'low',
  showLevelComplete: false, levelBonusPts: 0,
  showSettings: false, soundOn: true, showLegendSelect: false, legendBalloons: [],
  showLegendPayConfirm: false, legendPayBalloonId: null,
  legendSelectScrollY: 0,
  _legendSelectDrag: null,
  showAbandonConfirm: false, showResetChallengeConfirm: false, showSharePreview: false, showTutorial: false, tutorialStep: 0,
  showPrivacy: false, showAdRestartModal: false, adRestartModalContent: '',
  failHelpOpen: false,
  showRestartDoneToast: false, restartDoneToastRemain: 0, toastTimer: null,
  time: 0, gaugeHidden: false, paidBalloonUsed: false,
  shareTextIndex: 0, bouquetReady: false,
  bouquetAnimStartMs: 0,
  // 圆形按钮 hit-test & 提示
  pumpDisabled: false,
  showPumpTip: false,
  pumpTipTimer: null
};

function getLevelBg(background) { return LEVEL_BG[background] || LEVEL_BG.candy; }

module.exports = {

  onShow(data) {
    const settings = store.getSettings();
    state.soundOn = settings.soundOn;

    const user = store.getUser();
    const firstTime = !!user.isFirstTime;
    if (firstTime) {
      store.updateUser({ isFirstTime: false });
    }

    try { loadImages(['images/ui/setting.png'], () => {}); } catch (_) {}

    // 进场就提前创建两个音频实例，开始后台加载，首次按下不丢首声
    this._ensurePumpAudio();
    this._ensureExplodeAudio();

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
    state.showAbandonConfirm = false;
    state.showSharePreview = false;
    state.showPrivacy = false;
    state.showAdRestartModal = false;
    state.pumpDisabled = false;
    state.bouquetAnimStartMs = Date.now();
    try { console.log('[debug] Level complete modal'); } catch (_) {}
  },

  onHide() {
    if (state.toastTimer) { clearTimeout(state.toastTimer); state.toastTimer = null; }
    if (this._pumpTimer) { clearInterval(this._pumpTimer); this._pumpTimer = null; }
    if (state.pumpTipTimer) { clearTimeout(state.pumpTipTimer); state.pumpTipTimer = null; }
    state.isHolding = false;
    state.showPumpTip = false;
    this._stopPumpAudio();
  },

  _initLevel() {
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
    this._syncDerived({ currentLevelIdx: levelIdx });
    state.pressure = 0; state.isHolding = false; state.gameState = 'idle';
    state.isGameActive = true; state.isExploding = false; state.flashWhite = false;
    state.balloonInLevel = 0; state.completedInLevel = 0; state.completedBalloonsList = [];
    state.failCount = 0; state.showLevelComplete = false; state.showSettings = false;
    state.showLegendSelect = false; state.showTutorial = false;
    state.showAbandonConfirm = false; state.showResetChallengeConfirm = false; state.showSharePreview = false;
    state.showAdRestartModal = false;
    state.pumpDisabled = false;
    state.showPumpTip = false;
    if (state.pumpTipTimer) { clearTimeout(state.pumpTipTimer); state.pumpTipTimer = null; }
  },

  _syncDerived(next) {
    const idx = next && next.currentLevelIdx !== undefined ? next.currentLevelIdx : state.currentLevelIdx;
    const lv = LEVELS[idx % LEVELS.length];
    const bg = lv.background || 'candy';
    const seq = getSequence(lv.id);
    const balloonIdx = state.balloonInLevel;
    const currentSeqItem = seq[balloonIdx] || seq[0];

    state.level = lv;
    state.bgKey = bg;
    state.currentColor = currentSeqItem.color;
    state.currentGlow = currentSeqItem.glowColor;
    state.currentShape = currentSeqItem.shape;
    state.gaugeHidden = (bg === 'temple' && state.gameState === 'playing');
  },

  _refreshFlags() {
    return {
      disabledHold: !state.isGameActive || state.gameState === 'success' || state.showLevelComplete || state.showSettings || state.showLegendSelect || state.showAbandonConfirm || state.showResetChallengeConfirm || state.showSharePreview || state.showAdRestartModal,
      maskNative: state.gameState === 'fail' || state.showLevelComplete || state.showSettings || state.showLegendSelect || state.showAbandonConfirm || state.showResetChallengeConfirm || state.showSharePreview || state.showAdRestartModal
    };
  },

  // 任意会挡住「按住充气」交互的弹窗 / 提示是否在场
  _anyModalBlockingPumpTip() {
    return !!(state.gameState === 'fail' || state.showLevelComplete || state.showSettings || state.showLegendSelect || state.showAbandonConfirm || state.showResetChallengeConfirm || state.showSharePreview || state.showAdRestartModal || state.showTutorial || state.showPrivacy || state.failHelpOpen);
  },

  /** 是否绘制全屏黑蒙层（仅弹窗，不含会自动消失的 toast） */
  _battleDimBackdrop() {
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
    const bg = getLevelBg(state.bgKey);
    drawBackground(ctx, W, H, bg);
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
    const subText = '🚩 第 ' + (state.currentLevelIdx + 1) + ' 关 ｜ ' + state.level.name;
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
    panelGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
    panelGrad.addColorStop(1, 'rgba(20,8,40,0.55)');
    ctx.fillStyle = panelGrad; ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,200,0.22)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();

    // 头部：本关进度 / 重开次数 / 传奇 —— 左右与小卡片区严格对齐
    const cardsLeft = cardPad;
    const cardsRight = cardPad + cardCount * cardSize + (cardCount - 1) * cardGap;
    const cardsCenterX = (cardsLeft + cardsRight) / 2;
    const headerY = panelTop + panelGap;
    const headerCY = headerY + headerH / 2;
    drawText(ctx, '本关进度', cardsLeft, headerCY, '#ffffff', 14, 'left', undefined, 700);
    drawText(ctx, '重开次数 ' + state.restartChances, cardsCenterX, headerCY, 'rgba(255,255,255,0.7)', 12, 'center', undefined, 500);

    // 传奇 pill（右边沿对齐卡片右沿）
    const pillText = '✦ 传奇 ' + state.completedInLevel + '/10';
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
    UI.manager.addTouchable(pillX, pillY, pillW, 26, 'openLegendSelect');

    // ─── 进度方格（2×5） ────────────────────
    const slots = this._buildSlots();
    const row1Y = headerY + headerH + panelGap;   // 标题↔卡片 = panelGap
    const row2Y = row1Y + cardSize + cardGap;
    const miniR = cardSize * 0.22;

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

        // 小气球居中（不再向下偏移）
        if (s.isPaid && s.isBought) {
          ctx.save();
          ctx.globalAlpha = s.status === 'empty' ? 0.45 : 1;
          drawBalloonShape(ctx, 'crown', cx, cy, miniR,
            '#ffd700', '#ffab00', 0, 50, false, state.time, this.dpr, true);
          ctx.restore();
        } else if (s.isPaid) {
          ctx.save();
          ctx.globalAlpha = s.status === 'empty' ? 0.35 : 1;
          drawBalloonShape(ctx, s.shape || 'round', cx, cy, miniR,
            s.color || '#ff6eb4', s.glowColor || '#ff6eb4', 0, 50, false, state.time, this.dpr, true);
          ctx.restore();
          if (s.status !== 'done') {
            const ghostAlpha = (Math.sin(state.time * 1.6) * 0.5 + 0.5) * 0.45;
            ctx.save();
            ctx.globalAlpha = ghostAlpha;
            drawBalloonShape(ctx, 'crown', cx, cy, miniR,
              '#ffd700', '#ffab00', 0, 50, false, state.time, this.dpr, true);
            ctx.restore();
          }
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
          UI.manager.addTouchable(cx - cardSize / 2, rowY, cardSize, cardSize, 'openLegendSelect');
        } else {
          ctx.save();
          ctx.globalAlpha = s.status === 'empty' ? 0.35 : 1;
          drawBalloonShape(ctx, s.shape || 'round', cx, cy, miniR,
            s.color || '#ff6eb4', s.glowColor || '#ff6eb4', 0, 50, false, state.time, this.dpr, true);
          ctx.restore();
        }
      });
    });

    // 传奇购买提示
    const panelBottom = panelTop + panelH;
    let belowY = panelBottom + 8;
    const hintH = state.paidBalloonUsed ? 0 : 18;
    if (!state.paidBalloonUsed) {
      drawText(ctx, '可以购买传奇气球替换第十个气球', W / 2,
        belowY + 6, 'rgba(255,255,255,0.7)', 12, 'center');
      UI.manager.addTouchable(W / 2 - 110, belowY - 4, 220, 22, 'openLegendSelect');
      belowY += hintH + 6;
    }

    // ─── 仪表盘 / 圆形按钮（+30% 放大、距底部安全区） ──
    const safeBottom = (L.safeBottomInset || 0);
    const padBelowArc = Math.max(32, safeBottom);
    const gaugeSize = Math.min(W * 1.26 * 1.3, 468, W - 20);
    const arcR = gaugeSize * 0.55 * 0.5; // gauge-renderer 内部以 SIZE/2 为半径基准
    // 让圆心位于：屏底 - padBelowArc - 圆弧半径
    const gaugeCY = H - padBelowArc - arcR + 12; // 在原基础上微调下移 12px
    const gaugeCX = W / 2;

    // 中心球区域 = 顶部内容下方 ~ 仪表盘上方
    const gameTop = belowY + 4;
    const gameBottom = gaugeCY - arcR - 6;
    const gameH = Math.max(140, gameBottom - gameTop);

    // Ambient glow
    const ambCX = W / 2, ambCY = gameTop + gameH * 0.5;
    const ambGrad = ctx.createRadialGradient(ambCX, ambCY, gameH * 0.05, ambCX, ambCY, gameH * 0.55);
    ambGrad.addColorStop(0, 'rgba(255,80,200,0.04)');
    ambGrad.addColorStop(1, 'rgba(255,80,200,0)');
    ctx.save(); ctx.beginPath(); ctx.arc(ambCX, ambCY, gameH * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = ambGrad; ctx.fill(); ctx.restore();

    if (!flags.maskNative) {
      drawBalloon(ctx, W, gameTop, gameH, state.pressure, state.currentColor, state.currentGlow, state.currentShape, state.isExploding, state.gameState === 'success', this.dpr);
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
    if (state.showLegendSelect) {
      this._drawLegendSelect(ctx, W, H);
      if (state.showLegendPayConfirm) this._drawLegendPayConfirm(ctx, W, H);
    }
    if (state.showRestartDoneToast) this._drawRestartToast(ctx, W, H);
    if (state.showAdRestartModal) this._drawAdRestartModal(ctx, W, H);
    if (state.showAbandonConfirm) this._drawAbandonConfirm(ctx, W, H);
    if (state.showResetChallengeConfirm) this._drawResetChallengeConfirm(ctx, W, H);
    if (state.showPrivacy) this._drawPrivacyModal(ctx, W, H);
    if (state.gameState === 'success' && state.balloonInLevel < 9 && !state.showLevelComplete) {
      this._drawSuccessModal(ctx, W, H);
    }
  },

  // ─── Progress slots builder ────────────────
  _buildSlots() {
    const seq = getSequence(state.level.id);
    // 当前关刚刚完美/成功时，立即把当前格视作 done（避免视觉上还停留在 current）
    const successIdx = (state.gameState === 'success') ? state.balloonInLevel + 1 : state.completedInLevel;
    return seq.map((item, i) => ({
      id: i,
      shape: item.shape,
      color: item.color,
      glowColor: item.glowColor,
      status: i < successIdx ? 'done' : (i === state.balloonInLevel ? 'current' : 'empty'),
      isPaid: i === 9, isBought: state.paidBalloonUsed && i === 9
    }));
  },

  // ─── Touch handling ────────────────────────
  onTouch(type, x, y) {
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
      if (!state.isGameActive || state.gameState === 'success' || state.isHolding) return true;

      // 置灰态：再次唤起对应的失败弹窗，不进入充气
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
        clearInterval(this._pumpTimer); this._pumpTimer = null;
        state.isHolding = false;
        this._stopPumpAudio();
        this._failPump('explode', 100);
      }
    }, 50);
  },

  _stopPump() {
    if (this._pumpTimer) { clearInterval(this._pumpTimer); this._pumpTimer = null; }
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
      audio.src = 'audio/daqisheng.MP3';
      audio.loop = true;
      audio.obeyMuteSwitch = false;
      audio.volume = 1.0;
      if (audio.onCanplay) audio.onCanplay(() => { console.log('[battle.pumpAudio] canplay'); });
      if (audio.onPlay)    audio.onPlay(()    => { console.log('[battle.pumpAudio] playing'); });
      if (audio.onStop)    audio.onStop(()    => { console.log('[battle.pumpAudio] stopped'); });
      if (audio.onError)   audio.onError((err)=> { console.warn('[battle.pumpAudio] onError:', err && (err.errMsg || err)); });
      this._pumpAudio = audio;
    } catch (e) {
      console.warn('[battle.pumpAudio] init failed:', e && e.message);
    }
  },
  _startPumpAudio() {
    try {
      const settings = store.getSettings && store.getSettings();
      if (settings && settings.soundOn === false) return; // 设置里关了音效就别播
    } catch (_) {}
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
      audio.src = 'audio/baozha.MP3';
      audio.loop = false;
      audio.obeyMuteSwitch = false;
      audio.volume = 1.0;
      if (audio.onCanplay) audio.onCanplay(() => { console.log('[battle.explodeAudio] canplay'); });
      if (audio.onPlay)    audio.onPlay(()    => { console.log('[battle.explodeAudio] playing'); });
      if (audio.onEnded)   audio.onEnded(()   => { console.log('[battle.explodeAudio] ended'); });
      if (audio.onError)   audio.onError((err)=> { console.warn('[battle.explodeAudio] onError:', err && (err.errMsg || err)); });
      this._explodeAudio = audio;
    } catch (e) {
      console.warn('[battle.explodeAudio] init failed:', e && e.message);
    }
  },
  _playExplosionAudio() {
    try {
      const settings = store.getSettings && store.getSettings();
      if (settings && settings.soundOn === false) return;
    } catch (_) {}
    this._ensureExplodeAudio();
    const a = this._explodeAudio;
    if (!a) return;
    try {
      // 连续爆炸时先 stop（会自动复位到 0），然后立刻 play；不要在这里 seek，
      // 否则在「未就绪」状态下会把 play 截胡。
      if (typeof a.stop === 'function') a.stop();
      if (typeof a.play === 'function') a.play();
    } catch (e) {
      console.warn('[battle.explodeAudio] play failed:', e && e.message);
    }
  },

  _checkPressure() {
    const p = state.pressure;
    const { targetMin, targetMax } = state.level;
    if (p >= targetMin && p <= targetMax) {
      state.isPerfect = p >= targetMin + 0.5 && p <= targetMax - 0.5;
      if (state.balloonInLevel === 9) { state.gameState = 'success'; setTimeout(() => this._handleNextBalloon(), 80); return; }
      state.gameState = 'success'; return;
    }
    if (p > targetMax) { this._failPump('high', p); return; }
    this._failPump('low', p);
  },

  _failPump(reason, p) {
    state.isExploding = reason === 'explode';
    state.flashWhite = reason === 'explode';
    state.pressure = 0; state.gameState = 'fail'; state.isGameActive = false;
    state.failCount++; state.failReason = reason;
    state.failChoiceMode = state.restartChances > 0 ? 'hasRestart' : 'adOnly';
    const { targetMin, targetMax } = state.level;
    if (reason === 'explode') { state.failTitle = '气球炸了！'; state.failDesc = '压力爆表了！这算一次失败。'; }
    else if (reason === 'high') { state.failTitle = '气球炸了！'; state.failDesc = '超过目标上限 ' + targetMax + '。本次：' + Math.round(p); }
    else { state.failTitle = '充气不足'; state.failDesc = '未达到目标下限 ' + targetMin + '。本次：' + Math.round(p); }
    if (reason === 'explode') { setTimeout(() => state.flashWhite = false, 150); setTimeout(() => state.isExploding = false, 520); }
    if (reason === 'explode') { const c = getBalloonCenter(); spawnExplosion(c.x, c.y); this._playExplosionAudio(); }
  },

  _resetInLevel() {
    const lv = state.currentLevelIdx + 1;
    const retries = store.getFreeRetries(lv);
    state.pressure = 0; state.isHolding = false; state.isExploding = false; state.flashWhite = false;
    state.gameState = 'idle'; state.isGameActive = true; state.failCount = 0;
    state.completedInLevel = 0; state.balloonInLevel = 0; state.completedBalloonsList = [];
    state.restartChances = retries;
    state.pumpDisabled = false;
    resetParticles();
    this._syncDerived({ balloonInLevel: 0, completedInLevel: 0 });
  },

  _handleNextBalloon() {
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
      shape: completedMeta.shape,
      color: completedMeta.color,
      glowColor: completedMeta.glowColor,
      isPaid: isPaidSlot
    }]);

    state.pumpDisabled = false;

    if (nextBalloon >= 10) {
      const bonusPts = (state.currentLevelIdx + 1) * 500;
      store.unlockLevel(state.currentLevelIdx + 2);
      store.setLastPlayedLevel(Math.min(state.currentLevelIdx + 2, 4));
      store.addClearRecord({ level: state.currentLevelIdx + 1, isFullClear: false, hasLegend: isPaidSlot, balloons: list });
      store.addBouquet({ level: state.currentLevelIdx + 1, hasLegend: isPaidSlot, balloons: list });
      // 通关记录（Bug 3 修复：补 recordFullClear）
      try { store.recordFullClear(); } catch (_) {}
      state.completedBalloonsList = list; state.completedInLevel = 10; state.balloonInLevel = 0;
      state.showLevelComplete = true; state.levelBonusPts = bonusPts;
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
    let bx = Math.round(anchorX - bw / 2);
    let by = Math.round(anchorY - bh - arrowH - 8);
    if (by < 80) by = 80;
    bx = Math.max(12, Math.min(W - 12 - bw, bx));

    ctx.save();
    roundRect(ctx, bx, by, bw, bh, 12);
    ctx.fillStyle = 'rgba(17,24,39,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,200,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, text, bx + bw / 2, by + bh / 2, '#ffffff', fontSize, 'center', undefined, 600);

    // 小箭头指向按钮
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(anchorX - 7, by + bh - 0.5);
    ctx.lineTo(anchorX, by + bh + arrowH);
    ctx.lineTo(anchorX + 7, by + bh - 0.5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(17,24,39,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,200,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
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

    const btn = drawButtonGradient(ctx, mx + px, my + mh - py - btnH, mw - px * 2, btnH, '我会了，开始吧', gradientPink, '#fff', 14, 14, undefined, 700);
    this.manager.addTouchable(btn.x, btn.y, btn.w, btn.h, 'closeTutorial');
    ctx.restore();
  },
  closeTutorial() {
    state.showTutorial = false;
    this._showPumpTipFor(3000);
  },

  // ─── Fail Modal（紫红色调，参考完美充气样式） ──
  _drawFailModal(ctx, W, H) {
    const mw = W - 80, mx = 40;
    const py = 24, px = 20;
    const heroH = 96, gap = 12, titleH = 28, descH = 18, btnH = 50;
    const isAdOnly = state.failChoiceMode !== 'hasRestart';
    const helpBtnH = 22;
    const hasSecondary = true;
    const mh = py + helpBtnH + gap + heroH + gap + titleH + gap + descH + gap * 2 + btnH + (hasSecondary ? gap + btnH : 0) + gap + 28 + py;
    const my = (H - mh) / 2;

    ctx.save();
    this._drawModalBg(ctx, mx, my, mw, mh, 'rgba(244,114,182,0.45)', 24);
    // 外发光（柔化：alpha 与 blur 都减半）
    ctx.shadowColor = 'rgba(244,114,182,0.28)';
    ctx.shadowBlur = 14;
    roundRect(ctx, mx, my, mw, mh, 24);
    ctx.strokeStyle = 'rgba(244,114,182,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0;

    // 顶部说明按钮
    const helpW = 56, helpX = mx + mw - px - helpW;
    const helpY = my + py;
    ctx.save(); roundRect(ctx, helpX, helpY, helpW, helpBtnH, helpBtnH / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    drawText(ctx, '说明', helpX + helpW / 2, helpY + helpBtnH / 2, 'rgba(255,255,255,0.85)', 12, 'center', undefined, 500);
    this.manager.addTouchable(helpX, helpY, helpW, helpBtnH, 'openFailHelp');

    // hero（动画放大的矢量气球，紫红色）
    const heroY = my + py + helpBtnH + gap;
    const bounce = (Math.sin(state.time * 3) * 0.05 + 1);
    ctx.save();
    ctx.translate(W / 2, heroY + heroH / 2);
    ctx.scale(bounce, bounce);
    drawBalloonShape(ctx, 'round', 0, 0, heroH * 0.42,
      '#f472b6', '#a78bfa', 0, 60, false, state.time, this.dpr, true);
    ctx.restore();

    // 标题（24px，柔化粉紫发光）
    const titleY = heroY + heroH + gap;
    ctx.save();
    ctx.shadowColor = 'rgba(244,114,182,0.45)';
    ctx.shadowBlur = 10;
    drawText(ctx, state.failTitle || '气球炸了！', W / 2, titleY + titleH / 2, '#f472b6', 18, 'center', undefined, 900);
    ctx.shadowBlur = 0;
    ctx.restore();

    // 描述
    const descY = titleY + titleH + gap;
    if (state.failDesc) drawText(ctx, state.failDesc, W / 2, descY + descH / 2, 'rgba(255,255,255,0.65)', 14, 'center', undefined, 400);

    // 按钮
    const btnX = mx + px, btnW = mw - px * 2;
    const actionsTop = descY + descH + gap * 2;

    const b1Text = isAdOnly ? '看广告再试一次' : '看广告再试一次';
    // 主按钮：粉→紫渐变
    ctx.save();
    roundRect(ctx, btnX, actionsTop, btnW, btnH, 16);
    const mg = ctx.createLinearGradient(btnX, actionsTop, btnX + btnW, actionsTop + btnH);
    mg.addColorStop(0, '#f472b6'); mg.addColorStop(1, '#a78bfa');
    ctx.fillStyle = mg; ctx.fill();
    ctx.shadowColor = 'rgba(244,114,182,0.32)'; ctx.shadowBlur = 10;
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.restore();
    drawText(ctx, b1Text, W / 2, actionsTop + btnH / 2, '#ffffff', 14, 'center', 'rgba(0,0,0,0.25)', 700);
    this.manager.addTouchable(btnX, actionsTop, btnW, btnH, 'watchAdContinue');

    // 第二个按钮：透明+柔粉边框
    if (hasSecondary) {
      const sy = actionsTop + btnH + gap;
      ctx.save();
      roundRect(ctx, btnX, sy, btnW, btnH, 16);
      ctx.fillStyle = 'rgba(244,114,182,0.06)'; ctx.fill();
      ctx.strokeStyle = 'rgba(244,114,182,0.42)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
      const secondText = isAdOnly ? '重置挑战（从第 1 关开始）' : ('重置本关，从第1只开始（剩余 ' + state.restartChances + ' 次）');
      drawText(ctx, secondText, W / 2, sy + btnH / 2, '#f472b6', 14, 'center', undefined, 600);
      this.manager.addTouchable(btnX, sy, btnW, btnH, isAdOnly ? 'openResetChallengeConfirm' : 'restartFromFail');
    }

    // 取消（次级文字按钮）
    const cancelY = actionsTop + btnH + (hasSecondary ? btnH + gap : 0) + gap;
    drawText(ctx, '取消', W / 2, cancelY + 14, 'rgba(255,255,255,0.7)', 14, 'center', undefined, 500);
    this.manager.addTouchable(btnX, cancelY, btnW, 28, 'cancelFailModal');
    ctx.restore();

    if (state.failHelpOpen) this._drawFailHelpPopup(ctx, W, H, mx, my, mw, mh);
  },
  cancelFailModal() {
    if (state.gameState === 'fail') {
      state.failHelpOpen = false;
      state.gameState = 'idle';
      state.isGameActive = false;
      state.pressure = 0;
      state.pumpDisabled = true;
    }
  },
  openFailHelp() { state.failHelpOpen = true; },
  closeFailHelp() { state.failHelpOpen = false; },
  _drawFailHelpPopup(ctx, W, H) {
    const pw = W - 80, mx = 40;
    const py = 22, px = 20, gap = 12;
    const titleH = 22, lineGap = 22, btnH = 44;
    const ph = py + titleH + gap + lineGap * 4 + gap + btnH + py;
    const my = (H - ph) / 2;
    ctx.save();
    this._drawModalBg(ctx, mx, my, pw, ph, 'rgba(255,80,200,0.5)');
    drawText(ctx, '规则说明', W / 2, my + py + titleH / 2, '#ffffff', 18, 'center', undefined, 700);
    const isAdOnly = state.failChoiceMode !== 'hasRestart';
    const line1Y = my + py + titleH + gap;
    drawWrappedText(ctx, '看广告再试一次：不消耗重开次数，仅重打当前气球；', mx + px, line1Y, pw - px * 2, lineGap, 'rgba(255,255,255,0.75)', 14);
    const line2Y = line1Y + lineGap * 2;
    if (!isAdOnly) {
      drawWrappedText(ctx, '重置本关：每次消耗 1 次重开机会，从本关第 1 只气球重新开始；当前剩余 ' + state.restartChances + ' 次。', mx + px, line2Y, pw - px * 2, lineGap, 'rgba(255,255,255,0.75)', 14);
    } else {
      drawWrappedText(ctx, '重置挑战：重开机会已用完时可用，将清除挑战进度，从第 1 关重新开始。', mx + px, line2Y, pw - px * 2, lineGap, 'rgba(255,255,255,0.75)', 14);
    }
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
    const perfectH = state.isPerfect ? 28 : 0;
    const dotsH = 22;
    const mh = py + heroH + gap + titleH + (perfectH ? gap + perfectH : 0) + gap + dotsH + gap + descH + gap * 2 + btnH + py;
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

    // 完美奖励（金色 pill，宽度自适应）
    if (state.isPerfect) {
      const badgeText = '完美奖励 +50 分';
      const badgeFS = 12;
      const badgeTW = measureText(ctx, badgeText, badgeFS, 700);
      const badgeW = Math.ceil(badgeTW + 28);
      const badgeX = W / 2 - badgeW / 2;
      ctx.save();
      roundRect(ctx, badgeX, curY, badgeW, perfectH, perfectH / 2);
      const bg = ctx.createLinearGradient(badgeX, 0, badgeX + badgeW, 0);
      bg.addColorStop(0, '#ffd740'); bg.addColorStop(1, '#ff9100');
      ctx.fillStyle = bg; ctx.fill();
      ctx.restore();
      drawText(ctx, badgeText, W / 2, curY + perfectH / 2, '#1a0000', badgeFS, 'center', undefined, 700);
      curY += perfectH + gap;
    }

    // 进度圆点 + 计数同行
    const totalDots = 10;
    const dotR = 4, dotOnR = 6, dotGap = 6;
    const dotsWidth = totalDots * (dotR * 2 + dotGap) - dotGap;
    const cnt = (state.balloonInLevel + 1) + ' / 10';
    const cntFS = 14;
    const cntTW = measureText(ctx, cnt, cntFS, 700);
    const inlineW = dotsWidth + 16 + cntTW;
    const inlineX = W / 2 - inlineW / 2;
    for (let i = 0; i < totalDots; i++) {
      const dx = inlineX + i * (dotR * 2 + dotGap) + dotR;
      const dy = curY + dotsH / 2;
      const isOn = i < (state.balloonInLevel + 1);
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
    const remain = 9 - state.balloonInLevel;
    if (remain > 0) {
      drawText(ctx, '还剩 ' + remain + ' 个气球，继续加油！', W / 2, curY + descH / 2, 'rgba(255,255,255,0.7)', 14, 'center', undefined, 400);
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
    const titleH = 22, gap = 10, rowH = 40, actionH = 44, footerH = 28;
    const settings = store.getSettings();
    const actions = [
      { text: '放弃挑战', style: 'rgba(255,23,68,0.2)', color: '#ff1744', h: 'abandonChallenge' }
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
    drawText(ctx, '儿童隐私保护声明及监护人须知', W / 2, footerY + footerH / 2, 'rgba(255,255,255,0.5)', 12, 'center', undefined, 400);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(mx + px, footerY - 4); ctx.lineTo(mx + mw - px, footerY - 4); ctx.stroke();
    ctx.restore();
    this.manager.addTouchable(mx + px, footerY - 2, mw - px * 2, footerH + 4, 'openPrivacy');
    ctx.restore();
  },
  openPrivacy() { state.showPrivacy = true; },
  closePrivacy() { state.showPrivacy = false; },
  _drawPrivacyModal(ctx, W, H) {
    const mw = W - 80, mx = 40;
    const py = 22, px = 20;
    const titleH = 22, gap = 12, scrollH = 140, btnH = 44;
    const mh = py + titleH + gap + scrollH + gap + btnH + py;
    const my = (H - mh) / 2;

    ctx.save();
    this._drawModalBg(ctx, mx, my, mw, mh, 'rgba(255,80,200,0.4)');

    drawText(ctx, '✕', mx + mw - 22, my + py + 8, 'rgba(255,255,255,0.5)', 14, 'center');
    this.manager.addTouchable(mx + mw - 44, my + py - 4, 44, 32, 'closePrivacy');

    drawText(ctx, '儿童隐私保护声明', W / 2, my + py + titleH / 2, '#ffffff', 18, 'center', undefined, 700);

    const scrollY = my + py + titleH + gap;
    ctx.save();
    roundRect(ctx, mx + px, scrollY, mw - px * 2, scrollH, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.restore();
    drawWrappedText(ctx, '我们非常重视儿童隐私保护。如您为未成年人，请在监护人指导下使用本小程序。我们不会收集 14 岁以下用户的个人信息。详情请查看完整隐私政策。', mx + px + 12, scrollY + 12, mw - px * 2 - 24, 22, 'rgba(255,255,255,0.7)', 14);

    const cb = drawButtonGradient(ctx, mx + px, my + mh - py - btnH, mw - px * 2, btnH, '关闭', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.85)', 14, 12, undefined, 500);
    this.manager.addTouchable(cb.x, cb.y, cb.w, cb.h, 'closePrivacy');
    ctx.restore();
  },

  // ─── Level Complete Modal（配色与「完美充气」成功弹窗一致：深绿底 + 薄荷描边 + 绿青主按钮） ──
  _drawLevelCompleteModal(ctx, W, H) {
    const mw = W - 80, mx = 40;
    let pyTop = 10;
    let pyBottom = 8;
    const px = 10;
    let bannerH = 50;
    const gapBannerBouquet = 4;
    const statsGap = 2;
    let statsH = 54;
    const gapStatsActions = 5;
    let btn1H = 42;
    const btnGap = 5;
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
    while (fixedH + minBouquet > maxModalH && pyTop + pyBottom > 12) {
      if (pyTop > 6) pyTop -= 1;
      else if (pyBottom > 4) pyBottom -= 1;
      else break;
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
    const my = Math.max(8, (H - mh) / 2);

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
    const bannerText = '第 ' + (state.currentLevelIdx + 1) + ' 关全部完成！';
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
    drawText(ctx, state.level.name + ' · 10 个气球全部充气成功！', W / 2, bannerY + 42, 'rgba(255,255,255,0.65)', 12, 'center');

    const bqX = mx + px;
    const bqY = my + pyTop + bannerH + gapBannerBouquet;
    const bqW = mw - px * 2;
    const elapsedSec = (Date.now() - (state.bouquetAnimStartMs || Date.now())) / 1000;
    drawBouquetCompletionAnim(ctx, state.completedBalloonsList, bqX, bqY, bqW, bouquetH, elapsedSec);

    const statsY = bqY + bouquetH + statsGap;
    const statW = (mw - px * 2 - 12) / 3;
    const statIcons = ['images/ui/balloon.png', 'images/ui/crown.png', 'images/ui/sparkle.png'];
    const statNums = ['10', '第' + (state.currentLevelIdx + 1) + '关', '+' + state.levelBonusPts];
    const statLabels = ['完成气球', '关卡', '获得积分'];
    const iconSize = Math.min(20, Math.max(16, Math.floor(statsH * 0.32)));
    const iconTop = statsY + Math.max(2, statsH * 0.08);
    const numCy = statsY + statsH * 0.52;
    const labCy = statsY + statsH * 0.8;
    [0, 1, 2].forEach(i => {
      const sx = mx + px + i * (statW + 6);
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
        drawText(ctx, ['🎈', '👑', '✨'][i], sx + statW / 2, statsY + statsH * 0.22, '#86efac', Math.min(16, iconSize), 'center');
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
    const b1 = drawButtonGradient(ctx, mx + px, actionsY, btnW, btn1H, '📤 分享气球束给好友', shareGrad, '#a7f3d0', 14, 12, 'rgba(134,239,172,0.25)', 500);
    this.manager.addTouchable(b1.x, b1.y, b1.w, b1.h, 'openSharePreview');
    const b2text = state.currentLevelIdx < 3 ? '继续闯关 →' : '已通关，返回首页';
    const b2h = state.currentLevelIdx < 3 ? 'levelCompleteNext' : 'levelCompleteHome';
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
    resetParticles(); this._syncDerived({ currentLevelIdx: nextIdx, balloonInLevel: 0, completedInLevel: 0 });
  },
  levelCompleteHome() { this.manager.switchTo('home'); },
  openSharePreview() { showToast('分享功能已就绪'); },

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
      ctx.save();
      roundRect(ctx, gx, gy, cellW, cellH, 12);
      ctx.fillStyle = hasIt ? 'rgba(255,215,0,0.06)' : 'rgba(255,255,255,0.04)'; ctx.fill();
      ctx.strokeStyle = hasIt ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.save();
      ctx.beginPath(); ctx.arc(gx + cellW / 2, gy + 24, 22, 0, Math.PI * 2);
      ctx.strokeStyle = hasIt ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
      drawText(ctx, l.emoji, gx + cellW / 2, gy + 24, '#ffffff', 22, 'center');
      drawText(ctx, l.name, gx + cellW / 2, gy + 56, '#ffffff', 14, 'center', undefined, 600);
      drawText(ctx, hasIt ? '已拥有 ' + own.quantity : '未拥有', gx + cellW / 2, gy + 76, hasIt ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)', 12, 'center');
      ctx.restore();
      if (!state.showLegendPayConfirm) {
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

  /** 购买传奇气球确认（叠在选择弹窗之上） */
  _drawLegendPayConfirm(ctx, W, H) {
    const bId = state.legendPayBalloonId;
    const meta = bId && BALLOON_TYPES.find(b => b.id === bId);
    if (!meta) return;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    this.manager.addTouchable(0, 0, W, H, 'cancelLegendPay');

    const cardW = W - 80, cardX = 40;
    const py = 22, px = 20;
    const titleH = 24, gap = 12, descBoxH = 52, priceLineH = 36, btnH = 48;
    const ch = py + titleH + gap + descBoxH + gap + priceLineH + gap + btnH + py;
    const cy = (H - ch) / 2;

    this._drawModalBg(ctx, cardX, cy, cardW, ch, 'rgba(255,80,200,0.55)', 22);
    drawText(ctx, '购买传奇气球', W / 2, cy + py + titleH / 2, '#ffffff', 18, 'center', undefined, 700);
    const bodyTop = cy + py + titleH + gap;
    drawWrappedText(ctx, '「' + meta.name + '」每只 ¥' + LEGEND_PRICE_YUAN.toFixed(2) + '。支付成功后将自动装备到本关第 10 个气球位。', cardX + px, bodyTop, cardW - px * 2, 20, 'rgba(255,255,255,0.72)', 14);

    const priceY = bodyTop + descBoxH + gap + priceLineH / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(255,215,0,0.45)';
    ctx.shadowBlur = 12;
    drawText(ctx, '¥' + LEGEND_PRICE_YUAN.toFixed(2), W / 2, priceY, '#ffd740', 14, 'center', undefined, 800);
    ctx.shadowBlur = 0;
    ctx.restore();

    const btnY = cy + ch - py - btnH;
    const half = (cardW - px * 3) / 2;
    const cbtn = drawButtonGradient(ctx, cardX + px, btnY, half, btnH, '取消', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.88)', 14, 12, undefined, 600);
    this.manager.addTouchable(cbtn.x, cbtn.y, cbtn.w, cbtn.h, 'cancelLegendPay');
    const ok = drawButtonGradient(ctx, cardX + px * 2 + half, btnY, half, btnH, '确认支付', gradientPink, '#fff', 14, 12, undefined, 700);
    this.manager.addTouchable(ok.x, ok.y, ok.w, ok.h, 'confirmLegendPay');
    ctx.restore();
  },

  onLegendCellTap(bId) {
    if (state.showLegendPayConfirm) return;
    if (!bId) return;
    if (store.hasBalloon(bId)) {
      this._equipLegendFromModal(bId);
      return;
    }
    state.legendPayBalloonId = bId;
    state.showLegendPayConfirm = true;
    state._legendSelectDrag = null;
  },

  _equipLegendFromModal(bId) {
    if (!store.hasBalloon(bId)) return;
    if (!store.equipLegend(state.currentLevelIdx, bId)) return;
    state.paidBalloonUsed = true;
    this._syncDerived({});
    showToast('传奇气球已装上');
    state.showLegendSelect = false;
    state.showLegendPayConfirm = false;
    state.legendPayBalloonId = null;
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
    store.addBalloon(bId, 1, 'purchase');
    store.addTransaction({
      type: 'purchase',
      balloonId: bId,
      balloonName: meta ? meta.name : bId,
      quantity: 1,
      amountYuan: LEGEND_PRICE_YUAN,
      status: 'success',
      channel: 'mock_pay'
    });
    store.equipLegend(state.currentLevelIdx, bId);
    state.paidBalloonUsed = true;
    state.showLegendPayConfirm = false;
    state.legendPayBalloonId = null;
    this._syncDerived({});
    showToast('传奇气球已装上');
    state.showLegendSelect = false;
  },

  // ─── Reset Challenge Confirm ──
  _drawResetChallengeConfirm(ctx, W, H) {
    const mw = W - 80, mx = 40;
    const py = 22, px = 20;
    const titleH = 22, gap = 12, descH = 60, btnH = 48;
    const mh = py + titleH + gap + descH + gap + btnH + py;
    const my = (H - mh) / 2;

    this.manager.addTouchable(0, 0, W, H, () => {});

    ctx.save();
    this._drawModalBg(ctx, mx, my, mw, mh, 'rgba(244,114,182,0.45)');
    drawText(ctx, '确认重置挑战？', W / 2, my + py + titleH / 2, '#ffffff', 18, 'center', undefined, 700);
    drawWrappedText(ctx, '将重置挑战进度，从第 1 关开始挑战，确定重置挑战吗？', mx + px, my + py + titleH + gap, mw - px * 2, 22, 'rgba(255,255,255,0.7)', 14);
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
    const titleH = 22, gap = 12, descH = 44, btnH = 48;
    const mh = py + titleH + gap + descH + gap + btnH + py;
    const my = (H - mh) / 2;

    ctx.save();
    this._drawModalBg(ctx, mx, my, mw, mh, 'rgba(255,80,200,0.4)');
    drawText(ctx, '确认放弃？', W / 2, my + py + titleH / 2, '#ffffff', 18, 'center', undefined, 700);
    drawWrappedText(ctx, '确认放弃？将重置闯关关卡进度（已获得的普通气球不会消失）。', mx + px, my + py + titleH + gap, mw - px * 2, 22, 'rgba(255,255,255,0.7)', 14);
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
  toggleMusic() { const s = store.getSettings(); store.updateSettings({ musicOn: !s.musicOn }); },
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
    if (state.adRestartModalContent) drawWrappedText(ctx, state.adRestartModalContent, mx + px, my + py + titleH + gap, mw - px * 2, 22, 'rgba(255,255,255,0.7)', 14);
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
