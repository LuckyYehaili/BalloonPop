// Profile Scene — 我的（Canvas 版，参考移动端游戏个人页）
const {
  drawBackground, drawText, drawButtonGradient, drawImage, getImage, loadImages,
  showToast, gradientPink, roundRect, beginScrollView, endScrollView, drawWrappedText,
  drawModalBackground, measureText, drawToggle
} = require('../engine/canvas-ui');
const { drawPageHeader } = require('../engine/page-header');
const store = require('../store');
const { BALLOON_TYPES } = require('../balloons');
const UX = require('../ui-theme');
const { getCapsuleLayout } = require('../layout-safe');

const UI = {
  neon: '#ff50c8',
  violet: '#7c4dff',
  bg0: '#09031c',
  bg1: '#16082f',
  panel: 'rgba(255,255,255,0.035)',
  panel2: 'rgba(255,255,255,0.055)',
  stroke: 'rgba(255,80,200,0.24)',
  strokeSoft: 'rgba(255,255,255,0.07)',
  text: '#ffffff',
  muted: 'rgba(255,255,255,0.42)',
  dim: 'rgba(255,255,255,0.28)',
  danger: 'rgba(255,80,80,0.78)',
  gold: '#ffd740',
  green: 'rgba(80,220,160,0.9)'
};

const TYPE = {
  title: 16,
  name: 16,
  id: 12,
  chip: 12,
  statValue: 18,
  statValueSmall: 18,
  statUnit: 10,
  statLabel: 12,
  row: 14,
  icon: 16,
  modalTitle: 16,
  modalBody: 14,
  modalSmall: 12,
  button: 14
};

// 我的页 UI 图标统一登记：onShow 预加载，render 时从 getImage 取
const PROFILE_IMG = {
  statAll:        'images/ui/ALL.png',
  statToday:      'images/ui/today.png',
  statPutong:     'images/ui/putong.png',
  statChuanqi:    'images/ui/chuanqi.png',
  statShu:        'images/ui/SHU.png',
  settingYinxiao: 'images/ui/yinxiao.png',
  settingZhendong:'images/ui/zhendong.png',
  actionKefu:     'images/ui/kefu.png',     // ⚠️ 资源待补：缺图时自动回落到 emoji
  actionXieyi:    'images/ui/xieyi.png',
  actionYinsi:    'images/ui/yinsi.png',
  actionTuichu:   'images/ui/tuichu.png'
};

let state = {
  userAvatar: '',
  userNickName: '玩家',
  userId: '',
  totalClears: 0,
  todayClears: 0,
  normalCollected: 0,
  legendCollected: 0,
  bouquetCount: 0,
  teamName: '',
  hasTeam: false,
  soundOn: true,
  vibrationOn: true,
  records: [],
  showRecordsModal: false,
  showExitConfirm: false,
  showAbout: false,
  aboutTitle: '',
  aboutText: '',
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

function _todayStr() {
  const d = new Date();
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return Y + '-' + M + '-' + D;
}

function _shortId(id) {
  const s = String(id || '88888888');
  if (s.length <= 8) return s;
  return s.slice(0, 8);
}

function _truncateText(ctx, text, size, weight, maxW) {
  let t = String(text || '');
  if (measureText(ctx, t, size, weight) <= maxW) return t;
  while (t.length > 1 && measureText(ctx, t + '…', size, weight) > maxW) t = t.slice(0, -1);
  return t ? t + '…' : '…';
}

function _modalTop(H, mh) {
  return Math.max(36, Math.round((H - mh) / 2));
}

function _drawGlowCard(ctx, x, y, w, h, r, stroke, fill) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r || 22);
  ctx.fillStyle = fill || UI.panel;
  ctx.fill();
  ctx.strokeStyle = stroke || UI.strokeSoft;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function _drawProfileModalBg(ctx, x, y, w, h, borderColor, radius) {
  ctx.save();
  roundRect(ctx, x, y, w, h, radius || 22);
  const bg = ctx.createLinearGradient(x, y, x, y + h);
  bg.addColorStop(0, 'rgba(25,8,50,0.99)');
  bg.addColorStop(1, 'rgba(10,2,25,0.99)');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = borderColor || UI.stroke;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}


function _withAlpha(color, alpha) {
  if (!color) return 'rgba(255,255,255,' + alpha + ')';
  if (color[0] === '#') {
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    const n = parseInt(full, 16);
    if (!Number.isNaN(n)) {
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
    }
  }
  const nums = color.match(/[\d.]+/g);
  if (nums && nums.length >= 3) {
    return 'rgba(' + nums[0] + ',' + nums[1] + ',' + nums[2] + ',' + alpha + ')';
  }
  return color;
}

