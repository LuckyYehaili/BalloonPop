// Canvas UI Engine - 纯 Canvas 2D UI 渲染框架
// 包含: Button, Modal, Toast, ScrollView, Tab, Toggle, Text utilities

const UX = require('../ui-theme');
const NumFont = require('../fonts/numeric-font');
const { isDevelopEnv } = require('../platform');

let _cr = null; // current scene's touch handler

function setTouchHandler(scene) { _cr = scene; }

function _font(size, weight) {
  return `${weight || 600} ${size}px ${UX.font}`;
}

// ─── Text Utilities（数字段用 DIN Alternate，见 js/fonts/numeric-font.js）────────
function measureText(ctx, text, fontSize, fontWeight) {
  const w = fontWeight !== undefined && fontWeight !== null ? fontWeight : 600;
  const s = text == null ? '' : String(text);
  if (!s || !/[0-9]/.test(s)) {
    ctx.font = _font(fontSize, w);
    return ctx.measureText(s).width;
  }
  let tw = 0;
  for (const p of NumFont.segmentDigitRuns(s)) {
    ctx.font = p.num ? NumFont.fontNumericString(fontSize, w) : _font(fontSize, w);
    tw += ctx.measureText(p.s).width;
  }
  return tw;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} textBaseline 'middle' | 'top'
 */
function drawMixedLine(ctx, text, x, y, color, fontSize, align, shadowColor, fontWeight, textBaseline) {
  const w = fontWeight !== undefined && fontWeight !== null ? fontWeight : 600;
  const baseline = textBaseline || 'middle';
  const s = text == null ? '' : String(text);
  if (!s || !/[0-9]/.test(s)) {
    ctx.save();
    ctx.font = _font(fontSize, w);
    ctx.textAlign = align || 'left';
    ctx.textBaseline = baseline;
    ctx.fillStyle = color || '#ffffff';
    if (shadowColor) {
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = 10;
    }
    ctx.fillText(s, x, y);
    ctx.restore();
    return;
  }
  const parts = NumFont.segmentDigitRuns(s);
  let total = 0;
  ctx.save();
  for (const p of parts) {
    ctx.font = p.num ? NumFont.fontNumericString(fontSize, w) : _font(fontSize, w);
    total += ctx.measureText(p.s).width;
  }
  let curX = x;
  const al = align || 'left';
  if (al === 'center') curX = x - total / 2;
  else if (al === 'right') curX = x - total;
  ctx.textAlign = 'left';
  ctx.textBaseline = baseline;
  ctx.fillStyle = color || '#ffffff';
  if (shadowColor) {
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = 10;
  }
  for (const p of parts) {
    ctx.font = p.num ? NumFont.fontNumericString(fontSize, w) : _font(fontSize, w);
    ctx.fillText(p.s, curX, y);
    curX += ctx.measureText(p.s).width;
  }
  ctx.restore();
}

function drawText(ctx, text, x, y, color, fontSize, align, shadowColor, fontWeight) {
  const w = fontWeight !== undefined && fontWeight !== null ? fontWeight : 600;
  drawMixedLine(ctx, text, x, y, color, fontSize, align || 'left', shadowColor, w, 'middle');
}

/** 按字形视觉边界框居中绘制 emoji（解决 textAlign:center + middle 偏移问题） */
function drawEmojiCentered(ctx, emoji, cx, cy, color, fontSize, shadowColor, fontWeight) {
  const s = emoji == null ? '' : String(emoji);
  if (!s) return;
  const w = fontWeight !== undefined && fontWeight !== null ? fontWeight : 500;
  ctx.save();
  ctx.font = _font(fontSize, w);
  ctx.fillStyle = color || '#ffffff';
  if (shadowColor) {
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = 10;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(s);
  const left = m.actualBoundingBoxLeft || 0;
  const right = m.actualBoundingBoxRight || m.width || 0;
  const ascent = m.actualBoundingBoxAscent != null ? m.actualBoundingBoxAscent : m.fontBoundingBoxAscent;
  const descent = m.actualBoundingBoxDescent != null ? m.actualBoundingBoxDescent : m.fontBoundingBoxDescent;
  if (ascent != null && descent != null && right > 0) {
    const x = cx - (right - left) / 2;
    const y = cy + (ascent - descent) / 2;
    ctx.fillText(s, x, y);
  } else if (m.width > 0) {
    ctx.fillText(s, cx - m.width / 2, cy + fontSize * 0.35);
  } else {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, cx, cy);
  }
  ctx.restore();
}

