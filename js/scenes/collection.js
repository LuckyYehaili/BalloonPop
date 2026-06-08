// Collection Scene — 气球图鉴（与首页/战队视觉对齐，可滚动 + 完整弹窗链路）
const {
  drawBackground, drawText, drawButtonGradient, showToast, gradientPink, roundRect, measureText,
  beginScrollView, endScrollView, drawWrappedText, drawModalBackground
} = require('../engine/canvas-ui');
const { drawPageHeader } = require('../engine/page-header');
const store = require('../store');
const { isUserLoggedIn } = require('../auth-guard');
const {
  toastIfLegendPurchaseBlocked,
  getLegendPurchaseConfirmCopy,
  runLegendPurchase,
  LEGEND_PRICE_YUAN_DEFAULT
} = require('../legend-purchase');
const { BALLOON_TYPES, LEVELS } = require('../balloons');
const UX = require('../ui-theme');
const { getCapsuleLayout, centerModalY } = require('../layout-safe');
const { drawBouquetStillFrame, drawBouquetCompletionAnim } = require('../engine/bouquet-renderer');
const { shareBouquetAsImage, balloonsFromBouquetRecord } = require('../bouquet-share');
const { syncBalloonInventoryFromCloud, cloudLogin } = require('../cloud-login');
const { sendBalloonGift, claimBalloonGift, getBalloonGift } = require('../cloud-gift');
const { giftReasonMessage } = require('../gift-reason');

const TAB_H = 50;
const PROGRESS_H = 36;
const TYPE = {
  tab: 14,
  progress: 11,
  cardLabel: 10,
  status: 9,
  action: 12,
  modalTitle: 15,
  modalBody: 14,
  modalSub: 12,
  button: 12,
  close: 13
};
const COLLECTION_UI = {
  modalBgStart: 'rgba(15,23,42,0.98)',
  modalBgEnd: 'rgba(17,12,42,0.98)',
  modalBorder: 'rgba(125,211,252,0.32)',
  modalBorderViolet: 'rgba(167,139,250,0.38)',
  modalBorderGold: 'rgba(252,211,77,0.38)',
  cardFill: 'rgba(255,255,255,0.06)',
  cardFillDim: 'rgba(255,255,255,0.03)',
  cardStroke: 'rgba(125,211,252,0.18)',
  cardStrokeDim: 'rgba(148,163,184,0.12)',
  progressStroke: 'rgba(125,211,252,0.2)',
  progressFillA: 'rgba(129,140,248,0.45)',
  progressFillB: 'rgba(56,189,248,0.45)',
  previewStroke: 'rgba(167,139,250,0.38)',
  overlayFill: 'rgba(8,5,20,0.32)'
};

/** 气球束缩略图数据：优先使用通关保存的 balloons（10 枚） */
function _normalizeBouquetBalloon(item, fallbackMeta) {
  const meta = (item && item.balloonId && BALLOON_TYPES.find(x => x.id === item.balloonId)) || fallbackMeta || null;
  return Object.assign({}, item || {}, meta ? {
    emoji: item && item.emoji ? item.emoji : meta.emoji,
    shape: item && item.shape ? item.shape : meta.shape,
    color: item && item.color ? item.color : meta.color,
    glowColor: item && item.glowColor ? item.glowColor : meta.glowColor
  } : {});
}

function _bouquetThumbBalloons(bq) {
  let arr = [];
  if (bq.balloons && Array.isArray(bq.balloons) && bq.balloons.length) arr = bq.balloons;
  else if (bq.originalBalloons && bq.originalBalloons.length) arr = bq.originalBalloons;
  else if (bq.sourceBalloonId) {
    const m = BALLOON_TYPES.find(x => x.id === bq.sourceBalloonId);
    if (m) arr = [_normalizeBouquetBalloon({ balloonId: m.id }, m)];
  }
  if (!arr.length) return [{ emoji: '🎈', shape: 'round', color: '#94a3b8', glowColor: '#64748b' }];
  const normalized = arr.map(item => _normalizeBouquetBalloon(item));
  if (normalized.length === 1) return Array.from({ length: 8 }, () => Object.assign({}, normalized[0]));
  return normalized;
}

/** 已结算花束静止画面（与通关弹窗同一套布局/丝带/蝴蝶结） */
function _drawBouquetStillThumb(ctx, balloons, x, y, w, h) {
  drawBouquetStillFrame(ctx, balloons, x, y, w, h, { layout: 'centered' });
}

let state = {
  activeTab: 'common',
  commonFlatList: [],
  legendList: [],
  bouquets: [],
  selected: null,
  showDetail: false,
  showEquipSelect: false,
  showSynPicker: false,
  synSelections: {},
  synPickerScrollY: 0,
  synPickerScrollMax: 0,
  synPickerBodyTop: 0,
  synPickerBodyH: 0,
  showSynAnim: false,
  synAnimBalloons: [],
  synAnimStartMs: 0,
  synAnimConsumedCount: 0,
  showGiftConfirm: false,
  showGiftReceiveModal: false,
  showGiftAuthModal: false,
  incomingGiftId: '',
  giftReceivePreview: null,
  giftReceiveLoading: false,
  giftReceiveClaiming: false,
  showPurchaseConfirm: false,
  showPreview: false,
  previewBouquetSn: null,
  pendingGiftId: null,
  synPickerDragging: false,
  synPickerDragStartY: 0,
  synPickerDragStartScroll: 0,
  pendingPurchaseId: null,
  equipBalloonId: '',
  /** 穿戴弹窗：单选目标关卡索引 0..LEVELS.length-1 */
  equipSelectedLevelIdx: 0,
  isIOS: false,
  scrollY: 0,
  scrollMax: 0,
  _scrollTop: 0,
  _scrollBottom: 0,
  isDraggingScroll: false,
  scrollMoved: false,
  scrollTouchStart: 0,
  scrollTouchStartX: 0,
  scrollStartY: 0
};

function _readIOS() {
  try {
    const sys = wx.getSystemInfoSync();
    return sys.platform === 'ios';
  } catch (e) {
    return false;
  }
}