function _drawAvatar(ctx, x, y, r, name, avatar) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r + 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,80,200,0.16)';
  ctx.shadowColor = 'rgba(255,80,200,0.45)';
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,80,200,0.72)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.clip();
  const img = avatar ? getImage(avatar) : null;
  if (img) {
    drawImage(ctx, avatar, x - r, y - r, r * 2, r * 2);
  } else {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 4, x, y, r);
    g.addColorStop(0, '#ffe4f6');
    g.addColorStop(0.45, '#ff8ee2');
    g.addColorStop(1, '#7c4dff');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    drawText(ctx, (name || '玩')[0], x, y + 1, '#fff', 24, 'center', undefined, 700);
  }
  ctx.restore();
}

function _drawStatBox(ctx, x, y, w, h, stat, compact) {
  _drawGlowCard(ctx, x, y, w, h, compact ? 18 : 16, stat.clickable ? 'rgba(255,80,200,0.22)' : UI.strokeSoft, UI.panel2);
  const iconSize = compact ? 24 : 32;
  const iconX = compact ? x + w / 2 : x + 24;
  const iconY = compact ? y + 18 : y + h / 2;
  const img = stat.iconImg ? getImage(stat.iconImg) : null;
  if (img) {
    drawImage(ctx, stat.iconImg, iconX - iconSize / 2, iconY - iconSize / 2, iconSize, iconSize);
  } else {
    ctx.save();
    roundRect(ctx, iconX - iconSize / 2, iconY - iconSize / 2, iconSize, iconSize, compact ? 8 : 10);
    ctx.fillStyle = _withAlpha(stat.color, 0.1);
    ctx.fill();
    ctx.restore();
    drawText(ctx, stat.icon, iconX, iconY, stat.color, compact ? 14 : 16, 'center', undefined, 600);
  }

  if (compact) {
    const valueY = y + 58;
    drawText(ctx, stat.value, x + w / 2 - 4, valueY, stat.color, TYPE.statValueSmall, 'right', stat.glow, 800);
    drawText(ctx, stat.unit, x + w / 2 + 1, valueY + 2, UI.muted, TYPE.statUnit, 'left', undefined, 400);
    drawText(ctx, stat.label, x + w / 2, y + h - 20, UI.muted, TYPE.statLabel, 'center', undefined, 400);
    return;
  }

  const tx = x + 48;
  drawText(ctx, stat.value, tx, y + 30, stat.color, TYPE.statValue, 'left', stat.glow, 800);
  drawText(ctx, stat.unit, tx + 22, y + 32, UI.muted, TYPE.statUnit, 'left', undefined, 400);
  drawText(ctx, stat.label, tx, y + 54, UI.muted, TYPE.statLabel, 'left', undefined, 400);
}

function _drawRow(ctx, x, y, w, h, icon, label, danger, iconImg) {
  _drawGlowCard(ctx, x, y, w, h, 14, danger ? 'rgba(255,80,80,0.22)' : UI.strokeSoft, danger ? 'rgba(255,60,60,0.07)' : 'rgba(255,255,255,0.03)');
  const iconSize = 22;
  const iconCx = x + 28;
  const iconCy = y + h / 2;
  const img = iconImg ? getImage(iconImg) : null;
  if (img) {
    drawImage(ctx, iconImg, iconCx - iconSize / 2, iconCy - iconSize / 2, iconSize, iconSize);
  } else {
    drawText(ctx, icon, iconCx, iconCy, danger ? UI.danger : 'rgba(255,255,255,0.38)', TYPE.icon, 'center', undefined, 500);
  }
  drawText(ctx, label, danger ? x + w / 2 + 10 : x + 60, y + h / 2, danger ? UI.danger : 'rgba(255,255,255,0.62)', TYPE.row, danger ? 'center' : 'left', undefined, danger ? 600 : 500);
  if (!danger) drawText(ctx, '›', x + w - 28, y + h / 2, 'rgba(255,255,255,0.22)', 18, 'center', undefined, 400);
}