/** 按最大宽度拆行（用于 Toast 等，不绘制） */
function wrapTextLines(ctx, text, maxWidth, fontSize) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    const test = line + ch;
    if (measureText(ctx, test, fontSize, 600) > maxWidth && line.length > 0) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, color, fontSize, fontWeight) {
  const w = fontWeight !== undefined && fontWeight !== null ? fontWeight : 550;
  let line = '';
  let ly = y;
  for (const ch of text) {
    const test = line + ch;
    if (measureText(ctx, test, fontSize, w) > maxWidth && line.length > 0) {
      drawMixedLine(ctx, line, x, ly, color, fontSize, 'left', undefined, w, 'top');
      line = ch;
      ly += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) drawMixedLine(ctx, line, x, ly, color, fontSize, 'left', undefined, w, 'top');
  return ly + lineHeight - y;
}

/** 按 maxWidth 估算换行后的文本块高度（不绘制） */
function measureWrappedTextHeight(ctx, text, maxWidth, lineHeight, fontSize, fontWeight) {
  const w = fontWeight !== undefined && fontWeight !== null ? fontWeight : 550;
  let line = '';
  let lines = 0;
  for (const ch of String(text || '')) {
    const test = line + ch;
    if (measureText(ctx, test, fontSize, w) > maxWidth && line.length > 0) {
      lines++;
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines++;
  return Math.max(lineHeight, lines * lineHeight);
}

// ─── Rounded Rect ───────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

// ─── Button ─────────────────────────────────
// Simple: returns [hitX, hitY, hitW, hitH] as clickable zone
function drawButton(ctx, x, y, w, h, text, bgColor, textColor, fontSize, radius) {
  radius = radius || Math.min(w, h) * 0.15;
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = bgColor || UX.glassLight;
  ctx.fill();
  if (text) {
    drawMixedLine(ctx, text, x + w / 2, y + h / 2, textColor || '#ffffff', fontSize || 24, 'center', undefined, 600, 'middle');
  }
  ctx.restore();
  return { x, y, w, h };
}

function drawButtonGradient(ctx, x, y, w, h, text, gradient, textColor, fontSize, radius, shadow, textWeight) {
  radius = radius || Math.min(w, h) * 0.15;
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  if (typeof gradient === 'function') {
    const g = gradient(ctx, x, y, w, h);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = gradient || 'rgba(255,255,255,0.08)';
  }
  ctx.fill();
  if (shadow) { ctx.shadowColor = shadow; ctx.shadowBlur = 20; ctx.fill(); ctx.shadowBlur = 0; }
  if (text) {
    const tw = textWeight !== undefined && textWeight !== null ? textWeight : 600;
    drawMixedLine(ctx, text, x + w / 2, y + h / 2, textColor || '#ffffff', fontSize || 24, 'center', undefined, tw, 'middle');
  }
  ctx.restore();
  return { x, y, w, h };
}

function drawIconButton(ctx, x, y, size, emoji, bgColor) {
  ctx.save();
  roundRect(ctx, x, y, size, size, size*0.3);
  ctx.fillStyle = bgColor || 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.strokeStyle = UX.stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = `${size*0.5}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x + size/2, y + size/2);
  ctx.restore();
  return { x, y, w: size, h: size };
}

// ─── Gradient Helpers（主 CTA / 成功 / 金色）──────────
function gradientPink(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, UX.violetDeep);
  g.addColorStop(0.45, '#6366f1');
  g.addColorStop(1, UX.accentDeep);
  return g;
}
function gradientGold(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#fde68a');
  g.addColorStop(0.5, UX.amber);
  g.addColorStop(1, '#d97706');
  return g;
}
function gradientGreen(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, UX.success);
  g.addColorStop(1, '#14b8a6');
  return g;
}

// 全局统一开关：紫色渐变胶囊，倒角 30（即 h/2 全圆角），返回触区 {x,y,w,h}
function drawToggle(ctx, x, y, on) {
  const w = 50;
  const h = 30;
  const r = h / 2;
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  if (on) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#7c4dff');
    g.addColorStop(1, '#a855f7');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(124,77,255,0.42)';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const knobR = r - 3;
  const knobCx = on ? x + w - r : x + r;
  const knobCy = y + h / 2;
  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.arc(knobCx, knobCy, knobR, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  return { x, y, w, h };
}

// ─── Modal System ───────────────────────────
let _modalStack = [];

function showModal(modal) { _modalStack.push(modal); }
function closeModal() { _modalStack.pop(); }
function closeAllModals() { _modalStack = []; }
function getModalStack() { return _modalStack; }

/** 全屏蒙层：黑色 85% 不透明（弹窗底层，无模糊） */
function drawModalDimOverlay(ctx, W, H) {
  if (!ctx) return;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawModalBackground(ctx, W, H) {
  drawModalDimOverlay(ctx, W, H);
}

function drawModal(ctx, modal, touchables) {
  // modal: logicalWidth/logicalHeight = 逻辑屏尺寸；height = 弹窗卡片高度（默认 400）
  const t = typeof ctx.getTransform === 'function' ? ctx.getTransform() : { a: 1, d: 1 };
  const sx = t.a || 1;
  const sy = t.d || 1;
  const screenW = modal.logicalWidth != null ? modal.logicalWidth : (modal.width != null ? modal.width : ctx.canvas.width / sx);
  const screenH = modal.logicalHeight != null ? modal.logicalHeight : ctx.canvas.height / sy;
  const side = 40;
  const mw = Math.max(200, screenW - side * 2);
  const mh = modal.height != null ? modal.height : 400;
  const mx = side;
  const my = Math.max(30, (screenH - mh) / 2);
  
  ctx.save();
  roundRect(ctx, mx, my, mw, mh, 32);
  const bg = ctx.createLinearGradient(mx, my, mx, my + mh);
  bg.addColorStop(0, 'rgba(22,28,46,0.98)');
  bg.addColorStop(1, 'rgba(10,14,26,0.98)');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = modal.borderColor || UX.strokeViolet;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Title
  if (modal.title) {
    const titleFs = Math.min(18, modal.titleSize != null ? modal.titleSize : 18);
    drawMixedLine(
      ctx, modal.title, mx + mw / 2, my + 40,
      modal.titleColor || '#ffffff', titleFs, 'center',
      modal.titleShadow, 700, 'middle'
    );
  }

  // Body content
  if (modal.renderBody) modal.renderBody(ctx, mx, my, mw, touchables);

  // Buttons
  if (modal.buttons && modal.buttons.length > 0) {
    const btnH = 48;
    const gap = 12;
    const btnFont = 14;
    let by = my + mh - btnH - 24;
    if (modal.buttons.length === 1) {
      const bw = mw - 56;
      const bx = mx + (mw - bw)/2;
      touchables.push(drawButtonGradient(ctx, bx, by, bw, btnH, modal.buttons[0].text, modal.buttons[0].gradient||'rgba(255,255,255,0.08)', modal.buttons[0].textColor||'#fff', btnFont, 16));
    } else if (modal.buttons.length === 2) {
      const bw = (mw - 56 - gap) / 2;
      const bx1 = mx + 28;
      touchables.push(drawButtonGradient(ctx, bx1, by, bw, btnH, modal.buttons[0].text, modal.buttons[0].gradient||'rgba(255,255,255,0.08)', modal.buttons[0].textColor||'#fff', btnFont, 16));
      const bx2 = bx1 + bw + gap;
      touchables.push(drawButtonGradient(ctx, bx2, by, bw, btnH, modal.buttons[1].text, modal.buttons[1].gradient||'rgba(255,255,255,0.08)', modal.buttons[1].textColor||'#fff', btnFont, 16));
    } else {
      const bw = mw - 56;
      for (let i = 0; i < modal.buttons.length; i++) {
        touchables.push(drawButtonGradient(ctx, mx+28, by, bw, btnH, modal.buttons[i].text, modal.buttons[i].gradient||'rgba(255,255,255,0.08)', modal.buttons[i].textColor||'#fff', btnFont, 16));
        by -= (btnH + gap);
      }
    }
  }

  // Close button
  if (modal.showClose !== false && modal.buttons && modal.buttons.length > 0) {
    const closeBtnSize = 44;
    const closeX = mx + mw - closeBtnSize - 16;
    const closeY = my + 12;
    ctx.save();
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('✕', closeX + closeBtnSize/2, closeY + closeBtnSize/2);
    ctx.restore();
    touchables.push({ x: closeX, y: closeY, w: closeBtnSize, h: closeBtnSize, handler: 'closeModal' });
  }
}

// ─── Toast System ───────────────────────────
let _toast = null;
let _toastTimer = null;

function showToast(text, icon, duration) {
  _toast = { text, icon: icon || '', duration: duration || 2000 };
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { _toast = null; }, duration || 2000);
}

function drawToast(ctx, W, H) {
  if (!_toast) return;
  const t = _toast.text;
  const fontSize = 14;
  const lineHeight = 20;
  const padX = 14, padY = 12;
  const maxInner = Math.max(100, Math.min(W - 32, 320) - padX * 2);
  const lines = wrapTextLines(ctx, t, maxInner, fontSize);
  ctx.save();
  let maxLineW = 0;
  lines.forEach((L) => { maxLineW = Math.max(maxLineW, measureText(ctx, L, fontSize, 600)); });
  const bw = Math.min(W - 24, Math.max(180, maxLineW + padX * 2 + 8));
  const bh = Math.max(44, lines.length * lineHeight + padY * 2);
  const bx = (W - bw) / 2;
  const by = H * 0.62;
  roundRect(ctx, bx, by, bw, bh, 12);
  ctx.fillStyle = 'rgba(17,24,39,0.90)';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 16;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = UX.stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  let ly = by + padY;
  lines.forEach((line) => {
    drawMixedLine(ctx, line, bx + bw / 2, ly, UX.text, fontSize, 'center', undefined, 600, 'top');
    ly += lineHeight;
  });
  ctx.restore();
}

// ─── Image Cache ────────────────────────────
const _imageCache = {};

function loadImages(paths, callback) {
  let loaded = 0;
  const total = paths.length;
  paths.forEach(p => {
    if (_imageCache[p]) { loaded++; if (loaded >= total) callback(); return; }
    const img = wx.createImage();
    img.onload = () => { _imageCache[p] = img; loaded++; if (loaded >= total) callback(); };
    img.onerror = (e) => {
      try { console.warn('[loadImages] failed:', p, e && (e.errMsg || e)); } catch (_) {}
      loaded++;
      if (loaded >= total) callback();
    };
    img.src = p;
  });
}

function getImage(path) { return _imageCache[path] || null; }

function drawImage(ctx, path, x, y, w, h) {
  const img = getImage(path);
  if (img) ctx.drawImage(img, x, y, w, h);
}

// ─── Background ────────────────────────────
function drawBackground(ctx, W, H, colors) {
  const c = colors || ['#0a0e18', '#111827', '#0c1222'];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  c.forEach((col, i) => g.addColorStop(i/(c.length-1), col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ─── Scene background helpers ──────────────
const LEVEL_BG = {
  candy: ['#0c1220', '#152238', '#0f172a'],
  neon: ['#070b14', '#111b2e', '#0b1324'],
  lava: ['#1a0a0f', '#2a1218', '#12080c'],
  temple: ['#060a12', '#0f172a', '#0b1020']
};

// ─── Scroll View ───────────────────────────
function beginScrollView(ctx, x, y, w, h, offsetY) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(0, -offsetY);
}

function endScrollView(ctx) {
  ctx.restore();
}

// ─── Touch Hit Testing ─────────────────────
function handleTouchTap(touchables, x, y, scene) {
  // 后注册的可点击区优先（与绘制顺序一致：上层控件后 push）
  for (let i = touchables.length - 1; i >= 0; i--) {
    const t = touchables[i];
    if (t.handler === 'closeModal') {
      if (x >= t.x && x <= t.x+t.w && y >= t.y && y <= t.y+t.h) {
        closeModal();
        return true;
      }
      continue;
    }
    if (x >= t.x && x <= t.x+t.w && y >= t.y && y <= t.y+t.h) {
      if (isDevelopEnv()) {
        console.log('[handleTouchTap] 命中触区: handler=' + (typeof t.handler === 'string' ? t.handler : 'function') + ' area=' + JSON.stringify({x:t.x,y:t.y,w:t.w,h:t.h}));
      }
      if (typeof t.handler === 'function') {
        try {
          t.handler(scene);
        } catch (e) {
          console.error('[handleTouchTap] 函数 handler 执行失败:', e.message, e.stack);
        }
        return true;
      } else if (typeof t.handler === 'string' && scene && typeof scene[t.handler] === 'function') {
        try {
          scene[t.handler](t.data);
        } catch (e) {
          console.error('[handleTouchTap] handler(' + t.handler + ') 执行失败:', e.message, e.stack);
        }
        return true;
      }
    }
  }
  return false;
}

// ─── Exports ───────────────────────────────
module.exports = {
  setTouchHandler,
  measureText, drawText, drawEmojiCentered, drawWrappedText, measureWrappedTextHeight,
  loadNumericFont: NumFont.loadNumericFont,
  setNumericFontSourceUrl: NumFont.setNumericFontSourceUrl,
  getNumericFontFaceFamily: NumFont.getNumericFontFaceFamily,
  roundRect, drawButton, drawButtonGradient, drawIconButton,
  gradientPink, gradientGold, gradientGreen, drawToggle,
  showModal, closeModal, closeAllModals, getModalStack,
  drawModalDimOverlay, drawModalBackground, drawModal,
  showToast, drawToast,
  loadImages, getImage, drawImage,
  drawBackground, LEVEL_BG,
  beginScrollView, endScrollView,
  handleTouchTap
};
