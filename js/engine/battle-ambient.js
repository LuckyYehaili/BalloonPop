/**
 * 充气挑战页 — 呼吸感背景 + 漂浮氛围装饰
 */
const { LEVEL_BG } = require('./canvas-ui');

function _lerp(a, b, t) { return a + (b - a) * t; }

function _parseHex(hex) {
  const h = (hex || '#000000').replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

function _mixHex(a, b, t) {
  const A = _parseHex(a);
  const B = _parseHex(b);
  const r = Math.round(_lerp(A.r, B.r, t));
  const g = Math.round(_lerp(A.g, B.g, t));
  const bch = Math.round(_lerp(A.b, B.b, t));
  return '#' + [r, g, bch].map((n) => n.toString(16).padStart(2, '0')).join('');
}

const THEME_GLOW = {
  candy: { a: 'rgba(255,120,200,', b: 'rgba(167,139,250,' },
  neon: { a: 'rgba(56,189,248,', b: 'rgba(244,114,182,' },
  lava: { a: 'rgba(255,120,80,', b: 'rgba(239,68,68,' },
  temple: { a: 'rgba(186,230,253,', b: 'rgba(167,139,250,' }
};

/** 软光斑：归一化坐标 + 漂移周期 */
const ORBS = [
  { x: 0.12, y: 0.14, r: 14, period: 11, phase: 0.0 },
  { x: 0.88, y: 0.18, r: 17, period: 13, phase: 0.2 },
  { x: 0.08, y: 0.42, r: 11, period: 9, phase: 0.45 },
  { x: 0.92, y: 0.38, r: 13, period: 10, phase: 0.65 },
  { x: 0.18, y: 0.72, r: 16, period: 14, phase: 0.15 },
  { x: 0.82, y: 0.68, r: 15, period: 12, phase: 0.85 },
  { x: 0.50, y: 0.08, r: 10, period: 8, phase: 0.33 },
  { x: 0.06, y: 0.86, r: 12, period: 15, phase: 0.55 },
  { x: 0.94, y: 0.82, r: 11, period: 11, phase: 0.72 },
  { x: 0.35, y: 0.22, r: 8, period: 7, phase: 0.9 },
  { x: 0.68, y: 0.52, r: 9, period: 9, phase: 0.12 },
  { x: 0.42, y: 0.88, r: 10, period: 10, phase: 0.4 }
];

/** 小装饰：emoji + 漂浮 */
const FLOAT_DECOR = [
  { emoji: '✨', x: 0.1, y: 0.28, size: 7, period: 4.2, phase: 0.1 },
  { emoji: '💫', x: 0.9, y: 0.32, size: 8, period: 5.0, phase: 0.35 },
  { emoji: '🎈', x: 0.14, y: 0.58, size: 9, period: 4.8, phase: 0.6 },
  { emoji: '⭐', x: 0.86, y: 0.55, size: 8, period: 4.5, phase: 0.8 },
  { emoji: '✦', x: 0.22, y: 0.16, size: 6, period: 3.8, phase: 0.25 },
  { emoji: '❋', x: 0.78, y: 0.14, size: 6, period: 4.0, phase: 0.5 },
  { emoji: '🫧', x: 0.08, y: 0.78, size: 8, period: 5.2, phase: 0.15 },
  { emoji: '✨', x: 0.92, y: 0.76, size: 7, period: 4.6, phase: 0.7 }
];

function _orbMotion(period, phase, t) {
  const p = (((t / period) + phase) % 1 + 1) % 1;
  const wave = Math.sin(p * Math.PI * 2);
  return {
    dx: wave * 6,
    dy: Math.cos(p * Math.PI * 2) * 10 - 5,
    alpha: 0.14 + (wave * 0.5 + 0.5) * 0.1
  };
}

function drawBreathingBackground(ctx, W, H, bgKey, t) {
  const base = LEVEL_BG[bgKey] || LEVEL_BG.candy;
  const breath = 0.5 + 0.5 * Math.sin(t * 0.65);
  const breath2 = 0.5 + 0.5 * Math.sin(t * 0.42 + 1.2);

  const top = _mixHex(base[0], base[1], breath * 0.35);
  const mid = _mixHex(base[1], base[2], breath2 * 0.4);
  const bottom = base[2];

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const glow = THEME_GLOW[bgKey] || THEME_GLOW.candy;
  const blobs = [
    { x: 0.2, y: 0.25, r: 0.28, phase: 0 },
    { x: 0.8, y: 0.7, r: 0.25, phase: 1.8 },
    { x: 0.5, y: 0.5, r: 0.21, phase: 3.1 }
  ];
  blobs.forEach((b, i) => {
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.55 + b.phase);
    const cx = b.x * W;
    const cy = b.y * H;
    const rad = Math.min(W, H) * b.r * (0.92 + pulse * 0.12);
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const col = i % 2 === 0 ? glow.a : glow.b;
    rg.addColorStop(0, col + (0.14 + pulse * 0.1).toFixed(3) + ')');
    rg.addColorStop(0.55, col + (0.05 + pulse * 0.04).toFixed(3) + ')');
    rg.addColorStop(1, col + '0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  });
}

function drawFloatOrbs(ctx, W, H, bgKey, t) {
  const glow = THEME_GLOW[bgKey] || THEME_GLOW.candy;
  ctx.save();
  ORBS.forEach((o, i) => {
    const m = _orbMotion(o.period, o.phase, t);
    const px = o.x * W + m.dx;
    const py = o.y * H + m.dy;
    const col = i % 2 === 0 ? glow.a : glow.b;
    const rg = ctx.createRadialGradient(px, py, 0, px, py, o.r);
    rg.addColorStop(0, col + m.alpha.toFixed(3) + ')');
    rg.addColorStop(0.6, col + (m.alpha * 0.35).toFixed(3) + ')');
    rg.addColorStop(1, col + '0)');
    ctx.beginPath();
    ctx.arc(px, py, o.r, 0, Math.PI * 2);
    ctx.fillStyle = rg;
    ctx.fill();
  });
  ctx.restore();
}

function drawFloatDecor(ctx, W, H, t) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  FLOAT_DECOR.forEach((d) => {
    const phase = (((t / d.period) + d.phase) % 1 + 1) % 1;
    const bob = Math.sin(phase * Math.PI * 2);
    const px = d.x * W + bob * 4;
    const py = d.y * H + bob * 8 - 4;
    const alpha = 0.2 + (bob * 0.5 + 0.5) * 0.14;
    const fs = d.size;
    ctx.font = fs + 'px sans-serif';
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(255,255,255,0.2)';
    ctx.shadowBlur = 3;
    ctx.fillText(d.emoji, px, py);
    ctx.shadowBlur = 0;
  });
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** 充气页全屏氛围（在 UI 之下绘制） */
function drawBattleAmbient(ctx, W, H, bgKey, time) {
  const t = time || 0;
  drawBreathingBackground(ctx, W, H, bgKey, t);
  drawFloatOrbs(ctx, W, H, bgKey, t);
  drawFloatDecor(ctx, W, H, t);
}

module.exports = {
  drawBattleAmbient
};