function _drawActionRow(ctx, x, y, w, h, icon, label, danger, iconImg) {
  const iconSize = 22;
  const iconCx = x + 32;
  const iconCy = y + h / 2;
  const img = iconImg ? getImage(iconImg) : null;
  if (img) {
    drawImage(ctx, iconImg, iconCx - iconSize / 2, iconCy - iconSize / 2, iconSize, iconSize);
  } else {
    drawText(ctx, icon, iconCx, iconCy, danger ? UI.danger : 'rgba(255,255,255,0.38)', TYPE.icon, 'center', undefined, 500);
  }
  drawText(ctx, label, danger ? x + w / 2 + 8 : x + 60, y + h / 2, danger ? UI.danger : 'rgba(255,255,255,0.62)', TYPE.row, danger ? 'center' : 'left', undefined, danger ? 600 : 500);
  if (!danger) drawText(ctx, '›', x + w - 28, y + h / 2, 'rgba(255,255,255,0.22)', 18, 'center', undefined, 400);
}

module.exports = {
  onShow() {
    this._refresh();
    state.scrollY = 0;
    state.showRecordsModal = false;
    state.showExitConfirm = false;
    state.showAbout = false;
    try { loadImages(Object.values(PROFILE_IMG), () => {}); } catch (_) {}
  },

  _refresh() {
    const user = store.getUser();
    const settings = store.getSettings();
    const team = store.getTeam();
    const owned = store.getOwnedBalloons();
    const records = store.getClearHistory ? store.getClearHistory() : [];
    const today = _todayStr();
    const normalCollected = Object.keys(owned).filter(id => {
      const b = BALLOON_TYPES.find(t => t.id === id);
      return b && !b.isPaid && owned[id].quantity > 0;
    }).length;
    const legendCollected = Object.keys(owned).filter(id => {
      const b = BALLOON_TYPES.find(t => t.id === id);
      return b && b.isPaid && owned[id].quantity > 0;
    }).length;

    Object.assign(state, {
      userAvatar: user.avatar || '',
      userNickName: user.nickName || '糖果小仙女',
      userId: user.openid || '',
      totalClears: records.length,
      todayClears: records.filter(r => String(r.time || '').slice(0, 10) === today).length || (store.getTodayClears ? store.getTodayClears() : 0),
      normalCollected,
      legendCollected,
      bouquetCount: store.getBouquets ? store.getBouquets().length : 0,
      teamName: team ? team.name : '星云队',
      hasTeam: !!team,
      soundOn: settings.soundOn !== false,
      vibrationOn: settings.vibrationOn !== false,
      records
    });

    if (state.userAvatar) {
      try { loadImages([state.userAvatar], () => {}); } catch (_) {}
    }
  },

  _hitY(worldY) {
    return worldY - state.scrollY;
  },

  _addScrollTouchable(x, worldY, w, h, handler, data) {
    const y = this._hitY(worldY);
    if (y + h < state._scrollTop || y > state._scrollBottom) return;
    this.manager.addTouchable(x, y, w, h, handler, data);
  },

  render(ctx, W, H) {
    const scene = this;
    const L = getCapsuleLayout();
    drawBackground(ctx, W, H, [UI.bg0, UI.bg1, UI.bg0]);

    const header = drawPageHeader(ctx, scene, W, { title: '我的', onBack: 'goBack' });
    const contentTop = header.contentTop;
    const safeB = L.safeBottomInset || 0;
    const viewportH = Math.max(180, H - contentTop - safeB);
    const contentH = 734;
    state.scrollMax = Math.max(0, contentH - viewportH + 18);
    if (state.scrollY > state.scrollMax) state.scrollY = state.scrollMax;
    if (state.scrollY < 0) state.scrollY = 0;
    state._scrollTop = contentTop;
    state._scrollBottom = contentTop + viewportH;

    beginScrollView(ctx, 0, contentTop, W, viewportH, state.scrollY);

    const pad = 22;
    const cardX = pad;
    let y = contentTop;
    const cardW = W - pad * 2;
    const profileH = 340;

    const moduleGap = 16;
    const avX = cardX + 30;
    const avY = y + 58;
    _drawAvatar(ctx, avX, avY, 30, state.userNickName, state.userAvatar);
    const editX = avX + 22;
    const editY = avY + 20;
    const eg = ctx.createLinearGradient(editX - 14, editY - 14, editX + 14, editY + 14);
    eg.addColorStop(0, UI.neon);
    eg.addColorStop(1, UI.violet);
    ctx.save();
    ctx.beginPath();
    ctx.arc(editX, editY, 14, 0, Math.PI * 2);
    ctx.fillStyle = eg;
    ctx.fill();
    ctx.strokeStyle = UI.bg0;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, '✎', editX, editY + 1, '#fff', 12, 'center', undefined, 600);
    this._addScrollTouchable(editX - 20, editY - 20, 40, 40, 'editProfile');

    const nameX = cardX + 78;
    const nameY = y + 42;
    const teamText = state.teamName || '星云队';
    const chipH = 22;
    const chipW = Math.min(86, Math.max(56, Math.ceil(measureText(ctx, teamText, TYPE.chip, 600) + 18)));
    const nameMaxW = Math.max(72, cardX + cardW - nameX - chipW - 10);
    const nameText = _truncateText(ctx, state.userNickName, TYPE.name, 800, nameMaxW);
    const nameW = measureText(ctx, nameText, TYPE.name, 800);
    drawText(ctx, nameText, nameX, nameY, UI.text, TYPE.name, 'left', 'rgba(255,80,200,0.45)', 800);
    const chipX = nameX + nameW + 8;
    const chipY = nameY - chipH / 2;
    _drawGlowCard(ctx, chipX, chipY, chipW, chipH, chipH / 2, 'rgba(255,200,80,0.30)', 'rgba(255,200,80,0.12)');
    drawText(ctx, teamText, chipX + chipW / 2, chipY + chipH / 2, 'rgba(255,200,80,0.9)', TYPE.chip, 'center', undefined, 600);
    drawText(ctx, 'ID: ' + _shortId(state.userId), nameX, y + 72, UI.muted, TYPE.id, 'left', undefined, 400);

    const statGap = 10;
    const topStatY = y + 136;
    const gridX = cardX;
    const gridW = cardW;
    const topStatW = (gridW - statGap) / 2;
    const clearStats = [
      { label: '总通关次数', value: String(state.totalClears), unit: '次', icon: '🏆', iconImg: PROFILE_IMG.statAll, color: UI.neon, glow: 'rgba(255,80,200,0.5)', clickable: true },
      { label: '今日通关', value: String(state.todayClears), unit: '次', icon: '▣', iconImg: PROFILE_IMG.statToday, color: UI.green, glow: 'rgba(80,220,160,0.45)' }
    ];
    _drawStatBox(ctx, gridX, topStatY, topStatW, 80, clearStats[0], false);
    _drawStatBox(ctx, gridX + topStatW + statGap, topStatY, topStatW, 80, clearStats[1], false);
    this._addScrollTouchable(gridX, topStatY, topStatW, 80, 'openRecords');

    const smallY = topStatY + 92;
    const smallW = (gridW - statGap * 2) / 3;
    const balloonStats = [
      { label: '普通气球', value: String(state.normalCollected), unit: '个', icon: '⌘', iconImg: PROFILE_IMG.statPutong, color: 'rgba(190,190,205,0.9)', glow: 'rgba(190,190,205,0.28)' },
      { label: '传奇气球', value: String(state.legendCollected), unit: '个', icon: '♕', iconImg: PROFILE_IMG.statChuanqi, color: UI.gold, glow: 'rgba(255,215,64,0.45)' },
      { label: '气球束', value: String(state.bouquetCount), unit: '套', icon: '▰', iconImg: PROFILE_IMG.statShu, color: UI.neon, glow: 'rgba(255,80,200,0.45)' }
    ];
    balloonStats.forEach((s, i) => {
      _drawStatBox(ctx, gridX + i * (smallW + statGap), smallY, smallW, 104, s, true);
    });

    y += profileH + moduleGap;
    const rowX = pad;
    const rowW = W - pad * 2;
    const settingH = 146;
    _drawGlowCard(ctx, rowX, y, rowW, settingH, 18, UI.strokeSoft, 'rgba(255,255,255,0.03)');
    const settingRows = [
      { label: '游戏音效', icon: '♬', iconImg: PROFILE_IMG.settingYinxiao,  key: 'soundOn',     handler: 'toggleSound' },
      { label: '震动反馈', icon: '◔', iconImg: PROFILE_IMG.settingZhendong, key: 'vibrationOn', handler: 'toggleVibration' }
    ];
    settingRows.forEach((r, i) => {
      const ry = y + i * 72;
      if (i > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(rowX, ry, rowW, 1);
      }
      const iconSize = 22;
      const iconCx = rowX + 34;
      const iconCy = ry + 36;
      const img = r.iconImg ? getImage(r.iconImg) : null;
      if (img) {
        drawImage(ctx, r.iconImg, iconCx - iconSize / 2, iconCy - iconSize / 2, iconSize, iconSize);
      } else {
        drawText(ctx, r.icon, iconCx, iconCy, 'rgba(255,255,255,0.45)', 17, 'center', undefined, 500);
      }
      drawText(ctx, r.label, rowX + 62, ry + 36, 'rgba(255,255,255,0.76)', TYPE.row, 'left', undefined, 500);
      const tb = drawToggle(ctx, rowX + rowW - 70, ry + 21, state[r.key]);
      this._addScrollTouchable(tb.x - 8, ry + 14, tb.w + 16, 44, r.handler);
    });

    y += settingH + moduleGap;
    const actionRows = [
      { label: '联系客服', icon: '☏', iconImg: PROFILE_IMG.actionKefu,   handler: 'contactService' },
      { label: '用户协议', icon: '▤', iconImg: PROFILE_IMG.actionXieyi,  handler: 'openAgreement' },
      { label: '隐私政策', icon: '▧', iconImg: PROFILE_IMG.actionYinsi,  handler: 'openPrivacy' },
      { label: '退出登录', icon: '⇱', iconImg: PROFILE_IMG.actionTuichu, handler: 'openExitConfirm', danger: true }
    ];
    const actionRowH = 54;
    const actionCardH = actionRows.length * actionRowH;
    _drawGlowCard(ctx, rowX, y, rowW, actionCardH, 18, UI.strokeSoft, 'rgba(255,255,255,0.03)');
    actionRows.forEach((r, i) => {
      const ry = y + i * actionRowH;
      if (i > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(rowX + 14, ry, rowW - 28, 1);
      }
      _drawActionRow(ctx, rowX, ry, rowW, actionRowH, r.icon, r.label, !!r.danger, r.iconImg);
      this._addScrollTouchable(rowX, ry, rowW, actionRowH, r.handler);
    });

    endScrollView(ctx);

    if (state.showRecordsModal || state.showExitConfirm || state.showAbout) {
      drawModalBackground(ctx, W, H);
    }
    if (state.showRecordsModal) this._drawRecordsModal(ctx, W, H);
    if (state.showExitConfirm) this._drawExitModal(ctx, W, H);
    if (state.showAbout) this._drawInfoModal(ctx, W, H);
  },

  _drawRecordsModal(ctx, W, H) {
    const sheetH = Math.min(Math.round(H * 0.78), H - 74);
    const mx = 18;
    const mw = W - 36;
    const my = H - sheetH;
    _drawProfileModalBg(ctx, mx, my, mw, sheetH, UI.stroke, 24);
    ctx.save();
    roundRect(ctx, W / 2 - 20, my + 12, 40, 4, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fill();
    ctx.restore();
    drawText(ctx, '↺', mx + 32, my + 52, UI.neon, 18, 'center', undefined, 600);
    drawText(ctx, '通关记录', mx + 56, my + 52, UI.text, TYPE.modalTitle, 'left', undefined, 700);
    _drawGlowCard(ctx, mx + mw - 88, my + 38, 66, 28, 14, 'rgba(255,80,200,0.30)', 'rgba(255,80,200,0.14)');
    drawText(ctx, '共 ' + state.records.length + ' 次', mx + mw - 55, my + 52, UI.neon, 11, 'center', undefined, 700);
    drawText(ctx, '4 关全部通过才算一次完整通关', mx + 24, my + 82, UI.muted, TYPE.modalSmall, 'left', undefined, 400);

    const list = state.records.slice(0, 7);
    let y = my + 110;
    if (!list.length) {
      drawText(ctx, '暂无通关记录', W / 2, my + sheetH / 2, UI.dim, TYPE.modalBody, 'center', undefined, 400);
    }
    list.forEach((r, i) => {
      const h = 64;
      _drawGlowCard(ctx, mx + 14, y, mw - 28, h, 16, i === 0 ? 'rgba(255,80,200,0.28)' : UI.strokeSoft, i === 0 ? 'rgba(255,80,200,0.10)' : UI.panel);
      ctx.save();
      ctx.beginPath();
      ctx.arc(mx + 38, y + h / 2, 16, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? 'rgba(255,80,200,0.18)' : 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.restore();
      drawText(ctx, String(i + 1), mx + 38, y + h / 2, i === 0 ? UI.neon : UI.muted, 11, 'center', undefined, 800);
      const time = r.time || '';
      drawText(ctx, time ? time.slice(0, 16) : '未知时间', mx + 64, y + 24, UI.text, 13, 'left', undefined, 600);
      drawText(ctx, '第' + (r.level || '-') + '关' + (r.hasLegend ? ' · 含传奇' : ''), mx + 64, y + 45, UI.muted, 11, 'left', undefined, 400);
      drawText(ctx, '🏆', mx + mw - 42, y + h / 2, i === 0 ? UI.gold : 'rgba(255,215,64,0.35)', 17, 'center');
      y += h + 10;
    });
    this.manager.addTouchable(0, 0, W, H, 'closeTopModal');
  },

  _drawExitModal(ctx, W, H) {
    const mw = W - 92;
    const mh = 248;
    const mx = 46;
    const my = _modalTop(H, mh);
    _drawProfileModalBg(ctx, mx, my, mw, mh, 'rgba(255,80,80,0.30)', 24);
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, my + 58, 28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,80,80,0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,80,0.28)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, '⇱', W / 2, my + 58, UI.danger, 24, 'center', undefined, 600);
    drawText(ctx, '确认退出登录？', W / 2, my + 108, UI.text, TYPE.modalTitle, 'center', undefined, 800);
    drawWrappedText(ctx, '退出后将清除当前登录信息，本机数据仍会保留，下次进入需要重新授权登录。', mx + 28, my + 132, mw - 56, 19, UI.muted, TYPE.modalBody, 400);
    const btnW = (mw - 58) / 2;
    const by = my + mh - 62;
    const cancel = drawButtonGradient(ctx, mx + 22, by, btnW, 42, '再想想', 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0.55)', TYPE.button, 14, undefined, 600);
    const ok = drawButtonGradient(ctx, mx + 36 + btnW, by, btnW, 42, '确认退出', 'rgba(255,80,80,0.78)', '#fff', TYPE.button, 14, undefined, 700);
    this.manager.addTouchable(cancel.x, cancel.y, cancel.w, cancel.h, 'cancelExit');
    this.manager.addTouchable(ok.x, ok.y, ok.w, ok.h, 'confirmExit');
  },

  _drawInfoModal(ctx, W, H) {
    const mw = W - 88;
    const mh = 260;
    const mx = 44;
    const my = _modalTop(H, mh);
    _drawProfileModalBg(ctx, mx, my, mw, mh, UI.stroke, 22);
    drawText(ctx, '✕', mx + mw - 24, my + 24, UI.muted, 14, 'center');
    this.manager.addTouchable(mx + mw - 44, my + 4, 44, 44, 'closeTopModal');
    drawText(ctx, state.aboutTitle || '说明', W / 2, my + 44, UI.text, TYPE.modalTitle, 'center', undefined, 700);
    drawWrappedText(ctx, state.aboutText || '', mx + 24, my + 84, mw - 48, 21, 'rgba(255,255,255,0.58)', TYPE.modalBody, 400);
  },

  closeTopModal() {
    state.showRecordsModal = false;
    state.showExitConfirm = false;
    state.showAbout = false;
  },
  openRecords() { state.showRecordsModal = true; },
  openExitConfirm() { state.showExitConfirm = true; },
  cancelExit() { state.showExitConfirm = false; },
  confirmExit() {
    state.showExitConfirm = false;
    // 退出登录：仅清掉本机的登录态与个人资料；其它本地数据（图鉴、设置、战队等）保留。
    store.updateUser({ isLoggedIn: false, nickName: '玩家', avatar: '' });
    // 让 home 场景再次进入时重新弹出授权登录弹窗
    const homeScene = this.manager.scenes && this.manager.scenes.home;
    if (homeScene) homeScene._authPromptDone = false;
    showToast('已退出登录');
    this.manager.switchTo('home');
  },
  editProfile() { showToast('资料编辑暂未开放'); },
  toggleSound() {
    state.soundOn = !state.soundOn;
    store.updateSettings({ soundOn: state.soundOn });
  },
  toggleVibration() {
    state.vibrationOn = !state.vibrationOn;
    store.updateSettings({ vibrationOn: state.vibrationOn });
  },
  contactService() { showToast('客服功能暂未开放'); },
  openAgreement() {
    state.aboutTitle = '用户协议';
    state.aboutText = '请遵守游戏规则，公平挑战，不使用外挂或异常方式刷取通关、排行与奖励数据。';
    state.showAbout = true;
  },
  openPrivacy() {
    state.aboutTitle = '隐私政策';
    state.aboutText = '游戏仅在本地保存昵称、设置、通关记录和气球资产等必要数据，用于恢复进度和展示个人信息。';
    state.showAbout = true;
  },
  goBack() { this.manager.switchTo('home'); },

  onTouch(type, x, y) {
    if (state.showRecordsModal || state.showExitConfirm || state.showAbout) return false;
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
