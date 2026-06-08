// Profile Scene — 我的（Canvas 版，参考移动端游戏个人页）
const {
  drawBackground, drawText, drawButtonGradient, drawImage, getImage, loadImages,
  showToast, gradientPink, roundRect, beginScrollView, endScrollView, drawWrappedText,
  drawModalBackground, measureText, drawToggle
} = require('../engine/canvas-ui');
const { drawPageHeader } = require('../engine/page-header');
const store = require('../store');
const { isUserLoggedIn } = require('../auth-guard');
const { BALLOON_TYPES } = require('../balloons');
const UX = require('../ui-theme');
const { getCapsuleLayout, centerModalY } = require('../layout-safe');
const { drawFormField } = require('../engine/form-field');
const legalModal = require('../engine/legal-modal');
const { getUserAgreementText } = require('../legal-documents');
const { chooseFeedbackImage: pickFeedbackImage, submitFeedbackWithImage, sanitizeMobilePhone, validateMobilePhone } = require('../cloud-feedback');
const { deleteUserAccountCloud } = require('../cloud-account');
const settingsModal = require('../engine/settings-modal');

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
  actionTuichu:   'images/ui/tuichu.png',
  recordJilu:     'images/ui/jilu.png',
  recordShijian:  'images/ui/shijian.png',
  actionOrder:    'images/ui/jilu.png',
  actionSetting:  'images/ui/setting.png'
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
  musicOn: true,
  vibrationOn: true,
  records: [],
  showRecordsModal: false,
  showExitConfirm: false,
  showDeleteAccountConfirm: false,
  deleteAccountSubmitting: false,
  showAbout: false,
  aboutTitle: '',
  aboutText: '',
  showFeedbackModal: false,
  feedbackTitle: '',
  feedbackContent: '',
  feedbackPhone: '',
  feedbackImagePath: '',
  feedbackSubmitting: false,
  feedbackTitleError: '',
  feedbackContentError: '',
  feedbackPhoneError: '',
  feedbackEditingField: null,
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

