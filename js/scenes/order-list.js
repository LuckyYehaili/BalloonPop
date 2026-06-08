// Order List Scene — 订单记录（订单中心，支付合规展示页）
const {
  drawBackground, drawText, roundRect, beginScrollView, endScrollView,
  measureText, drawImage, getImage, loadImages
} = require('../engine/canvas-ui');

const EMPTY_IMG = 'images/ui/nodata.png';
const { drawPageHeader } = require('../engine/page-header');
const { getCapsuleLayout } = require('../layout-safe');
const { isUserLoggedIn } = require('../auth-guard');
const { fetchOrderList } = require('../cloud-order');

const UI = {
  bg0: '#09031c',
  bg1: '#16082f',
  panel: 'rgba(255,255,255,0.04)',
  stroke: 'rgba(255,80,200,0.22)',
  strokeSoft: 'rgba(255,255,255,0.08)',
  text: '#ffffff',
  muted: 'rgba(255,255,255,0.45)',
  dim: 'rgba(255,255,255,0.28)',
  gold: '#ffd740',
  neon: '#ff50c8',
  green: 'rgba(80,220,160,0.95)'
};

const STATUS_TEXT = {
  completed: '已完成',
  refunded: '已退款',
  closed: '已关闭'
};

let state = {
  loading: false,
  loaded: false,
  orders: [],
  errMsg: '',
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

function _fmtTime(ms) {
  const n = Number(ms) || 0;
  if (n <= 0) return '—';
  const d = new Date(n);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return Y + '-' + M + '-' + D + ' ' + h + ':' + m;
}

function _fmtPrice(price) {
  const n = Number(price) || 0;
  return '¥' + n.toFixed(2);
}

function _truncate(ctx, text, size, weight, maxW) {
  let t = String(text || '');
  if (measureText(ctx, t, size, weight) <= maxW) return t;
  while (t.length > 1 && measureText(ctx, t + '…', size, weight) > maxW) t = t.slice(0, -1);
  return t ? t + '…' : '…';
}

module.exports = {
  onShow() {
    state.scrollY = 0;
    state.orders = [];
    state.loaded = false;
    state.errMsg = '';
    try { loadImages([EMPTY_IMG], () => {}); } catch (_) {}
    this._load();
  },

  _load() {
    if (state.loading) return;
    if (!isUserLoggedIn()) {
      state.loaded = true;
      state.orders = [];
      return;
    }
    state.loading = true;
    fetchOrderList({ limit: 50 })
      .then((res) => {
        state.orders = res.orders || [];
        state.errMsg = res.ok ? '' : (res.errMsg || '加载失败');
      })
      .catch((err) => {
        state.orders = [];
        state.errMsg = (err && err.message) || '加载失败';
      })
      .then(() => {
        state.loading = false;
        state.loaded = true;
      });
  },

  render(ctx, W, H) {
    const scene = this;
    const L = getCapsuleLayout();
    drawBackground(ctx, W, H, [UI.bg0, UI.bg1, UI.bg0]);

    const header = drawPageHeader(ctx, scene, W, { title: '订单记录', onBack: 'goBack' });
    const contentTop = header.contentTop;
    const safeB = L.safeBottomInset || 0;
    const viewportH = Math.max(180, H - contentTop - safeB);

    const pad = 18;
    const cardX = pad;
    const cardW = W - pad * 2;
    const cardH = 150;
    const cardGap = 12;

    const orders = state.orders;
    const hasOrders = orders.length > 0;
    const contentH = hasOrders
      ? orders.length * (cardH + cardGap) + 8
      : viewportH;
    state.scrollMax = hasOrders ? Math.max(0, contentH - viewportH + 18) : 0;
    if (state.scrollY > state.scrollMax) state.scrollY = state.scrollMax;
    if (state.scrollY < 0) state.scrollY = 0;
    state._scrollTop = contentTop;
    state._scrollBottom = contentTop + viewportH;

    beginScrollView(ctx, 0, contentTop, W, viewportH, state.scrollY);

    if (!state.loaded || state.loading) {
      this._drawCenterHint(ctx, W, contentTop, viewportH, '加载中…', '');
    } else if (!isUserLoggedIn()) {
      this._drawCenterHint(ctx, W, contentTop, viewportH, '请先登录', '登录后可查看你的订单记录');
    } else if (!hasOrders) {
      this._drawEmptyState(ctx, W, contentTop, viewportH);
    } else {
      let y = contentTop + 4;
      orders.forEach((o) => {
        this._drawOrderCard(ctx, cardX, y, cardW, cardH, o);
        y += cardH + cardGap;
      });
    }

    endScrollView(ctx);
  },

  _drawCenterHint(ctx, W, contentTop, viewportH, title, sub) {
    drawText(ctx, title, W / 2, contentTop + viewportH / 2 - (sub ? 12 : 0), UI.muted, 15, 'center', undefined, 500);
    if (sub) {
      drawText(ctx, sub, W / 2, contentTop + viewportH / 2 + 14, UI.dim, 12, 'center', undefined, 400);
    }
  },

  _drawEmptyState(ctx, W, contentTop, viewportH) {
    const imgSize = 120;
    const textH = 14;
    const btnW = 120;
    const btnH = 40;
    const gapImgText = 16;
    const gapTextBtn = 24;
    const totalH = imgSize + gapImgText + textH + gapTextBtn + btnH;
    const top = contentTop + Math.max(0, (viewportH - totalH) / 2);

    const imgX = W / 2 - imgSize / 2;
    const imgY = top;
    if (getImage(EMPTY_IMG)) {
      drawImage(ctx, EMPTY_IMG, imgX, imgY, imgSize, imgSize);
    }

    const textCy = imgY + imgSize + gapImgText + textH / 2;
    drawText(ctx, '暂无订单', W / 2, textCy, UI.muted, 14, 'center', undefined, 500);

    const btnX = W / 2 - btnW / 2;
    const btnY = textCy + textH / 2 + gapTextBtn;
    ctx.save();
    roundRect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
    ctx.fillStyle = 'rgba(255,80,200,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,200,0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, '返回', W / 2, btnY + btnH / 2, UI.neon, 14, 'center', undefined, 600);
    this.manager.addTouchable(btnX, btnY, btnW, btnH, 'goBack');
  },

  _drawOrderCard(ctx, x, y, w, h, o) {
    ctx.save();
    roundRect(ctx, x, y, w, h, 18);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(255,255,255,0.025)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = UI.strokeSoft;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    const px = x + 18;
    const innerW = w - 36;
    let cy = y + 20;

    // 行1：商品名称 + 状态徽标
    const statusLabel = STATUS_TEXT[o.status] || '已完成';
    const badgeW = Math.max(52, measureText(ctx, statusLabel, 11, 700) + 22);
    const badgeH = 22;
    const badgeX = x + w - 18 - badgeW;
    const nameMaxW = innerW - badgeW - 12;
    const name = _truncate(ctx, o.goodsName || '商品', 15, 700, nameMaxW);
    drawText(ctx, name, px, cy + 8, UI.text, 15, 'left', undefined, 700);

    ctx.save();
    roundRect(ctx, badgeX, cy - 3, badgeW, badgeH, badgeH / 2);
    ctx.fillStyle = 'rgba(80,220,160,0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,220,160,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, statusLabel, badgeX + badgeW / 2, cy + 8, UI.green, 11, 'center', undefined, 700);

    // 分隔线
    cy += 30;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(px, cy, innerW, 1);

    // 明细行
    cy += 16;
    const lineGap = 24;
    const labelColor = UI.muted;
    const valueColor = 'rgba(255,255,255,0.82)';

    this._drawKV(ctx, px, innerW, cy, '商品内容', o.goodsContent || '—', labelColor, valueColor);
    cy += lineGap;
    // 金额：高亮
    this._drawKV(ctx, px, innerW, cy, '购买金额', _fmtPrice(o.price), labelColor, UI.gold, 700);
    cy += lineGap;
    this._drawKV(ctx, px, innerW, cy, '下单时间', _fmtTime(o.createTime), labelColor, valueColor);
    cy += lineGap;
    this._drawKV(ctx, px, innerW, cy, '订单号', o.orderNo || '—', labelColor, valueColor, 400, true);
  },

  _drawKV(ctx, x, w, y, label, value, labelColor, valueColor, valueWeight) {
    drawText(ctx, label, x, y, labelColor, 12, 'left', undefined, 400);
    const labelW = 64;
    const valMaxW = w - labelW;
    const v = _truncate(ctx, value, 12, valueWeight || 500, valMaxW);
    drawText(ctx, v, x + w, y, valueColor, 12, 'right', undefined, valueWeight || 500);
  },

  goBack() { this.manager.switchTo('profile'); },

  handleBackButton() { return false; },

  onTouch(type, x, y) {
    const top = state._scrollTop;
    const bottom = state._scrollBottom;
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
