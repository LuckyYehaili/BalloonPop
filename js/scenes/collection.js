// Collection Scene — 气球图鉴（与首页/战队视觉对齐，可滚动 + 完整弹窗链路）
const {
  drawBackground, drawText, drawButtonGradient, showToast, gradientPink, roundRect, measureText,
  beginScrollView, endScrollView, drawWrappedText, drawModalBackground
} = require('../engine/canvas-ui');
const { drawPageHeader } = require('../engine/page-header');
const store = require('../store');
const { purchaseLegendBalloon } = require('../cloud-pay');
const { BALLOON_TYPES, LEVELS } = require('../balloons');
const UX = require('../ui-theme');
const { getCapsuleLayout } = require('../layout-safe');
const { drawBouquetCompletionAnim } = require('../engine/bouquet-renderer');

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
  button: 13,
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
  drawBouquetCompletionAnim(ctx, balloons, x, y, w, h, 2.6);
}

let state = {
  activeTab: 'common',
  commonFlatList: [],
  legendList: [],
  bouquets: [],
  selected: null,
  showDetail: false,
  showEquipSelect: false,
  showSynConfirm: false,
  showGiftConfirm: false,
  showPurchaseConfirm: false,
  showPreview: false,
  previewBouquetSn: null,
  pendingSynId: null,
  pendingGiftId: null,
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
    const rowsB = Math.max(1, Math.ceil(state.bouquets.length / colsB));
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

function _isVisibleHit(y, h) {
  return y + h > state._scrollTop && y < state._scrollBottom;
}

function _modalTop(H, mh) {
  return Math.max(36, Math.round((H - mh) / 2));
}

function _shareAppMessage(title, query, fallbackText) {
  if (typeof wx !== 'undefined' && wx.shareAppMessage) {
    try {
      wx.shareAppMessage({ title, query: query || '', imageUrl: '' });
      return true;
    } catch (e) {
      showToast(fallbackText || '请使用右上角菜单分享');
      return false;
    }
  }
  showToast(fallbackText || '请使用右上角菜单分享');
  return false;
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
  onShow() {
    state.isIOS = _readIOS();
    state.scrollY = 0;
    state.showDetail = false;
    state.showEquipSelect = false;
    state.showSynConfirm = false;
    state.showGiftConfirm = false;
    state.showPurchaseConfirm = false;
    state.showPreview = false;
    state.previewBouquetSn = null;
    state.pendingSynId = null;
    state.pendingGiftId = null;
    state.pendingPurchaseId = null;
    state.selected = null;
    state.isDraggingScroll = false;
    this._refresh();
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

    const anyModal = state.showDetail || state.showEquipSelect || state.showSynConfirm ||
      state.showGiftConfirm || state.showPurchaseConfirm || state.showPreview;
    if (anyModal) {
      drawModalBackground(ctx, W, H);
      scene.manager.addTouchable(0, 0, W, H, 'closeTopModal');
    }
    if (state.showDetail) this._drawDetailModal(ctx, W, H, dpr);
    if (state.showEquipSelect) this._drawEquipModal(ctx, W, H);
    if (state.showSynConfirm) this._drawSynConfirm(ctx, W, H);
    if (state.showGiftConfirm) this._drawGiftConfirm(ctx, W, H);
    if (state.showPurchaseConfirm) this._drawPurchaseConfirm(ctx, W, H);
    if (state.showPreview) this._drawBouquetPreview(ctx, W, H);
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

      if (l.owned) {
        const half = gw / 2;
        const cxWear = bx + half / 2;
        const cxGift = bx + half + half / 2;
        const cxSyn = bx + gw / 2;
        const showSyn = !l.legendInflated && l.availableQuantity >= 2;
        const showGift = !l.legendInflated && l.giftable && l.availableQuantity >= 1;
        const canWear = !l.legendInflated;

        if (!canWear) {
          drawText(ctx, '已充气', mx, actionY, 'rgba(255,152,0,0.75)', TYPE.action, 'center', undefined, 500);
        } else if (!showSyn && !showGift) {
          drawText(ctx, '穿戴', mx, actionY, UX.gold, TYPE.action, 'center', undefined, 500);
          if (_isVisibleHit(hitTopRow, 30)) scene.manager.addTouchable(bx + half / 2, hitTopRow, half, 30, 'openEquip', l.id);
        } else if (canWear && showSyn && showGift) {
          drawText(ctx, '穿戴', cxWear, actionY, UX.gold, TYPE.action, 'center', undefined, 500);
          drawText(ctx, '合成', cxSyn, actionY, UX.violet, TYPE.action, 'center', undefined, 500);
          const b12 = (gw / 4 + gw / 2) / 2;
          const b23 = (gw / 2 + (3 * gw) / 4) / 2;
          if (_isVisibleHit(hitTopRow, 30)) {
            scene.manager.addTouchable(bx, hitTopRow, b12, 30, 'openEquip', l.id);
            scene.manager.addTouchable(bx + b12, hitTopRow, b23 - b12, 30, 'openSynConfirm', l.id);
          }
          if (state.isIOS) {
            drawText(ctx, 'iOS不可赠', cxGift, actionY, 'rgba(255,255,255,0.25)', 11, 'center', undefined, 500);
          } else {
            drawText(ctx, '赠送', cxGift, actionY, UX.success, TYPE.action, 'center', undefined, 500);
            if (_isVisibleHit(hitTopRow, 30)) scene.manager.addTouchable(bx + b23, hitTopRow, gw - b23, 30, 'openGiftConfirm', l.id);
          }
        } else if (canWear && showSyn && !showGift) {
          drawText(ctx, '穿戴', cxWear, actionY, UX.gold, TYPE.action, 'center', undefined, 500);
          drawText(ctx, '合成', cxGift, actionY, UX.violet, TYPE.action, 'center', undefined, 500);
          if (_isVisibleHit(hitTopRow, 30)) {
            scene.manager.addTouchable(bx, hitTopRow, half, 30, 'openEquip', l.id);
            scene.manager.addTouchable(bx + half, hitTopRow, half, 30, 'openSynConfirm', l.id);
          }
        } else if (canWear) {
          drawText(ctx, '穿戴', cxWear, actionY, UX.gold, TYPE.action, 'center', undefined, 500);
          if (_isVisibleHit(hitTopRow, 30)) scene.manager.addTouchable(bx, hitTopRow, half, 30, 'openEquip', l.id);
          if (showGift) {
            if (state.isIOS) {
              drawText(ctx, 'iOS不可赠', cxGift, actionY, 'rgba(255,255,255,0.25)', 11, 'center', undefined, 500);
            } else {
              drawText(ctx, '赠送', cxGift, actionY, UX.success, TYPE.action, 'center', undefined, 500);
              if (_isVisibleHit(hitTopRow, 30)) scene.manager.addTouchable(bx + half, hitTopRow, half, 30, 'openGiftConfirm', l.id);
            }
          }
        }
      } else {
        if (state.isIOS) {
          drawText(ctx, 'iOS 暂不支持购买', mx, actionY, 'rgba(255,255,255,0.28)', 11, 'center', undefined, 500);
        } else {
          drawText(ctx, '购买', mx, actionY, UX.gold, TYPE.action, 'center', undefined, 600);
          const purchaseHitTop = this._hitY(by + 92);
          if (_isVisibleHit(purchaseHitTop, 32)) scene.manager.addTouchable(bx + 16, purchaseHitTop, gw - 32, 32, 'openPurchaseConfirm', l.id);
        }
      }

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

    if (state.bouquets.length === 0) {
      drawWrappedText(ctx, '暂无气球束。', 24, contentTop + 24, W - 48, 20, 'rgba(255,255,255,0.4)', TYPE.modalBody, 400);
      drawWrappedText(ctx, '通关关卡或合成传奇气球后，会保存在这里。', 24, contentTop + 24 + 20, W - 48, 20, 'rgba(255,255,255,0.4)', TYPE.modalBody, 400);
      return;
    }

    state.bouquets.forEach((b, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = pad + col * (cardW + gap);
      const by = contentTop + row * (cardH + gap);

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

      const hitTop = this._hitY(by);
      if (_isVisibleHit(hitTop, cardH)) {
        scene.manager.addTouchable(bx, hitTop, cardW - 40, cardH, 'openBouquetPreview', b.sn);
        scene.manager.addTouchable(bx + cardW - 44, hitTop, 44, 44, 'toggleBouquetStar', b.sn);
      }
    });
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
    let extraBtn = 0;
    if (sel.type === 'common' && sel.owned) extraBtn = btnH + 8;
    if (sel.type === 'legend' && sel.owned && (sel.availableQuantity || 0) > 0) extraBtn = btnH + 8;
    if (sel.type === 'legend' && !sel.owned && !state.isIOS) extraBtn = btnH + 8;
    if (sel.type === 'common' && sel.unlocked && !sel.owned) extraBtn = btnH + 8;
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

    btnY -= extraBtn;
    if (sel.type === 'common' && sel.owned) {
      const b = drawButtonGradient(ctx, mx + px, btnY, mw - px * 2, btnH - 4, '开始挑战', gradientPink, '#fff', TYPE.button, 12, undefined, 600);
      scene.manager.addTouchable(b.x, b.y, b.w, b.h, 'startChallengeFromCollection');
    } else if (sel.type === 'common' && sel.unlocked && !sel.owned) {
      const b = drawButtonGradient(ctx, mx + px, btnY, mw - px * 2, btnH - 4, '去挑战获得', gradientPink, '#fff', TYPE.button, 12, undefined, 600);
      scene.manager.addTouchable(b.x, b.y, b.w, b.h, 'startChallengeFromCollection');
    } else if (sel.type === 'legend' && sel.owned && (sel.availableQuantity || 0) > 0 && !sel.legendInflated) {
      const b = drawButtonGradient(ctx, mx + px, btnY, mw - px * 2, btnH - 4, '穿戴到关卡', UX.gold, '#1a1025', TYPE.button, 12, 'rgba(255,215,0,0.35)', 600);
      scene.manager.addTouchable(b.x, b.y, b.w, b.h, 'openEquipFromDetail', sel.id);
    } else if (sel.type === 'legend' && !sel.owned && !state.isIOS) {
      const b = drawButtonGradient(ctx, mx + px, btnY, mw - px * 2, btnH - 4, '购买（演示）', gradientPink, '#fff', TYPE.button, 12, undefined, 600);
      scene.manager.addTouchable(b.x, b.y, b.w, b.h, 'openPurchaseFromDetail', sel.id);
    }
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

    drawText(ctx, '穿戴「' + meta.name + '」到关卡', W / 2, my + py + titleH / 2, '#ffffff', TYPE.modalTitle, 'center', 'rgba(255,215,0,0.35)', 600);

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
      let label = eqMeta ? ('当前：' + eqMeta.emoji + ' ' + eqMeta.name) : '当前：未装备';
      if (blocked && equipCheck.reason === '已充气') label = '已充气';
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

  _drawSynConfirm(ctx, W, H) {
    const scene = this;
    const id = state.pendingSynId;
    const meta = id && BALLOON_TYPES.find(b => b.id === id);
    if (!meta) return;
    const mw = W - 88;
    const mx = 44;
    const py = 18;
    const px = 18;
    const titleH = 20;
    const gap = 10;
    const descH = 50;
    const btnH = 42;
    const mh = py + titleH + gap + descH + gap + btnH + py;
    const my = _modalTop(H, mh);
    _drawCollectionModalBg(ctx, mx, my, mw, mh, COLLECTION_UI.modalBorderViolet, 18);
    drawText(ctx, '确认合成气球束？', W / 2, my + py + titleH / 2, '#ffffff', TYPE.modalTitle, 'center', undefined, 600);
    drawWrappedText(ctx, '将消耗 2 个「' + meta.name + '」合成专属气球束，操作不可撤销。', mx + px, my + py + titleH + gap, mw - px * 2, 20, 'rgba(255,255,255,0.88)', TYPE.modalBody, 400);
    const btnY = my + py + titleH + gap + descH + gap;
    const halfW = (mw - px * 3) / 2;
    const cb = drawButtonGradient(ctx, mx + px, btnY, halfW, btnH, '取消', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.85)', TYPE.button, 12, undefined, 500);
    scene.manager.addTouchable(cb.x, cb.y, cb.w, cb.h, 'cancelSyn');
    const db = drawButtonGradient(ctx, mx + px * 2 + halfW, btnY, halfW, btnH, '确认合成', gradientPink, '#fff', TYPE.button, 12, undefined, 600);
    scene.manager.addTouchable(db.x, db.y, db.w, db.h, 'confirmSyn');
  },

  _drawGiftConfirm(ctx, W, H) {
    const scene = this;
    const id = state.pendingGiftId;
    const meta = id && BALLOON_TYPES.find(b => b.id === id);
    if (!meta) return;
    const mw = W - 88;
    const mx = 44;
    const py = 18;
    const px = 18;
    const titleH = 20;
    const gap = 10;
    const descH = 58;
    const btnH = 42;
    const mh = py + titleH + gap + descH + gap + btnH + py;
    const my = _modalTop(H, mh);
    _drawCollectionModalBg(ctx, mx, my, mw, mh, 'rgba(134,239,172,0.32)', 18);
    drawText(ctx, '确认发起赠送？', W / 2, my + py + titleH / 2, '#ffffff', TYPE.modalTitle, 'center', undefined, 600);
    drawWrappedText(ctx, '「' + meta.name + '」将进入冻结状态（24 小时内有效），请通过右上角菜单分享给好友领取。', mx + px, my + py + titleH + gap, mw - px * 2, 20, 'rgba(255,255,255,0.88)', TYPE.modalBody, 400);
    const btnY = my + py + titleH + gap + descH + gap;
    const halfW = (mw - px * 3) / 2;
    const cb = drawButtonGradient(ctx, mx + px, btnY, halfW, btnH, '取消', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.85)', TYPE.button, 12, undefined, 500);
    scene.manager.addTouchable(cb.x, cb.y, cb.w, cb.h, 'cancelGift');
    const db = drawButtonGradient(ctx, mx + px * 2 + halfW, btnY, halfW, btnH, '确认赠送', 'rgba(134,239,172,0.18)', UX.success, TYPE.button, 12, undefined, 600);
    scene.manager.addTouchable(db.x, db.y, db.w, db.h, 'confirmGift');
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
    _drawCollectionModalBg(ctx, mx, my, mw, mh, COLLECTION_UI.modalBorderGold, 18);
    drawText(ctx, '确认购买（演示）', W / 2, my + py + titleH / 2, '#ffffff', TYPE.modalTitle, 'center', undefined, 600);
    drawWrappedText(ctx, '此为本地演示流程，未接入真实支付。购买后将获得 1 个「' + meta.name + '」。', mx + px, my + py + titleH + gap, mw - px * 2, 20, 'rgba(255,255,255,0.88)', TYPE.modalBody, 400);
    const btnY = my + py + titleH + gap + descH + gap;
    const halfW = (mw - px * 3) / 2;
    const cb = drawButtonGradient(ctx, mx + px, btnY, halfW, btnH, '取消', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.85)', TYPE.button, 12, undefined, 500);
    scene.manager.addTouchable(cb.x, cb.y, cb.w, cb.h, 'cancelPurchase');
    const db = drawButtonGradient(ctx, mx + px * 2 + halfW, btnY, halfW, btnH, '确认购买', gradientPink, '#fff', TYPE.button, 12, undefined, 600);
    scene.manager.addTouchable(db.x, db.y, db.w, db.h, 'confirmPurchase');
  },

  _drawBouquetPreview(ctx, W, H) {
    const scene = this;
    const b = state.bouquets.find(x => x.sn === state.previewBouquetSn);
    if (!b) return;
    // 弹窗略窄、花束区略矮，比例接近列表缩略图，避免「铺满屏」显得笨重
    const mw = Math.min(W - 72, 304);
    const mx = (W - mw) / 2;
    const py = 16;
    const px = 14;
    const titleH = 20;
    const gap = 6;
    const metaH = 36;
    const bodyH = 132;
    const btnH = 40;
    const mh = py + titleH + gap + metaH + bodyH + gap + btnH + py;
    const my = _modalTop(H, mh);
    _drawCollectionModalBg(ctx, mx, my, mw, mh, COLLECTION_UI.previewStroke, 18);
    drawText(ctx, '✕', mx + mw - 18, my + py + 4, 'rgba(255,255,255,0.45)', TYPE.close, 'center');
    scene.manager.addTouchable(mx + mw - 44, my + py - 4, 44, 36, 'closeBouquetPreview');
    const title = b.isSynthesized ? '传奇合成气球束' : ('第' + b.level + '关 气球束');
    drawText(ctx, title, W / 2, my + py + titleH / 2, '#ffffff', TYPE.modalTitle, 'center', undefined, 600);
    const sub = (b.time || '') + ' · ' + (b.hasLegend ? '含传奇' : '普通') + (b.starred ? ' · 已标星' : '');
    drawWrappedText(ctx, sub, mx + px, my + py + titleH + gap, mw - px * 2, 18, 'rgba(255,255,255,0.72)', TYPE.modalSub, 400);
    const bqY = my + py + titleH + gap + metaH;
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
    if (state.showPreview) {
      state.showPreview = false;
      state.previewBouquetSn = null;
      return;
    }
    if (state.showEquipSelect) {
      state.showEquipSelect = false;
      return;
    }
    if (state.showSynConfirm) {
      state.showSynConfirm = false;
      state.pendingSynId = null;
      return;
    }
    if (state.showGiftConfirm) {
      state.showGiftConfirm = false;
      state.pendingGiftId = null;
      return;
    }
    if (state.showPurchaseConfirm) {
      state.showPurchaseConfirm = false;
      state.pendingPurchaseId = null;
      return;
    }
    if (state.showDetail) {
      state.showDetail = false;
      state.selected = null;
    }
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

  openSynConfirm(id) {
    const b = state.legendList.find(l => l.id === id);
    if (!b || !b.owned || b.availableQuantity < 2) {
      showToast('至少需要2个同款气球');
      return;
    }
    state.pendingSynId = id;
    state.showSynConfirm = true;
  },

  cancelSyn() {
    state.showSynConfirm = false;
    state.pendingSynId = null;
  },

  confirmSyn() {
    const id = state.pendingSynId;
    const b = id && state.legendList.find(l => l.id === id);
    if (!b || !b.owned || b.availableQuantity < 2) {
      showToast('条件不足');
      state.showSynConfirm = false;
      state.pendingSynId = null;
      return;
    }
    if (!store.removeBalloon(id, 2)) {
      showToast('扣除失败，请重试');
      state.showSynConfirm = false;
      state.pendingSynId = null;
      return;
    }
    store.addBouquet({
      level: 1,
      hasLegend: true,
      isSynthesized: true,
      sourceBalloonId: id,
      sourceBalloonName: b.name,
      sourceBalloonEmoji: b.emoji,
      originalBalloons: [{ emoji: b.emoji, shape: b.shape, color: b.color, glowColor: b.glowColor, isPaid: true }]
    });
    store.addTransaction({ type: 'synthesize', balloonId: id, quantity: -2, counterparty: '', status: 'success' });
    showToast('合成成功！已存入气球束');
    state.showSynConfirm = false;
    state.pendingSynId = null;
    this._refresh();
  },

  openGiftConfirm(id) {
    if (state.isIOS) {
      showToast('iOS暂不支持赠送');
      return;
    }
    const b = state.legendList.find(l => l.id === id);
    if (!b || !b.giftable || b.availableQuantity < 1) {
      showToast('该气球不可转赠');
      return;
    }
    state.pendingGiftId = id;
    state.showGiftConfirm = true;
  },

  cancelGift() {
    state.showGiftConfirm = false;
    state.pendingGiftId = null;
  },

  confirmGift() {
    const id = state.pendingGiftId;
    if (!id || state.isIOS) {
      this.cancelGift();
      return;
    }
    const result = store.createGift([id], null, '送你专属气球');
    if (result.ok) {
      const meta = BALLOON_TYPES.find(b => b.id === id);
      _shareAppMessage(
        '送你一个「' + (meta ? meta.name : '传奇气球') + '」',
        'giftId=' + encodeURIComponent(result.giftId),
        '赠送已发起，请用右上角分享'
      );
    } else showToast(result.reason || '赠送失败');
    state.showGiftConfirm = false;
    state.pendingGiftId = null;
    this._refresh();
  },

  openPurchaseConfirm(id) {
    if (state.isIOS) {
      showToast('iOS暂未开放购买');
      return;
    }
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
    if (!b || state.isIOS) {
      this.cancelPurchase();
      return;
    }
    const scene = this;
    showToast('支付处理中…');
    purchaseLegendBalloon(id, { meta: b, priceYuan: 1.99 })
      .then((payResult) => {
        const channel = payResult.channel || 'mock_pay';
        store.addBalloon(id, 1, 'purchase');
        store.addTransaction({
          type: 'purchase',
          balloonId: id,
          quantity: 1,
          counterparty: '',
          status: 'success',
          channel
        });
        showToast(channel === 'cloud_pay' ? '购买成功' : '购买成功（演示）');
        state.showPurchaseConfirm = false;
        state.pendingPurchaseId = null;
        scene._refresh();
      })
      .catch((err) => {
        console.warn('[collection.confirmPurchase]', err);
        showToast((err && err.message) || '支付失败');
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
    const title = b
      ? '我收集了' + (b.isSynthesized ? '传奇合成气球束' : '第' + b.level + '关气球束') + '，快来看看！'
      : '我收集了一束气球，快来看看！';
    _shareAppMessage(title, 'scene=collection&bouquetSn=' + encodeURIComponent(state.previewBouquetSn || ''));
  },

  toggleBouquetStar(sn) {
    store.toggleBouquetStar(sn);
    this._refreshBouquets();
  },

  onTouch(type, x, y) {
    if (state.showDetail || state.showEquipSelect || state.showSynConfirm ||
      state.showGiftConfirm || state.showPurchaseConfirm || state.showPreview) {
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
