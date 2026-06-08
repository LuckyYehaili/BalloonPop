/**
 * 可滚动法律文档弹窗（隐私政策等）
 */
const { drawText, drawButtonGradient, roundRect, measureText, drawModalBackground } = require('./canvas-ui');
const { getPrivacyPolicyText, getChildrenPrivacyText } = require('../legal-documents');

const _state = {
  show: false,
  title: '',
  body: '',
  scrollY: 0,
  scrollMax: 0,
  bodyTop: 0,
  bodyH: 0,
  bodyLeft: 0,
  bodyWidth: 0,
  dragging: false,
  dragStartY: 0,
  dragStartScroll: 0
};

function _wrapLines(ctx, text, maxWidth, fontSize, fontWeight) {
  const w = fontWeight != null ? fontWeight : 400;
  const lines = [];
  const paragraphs = String(text || '').split('\n');
  paragraphs.forEach((para, pi) => {
    if (pi > 0) lines.push('');
    if (!para) return;
    let line = '';
    for (const ch of para) {
      const test = line + ch;
      if (measureText(ctx, test, fontSize, w) > maxWidth && line.length > 0) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  });
  return lines;
}

function openLegalDocument(title, body) {
  _state.show = true;
  _state.title = title || '说明';
  _state.body = body || '';
  _state.scrollY = 0;
  _state.scrollMax = 0;
  _state.dragging = false;
}

function openPrivacyPolicy() {
  openLegalDocument('隐私政策', getPrivacyPolicyText());
}

function openChildrenPrivacy() {
  openLegalDocument('儿童隐私保护声明及监护人须知', getChildrenPrivacyText());
}

function closeLegalModal() {
  _state.show = false;
  _state.dragging = false;
}

function isLegalModalOpen() {
  return _state.show;
}

function drawLegalModal(ctx, scene, W, H, opts) {
  if (!_state.show) return;
  opts = opts || {};
  const borderColor = opts.borderColor || 'rgba(125,211,252,0.32)';
  const closeHandler = opts.closeHandler || 'closeLegalModal';

  drawModalBackground(ctx, W, H);
  scene.manager.addTouchable(0, 0, W, H, '_legalModalAbsorb');

  const side = Math.max(24, Math.round(W * 0.06));
  const mw = W - side * 2;
  const mh = Math.min(H - 48, Math.floor(H * 0.82));
  const mx = side;
  const my = Math.max(24, (H - mh) / 2);
  const pad = 18;
  const titleH = 28;
  const btnH = 44;
  const bodyTop = my + pad + titleH + 8;
  const bodyH = mh - pad - titleH - 8 - pad - btnH - pad;
  const bodyLeft = mx + pad;
  const bodyWidth = mw - pad * 2;

  ctx.save();
  roundRect(ctx, mx, my, mw, mh, 20);
  const bg = ctx.createLinearGradient(mx, my, mx, my + mh);
  bg.addColorStop(0, 'rgba(15,23,42,0.98)');
  bg.addColorStop(1, 'rgba(8,5,20,0.98)');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  drawText(ctx, '✕', mx + mw - 22, my + pad + 4, 'rgba(255,255,255,0.5)', 14, 'center');
  scene.manager.addTouchable(mx + mw - 44, my + pad - 6, 44, 36, closeHandler);

  drawText(ctx, _state.title, W / 2, my + pad + titleH / 2, '#ffffff', 17, 'center', undefined, 700);

  ctx.save();
  roundRect(ctx, bodyLeft, bodyTop, bodyWidth, bodyH, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.clip();

  const fontSize = 12;
  const lineHeight = 18;
  const lines = _wrapLines(ctx, _state.body, bodyWidth - 16, fontSize, 400);
  const contentH = lines.length * lineHeight + 12;
  _state.scrollMax = Math.max(0, contentH - bodyH);
  if (_state.scrollY > _state.scrollMax) _state.scrollY = _state.scrollMax;
  if (_state.scrollY < 0) _state.scrollY = 0;

  _state.bodyTop = bodyTop;
  _state.bodyH = bodyH;
  _state.bodyLeft = bodyLeft;
  _state.bodyWidth = bodyWidth;

  let ly = bodyTop + 10 - _state.scrollY;
  lines.forEach((line) => {
    if (ly + lineHeight >= bodyTop && ly <= bodyTop + bodyH) {
      drawText(ctx, line, bodyLeft + 8, ly + lineHeight / 2, 'rgba(255,255,255,0.72)', fontSize, 'left', undefined, 400);
    }
    ly += lineHeight;
  });
  ctx.restore();

  const btnY = my + mh - pad - btnH;
  const btn = drawButtonGradient(
    ctx, bodyLeft, btnY, bodyWidth, btnH, '我已阅读',
    'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.88)', 14, 12, undefined, 500
  );
  scene.manager.addTouchable(btn.x, btn.y, btn.w, btn.h, closeHandler);
}

function handleLegalModalTouch(type, x, y) {
  if (!_state.show) return false;
  const inBody = x >= _state.bodyLeft && x <= _state.bodyLeft + _state.bodyWidth &&
    y >= _state.bodyTop && y <= _state.bodyTop + _state.bodyH;

  if (type === 'start' || type === 'begin') {
    if (inBody && _state.scrollMax > 0) {
      _state.dragging = true;
      _state.dragStartY = y;
      _state.dragStartScroll = _state.scrollY;
    } else {
      _state.dragging = false;
    }
    return false;
  }
  if ((type === 'move' || type === 'end') && _state.dragging) {
    const dy = y - _state.dragStartY;
    _state.scrollY = Math.max(0, Math.min(_state.scrollMax, _state.dragStartScroll - dy));
    if (type === 'end') _state.dragging = false;
    return true;
  }
  return false;
}

module.exports = {
  openLegalDocument,
  openPrivacyPolicy,
  openChildrenPrivacy,
  closeLegalModal,
  isLegalModalOpen,
  drawLegalModal,
  handleLegalModalTouch
};