function _formatDurationMs(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m <= 0) return sec + '秒';
  return m + '分' + sec + '秒';
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
  // 顶部两格通关统计：图标相对卡片左缘再右移 16px
  const iconX = compact ? x + w / 2 : x + 40;
  // 下方三格紧凑统计：图标下移 8px，更贴近数值
  const iconY = compact ? y + 26 : y + h / 2;
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

  const tx = x + 64;
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
    settingsModal.closeSettingsModal();
    state.showExitConfirm = false;
    state.showAbout = false;
    state.showFeedbackModal = false;
    state.feedbackEditingField = null;
    try { loadImages(Object.values(PROFILE_IMG), () => {}); } catch (_) {}
  },

  _refresh() {
    const user = store.getUser();
    const settings = store.getSettings();
    const team = store.getTeam();
    const owned = store.getOwnedBalloons();
    const fullRecords = store.getFullClearRunHistory ? store.getFullClearRunHistory() : [];
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
      totalClears: fullRecords.length,
      todayClears: store.getTodayClears ? store.getTodayClears() : 0,
      normalCollected,
      legendCollected,
      bouquetCount: store.getBouquets ? store.getBouquets().length : 0,
      teamName: team ? team.name : '星云队',
      hasTeam: !!team,
      soundOn: settings.soundOn !== false,
      musicOn: settings.musicOn !== false,
      vibrationOn: settings.vibrationOn !== false,
      records: fullRecords
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
    const contentH = 760;
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
    const actionRows = [
      { label: '订单记录', icon: '🧾', iconImg: PROFILE_IMG.actionOrder,   handler: 'openOrders' },
      { label: '设置',     icon: '⚙', iconImg: PROFILE_IMG.actionSetting, handler: 'openSettings' },
      { label: '建议与反馈', icon: '✎', iconImg: PROFILE_IMG.actionKefu,   handler: 'openFeedback' },
      { label: '用户协议',  icon: '▤', iconImg: PROFILE_IMG.actionXieyi,   handler: 'openAgreement' },
      { label: '隐私政策',  icon: '▧', iconImg: PROFILE_IMG.actionYinsi,   handler: 'openPrivacy' }
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
      _drawActionRow(ctx, rowX, ry, rowW, actionRowH, r.icon, r.label, false, r.iconImg);
      this._addScrollTouchable(rowX, ry, rowW, actionRowH, r.handler);
    });

    const logoutGap = 24;
    const logoutRowH = 44;
    const accountActionGap = 8;
    const logoutY = y + actionCardH + logoutGap;
    drawText(ctx, '退出登录', W / 2, logoutY + logoutRowH / 2, UI.danger, TYPE.row, 'center', undefined, 600);
    this._addScrollTouchable(rowX, logoutY, rowW, logoutRowH, 'openExitConfirm');

    const deleteY = logoutY + logoutRowH + accountActionGap;
    drawText(ctx, '注销账号', W / 2, deleteY + logoutRowH / 2, 'rgba(255,255,255,0.38)', TYPE.row, 'center', undefined, 500);
    this._addScrollTouchable(rowX, deleteY, rowW, logoutRowH, 'openDeleteAccountConfirm');

    endScrollView(ctx);

    if (state.showRecordsModal || state.showExitConfirm || state.showDeleteAccountConfirm || state.showAbout || state.showFeedbackModal) {
      drawModalBackground(ctx, W, H);
    }
    if (state.showRecordsModal) this._drawRecordsModal(ctx, W, H);
    settingsModal.drawSettingsModal(ctx, this, W, H);
    if (state.showExitConfirm) this._drawExitModal(ctx, W, H);
    if (state.showDeleteAccountConfirm) this._drawDeleteAccountModal(ctx, W, H);
    if (state.showAbout) this._drawInfoModal(ctx, W, H);
    if (state.showFeedbackModal) this._drawFeedbackModal(ctx, W, H);
    if (legalModal.isLegalModalOpen()) {
      legalModal.drawLegalModal(ctx, scene, W, H, { borderColor: UI.stroke, closeHandler: 'closeLegalModal' });
    }
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

    const iconJilu = getImage(PROFILE_IMG.recordJilu);
    const iconSz = 28;
    if (iconJilu) {
      drawImage(ctx, PROFILE_IMG.recordJilu, mx + 20, my + 38, iconSz, iconSz);
    } else {
      drawText(ctx, '📋', mx + 34, my + 52, UI.neon, 18, 'center', undefined, 600);
    }
    drawText(ctx, '通关记录', mx + 54, my + 52, UI.text, TYPE.modalTitle, 'left', undefined, 700);
    _drawGlowCard(ctx, mx + mw - 88, my + 38, 66, 28, 14, 'rgba(255,80,200,0.30)', 'rgba(255,80,200,0.14)');
    drawText(ctx, '共 ' + state.records.length + ' 次', mx + mw - 55, my + 52, UI.neon, 11, 'center', undefined, 700);
    drawWrappedText(
      ctx, '四关全部通过计为 1 次；卡片展示通关时间与用时',
      mx + 24, my + 82, mw - 48, 18, UI.muted, TYPE.modalSmall, 400
    );

    const list = state.records.slice(0, 12);
    let y = my + 108;
    const iconShijian = getImage(PROFILE_IMG.recordShijian);
    if (!list.length) {
      drawText(ctx, '暂无完整通关记录', W / 2, my + sheetH / 2, UI.dim, TYPE.modalBody, 'center', undefined, 400);
    }
    list.forEach((r, i) => {
      const h = 74;
      const isFirst = i === 0;
      _drawGlowCard(ctx, mx + 14, y, mw - 28, h, 16, isFirst ? 'rgba(255,80,200,0.32)' : UI.strokeSoft, isFirst ? 'rgba(255,80,200,0.10)' : UI.panel);

      ctx.save();
      ctx.beginPath();
      ctx.arc(mx + 38, y + h / 2, 16, 0, Math.PI * 2);
      ctx.fillStyle = isFirst ? 'rgba(255,80,200,0.22)' : 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.restore();
      drawText(ctx, String(i + 1), mx + 38, y + h / 2, isFirst ? UI.neon : UI.muted, 11, 'center', undefined, 800);

      const timeStr = String(r.time || '').replace('T', ' ').slice(0, 16) || '未知时间';
      const tx = mx + 64;
      drawText(ctx, timeStr, tx, y + 26, UI.text, 13, 'left', undefined, 600);
      if (isFirst) {
        const tw = measureText(ctx, timeStr, 13, 600);
        const pillX = tx + tw + 8;
        const pillY = y + 14;
        const pillW = 40;
        const pillH = 22;
        ctx.save();
        roundRect(ctx, pillX, pillY, pillW, pillH, 11);
        ctx.fillStyle = 'rgba(40,12,55,0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,80,200,0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        drawText(ctx, '最近', pillX + pillW / 2, pillY + pillH / 2, UI.neon, 11, 'center', undefined, 700);
      }

      const durLabel = (r.durationMs > 0 ? _formatDurationMs(r.durationMs) : '—');
      const line2Y = y + 50;
      const clockSz = 16;
      const cx0 = tx;
      if (iconShijian) {
        drawImage(ctx, PROFILE_IMG.recordShijian, cx0, line2Y - clockSz / 2, clockSz, clockSz);
      } else {
        drawText(ctx, '⏱', cx0 + 8, line2Y, UI.muted, 13, 'center', undefined, 500);
      }
      drawText(ctx, '用时 ' + durLabel, cx0 + clockSz + 6, line2Y, UI.muted, 12, 'left', undefined, 400);

      const stamp = 26;
      const stampX = mx + mw - 14 - stamp;
      const stampY = y + (h - stamp) / 2;
      ctx.save();
      if (!isFirst) ctx.globalAlpha = 0.42;
      if (iconJilu) {
        drawImage(ctx, PROFILE_IMG.recordJilu, stampX, stampY, stamp, stamp);
      } else {
        drawText(ctx, '🏆', stampX + stamp / 2, stampY + stamp / 2, isFirst ? UI.gold : UI.muted, 18, 'center', undefined, 600);
      }
      ctx.restore();

      y += h + 10;
    });
    this.manager.addTouchable(0, 0, W, H, 'closeTopModal');
  },

  _drawDeleteAccountModal(ctx, W, H) {
    const mw = W - 92;
    const mh = 288;
    const mx = 46;
    const my = _modalTop(H, mh);
    _drawProfileModalBg(ctx, mx, my, mw, mh, 'rgba(255,80,80,0.22)', 24);
    drawText(ctx, '确认注销账号？', W / 2, my + 52, UI.text, TYPE.modalTitle, 'center', undefined, 800);
    drawWrappedText(
      ctx,
      '注销后将永久删除云端游戏数据（个人资料、图鉴库存、战队、礼物、订单与反馈等），本地数据同时清空，且无法恢复。',
      mx + 28, my + 82, mw - 56, 20, 'rgba(255,255,255,0.88)', TYPE.modalBody, 400
    );
    drawWrappedText(
      ctx,
      state.deleteAccountSubmitting ? '正在删除云端数据…' : '若你为队长，所属战队将自动解散。',
      mx + 28, my + 168, mw - 56, 18, UI.muted, TYPE.modalSmall, 400
    );
    const btnW = (mw - 58) / 2;
    const by = my + mh - 62;
    const disabled = state.deleteAccountSubmitting;
    const cancel = drawButtonGradient(
      ctx, mx + 22, by, btnW, 42, '再想想',
      disabled ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.07)',
      disabled ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.55)',
      TYPE.button, 14, undefined, 600
    );
    const okBtn = drawButtonGradient(
      ctx, mx + 36 + btnW, by, btnW, 42, disabled ? '处理中…' : '确认注销',
      disabled ? 'rgba(255,80,80,0.35)' : 'rgba(255,80,80,0.78)', '#fff',
      TYPE.button, 14, undefined, 700
    );
    if (!disabled) {
      this.manager.addTouchable(cancel.x, cancel.y, cancel.w, cancel.h, 'cancelDeleteAccount');
      this.manager.addTouchable(okBtn.x, okBtn.y, okBtn.w, okBtn.h, 'confirmDeleteAccount');
    }
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
    drawWrappedText(ctx, '下次进入需要重新授权登录，确定退出游戏？', mx + 28, my + 132, mw - 56, 20, 'rgba(255,255,255,0.88)', TYPE.modalBody, 400);
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
    settingsModal.closeSettingsModal();
    state.showExitConfirm = false;
    state.showDeleteAccountConfirm = false;
    state.showAbout = false;
    this.closeFeedbackModal();
  },

  _resetFeedbackForm() {
    state.feedbackTitle = '';
    state.feedbackContent = '';
    state.feedbackPhone = '';
    state.feedbackImagePath = '';
    state.feedbackSubmitting = false;
    state.feedbackTitleError = '';
    state.feedbackContentError = '';
    state.feedbackPhoneError = '';
    state.feedbackEditingField = null;
  },

  _initFeedbackKeyboardListeners() {
    if (this._feedbackKeyboardInited) return;
    this._feedbackKeyboardInited = true;
    if (typeof wx === 'undefined') return;
    wx.onKeyboardInput && wx.onKeyboardInput((res) => {
      if (state.feedbackEditingField === 'title') {
        state.feedbackTitle = res.value;
        state.feedbackTitleError = '';
      } else if (state.feedbackEditingField === 'content') {
        state.feedbackContent = res.value;
        state.feedbackContentError = '';
      } else if (state.feedbackEditingField === 'phone') {
        state.feedbackPhone = sanitizeMobilePhone(res.value);
        state.feedbackPhoneError = '';
      }
    });
    wx.onKeyboardConfirm && wx.onKeyboardConfirm((res) => {
      if (state.feedbackEditingField === 'title') {
        state.feedbackTitle = (res.value || '').trim();
        state.feedbackTitleError = '';
      } else if (state.feedbackEditingField === 'content') {
        state.feedbackContent = (res.value || '').trim();
        state.feedbackContentError = '';
      } else if (state.feedbackEditingField === 'phone') {
        state.feedbackPhone = sanitizeMobilePhone(res.value);
        state.feedbackPhoneError = '';
      }
      state.feedbackEditingField = null;
      wx.hideKeyboard && wx.hideKeyboard();
    });
    wx.onKeyboardComplete && wx.onKeyboardComplete(() => {
      state.feedbackEditingField = null;
    });
  },

  _measureFeedbackModalH() {
    const titleErrH = state.feedbackTitleError ? 22 : 0;
    const contentErrH = state.feedbackContentError ? 22 : 0;
    const phoneErrH = state.feedbackPhoneError ? 22 : 0;
    const PAD = 22;
    return PAD + 20 + 14
      + (12 + 8 + 40 + titleErrH) + 14
      + (12 + 8 + 64 + contentErrH) + 14
      + (12 + 8 + 40 + phoneErrH) + 14
      + (12 + 8 + 72) + 14
      + 42 + PAD;
  },

  _drawFeedbackModal(ctx, W, H) {
    const scene = this;
    const PAD = 22;
    const mw = W - 56;
    const mx = 28;
    const mh = this._measureFeedbackModalH();
    const my = centerModalY(H, mh, { minTop: 48, bottomInset: 24 });
    _drawProfileModalBg(ctx, mx, my, mw, mh, UI.stroke, 22);
    drawText(ctx, '✕', mx + mw - 24, my + 24, UI.muted, 14, 'center');
    scene.manager.addTouchable(mx + mw - 44, my + 4, 44, 44, 'closeFeedbackModal');
    drawText(ctx, '建议与反馈', W / 2, my + PAD + 10, UI.text, TYPE.modalTitle, 'center', undefined, 700);

    const fieldX = mx + PAD;
    const fieldW = mw - PAD * 2;
    let y = my + PAD + 20 + 14;
    const rTitle = drawFormField(ctx, {
      x: fieldX,
      y,
      w: fieldW,
      label: '标题',
      value: state.feedbackTitle,
      placeholder: '简要描述问题或建议',
      error: state.feedbackTitleError,
      active: state.feedbackEditingField === 'title'
    });
    scene.manager.addTouchable(rTitle.inputRect.x, rTitle.inputRect.y, rTitle.inputRect.w, rTitle.inputRect.h, 'editFeedbackTitle');

    const rContent = drawFormField(ctx, {
      x: fieldX,
      y: rTitle.bottom + 14,
      w: fieldW,
      label: '内容',
      value: state.feedbackContent,
      placeholder: '请详细说明，便于我们跟进处理',
      multiline: true,
      maxLines: 3,
      error: state.feedbackContentError,
      active: state.feedbackEditingField === 'content'
    });
    scene.manager.addTouchable(rContent.inputRect.x, rContent.inputRect.y, rContent.inputRect.w, rContent.inputRect.h, 'editFeedbackContent');

    const rPhone = drawFormField(ctx, {
      x: fieldX,
      y: rContent.bottom + 14,
      w: fieldW,
      label: '联系方式',
      value: state.feedbackPhone,
      placeholder: '请输入手机号',
      error: state.feedbackPhoneError,
      active: state.feedbackEditingField === 'phone'
    });
    scene.manager.addTouchable(rPhone.inputRect.x, rPhone.inputRect.y, rPhone.inputRect.w, rPhone.inputRect.h, 'editFeedbackPhone');

    const imgLabelY = rPhone.bottom + 14;
    drawText(ctx, '配图（选填）', fieldX, imgLabelY + 6, UI.muted, 12, 'left', undefined, 400);
    const imgBoxY = imgLabelY + 12 + 8;
    const imgBoxH = 72;
    ctx.save();
    roundRect(ctx, fieldX, imgBoxY, fieldW, imgBoxH, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (state.feedbackImagePath) {
      const thumb = 56;
      const thumbX = fieldX + 10;
      const thumbY = imgBoxY + (imgBoxH - thumb) / 2;
      try { loadImages([state.feedbackImagePath], () => {}); } catch (_) {}
      const img = getImage(state.feedbackImagePath);
      if (img) {
        ctx.save();
        roundRect(ctx, thumbX, thumbY, thumb, thumb, 10);
        ctx.clip();
        drawImage(ctx, state.feedbackImagePath, thumbX, thumbY, thumb, thumb);
        ctx.restore();
      } else {
        drawText(ctx, '🖼', thumbX + thumb / 2, thumbY + thumb / 2, UI.muted, 22, 'center', undefined, 400);
      }
      drawText(ctx, '已添加 1 张配图', fieldX + 78, imgBoxY + imgBoxH / 2 - 8, 'rgba(255,255,255,0.72)', 13, 'left', undefined, 500);
      const rm = drawButtonGradient(ctx, fieldX + fieldW - 68, imgBoxY + 20, 56, 32, '移除', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.72)', 12, 10, undefined, 600);
      scene.manager.addTouchable(rm.x, rm.y, rm.w, rm.h, 'removeFeedbackImage');
    } else {
      drawText(ctx, '＋ 添加配图', W / 2, imgBoxY + imgBoxH / 2, 'rgba(255,255,255,0.45)', 14, 'center', undefined, 500);
      scene.manager.addTouchable(fieldX, imgBoxY, fieldW, imgBoxH, 'chooseFeedbackImage');
    }

    const btnY = my + mh - PAD - 42;
    const btnW = (fieldW - 12) / 2;
    const cancel = drawButtonGradient(ctx, fieldX, btnY, btnW, 42, '取消', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.72)', TYPE.button, 12, undefined, 600);
    const submitLabel = state.feedbackSubmitting ? '提交中…' : '提交';
    const submit = drawButtonGradient(ctx, fieldX + btnW + 12, btnY, btnW, 42, submitLabel, gradientPink, '#fff', TYPE.button, 12, undefined, 700);
    if (!state.feedbackSubmitting) {
      scene.manager.addTouchable(cancel.x, cancel.y, cancel.w, cancel.h, 'closeFeedbackModal');
      scene.manager.addTouchable(submit.x, submit.y, submit.w, submit.h, 'submitFeedbackForm');
    }
  },

  openFeedback() {
    if (!isUserLoggedIn()) {
      showToast('请先登录后再提交反馈');
      return;
    }
    this._initFeedbackKeyboardListeners();
    this._resetFeedbackForm();
    state.showFeedbackModal = true;
  },

  closeFeedbackModal() {
    if (!state.showFeedbackModal) return;
    state.showFeedbackModal = false;
    state.feedbackEditingField = null;
    if (typeof wx !== 'undefined' && wx.hideKeyboard) wx.hideKeyboard();
  },

  editFeedbackTitle() {
    if (state.feedbackSubmitting) return;
    this._initFeedbackKeyboardListeners();
    state.feedbackEditingField = 'title';
    if (typeof wx !== 'undefined' && wx.showKeyboard) {
      wx.showKeyboard({
        defaultValue: state.feedbackTitle || '',
        maxLength: 30,
        multiple: false,
        confirmHold: false,
        confirmType: 'next'
      });
    }
  },

  editFeedbackContent() {
    if (state.feedbackSubmitting) return;
    this._initFeedbackKeyboardListeners();
    state.feedbackEditingField = 'content';
    if (typeof wx !== 'undefined' && wx.showKeyboard) {
      wx.showKeyboard({
        defaultValue: state.feedbackContent || '',
        maxLength: 500,
        multiple: true,
        confirmHold: true,
        confirmType: 'next'
      });
    }
  },

  editFeedbackPhone() {
    if (state.feedbackSubmitting) return;
    this._initFeedbackKeyboardListeners();
    state.feedbackEditingField = 'phone';
    if (typeof wx !== 'undefined' && wx.showKeyboard) {
      wx.showKeyboard({
        defaultValue: state.feedbackPhone || '',
        maxLength: 11,
        multiple: false,
        confirmHold: false,
        confirmType: 'done'
      });
    }
  },

  chooseFeedbackImage() {
    if (state.feedbackSubmitting) return;
    pickFeedbackImage()
      .then((path) => {
        state.feedbackImagePath = path;
        try { loadImages([path], () => {}); } catch (_) {}
      })
      .catch((err) => {
        if (err && err.errMsg && String(err.errMsg).indexOf('cancel') >= 0) return;
        showToast((err && err.message) || '选图失败');
      });
  },

  removeFeedbackImage() {
    if (state.feedbackSubmitting) return;
    state.feedbackImagePath = '';
  },

  submitFeedbackForm() {
    if (state.feedbackSubmitting) return;
    const title = (state.feedbackTitle || '').trim();
    const content = (state.feedbackContent || '').trim();
    const phoneResult = validateMobilePhone(state.feedbackPhone);
    state.feedbackTitleError = '';
    state.feedbackContentError = '';
    state.feedbackPhoneError = '';
    let ok = true;
    if (!title) {
      state.feedbackTitleError = '请填写标题';
      ok = false;
    } else if (title.length > 30) {
      state.feedbackTitleError = '标题不超过 30 字';
      ok = false;
    }
    if (!content) {
      state.feedbackContentError = '请填写内容';
      ok = false;
    } else if (content.length > 500) {
      state.feedbackContentError = '内容不超过 500 字';
      ok = false;
    }
    if (!phoneResult.ok) {
      state.feedbackPhoneError = phoneResult.reason;
      ok = false;
    }
    if (!ok) return;

    const scene = this;
    state.feedbackSubmitting = true;
    state.feedbackEditingField = null;
    if (typeof wx !== 'undefined' && wx.hideKeyboard) wx.hideKeyboard();
    showToast('提交中…');
    submitFeedbackWithImage({
      title,
      content,
      phone: phoneResult.phone,
      imagePath: state.feedbackImagePath
    })
      .then(() => {
        showToast('提交成功，感谢反馈');
        scene.closeFeedbackModal();
        scene._resetFeedbackForm();
      })
      .catch((err) => {
        showToast((err && err.message) || '提交失败');
      })
      .finally(() => {
        state.feedbackSubmitting = false;
      });
  },

  openRecords() {
    state.showRecordsModal = true;
    this._refresh();
  },
  openExitConfirm() { state.showExitConfirm = true; },
  cancelExit() { state.showExitConfirm = false; },
  confirmExit() {
    state.showExitConfirm = false;
    // 退出登录：仅清掉本机的登录态与个人资料；其它本地数据（图鉴、设置、战队等）保留。
    store.updateUser({ isLoggedIn: false, nickName: '玩家', avatar: '' });
    showToast('已退出登录');
    this.manager.switchTo('home', { requireLogin: true });
  },
  openDeleteAccountConfirm() {
    if (!isUserLoggedIn()) {
      showToast('请先登录后再注销账号');
      return;
    }
    state.showDeleteAccountConfirm = true;
  },
  cancelDeleteAccount() {
    if (state.deleteAccountSubmitting) return;
    state.showDeleteAccountConfirm = false;
  },
  confirmDeleteAccount() {
    if (state.deleteAccountSubmitting) return;
    const scene = this;
    state.deleteAccountSubmitting = true;
    showToast('正在注销…');
    deleteUserAccountCloud().then((result) => {
      state.deleteAccountSubmitting = false;
      if (!result.success) {
        showToast(result.msg || '注销失败，请稍后重试');
        return;
      }
      state.showDeleteAccountConfirm = false;
      showToast('账号已注销');
      scene._exitAfterAccountDeletion();
    });
  },
  _exitAfterAccountDeletion() {
    if (typeof wx !== 'undefined' && typeof wx.exitMiniProgram === 'function') {
      try {
        wx.exitMiniProgram({
          fail: () => {
            showToast('数据已清空，请从胶囊关闭小游戏');
            this.manager.switchTo('home', { requireLogin: true });
          }
        });
      } catch (e) {
        this.manager.switchTo('home', { requireLogin: true });
      }
    } else {
      this.manager.switchTo('home', { requireLogin: true });
    }
  },
  openOrders() {
    if (!isUserLoggedIn()) {
      showToast('请先登录后查看订单');
      return;
    }
    this.manager.switchTo('order-list');
  },
  openSettings() { settingsModal.openSettingsModal(); },
  openAgreement() {
    legalModal.openLegalDocument('用户协议', getUserAgreementText());
  },
  openPrivacy() {
    legalModal.openPrivacyPolicy();
  },
  closeLegalModal() {
    legalModal.closeLegalModal();
  },
  _legalModalAbsorb() { /* 阻断穿透 */ },

  handleBackButton() {
    if (state.showFeedbackModal) {
      this.closeFeedbackModal();
      return true;
    }
    if (state.showDeleteAccountConfirm) {
      if (!state.deleteAccountSubmitting) state.showDeleteAccountConfirm = false;
      return true;
    }
    if (state.showExitConfirm) {
      state.showExitConfirm = false;
      return true;
    }
    if (settingsModal.isSettingsModalOpen()) {
      settingsModal.closeSettingsModal();
      return true;
    }
    if (state.showRecordsModal || state.showAbout) {
      this.closeTopModal();
      return true;
    }
    return false;
  },

  goBack() { this.manager.switchTo('home'); },

  onTouch(type, x, y) {
    if (legalModal.handleLegalModalTouch(type, x, y)) return true;
    if (legalModal.isLegalModalOpen()) return false;
    if (state.showRecordsModal || settingsModal.isSettingsModalOpen() || state.showExitConfirm || state.showDeleteAccountConfirm || state.showAbout || state.showFeedbackModal) return false;
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