function _drawCollectionModalBg(ctx, x, y, w, h, borderColor, radius) {
  const r = radius || 22;
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  const grad = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
  grad.addColorStop(0, COLLECTION_UI.modalBgStart);
  grad.addColorStop(1, COLLECTION_UI.modalBgEnd);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = borderColor || COLLECTION_UI.modalBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function _freeBalloonStats() {
  const owned = store.getOwnedBalloons();
  const commons = BALLOON_TYPES.filter(b => !b.isPaid);
  let nOwned = 0;
  commons.forEach(b => {
    if (owned[b.id] && owned[b.id].quantity > 0) nOwned++;
  });
  return { nOwned, nTotal: commons.length };
}

function _legendStats() {
  const n = state.legendList.length;
  const owned = state.legendList.filter(l => l.owned).length;
  return { owned, n };
}

/** 合成可选：已拥有（未冻结）即可，充气/通关气球束不影响 */
function _getSynEligibleLegends() {
  return state.legendList.filter(l => l.owned && l.synAvailableQuantity >= 1);
}

function _synSelectedTotal() {
  const s = state.synSelections || {};
  return Object.keys(s).reduce((sum, id) => sum + (s[id] || 0), 0);
}

function _synSelectedBalloonList() {
  const list = [];
  const s = state.synSelections || {};
  Object.keys(s).forEach(id => {
    const n = s[id] || 0;
    const meta = BALLOON_TYPES.find(b => b.id === id);
    if (!meta || n <= 0) return;
    for (let i = 0; i < n; i++) {
      list.push({
        balloonId: id,
        emoji: meta.emoji,
        shape: meta.shape,
        color: meta.color,
        glowColor: meta.glowColor,
        isPaid: true,
        name: meta.name
      });
    }
  });
  return list;
}

/** 构建合成充气计划：每个被选中的气球都进入合成充气关卡（不因关卡已充气而跳过） */
function _buildSynInflatePlan(selections) {
  const queue = [];
  Object.keys(selections).forEach(id => {
    const count = selections[id] || 0;
    const meta = BALLOON_TYPES.find(b => b.id === id);
    if (!meta || count <= 0) return;
    for (let i = 0; i < count; i++) {
      queue.push({
        balloonId: id,
        name: meta.name,
        emoji: meta.emoji,
        shape: meta.shape,
        color: meta.color,
        glowColor: meta.glowColor,
        isPaid: true
      });
    }
  });
  return {
    selections,
    queue,
    total: queue.length,
    allBalloons: queue.slice()
  };
}

function _scrollContentHeight(W) {
  const colsC = 4;
  const gapC = 8;
  const bw = (W - 32 - gapC * (colsC - 1)) / colsC;
  if (state.activeTab === 'common') {
    const n = state.commonFlatList.length;
    const rows = Math.max(1, Math.ceil(n / colsC));
    return rows * (bw + 20) + 20;
  }
  if (state.activeTab === 'legend') {
    const cols = 2;
    const gap = 10;
    const gh = 140;
    const rows = Math.max(1, Math.ceil(state.legendList.length / cols));
    return rows * (gh + gap) - gap + 8;
  }
  if (state.activeTab === 'bouquet') {
    const colsB = 2;
    const gapB = 12;
    const padB = 16;
    const cardW = (W - padB * 2 - gapB) / colsB;
    const cardH = Math.round(cardW * 0.95) + 20;
    const nItems = state.bouquets.length + 1;
    const rowsB = Math.max(1, Math.ceil(nItems / colsB));
    return rowsB * (cardH + gapB) + 20;
  }
  return 100;
}

/** 单行左文截断，避免与右侧「当前」备注重叠 */
function _truncateEquipTitle(ctx, text, fontSize, maxW, fontWeight) {
  const w = fontWeight !== undefined && fontWeight !== null ? fontWeight : 600;
  let t = text || '';
  if (measureText(ctx, t, fontSize, w) <= maxW) return t;
  while (t.length > 1 && measureText(ctx, t + '…', fontSize, w) > maxW) t = t.slice(0, -1);
  return t ? t + '…' : '…';
}

/** 传奇卡左上角状态小标签（宽按文案测量） */
function _drawLegendStatusChip(ctx, x, y, text, bg, fg, border) {
  const fs = 10;
  const padX = 7;
  const chipH = 18;
  const tw = measureText(ctx, text, fs, 600);
  const w = Math.min(tw + padX * 2, 88);
  ctx.save();
  roundRect(ctx, x, y, w, chipH, 7);
  ctx.fillStyle = bg;
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
  drawText(ctx, text, x + w / 2, y + chipH / 2, fg, fs, 'center', undefined, 600);
}

/** 传奇卡底部可点操作（仅返回当前支持项） */
function _getLegendCardActions(l, isIOS) {
  const actions = [];
  if (l.owned) {
    if (!l.legendInflated && l.availableQuantity >= 1) {
      actions.push({ key: 'openEquip', label: '穿戴', color: UX.gold, fw: 500 });
    }
    if (!l.legendInflated && l.giftable && l.availableQuantity >= 1) {
      actions.push({ key: 'openGiftConfirm', label: '赠送', color: UX.success, fw: 500 });
    }
    if (!isIOS) {
      actions.push({ key: 'openPurchaseConfirm', label: '购买', color: UX.gold, fw: 600 });
    }
  } else if (isIOS) {
    actions.push({
      key: null, label: '暂不支持购买', color: 'rgba(255,255,255,0.28)', fs: 14, fw: 500, disabled: true
    });
  } else {
    actions.push({ key: 'openPurchaseConfirm', label: '购买', color: UX.gold, fw: 600 });
  }
  return actions;
}

function _drawLegendActionRow(ctx, scene, balloonId, bx, gw, actionY, hitTopRow, actions) {
  const n = actions.length;
  if (n === 0) return;
  const hitH = 30;
  if (n === 1) {
    const a = actions[0];
    drawText(ctx, a.label, bx + gw / 2, actionY, a.color, a.fs || TYPE.button, 'center', undefined, a.fw || 500);
    if (a.key && _isVisibleHit(hitTopRow, hitH)) {
      scene.manager.addTouchable(bx + 16, hitTopRow, gw - 32, hitH, a.key, balloonId);
    }
    return;
  }
  const colW = gw / n;
  actions.forEach((a, i) => {
    const cx = bx + colW * i + colW / 2;
    drawText(ctx, a.label, cx, actionY, a.color, a.fs || TYPE.button, 'center', undefined, a.fw || 500);
    if (a.key && _isVisibleHit(hitTopRow, hitH)) {
      scene.manager.addTouchable(bx + colW * i, hitTopRow, colW, hitH, a.key, balloonId);
    }
  });
}

/** 传奇详情弹窗额外操作按钮 */
function _getLegendDetailActions(sel, isIOS) {
  const actions = [];
  if (sel.owned && !sel.legendInflated && (sel.availableQuantity || 0) > 0) {
    actions.push({ key: 'openEquipFromDetail', label: '穿戴', style: 'equip' });
  }
  if (!isIOS) {
    actions.push({
      key: 'openPurchaseFromDetail',
      label: '购买',
      style: 'purchase'
    });
  }
  return actions;
}

function _isVisibleHit(y, h) {
  return y + h > state._scrollTop && y < state._scrollBottom;
}

function _modalTop(H, mh) {
  return centerModalY(H, mh, {
    padTop: 36,
    padBottom: Math.max(16, (getCapsuleLayout().safeBottomInset || 0) + 12)
  });
}

/** 未解锁关卡：灰色半透明圆球占位（不展示真实造型） */
function _drawMysteryRoundPlaceholder(ctx, cx, cy, r) {
  ctx.save();
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.08, cx, cy, r);
  g.addColorStop(0, 'rgba(200,210,230,0.42)');
  g.addColorStop(0.55, 'rgba(120,130,155,0.28)');
  g.addColorStop(1, 'rgba(70,78,98,0.18)');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

const sceneApi = {
  onShow(data) {
    state.isIOS = _readIOS();
    state.scrollY = 0;
    const d = data || {};
    if (data && data.activeTab) state.activeTab = data.activeTab;
    state.showDetail = false;
    state.showEquipSelect = false;
    state.showSynPicker = false;
    state.synSelections = {};
    state.synPickerScrollY = 0;
    state.showSynAnim = false;
    state.synAnimBalloons = [];
    state.synAnimStartMs = 0;
    state.synAnimConsumedCount = 0;
    state.showGiftConfirm = false;
    state.showPurchaseConfirm = false;
    state.showPreview = false;
    state.previewBouquetSn = null;
    state.pendingGiftId = null;
    state.pendingPurchaseId = null;
    state.synPickerDragging = false;
    state._giftSending = false;
    state.selected = null;
    state.isDraggingScroll = false;

    if (d.incomingGiftId) {
      state.incomingGiftId = String(d.incomingGiftId);
      state.giftReceivePreview = null;
      state.giftReceiveLoading = false;
      state.giftReceiveClaiming = false;
      state.activeTab = 'legend';
      state.showGiftAuthModal = false;
      state.showGiftReceiveModal = false;
      const scene = this;
      cloudLogin().finally(() => {
        const loggedIn = isUserLoggedIn();
        if (state.incomingGiftId !== String(d.incomingGiftId)) return;
        if (loggedIn) {
          state.showGiftAuthModal = false;
          state.showGiftReceiveModal = true;
          scene._loadGiftReceivePreview();
        } else {
          state.showGiftAuthModal = true;
          state.showGiftReceiveModal = false;
        }
      });
    } else if (!state.showGiftReceiveModal && !state.showGiftAuthModal) {
      state.incomingGiftId = '';
      state.giftReceivePreview = null;
      state.giftReceiveLoading = false;
      state.giftReceiveClaiming = false;
    }

    this._refresh();
    syncBalloonInventoryFromCloud().then(() => this._refresh());
  },

  onHide() {
    state.isDraggingScroll = false;
  },

  _refresh() {
    this._refreshCommon();
    this._refreshLegend();
    this._refreshBouquets();
  },

  _refreshCommon() {
    const unlocked = store.getUnlockedLevels();
    const owned = store.getOwnedBalloons();
    const free = BALLOON_TYPES.filter(b => !b.isPaid);
    state.commonFlatList = free.map(b => ({
      ...b,
      unlocked: unlocked.includes(b.level),
      owned: !!(owned[b.id] && owned[b.id].quantity > 0)
    }));
  },

  _refreshLegend() {
    const owned = store.getOwnedBalloonList();
    const legends = BALLOON_TYPES.filter(b => b.isPaid);
    state.legendList = legends.map(l => {
      const o = owned.find(x => x.id === l.id);
      const availableQuantity = o ? Math.max(0, o.quantity - (o.frozenQuantity || (o.frozen ? 1 : 0))) : 0;
      const synAvailableQuantity = o ? store.getSynEligibleQuantity(l.id) : 0;
      const usedLevels = store.getLegendUsedLevels(l.id);
      let canEquipAny = false;
      for (let i = 0; i < LEVELS.length; i++) {
        if (store.canEquipLegend(i, l.id).ok) { canEquipAny = true; break; }
      }
      return {
        ...l,
        owned: !!(o && o.quantity > 0),
        quantity: o ? o.quantity : 0,
        frozenQuantity: o ? (o.frozenQuantity || (o.frozen ? 1 : 0)) : 0,
        availableQuantity,
        synAvailableQuantity,
        usedLevels,
        legendInflated: !!(o && o.quantity > 0 && !canEquipAny),
        giftable: o ? !!o.giftable : false,
        wearable: o ? o.wearable !== false : false,
        frozen: o ? !!o.frozen : false
      };
    });
  },

  _refreshBouquets() {
    state.bouquets = store.getBouquets();
  },

  render(ctx, W, H) {
    drawBackground(ctx, W, H, ['#080520', '#0d0b3a', '#08082a', '#050518']);
    const scene = this;
    const L = getCapsuleLayout();
    const dpr = scene.dpr || 2;
    const safeB = L.safeBottomInset || 0;

    const header = drawPageHeader(ctx, scene, W, { title: '气球图鉴', onBack: 'goBack' });
    let y = header.contentTop;

    const tabs = [
      { k: 'common', l: '普通气球' },
      { k: 'legend', l: '传奇气球' },
      { k: 'bouquet', l: '气球束' }
    ];
    const tabW = W / tabs.length;
    const tabTop = Math.round(y + 4);
    tabs.forEach((t, i) => {
      const tx = i * tabW;
      const ty = tabTop;
      drawText(ctx, t.l, tx + tabW / 2, ty + 20, state.activeTab === t.k ? UX.accent : UX.textMuted, TYPE.tab, 'center', undefined, 500);
      if (state.activeTab === t.k) {
        ctx.fillStyle = UX.accentDeep;
        ctx.fillRect(tx + tabW * 0.2, ty + 36, tabW * 0.6, 3);
      }
      scene.manager.addTouchable(tx, ty - 8, tabW, TAB_H, 'setCollectionTab', t.k);
    });

    y = tabTop + TAB_H - 4;
    const progY = y;
    ctx.save();
    roundRect(ctx, 16, progY, W - 32, PROGRESS_H - 4, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.strokeStyle = COLLECTION_UI.progressStroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    let progLine = '';
    let progRatio = 0;
    if (state.activeTab === 'common') {
      const st = _freeBalloonStats();
      progLine = '普通气球收集 ' + st.nOwned + ' / ' + st.nTotal;
      progRatio = st.nTotal > 0 ? st.nOwned / st.nTotal : 0;
    } else if (state.activeTab === 'legend') {
      const st = _legendStats();
      progLine = '传奇气球拥有 ' + st.owned + ' / ' + st.n;
      progRatio = st.n > 0 ? st.owned / st.n : 0;
    } else {
      progLine = '气球束 ' + state.bouquets.length + ' / 100';
      progRatio = state.bouquets.length / 100;
    }
    drawText(ctx, progLine, W / 2, progY + (PROGRESS_H - 4) / 2, 'rgba(255,255,255,0.55)', TYPE.progress, 'center', undefined, 400);
    const fillW = (W - 48) * Math.max(0, Math.min(1, progRatio));
    if (fillW > 4) {
      ctx.save();
      roundRect(ctx, 20, progY + 4, fillW, PROGRESS_H - 12, 6);
      const g = ctx.createLinearGradient(20, 0, 20 + fillW, 0);
      g.addColorStop(0, COLLECTION_UI.progressFillA);
      g.addColorStop(1, COLLECTION_UI.progressFillB);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }

    const contentTop = progY + PROGRESS_H + 6;
    const viewportH = Math.max(120, H - contentTop - safeB - 10);
    const contentH = _scrollContentHeight(W);
    state.scrollMax = Math.max(0, contentH - viewportH);
    if (state.scrollY > state.scrollMax) state.scrollY = state.scrollMax;
    if (state.scrollY < 0) state.scrollY = 0;
    state._scrollTop = contentTop;
    state._scrollBottom = contentTop + viewportH;

    const sy = state.scrollY;
    beginScrollView(ctx, 0, contentTop, W, viewportH, sy);

    if (state.activeTab === 'common') this._renderCommon(ctx, W, contentTop, sy, dpr);
    else if (state.activeTab === 'legend') this._renderLegend(ctx, W, contentTop, sy, dpr);
    else this._renderBouquets(ctx, W, contentTop, sy, dpr);

    endScrollView(ctx);

    if (state.scrollMax > 0) {
      const trackW = 3;
      const trackX = W - 10;
      const trackY = contentTop + 6;
      const trackH = viewportH - 12;
      const barH = Math.max(28, trackH * (viewportH / (contentH + 1)));
      const barY = trackY + (state.scrollMax <= 0 ? 0 : (state.scrollY / state.scrollMax) * (trackH - barH));
      ctx.save();
      roundRect(ctx, trackX, trackY, trackW, trackH, trackW / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      roundRect(ctx, trackX, barY, trackW, barH, trackW / 2);
      ctx.fillStyle = COLLECTION_UI.progressFillB;
      ctx.fill();
      ctx.restore();
    }

    const anyModal = state.showDetail || state.showEquipSelect || state.showSynPicker ||
      state.showSynAnim || state.showPurchaseConfirm || state.showPreview;
    if (anyModal) {
      drawModalBackground(ctx, W, H);
      if (!state.showSynAnim) scene.manager.addTouchable(0, 0, W, H, 'closeTopModal');
    }
    if (state.showDetail) this._drawDetailModal(ctx, W, H, dpr);
    if (state.showEquipSelect) this._drawEquipModal(ctx, W, H);
    if (state.showSynPicker) this._drawSynPickerModal(ctx, W, H);
    if (state.showSynAnim) this._drawSynAnimOverlay(ctx, W, H);
    if (state.showPurchaseConfirm) this._drawPurchaseConfirm(ctx, W, H);
    if (state.showPreview) this._drawBouquetPreview(ctx, W, H);
    if (state.showGiftReceiveModal) {
      drawModalBackground(ctx, W, H);
      this._drawGiftReceiveModal(ctx, W, H);
    }
    if (state.showGiftAuthModal) {
      drawModalBackground(ctx, W, H);
      this._drawGiftAuthModal(ctx, W, H);
    }
  },

  _hitY(worldY) {
    return worldY - state.scrollY;
  },

  _renderCommon(ctx, W, contentTop, scrollY, dpr) {
    const scene = this;
    const yy = contentTop;
    const cols = 4;
    const gap = 8;
    const bw = (W - 32 - gap * (cols - 1)) / cols;

    state.commonFlatList.forEach((b, i) => {
      const bx = 16 + (i % cols) * (bw + gap);
      const by = yy + Math.floor(i / cols) * (bw + 20);
      ctx.save();
      roundRect(ctx, bx, by, bw, bw, 12);
      ctx.fillStyle = b.owned ? COLLECTION_UI.cardFill : COLLECTION_UI.cardFillDim;
      ctx.fill();
      ctx.strokeStyle = b.owned ? (b.color || COLLECTION_UI.cardStroke) : COLLECTION_UI.cardStrokeDim;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      const cx = bx + bw / 2;
      const cyBall = by + bw * 0.4;
      const br = bw * 0.28;
      const emojiFs = b.owned ? Math.max(12, bw * 0.35 - 4) : bw * 0.35;

      if (!b.unlocked && !b.owned) {
        _drawMysteryRoundPlaceholder(ctx, cx, cyBall, br);
        ctx.fillStyle = COLLECTION_UI.overlayFill;
        roundRect(ctx, bx, by, bw, bw, 12);
        ctx.fill();
        drawText(ctx, '未解锁', cx, cyBall + 4, 'rgba(255,255,255,0.45)', TYPE.status, 'center', undefined, 500);
        drawText(ctx, '未知', cx, by + bw - 12, 'rgba(255,255,255,0.28)', TYPE.cardLabel, 'center', undefined, 400);
      } else {
        drawText(ctx, b.emoji || '🎈', cx, cyBall, b.owned ? '#ffffff' : 'rgba(255,255,255,0.2)', emojiFs, 'center');
        drawText(ctx, b.name, cx, by + bw - 12, b.owned ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.22)', TYPE.cardLabel, 'center', undefined, 400);
        if (!b.owned) {
          ctx.fillStyle = COLLECTION_UI.overlayFill;
          roundRect(ctx, bx, by, bw, bw, 12);
          ctx.fill();
          drawText(ctx, '未获得', cx, cyBall + 4, 'rgba(255,255,255,0.45)', TYPE.status, 'center', undefined, 500);
        }
      }

      const hitTop = this._hitY(by);
      if ((b.unlocked || b.owned) && _isVisibleHit(hitTop, bw)) {
        scene.manager.addTouchable(bx, hitTop, bw, bw, 'openCommonDetail', b.id);
      }
    });
  },

  _renderLegend(ctx, W, contentTop, scrollY, dpr) {
    const scene = this;
    const cols = 2;
    const gap = 10;
    const gw = (W - 32 - gap) / cols;
    const gh = 140;
    let yy = contentTop;

    if (state.legendList.length === 0) {
      drawWrappedText(ctx, '暂无传奇气球配置。', 24, yy + 20, W - 48, 20, 'rgba(255,255,255,0.35)', TYPE.modalBody, 400);
      return;
    }

    state.legendList.forEach((l, i) => {
      const bx = 16 + (i % cols) * (gw + gap);
      const by = yy + Math.floor(i / cols) * (gh + gap);
      ctx.save();
      roundRect(ctx, bx, by, gw, gh, 16);
      ctx.fillStyle = l.owned ? 'rgba(255,215,0,0.07)' : 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.strokeStyle = l.owned ? COLLECTION_UI.modalBorderGold : COLLECTION_UI.cardStrokeDim;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      if (l.owned) {
        if (l.legendInflated) {
          _drawLegendStatusChip(ctx, bx + 8, by + 7, '已充气', 'rgba(255,152,0,0.18)', '#ffb74d', 'rgba(255,152,0,0.45)');
        } else if (l.frozenQuantity > 0) {
          _drawLegendStatusChip(ctx, bx + 8, by + 7, '赠送中×' + l.frozenQuantity, 'rgba(64,196,255,0.18)', '#7dd3fc', 'rgba(64,196,255,0.45)');
        } else if (l.giftable) {
          _drawLegendStatusChip(ctx, bx + 8, by + 7, '可赠送', 'rgba(105,255,71,0.16)', '#86efac', 'rgba(105,255,71,0.42)');
        } else {
          _drawLegendStatusChip(ctx, bx + 8, by + 7, '不可转赠', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.42)', 'rgba(255,255,255,0.15)');
        }
        const qtyText = l.frozenQuantity > 0 ? ('×' + l.availableQuantity + '/' + l.quantity) : ('×' + l.quantity);
        drawText(ctx, qtyText, bx + gw - 10, by + 16, UX.gold, TYPE.action, 'right', undefined, 600);
      }

      const mx = bx + gw / 2;
      const iconCy = by + 44;
      drawText(ctx, l.emoji || '🎈', mx, iconCy, '#ffffff', 24, 'center');

      const nameY = iconCy + 26 + 10;
      drawText(ctx, l.name, mx, nameY, l.owned ? '#ffffff' : 'rgba(255,255,255,0.42)', TYPE.action, 'center', undefined, 500);

      const actionY = by + 108;
      const hitTopCard = this._hitY(by);
      const hitTopRow = this._hitY(actionY - 14);
      _drawLegendActionRow(ctx, scene, l.id, bx, gw, actionY, hitTopRow, _getLegendCardActions(l, state.isIOS));

      const detailHitH = 88;
      if (_isVisibleHit(hitTopCard, detailHitH)) {
        scene.manager.addTouchable(bx, hitTopCard, gw, detailHitH, 'openLegendDetail', l.id);
      }
    });
  },

  _renderBouquets(ctx, W, contentTop, scrollY, dpr) {
    const scene = this;
    const pad = 16;
    const cols = 2;
    const gap = 12;
    const cardW = (W - pad * 2 - gap) / cols;
    const cardH = Math.round(cardW * 0.95) + 20;
    const inner = 10;
    const totalItems = state.bouquets.length + 1;

    for (let idx = 0; idx < totalItems; idx++) {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const bx = pad + col * (cardW + gap);
      const by = contentTop + row * (cardH + gap);
      const hitTop = this._hitY(by);

      if (idx === 0) {
        ctx.save();
        roundRect(ctx, bx, by, cardW, cardH, 18);
        const g = ctx.createLinearGradient(bx, by, bx + cardW, by + cardH);
        g.addColorStop(0, 'rgba(167,139,250,0.14)');
        g.addColorStop(1, 'rgba(125,211,252,0.08)');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(167,139,250,0.55)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        const cx = bx + cardW / 2;
        drawText(ctx, '＋', cx, by + cardH * 0.38, UX.violet, 36, 'center', undefined, 300);
        drawText(ctx, '合成气球束', cx, by + cardH * 0.68, '#ffffff', TYPE.action, 'center', undefined, 600);
        drawText(ctx, '选择传奇气球', cx, by + cardH * 0.82, 'rgba(255,255,255,0.45)', TYPE.status, 'center', undefined, 400);

        if (_isVisibleHit(hitTop, cardH)) {
          scene.manager.addTouchable(bx, hitTop, cardW, cardH, 'openSynPicker');
        }
        continue;
      }

      const b = state.bouquets[idx - 1];
      if (!b) continue;

      ctx.save();
      roundRect(ctx, bx, by, cardW, cardH, 18);
      ctx.fillStyle = COLLECTION_UI.cardFill;
      ctx.fill();
      ctx.strokeStyle = COLLECTION_UI.previewStroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      const ix = bx + inner;
      const iy = by + inner;
      const iw = cardW - inner * 2;
      const ih = cardH - inner * 2;
      ctx.save();
      roundRect(ctx, ix, iy, iw, ih, 14);
      ctx.fillStyle = 'rgba(8,6,22,0.5)';
      ctx.fill();
      ctx.clip();
      const balloons = _bouquetThumbBalloons(b);
      _drawBouquetStillThumb(ctx, balloons, ix, iy, iw, ih);
      ctx.restore();

      drawText(ctx, b.starred ? '★' : '☆', bx + cardW - 14, by + 18, UX.gold, 16, 'center', undefined, 600);

      if (_isVisibleHit(hitTop, cardH)) {
        scene.manager.addTouchable(bx, hitTop, cardW - 40, cardH, 'openBouquetPreview', b.sn);
        scene.manager.addTouchable(bx + cardW - 44, hitTop, 44, 44, 'toggleBouquetStar', b.sn);
      }
    }

    if (state.bouquets.length === 0) {
      const hintY = contentTop + cardH + gap + 8;
      drawWrappedText(ctx, '通关任意关卡（10 球全成功）也会自动保存气球束。', pad, hintY, W - pad * 2, 18, 'rgba(255,255,255,0.35)', TYPE.modalSub, 400);
    }
  },

  _drawDetailModal(ctx, W, H, dpr) {
    const scene = this;
    const sel = state.selected;
    if (!sel) return;

    const mw = W - 88;
    const mx = 44;
    const py = 18;
    const px = 18;
    const heroH = 88;
    const titleH = 20;
    const gap = 10;
    const btnH = 42;

    let mh = py + heroH + gap + titleH + gap + btnH + py;
    let extraActions = [];
    if (sel.type === 'common' && sel.owned) {
      extraActions.push({ key: 'startChallengeFromCollection', label: '开始挑战', style: 'challenge' });
    } else if (sel.type === 'common' && sel.unlocked && !sel.owned) {
      extraActions.push({ key: 'startChallengeFromCollection', label: '去挑战', style: 'challenge' });
    } else if (sel.type === 'legend') {
      extraActions = _getLegendDetailActions(sel, state.isIOS);
    }
    const extraBtn = extraActions.length * (btnH + 8);
    mh += extraBtn;

    const my = _modalTop(H, mh);
    _drawCollectionModalBg(ctx, mx, my, mw, mh, COLLECTION_UI.modalBorder, 18);

    drawText(ctx, '✕', mx + mw - 20, my + py + 6, 'rgba(255,255,255,0.45)', TYPE.close, 'center');
    scene.manager.addTouchable(mx + mw - 44, my + py - 4, 44, 36, 'closeDetailModal');

    ctx.save();
    ctx.translate(mx + mw / 2, my + py + heroH / 2);
    if (sel.type === 'common' && !sel.unlocked && !sel.owned) {
      _drawMysteryRoundPlaceholder(ctx, 0, 0, heroH * 0.36);
    } else {
      drawText(ctx, sel.emoji || '🎈', 0, 0, '#fff', 48, 'center', undefined, 500);
    }
    ctx.restore();

    const titleName = sel.type === 'common' && !sel.unlocked && !sel.owned ? '未知' : sel.name;
    drawText(ctx, titleName, W / 2, my + py + heroH + gap + titleH / 2, '#ffffff', 14, 'center', UX.shadowTitle, 400);

    let btnY = my + mh - py - btnH;
    const closeBtn = drawButtonGradient(ctx, mx + px, btnY, mw - px * 2, btnH, '关闭', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.88)', TYPE.button, 12, undefined, 500);
    scene.manager.addTouchable(closeBtn.x, closeBtn.y, closeBtn.w, closeBtn.h, 'closeDetailModal');

    extraActions.forEach((act) => {
      btnY -= btnH + 8;
      let b;
      if (act.style === 'equip') {
        b = drawButtonGradient(ctx, mx + px, btnY, mw - px * 2, btnH - 4, act.label, UX.gold, '#1a1025', TYPE.button, 12, 'rgba(255,215,0,0.35)', 600);
      } else {
        b = drawButtonGradient(ctx, mx + px, btnY, mw - px * 2, btnH - 4, act.label, gradientPink, '#fff', TYPE.button, 12, undefined, 600);
      }
      scene.manager.addTouchable(b.x, b.y, b.w, b.h, act.key, sel.type === 'legend' ? sel.id : undefined);
    });
  },

  _drawEquipModal(ctx, W, H) {
    const scene = this;
    const bId = state.equipBalloonId;
    const meta = state.legendList.find(l => l.id === bId) || BALLOON_TYPES.find(b => b.id === bId);
    if (!meta) return;

    const mw = W - 64;
    const mx = 32;
    const py = 16;
    const px = 16;
    const rowH = 44;
    const titleH = 20;
    const gap = 8;
    const btnH = 42;
    const listH = LEVELS.length * rowH;
    const mh = py + titleH + gap + listH + gap + btnH + py;
    const my = _modalTop(H, mh);

    _drawCollectionModalBg(ctx, mx, my, mw, mh, COLLECTION_UI.modalBorderGold, 18);

    drawText(ctx, '✕', mx + mw - 18, my + py + 4, 'rgba(255,255,255,0.45)', TYPE.close, 'center');
    scene.manager.addTouchable(mx + mw - 44, my + py - 4, 44, 36, 'closeEquipModal');

    drawText(ctx, '装备「' + meta.name + '」到关卡', W / 2, my + py + titleH / 2, '#ffffff', TYPE.modalTitle, 'center', 'rgba(255,215,0,0.35)', 600);

    const rowInnerW = mw - px * 2;
    const radioR = 9;
    const radioGap = 10;
    const rightColW = Math.min(168, Math.floor(rowInnerW * 0.46));
    const leftMaxW = rowInnerW - (radioR * 2 + radioGap) - rightColW - 8;
    const rowCy = (ry) => ry + (rowH - 6) / 2;

    LEVELS.forEach((lv, idx) => {
      const ry = my + py + titleH + gap + idx * rowH;
      const eqId = store.getEquippedLegend(lv.id - 1);
      const eqMeta = eqId ? BALLOON_TYPES.find(x => x.id === eqId) : null;
      const equipCheck = store.canEquipLegend(idx, bId);
      const blocked = !equipCheck.ok;
      let label = eqMeta ? (eqMeta.emoji + ' ' + eqMeta.name) : '未装备';
      if (blocked && equipCheck.reason === '已充气') label = '已装备';
      const selected = state.equipSelectedLevelIdx === idx;

      ctx.save();
      roundRect(ctx, mx + px, ry, rowInnerW, rowH - 6, 12);
      ctx.fillStyle = selected ? 'rgba(255,215,0,0.14)' : (blocked ? 'rgba(255,255,255,0.03)' : (eqId === bId ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.05)'));
      ctx.fill();
      ctx.strokeStyle = selected ? 'rgba(252,211,77,0.55)' : (blocked ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)');
      ctx.lineWidth = selected ? 1.5 : 1;
      ctx.stroke();
      ctx.restore();

      const rx = mx + px + 10 + radioR;
      const ryc = rowCy(ry);
      ctx.save();
      ctx.beginPath();
      ctx.arc(rx, ryc, radioR, 0, Math.PI * 2);
      ctx.strokeStyle = selected ? UX.gold : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (selected) {
        ctx.beginPath();
        ctx.arc(rx, ryc, radioR - 5, 0, Math.PI * 2);
        ctx.fillStyle = UX.gold;
        ctx.fill();
      }
      ctx.restore();

      const titleStr = '第' + lv.id + '关 ' + lv.name;
      const titleDisp = _truncateEquipTitle(ctx, titleStr, TYPE.action, leftMaxW, 500);
      const textLeft = mx + px + 10 + radioR * 2 + radioGap;
      drawText(ctx, titleDisp, textLeft, ryc, '#ffffff', TYPE.action, 'left', undefined, 500);

      const labelDisp = _truncateEquipTitle(ctx, label, TYPE.modalSub, rightColW - 4, 400);
      const rightX = mx + px + rowInnerW - 8;
      const labelCol = blocked && equipCheck.reason === '已充气' ? 'rgba(255,152,0,0.8)' : 'rgba(255,255,255,0.5)';
      drawText(ctx, labelDisp, rightX, ryc, labelCol, TYPE.modalSub, 'right', undefined, 400);

      if (!blocked) scene.manager.addTouchable(mx + px, ry, rowInnerW, rowH - 6, 'setEquipSelectedLevel', idx);
    });

    const cb = drawButtonGradient(ctx, mx + px, my + mh - py - btnH, mw - px * 2, btnH, '完成', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.88)', TYPE.button, 12, undefined, 500);
    scene.manager.addTouchable(cb.x, cb.y, cb.w, cb.h, 'confirmEquipModal');
  },

  _drawSynPickerModal(ctx, W, H) {
    const scene = this;
    const MAX_MODAL_H = 500;
    const mw = Math.min(W - 24, 360);
    const mx = (W - mw) / 2;
    const px = 16;
    const py = 16;
    const gap = 10;
    const titleH = 22;
    const titleGap = 8;
    const hintBoxH = 46;
    const statusH = 24;
    const btnH = 44;
    const closeLinkH = 28;
    const cardBottomPad = 12;
    const nameFs = 14;
    const qtyFs = 12;
    const nameQtyGap = 4;
    const cardFooterH = cardBottomPad + qtyFs + nameQtyGap + nameFs;

    const eligible = _getSynEligibleLegends();
    const cols = 3;
    const gridGap = 10;
    const gridInnerW = mw - px * 2;
    const cellW = (gridInnerW - gridGap * (cols - 1)) / cols;
    const cellH = Math.round(cellW * 0.62) + cardFooterH;
    const rows = Math.ceil(Math.max(1, eligible.length) / cols);
    const gridContentH = rows * (cellH + gridGap) - (rows > 0 ? gridGap : 0);

    const maxGridViewport = MAX_MODAL_H - py * 2 - titleH - titleGap - hintBoxH - gap - statusH - gap - btnH - gap - closeLinkH;
    const gridViewportH = Math.min(gridContentH, Math.max(72, maxGridViewport));
    const mh = Math.min(
      MAX_MODAL_H,
      py * 2 + titleH + titleGap + hintBoxH + gap + statusH + gap + gridViewportH + gap + btnH + gap + closeLinkH
    );
    const my = Math.max(20, Math.round((H - mh) / 2));

    const titleY = my + py;
    const hintY = titleY + titleH + titleGap;
    const statusY = hintY + hintBoxH + gap;
    const bodyTop = statusY + statusH + gap;
    state.synPickerBodyTop = bodyTop;
    state.synPickerBodyH = gridViewportH;
    state.synPickerScrollMax = Math.max(0, gridContentH - gridViewportH);
    if (state.synPickerScrollY > state.synPickerScrollMax) state.synPickerScrollY = state.synPickerScrollMax;
    if (state.synPickerScrollY < 0) state.synPickerScrollY = 0;

    _drawCollectionModalBg(ctx, mx, my, mw, mh, COLLECTION_UI.modalBorderViolet, 20);

    drawText(ctx, '✕', mx + mw - 18, titleY + 2, 'rgba(255,255,255,0.45)', TYPE.close, 'center');
    scene.manager.addTouchable(mx + mw - 44, titleY - 4, 44, 36, 'closeSynPicker');
    drawText(ctx, '合成气球束', W / 2, titleY + titleH / 2, '#ffffff', TYPE.modalTitle, 'center', undefined, 600);

    ctx.save();
    roundRect(ctx, mx + px, hintY, gridInnerW, hintBoxH, 10);
    ctx.fillStyle = 'rgba(255,215,0,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,0,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    {
      const hintText = '消耗2-10个传奇气球，为它们充气后再合成气球束';
      const hintMaxW = gridInnerW - 20;
      const hintLineH = 16;
      const hintFs = TYPE.modalSub;
      const hintFw = 400;
      const hintLines = [];
      let hintLine = '';
      for (const ch of hintText) {
        const test = hintLine + ch;
        if (measureText(ctx, test, hintFs, hintFw) > hintMaxW && hintLine.length > 0) {
          hintLines.push(hintLine);
          hintLine = ch;
        } else {
          hintLine = test;
        }
      }
      if (hintLine) hintLines.push(hintLine);
      const hintCx = mx + px + gridInnerW / 2;
      const hintCy = hintY + hintBoxH / 2;
      hintLines.forEach((ln, i) => {
        const ly = hintCy + (i - (hintLines.length - 1) / 2) * hintLineH;
        drawText(ctx, ln, hintCx, ly, 'rgba(255,215,0,0.88)', hintFs, 'center', undefined, hintFw);
      });
    }

    const total = _synSelectedTotal();
    drawText(ctx, '已选择 ', mx + px, statusY + statusH / 2, 'rgba(255,255,255,0.55)', TYPE.modalSub, 'left', undefined, 400);
    const selNumX = mx + px + measureText(ctx, '已选择 ', TYPE.modalSub, 400);
    drawText(ctx, String(total), selNumX, statusY + statusH / 2, UX.gold, TYPE.modalSub, 'left', undefined, 600);
    const suffixX = selNumX + measureText(ctx, String(total), TYPE.modalSub, 600);
    drawText(ctx, ' / 10', suffixX, statusY + statusH / 2, 'rgba(255,255,255,0.55)', TYPE.modalSub, 'left', undefined, 400);
    drawText(ctx, eligible.length + ' 个可用', mx + mw - px, statusY + statusH / 2, 'rgba(255,255,255,0.42)', TYPE.modalSub, 'right', undefined, 400);

    ctx.save();
    roundRect(ctx, mx + px, bodyTop, gridInnerW, gridViewportH, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fill();
    ctx.clip();

    const scrollY = state.synPickerScrollY;
    const gridX = mx + px;

    if (eligible.length === 0) {
      drawText(ctx, '暂无可用传奇', mx + mw / 2, bodyTop + gridViewportH / 2, 'rgba(255,255,255,0.45)', TYPE.modalBody, 'center', undefined, 400);
    }

    eligible.forEach((l, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = gridX + col * (cellW + gridGap);
      const by = bodyTop + row * (cellH + gridGap) - scrollY;
      if (by + cellH < bodyTop || by > bodyTop + gridViewportH) return;

      const picked = state.synSelections[l.id] || 0;
      const selected = picked > 0;
      const qty = l.synAvailableQuantity;

      ctx.save();
      roundRect(ctx, bx, by, cellW, cellH, 12);
      ctx.fillStyle = selected ? 'rgba(255,215,0,0.07)' : 'rgba(255,255,255,0.05)';
      ctx.fill();
      ctx.strokeStyle = selected ? UX.gold : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.stroke();
      ctx.restore();

      const qtyY = by + cellH - cardBottomPad - qtyFs / 2;
      const nameY = qtyY - qtyFs / 2 - nameQtyGap - nameFs / 2;
      const emojiAreaH = cellH - cardFooterH;
      const emojiY = by + emojiAreaH / 2;
      const emojiFs = Math.min(Math.round(cellW * 0.34), Math.round(emojiAreaH * 0.52));

      drawText(ctx, l.emoji || '🎈', bx + cellW / 2, emojiY, '#fff', emojiFs, 'center');
      drawText(
        ctx, l.name, bx + cellW / 2, nameY,
        selected ? UX.gold : 'rgba(255,255,255,0.82)',
        nameFs, 'center', undefined, selected ? 600 : 500
      );
      drawText(ctx, '×' + qty, bx + cellW / 2, qtyY, 'rgba(255,255,255,0.38)', qtyFs, 'center', undefined, 400);

      if (picked > 0) {
        const badgeR = 9;
        const badgeCx = bx + cellW - 10;
        const badgeCy = by + 10;
        ctx.save();
        ctx.beginPath();
        ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
        ctx.fillStyle = UX.gold;
        ctx.fill();
        ctx.restore();
        const badgeLabel = (picked === 1 && qty === 1) ? '✓' : String(picked);
        drawText(ctx, badgeLabel, badgeCx, badgeCy, '#1a1025', badgeLabel === '✓' ? 11 : 10, 'center', undefined, 700);
      }

      scene.manager.addTouchable(bx, by, cellW, cellH, 'toggleSynPick', l.id);
    });

    ctx.restore();

    const btnY = bodyTop + gridViewportH + gap;
    const canConfirm = total >= 2 && total <= 10;
    let btnLabel = '充气并合成';
    if (!canConfirm) {
      const need = Math.max(1, 2 - total);
      btnLabel = total >= 2 ? '充气并合成' : ('还差 ' + need + ' 个');
    }
    const btnGrad = canConfirm
      ? gradientPink
      : (c, gx, gy, gw, gh) => {
        const g = c.createLinearGradient(gx, gy, gx, gy + gh);
        g.addColorStop(0, 'rgba(255,255,255,0.07)');
        g.addColorStop(1, 'rgba(255,255,255,0.04)');
        return g;
      };
    const actionBtn = drawButtonGradient(
      ctx, mx + px, btnY, gridInnerW, btnH, btnLabel,
      btnGrad,
      canConfirm ? '#fff' : 'rgba(255,255,255,0.32)',
      TYPE.button, 12, undefined, canConfirm ? 600 : 500
    );
    if (canConfirm) scene.manager.addTouchable(actionBtn.x, actionBtn.y, actionBtn.w, actionBtn.h, 'confirmSynPicker');

    const closeY = btnY + btnH + 6;
    drawText(ctx, '关闭', W / 2, closeY + closeLinkH / 2, 'rgba(255,255,255,0.45)', 14, 'center', undefined, 400);
    scene.manager.addTouchable(mx + px, closeY, gridInnerW, closeLinkH, 'closeSynPicker');
  },

  _drawSynAnimOverlay(ctx, W, H) {
    const scene = this;
    const elapsedSec = (Date.now() - (state.synAnimStartMs || Date.now())) / 1000;
    const done = elapsedSec >= 1.6;
    const consumed = state.synAnimConsumedCount || (state.synAnimBalloons || []).length;

    ctx.save();
    ctx.fillStyle = 'rgba(6,4,18,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const boxW = Math.min(W - 48, 320);
    const py = 20;
    const titleRow = 26;
    const gapTitleAnim = 14;
    const animH = Math.min(200, Math.round(H * 0.28));
    const gapAnimSub = 16;
    const subRow = 22;
    const gapSubBtn = 18;
    const btnH = 44;
    const btnW = Math.min(boxW - 48, 200);
    const boxH = done
      ? py + titleRow + gapTitleAnim + animH + gapAnimSub + subRow + gapSubBtn + btnH + py
      : py + titleRow + gapTitleAnim + animH + py + 8;
    const boxX = (W - boxW) / 2;
    const boxY = centerModalY(H, boxH, { padTop: 36, padBottom: Math.max(16, (getCapsuleLayout().safeBottomInset || 0) + 12) });

    _drawCollectionModalBg(ctx, boxX, boxY, boxW, boxH, COLLECTION_UI.modalBorderViolet, 20);

    const titleText = done ? '合成成功' : '合成中…';
    const titleY = boxY + py + titleRow / 2;
    drawText(ctx, titleText, W / 2, titleY, '#ffffff', TYPE.modalTitle, 'center', undefined, 600);

    const animPad = 16;
    const animY = boxY + py + titleRow + gapTitleAnim;
    ctx.save();
    roundRect(ctx, boxX + animPad, animY, boxW - animPad * 2, animH, 14);
    ctx.fillStyle = 'rgba(6,4,18,0.55)';
    ctx.fill();
    ctx.clip();
    drawBouquetCompletionAnim(
      ctx, state.synAnimBalloons, boxX + animPad, animY, boxW - animPad * 2, animH, elapsedSec,
      { layout: 'centered' }
    );
    ctx.restore();

    if (done) {
      const subY = animY + animH + gapAnimSub + subRow / 2;
      drawText(ctx, '消耗 ' + consumed + ' 个传奇气球', W / 2, subY, 'rgba(255,255,255,0.62)', TYPE.modalBody, 'center', undefined, 400);
      const btnX = (W - btnW) / 2;
      const btnY = animY + animH + gapAnimSub + subRow + gapSubBtn;
      const fb = drawButtonGradient(ctx, btnX, btnY, btnW, btnH, '完成', gradientPink, '#fff', TYPE.button, 12, undefined, 600);
      scene.manager.addTouchable(fb.x, fb.y, fb.w, fb.h, 'closeSynAnim');
    }
  },



  _drawGiftReceiveModal(ctx, W, H) {
    const scene = this;
    scene.manager.addTouchable(0, 0, W, H, '_giftReceiveModalAbsorb');

    const mw = Math.min(W - 56, 340);
    const mx = (W - mw) / 2;
    const py = 22;
    const px = 20;
    const titleH = 24;
    const subH = 40;
    const heroH = 120;
    const nameH = 22;
    const btnH = 44;
    const btnGap = 10;
    const closeBtnH = 40;

    const preview = state.giftReceivePreview;
    const loading = state.giftReceiveLoading;
    const claiming = state.giftReceiveClaiming;
    const meta = preview && preview.meta;
    const count = (preview && preview.count) || 1;
    const fromName = (preview && preview.fromNickName) || '好友';
    const errText = preview && preview.error;
    const canClaim = !!(preview && preview.giftId && !preview.error && !loading && !claiming);
    const hasError = !!(preview && preview.error && !loading);

    const mh = py + titleH + 8 + subH + heroH + nameH + py + btnH + btnGap + btnH + (hasError ? btnGap + closeBtnH : 0) + py;
    const my = _modalTop(H, mh);

    _drawCollectionModalBg(ctx, mx, my, mw, mh, COLLECTION_UI.modalBorderGold, 20);

    drawText(ctx, '送你一个传奇气球', W / 2, my + py + titleH / 2, '#ffffff', 18, 'center', UX.shadowTitle, 700);

    let subCopy = loading
      ? '正在加载赠送信息…'
      : (errText || (fromName + '赠送了你' + count + '枚传奇限定气球'));
    drawWrappedText(
      ctx, subCopy,
      mx + px, my + py + titleH + 8, mw - px * 2, 20,
      errText ? 'rgba(248,113,113,0.88)' : 'rgba(255,255,255,0.62)', TYPE.modalBody, 400
    );

    const heroCy = my + py + titleH + 8 + subH + heroH / 2;
    const heroCx = W / 2;
    if (meta && !errText) {
      ctx.save();
      ctx.shadowColor = (meta.glowColor || meta.color || '#fcd34d') + '88';
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(heroCx, heroCy, 46, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(heroCx, heroCy - 8, 8, heroCx, heroCy, 46);
      g.addColorStop(0, (meta.color || '#fff') + 'ee');
      g.addColorStop(1, (meta.color || '#94a3b8') + '55');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(252,211,77,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      drawText(ctx, meta.emoji || '🎈', heroCx, heroCy, '#ffffff', 52, 'center', undefined, 500);
      ctx.restore();
      drawText(ctx, meta.name || '传奇气球', W / 2, heroCy + 62, '#ffffff', 16, 'center', undefined, 600);
    } else if (loading) {
      drawText(ctx, '…', heroCx, heroCy, 'rgba(255,255,255,0.35)', 36, 'center', undefined, 500);
    } else {
      drawText(ctx, '🎁', heroCx, heroCy, 'rgba(255,255,255,0.35)', 44, 'center', undefined, 500);
    }

    const btnW = mw - px * 2;
    const btnX = mx + px;
    const btn1Y = my + mh - py - (hasError ? closeBtnH + btnGap + btnH + btnGap + btnH : btnH + btnGap + btnH);
    const btn2Y = btn1Y + btnH + btnGap;
    const challengeGrad = (c, gx, gy, gw, gh) => {
      const g = c.createLinearGradient(gx, gy, gx + gw, gy + gh);
      g.addColorStop(0, '#ff50c8');
      g.addColorStop(1, '#ff9100');
      return g;
    };
    drawButtonGradient(
      ctx, btnX, btn1Y, btnW, btnH,
      claiming ? '领取中…' : '立即充气挑战',
      canClaim ? challengeGrad : 'rgba(255,255,255,0.06)',
      canClaim ? '#fff' : 'rgba(255,255,255,0.28)',
      TYPE.button, 12, undefined, 600
    );
    if (canClaim) scene.manager.addTouchable(btnX, btn1Y, btnW, btnH, 'giftReceiveToBattle');

    drawButtonGradient(
      ctx, btnX, btn2Y, btnW, btnH,
      '前往图鉴查看',
      canClaim ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
      canClaim ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.28)',
      TYPE.button, 12, undefined, 500
    );
    if (canClaim) scene.manager.addTouchable(btnX, btn2Y, btnW, btnH, 'giftReceiveToCollection');

    if (hasError) {
      const closeY = btn2Y + btnH + btnGap;
      const cb = drawButtonGradient(ctx, btnX, closeY, btnW, closeBtnH, '关闭', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.75)', TYPE.button, 12, undefined, 500);
      scene.manager.addTouchable(cb.x, cb.y, cb.w, cb.h, 'giftReceiveDismiss');
    }
  },

  _drawGiftAuthModal(ctx, W, H) {
    const scene = this;
    scene.manager.addTouchable(0, 0, W, H, '_giftAuthModalAbsorb');

    const side = 36;
    const mw = Math.min(W - side * 2, 340);
    const mh = 320;
    const mx = (W - mw) / 2;
    const my = Math.max(72, (H - mh) / 2);

    _drawCollectionModalBg(ctx, mx, my, mw, mh, COLLECTION_UI.modalBorderGold, 20);
    drawText(ctx, '登录后领取赠礼', W / 2, my + 28, '#ffffff', 17, 'center', UX.shadowTitle, 700);
    drawWrappedText(
      ctx,
      '授权获取微信昵称和头像后，即可查看并领取好友赠送的传奇气球。',
      mx + 22, my + 58, mw - 44, 20,
      'rgba(255,255,255,0.62)', TYPE.modalBody, 400
    );

    const btnH = 46;
    const btnW = mw - 44;
    const btnX = mx + 22;
    const btnY = my + mh - 22 - btnH;
    const b = drawButtonGradient(ctx, btnX, btnY, btnW, btnH, '微信一键登录', gradientPink, '#fff', TYPE.button, 12, undefined, 600);
    scene.manager.addTouchable(b.x, b.y, b.w, b.h, 'giftAuthLogin');
  },

  _giftAuthModalAbsorb() { /* 阻断穿透 */ },

  giftAuthLogin() {
    const scene = this;
    showToast('登录中…');
    cloudLogin().then((r) => {
      if (!r.ok) {
        showToast('登录失败，请稍后再试');
        return;
      }
      state.showGiftAuthModal = false;
      state.showGiftReceiveModal = true;
      scene._loadGiftReceivePreview();
      showToast('登录成功');
    }).catch(() => {
      showToast('登录失败，请稍后再试');
    });
  },

  _giftReceiveModalAbsorb() { /* 阻断图鉴其它点击 */ },

  _loadGiftReceivePreview() {
    const giftId = state.incomingGiftId;
    if (!giftId) {
      state.giftReceiveLoading = false;
      return;
    }
    state.giftReceiveLoading = true;
    state.giftReceivePreview = null;
    cloudLogin()
      .then(() => getBalloonGift(giftId))
      .then((r) => {
        if (state.incomingGiftId !== giftId) return;
        state.giftReceiveLoading = false;
        if (r.ok) {
          const meta = BALLOON_TYPES.find(b => b.id === r.balloonId);
          state.giftReceivePreview = {
            giftId: r.giftId || giftId,
            balloonId: r.balloonId,
            count: r.count || 1,
            fromNickName: r.fromNickName || '好友',
            meta: meta || null
          };
        } else {
          state.giftReceivePreview = {
            error: giftReasonMessage(r),
            reasonCode: r.reasonCode
          };
        }
      })
      .catch((err) => {
        console.warn('[collection._loadGiftReceivePreview]', err);
        if (state.incomingGiftId !== giftId) return;
        state.giftReceiveLoading = false;
        state.giftReceivePreview = { error: '加载失败，请稍后再试' };
      });
  },

  _claimIncomingGift(nextAction) {
    if (state.giftReceiveClaiming) return;
    const preview = state.giftReceivePreview;
    if (!preview || preview.error || !preview.giftId) {
      showToast(preview && preview.error ? preview.error : '无法领取');
      return;
    }
    const scene = this;
    const giftId = preview.giftId;
    state.giftReceiveClaiming = true;
    claimBalloonGift(giftId)
      .then((result) => {
        if (!result.ok) {
          state.giftReceiveClaiming = false;
          showToast(giftReasonMessage(result));
          return;
        }
        return syncBalloonInventoryFromCloud().then(() => {
          state.showGiftReceiveModal = false;
          state.incomingGiftId = '';
          state.giftReceivePreview = null;
          state.giftReceiveClaiming = false;
          state.giftReceiveLoading = false;
          showToast('领取成功，已存入图鉴');
          scene._refresh();
          if (nextAction === 'battle') {
            scene.manager.switchTo('battle');
          } else {
            state.activeTab = 'legend';
            state.scrollY = 0;
          }
        });
      })
      .catch((err) => {
        console.warn('[collection._claimIncomingGift]', err);
        state.giftReceiveClaiming = false;
        showToast('领取失败');
      });
  },

  giftReceiveToBattle() {
    this._claimIncomingGift('battle');
  },

  giftReceiveToCollection() {
    this._claimIncomingGift('collection');
  },

  giftReceiveDismiss() {
    state.showGiftReceiveModal = false;
    state.showGiftAuthModal = false;
    state.incomingGiftId = '';
    state.giftReceivePreview = null;
    state.giftReceiveLoading = false;
    state.giftReceiveClaiming = false;
    state.activeTab = 'legend';
  },

  _drawPurchaseConfirm(ctx, W, H) {
    const scene = this;
    const id = state.pendingPurchaseId;
    const meta = id && BALLOON_TYPES.find(b => b.id === id);
    if (!meta) return;
    const mw = W - 88;
    const mx = 44;
    const py = 18;
    const px = 18;
    const titleH = 20;
    const gap = 10;
    const descH = 48;
    const btnH = 42;
    const mh = py + titleH + gap + descH + gap + btnH + py;
    const my = _modalTop(H, mh);
    const copy = getLegendPurchaseConfirmCopy(meta);
    _drawCollectionModalBg(ctx, mx, my, mw, mh, COLLECTION_UI.modalBorderGold, 18);
    drawText(ctx, copy.title, W / 2, my + py + titleH / 2, '#ffffff', TYPE.modalTitle, 'center', undefined, 600);
    drawWrappedText(ctx, copy.desc, mx + px, my + py + titleH + gap, mw - px * 2, 20, 'rgba(255,255,255,0.88)', TYPE.modalBody, 400);
    const btnY = my + py + titleH + gap + descH + gap;
    const halfW = (mw - px * 3) / 2;
    const cb = drawButtonGradient(ctx, mx + px, btnY, halfW, btnH, '取消', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.85)', TYPE.button, 12, undefined, 500);
    scene.manager.addTouchable(cb.x, cb.y, cb.w, cb.h, 'cancelPurchase');
    const db = drawButtonGradient(ctx, mx + px * 2 + halfW, btnY, halfW, btnH, copy.confirmLabel, gradientPink, '#fff', TYPE.button, 12, undefined, 600);
    scene.manager.addTouchable(db.x, db.y, db.w, db.h, 'confirmPurchase');
  },

  _drawBouquetPreview(ctx, W, H) {
    const scene = this;
    const b = state.bouquets.find(x => x.sn === state.previewBouquetSn);
    if (!b) return;
    // 弹窗略窄，花束区加高，预览效果更接近通关合成弹窗
    const mw = Math.min(W - 72, 304);
    const mx = (W - mw) / 2;
    const py = 16;
    const px = 14;
    const titleH = 20;
    const titleMetaGap = 10;
    const gap = 6;
    const metaH = 36;
    const bodyH = 176;
    const btnH = 40;
    const mh = py + titleH + titleMetaGap + metaH + bodyH + gap + btnH + py;
    const my = _modalTop(H, mh);
    _drawCollectionModalBg(ctx, mx, my, mw, mh, COLLECTION_UI.previewStroke, 18);
    drawText(ctx, '✕', mx + mw - 18, my + py + 4, 'rgba(255,255,255,0.45)', TYPE.close, 'center');
    scene.manager.addTouchable(mx + mw - 44, my + py - 4, 44, 36, 'closeBouquetPreview');
    const title = b.isSynthesized ? '传奇合成气球束' : ('第' + b.level + '关 气球束');
    drawText(ctx, title, W / 2, my + py + titleH / 2, '#ffffff', TYPE.modalTitle, 'center', undefined, 600);
    const subParts = [(b.time || '')];
    if (b.isSynthesized) subParts.push('合成');
    else subParts.push(b.hasLegend ? '含传奇' : '普通');
    if (b.starred) subParts.push('已标星');
    const sub = subParts.filter(Boolean).join(' · ');
    const metaY = my + py + titleH + titleMetaGap;
    const subMaxW = mw - px * 2;
    const subLineH = 18;
    const subFs = TYPE.modalSub;
    const subFw = 400;
    const subLines = [];
    let subLine = '';
    for (const ch of sub) {
      const test = subLine + ch;
      if (measureText(ctx, test, subFs, subFw) > subMaxW && subLine.length > 0) {
        subLines.push(subLine);
        subLine = ch;
      } else {
        subLine = test;
      }
    }
    if (subLine) subLines.push(subLine);
    const subCx = mx + mw / 2;
    const subCy = metaY + metaH / 2;
    subLines.forEach((ln, i) => {
      const ly = subCy + (i - (subLines.length - 1) / 2) * subLineH;
      drawText(ctx, ln, subCx, ly, 'rgba(255,255,255,0.72)', subFs, 'center', undefined, subFw);
    });
    const bqY = metaY + metaH;
    const bqH = bodyH;
    ctx.save();
    roundRect(ctx, mx + px, bqY, mw - px * 2, bqH, 14);
    ctx.fillStyle = 'rgba(6,4,18,0.55)';
    ctx.fill();
    ctx.clip();
    _drawBouquetStillThumb(ctx, _bouquetThumbBalloons(b), mx + px, bqY, mw - px * 2, bqH);
    ctx.restore();
    const shareY = my + mh - py - btnH;
    const halfW = (mw - px * 3) / 2;
    const shareGrad = (c, gx, gy, gw, gh) => {
      const g = c.createLinearGradient(gx, gy, gx, gy + gh);
      g.addColorStop(0, 'rgba(134,239,172,0.16)');
      g.addColorStop(1, 'rgba(125,211,192,0.08)');
      return g;
    };
    const pb = drawButtonGradient(ctx, mx + px, shareY, halfW, btnH, '分享', shareGrad, '#a7f3d0', TYPE.button, 12, 'rgba(134,239,172,0.25)', 600);
    scene.manager.addTouchable(pb.x, pb.y, pb.w, pb.h, 'shareBouquetPreview');
    const sb = drawButtonGradient(ctx, mx + px * 2 + halfW, shareY, halfW, btnH, '关闭', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.88)', TYPE.button, 12, undefined, 500);
    scene.manager.addTouchable(sb.x, sb.y, sb.w, sb.h, 'closeBouquetPreview');
  },

  goBack() {
    this.manager.switchTo('home');
  },

  setCollectionTab(tab) {
    if (state.activeTab === tab) return;
    state.activeTab = tab;
    state.scrollY = 0;
  },

  closeTopModal() {
    if (state.showGiftAuthModal || state.showGiftReceiveModal) {
      this.giftReceiveDismiss();
      return true;
    }
    if (state.showPreview) {
      state.showPreview = false;
      state.previewBouquetSn = null;
      return true;
    }
    if (state.showEquipSelect) {
      state.showEquipSelect = false;
      return true;
    }
    if (state.showSynPicker) {
      state.showSynPicker = false;
      state.synSelections = {};
      state.synPickerScrollY = 0;
      return true;
    }
    if (state.showSynAnim) {
      return false;
    }
    if (state.showGiftConfirm) {
      // 旧版确认弹窗已不再使用，点击赠送直接分享，直接关闭
      state.showGiftConfirm = false;
      state.pendingGiftId = null;
      return true;
    }
    if (state.showPurchaseConfirm) {
      state.showPurchaseConfirm = false;
      state.pendingPurchaseId = null;
      return true;
    }
    if (state.showDetail) {
      state.showDetail = false;
      state.selected = null;
      return true;
    }
    return false;
  },

  handleBackButton() {
    if (state.showSynAnim) return false;
    return this.closeTopModal();
  },

  closeDetailModal() {
    state.showDetail = false;
    state.selected = null;
  },

  closeEquipModal() {
    state.showEquipSelect = false;
  },

  openCommonDetail(balloonId) {
    const b = BALLOON_TYPES.find(x => x.id === balloonId);
    if (!b || b.isPaid) return;
    const unlocked = store.getUnlockedLevels().includes(b.level);
    const owned = !!(store.getOwnedBalloons()[b.id] && store.getOwnedBalloons()[b.id].quantity > 0);
    if (!unlocked && !owned) return;
    state.selected = { ...b, type: 'common', unlocked, owned };
    state.showDetail = true;
  },

  openLegendDetail(balloonId) {
    const l = state.legendList.find(x => x.id === balloonId);
    if (!l) return;
    state.selected = { ...l, type: 'legend' };
    state.showDetail = true;
  },

  openEquip(id) {
    const b = state.legendList.find(l => l.id === id);
    if (!b || !b.owned || b.availableQuantity < 1) {
      showToast('未拥有该气球');
      return;
    }
    if (b.legendInflated) {
      showToast('已充气');
      return;
    }
    state.showDetail = false;
    state.selected = null;
    let pick = -1;
    for (let i = 0; i < LEVELS.length; i++) {
      if (store.getEquippedLegend(LEVELS[i].id - 1) === id) {
        pick = i;
        break;
      }
    }
    if (pick < 0) {
      for (let i = 0; i < LEVELS.length; i++) {
        if (store.canEquipLegend(i, id).ok) { pick = i; break; }
      }
    }
    if (pick < 0) {
      showToast('已充气');
      return;
    }
    state.equipSelectedLevelIdx = pick;
    state.equipBalloonId = id;
    state.showEquipSelect = true;
  },

  openEquipFromDetail(id) {
    this.openEquip(id);
  },

  openSynPicker() {
    const eligible = _getSynEligibleLegends();
    if (eligible.length === 0) {
      showToast('暂无可用传奇（需已购买且未用于手动合成）');
      return;
    }
    state.synSelections = {};
    state.synPickerScrollY = 0;
    state.showSynPicker = true;
  },

  closeSynPicker() {
    state.showSynPicker = false;
    state.synSelections = {};
    state.synPickerScrollY = 0;
  },

  toggleSynPick(id) {
    const leg = state.legendList.find(l => l.id === id);
    if (!leg || leg.synAvailableQuantity < 1) return;
    const cur = state.synSelections[id] || 0;
    const total = _synSelectedTotal();
    let next = cur + 1;
    if (next > leg.synAvailableQuantity) next = 0;
    if (next > cur && total >= 10) {
      showToast('最多选择 10 个');
      return;
    }
    if (next <= 0) delete state.synSelections[id];
    else state.synSelections[id] = next;
  },

  confirmSynPicker() {
    const total = _synSelectedTotal();
    if (total < 2) {
      showToast('请至少选择 2 个传奇气球');
      return;
    }
    if (total > 10) {
      showToast('最多选择 10 个');
      return;
    }
    const selections = Object.assign({}, state.synSelections);
    for (const id of Object.keys(selections)) {
      const leg = state.legendList.find(l => l.id === id);
      const need = selections[id];
      if (!leg || leg.synAvailableQuantity < need) {
        showToast('气球数量不足，请重新选择');
        return;
      }
    }
    const plan = _buildSynInflatePlan(selections);
    state.showSynPicker = false;
    state.synSelections = {};
    state.synPickerScrollY = 0;
    this.manager.switchTo('battle', {
      synInflateRun: true,
      selections: plan.selections,
      queue: plan.queue,
      allBalloons: plan.allBalloons,
      total: plan.total
    });
  },

  closeSynAnim() {
    state.showSynAnim = false;
    state.synAnimBalloons = [];
    state.synAnimStartMs = 0;
    state.synAnimConsumedCount = 0;
    showToast('已存入气球束');
    this._refresh();
  },

  openGiftConfirm(id) {
    const b = state.legendList.find(l => l.id === id);
    if (!b || !b.giftable || b.availableQuantity < 1) {
      showToast(b && b.owned && !b.giftable ? '仅本人购买的气球可赠送' : '该气球不可转赠');
      return;
    }
    if (state._giftSending) return;
    state._giftSending = true;
    const scene = this;
    const meta = BALLOON_TYPES.find(b2 => b2.id === id);
    showToast('正在发起赠送…');
    sendBalloonGift(id, 1)
      .then((result) => {
        state._giftSending = false;
        if (!result.ok) {
          showToast(result.reason || '赠送失败');
          return;
        }
        state.showGiftConfirm = false;
        state.pendingGiftId = null;
        // 直接唤起微信分享，与分享气球束效果一致
        if (typeof wx !== 'undefined' && wx.shareAppMessage) {
          try {
            wx.shareAppMessage({
              title: '送你一个「' + (meta ? meta.name : '传奇气球') + '」',
              query: 'giftId=' + encodeURIComponent(result.giftId),
              imageUrl: ''
            });
          } catch (_) {
            showToast('请使用右上角菜单分享');
          }
        } else {
          showToast('已发起赠送，请用右上角菜单分享');
        }
        syncBalloonInventoryFromCloud().then(() => {
          scene._refresh();
        });
      })
      .catch((err) => {
        state._giftSending = false;
        console.warn('[collection.openGiftConfirm]', err);
        showToast('赠送失败');
      });
  },

  openPurchaseConfirm(id) {
    if (toastIfLegendPurchaseBlocked(showToast)) return;
    state.pendingPurchaseId = id;
    state.showPurchaseConfirm = true;
  },

  openPurchaseFromDetail(id) {
    state.showDetail = false;
    state.selected = null;
    this.openPurchaseConfirm(id);
  },

  cancelPurchase() {
    state.showPurchaseConfirm = false;
    state.pendingPurchaseId = null;
  },

  confirmPurchase() {
    const id = state.pendingPurchaseId;
    const b = id && BALLOON_TYPES.find(x => x.id === id);
    if (!b || toastIfLegendPurchaseBlocked(showToast)) {
      this.cancelPurchase();
      return;
    }
    const scene = this;
    runLegendPurchase({
      balloonId: id,
      meta: b,
      priceYuan: LEGEND_PRICE_YUAN_DEFAULT,
      showToast,
      onSuccess() {
        state.showPurchaseConfirm = false;
        state.pendingPurchaseId = null;
        scene._refresh();
      }
    }).catch((err) => {
      if (err && err.message) {
        console.warn('[collection.confirmPurchase]', err);
        showToast(err.message || '支付失败');
      }
    });
  },

  setEquipSelectedLevel(levelIndex) {
    const idx = typeof levelIndex === 'number' ? levelIndex : parseInt(levelIndex, 10);
    if (idx < 0 || idx >= LEVELS.length || Number.isNaN(idx)) return;
    state.equipSelectedLevelIdx = idx;
  },

  confirmEquipModal() {
    const bId = state.equipBalloonId;
    if (!bId) {
      this.closeEquipModal();
      return;
    }
    const idx = state.equipSelectedLevelIdx;
    if (idx < 0 || idx >= LEVELS.length) {
      showToast('请选择关卡');
      return;
    }
    const check = store.canEquipLegend(idx, bId);
    if (!check.ok) {
      showToast(check.reason || '装备失败');
      return;
    }
    const ok = store.equipLegend(idx, bId);
    if (ok) {
      showToast('已装备到第 ' + (idx + 1) + ' 关');
      this.closeEquipModal();
      this._refresh();
    } else showToast('装备失败');
  },

  startChallengeFromCollection() {
    const sel = state.selected;
    const unlocked = store.getUnlockedLevels();
    const maxUnlocked = Math.max(1, ...unlocked);
    let last = store.getLastPlayedLevel() || 1;
    last = last <= maxUnlocked ? last : maxUnlocked;
    if (sel && sel.type === 'common' && typeof sel.level === 'number' &&
      (store.isLevelUnlocked(sel.level) || sel.owned)) {
      last = sel.level;
    }
    store.setLastPlayedLevel(last);
    state.showDetail = false;
    state.selected = null;
    this.manager.switchTo('battle');
  },

  openBouquetPreview(sn) {
    state.previewBouquetSn = sn;
    state.showPreview = true;
  },

  closeBouquetPreview() {
    state.showPreview = false;
    state.previewBouquetSn = null;
  },

  shareBouquetPreview() {
    const b = state.bouquets.find(x => x.sn === state.previewBouquetSn);
    if (!b) {
      showToast('气球束不存在');
      return;
    }
    const shareTitle = b.isSynthesized
      ? '我收集了传奇合成气球束，快来看看！'
      : '我收集了第' + b.level + '关气球束，快来看看！';
    const posterTitle = b.isSynthesized ? '传奇合成气球束' : ('第 ' + b.level + ' 关气球束');
    const subtitle = b.isSynthesized && b.sourceBalloonName
      ? b.sourceBalloonName + ' · 合成专属'
      : (b.level ? '通关纪念 · 10 个气球' : '合成专属');
    showToast('正在生成分享图…');
    shareBouquetAsImage({
      balloons: balloonsFromBouquetRecord(b),
      shareTitle,
      posterTitle,
      subtitle,
      viewerLanding: true
    });
  },

  toggleBouquetStar(sn) {
    store.toggleBouquetStar(sn);
    this._refreshBouquets();
  },

  onTouch(type, x, y) {
    if (state.showSynAnim) return false;
    if (state.showGiftReceiveModal || state.showGiftAuthModal) return false;
    if (state.showSynPicker) {
      const bodyTop = state.synPickerBodyTop;
      const bodyH = state.synPickerBodyH;
      const inBody = bodyTop > 0 && x >= 14 && y >= bodyTop && y <= bodyTop + bodyH;
      if (type === 'start' || type === 'begin') {
        if (inBody && state.synPickerScrollMax > 0) {
          state.synPickerDragging = true;
          state.synPickerDragStartY = y;
          state.synPickerDragStartScroll = state.synPickerScrollY;
        } else state.synPickerDragging = false;
        return false;
      }
      if ((type === 'move' || type === 'end') && state.synPickerDragging) {
        const dy = y - state.synPickerDragStartY;
        state.synPickerScrollY = Math.max(0, Math.min(state.synPickerScrollMax, state.synPickerDragStartScroll - dy));
        if (type === 'end') state.synPickerDragging = false;
        return true;
      }
      return false;
    }
    if (state.showDetail || state.showEquipSelect ||
      state.showGiftConfirm || state.showPurchaseConfirm || state.showPreview ||
      state.showGiftReceiveModal) {
      return false;
    }
    const top = state._scrollTop;
    const bottom = state._scrollBottom;
    if (top < 0) return false;
    if (type === 'start' || type === 'begin') {
      if (y >= top && y <= bottom && state.scrollMax > 0) {
        state.isDraggingScroll = true;
        state.scrollMoved = false;
        state.scrollTouchStart = y;
        state.scrollTouchStartX = x;
        state.scrollStartY = state.scrollY;
      } else state.isDraggingScroll = false;
      return false;
    }
    if (type === 'move' && state.isDraggingScroll) {
      const dy = y - state.scrollTouchStart;
      if (Math.abs(dy) > 3 || Math.abs(x - state.scrollTouchStartX) > 3) state.scrollMoved = true;
      state.scrollY = Math.max(0, Math.min(state.scrollMax, state.scrollStartY - dy));
      return true;
    }
    if (type === 'tap' && state.scrollMoved) {
      state.scrollMoved = false;
      state.isDraggingScroll = false;
      return true;
    }
    if (type === 'end') {
      state.isDraggingScroll = false;
      state.scrollMoved = false;
    }
    return false;
  }
};

module.exports = sceneApi;
