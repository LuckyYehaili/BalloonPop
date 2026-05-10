/**
 * 关卡 10 气球完成花束动效（自 Ballon-hot-backup/components/balloon-bouquet）
 * drawBouquetCompletionAnim：在矩形 (x,y,w,h) 内绘制，elapsedSec 为从通关起经过的秒数
 */
const { hexAlpha } = require('./balloon-renderer');

/** 10 个气球在花束中的目标位置（相对区域宽高比例） */
const BOUQUET_SLOTS = [
  { rx: 0.0, ry: -0.12, s: 1.0 },
  { rx: -0.18, ry: -0.05, s: 0.88 },
  { rx: 0.18, ry: -0.05, s: 0.88 },
  { rx: -0.1, ry: -0.2, s: 0.82 },
  { rx: 0.1, ry: -0.2, s: 0.82 },
  { rx: -0.24, ry: 0.06, s: 0.78 },
  { rx: 0.24, ry: 0.06, s: 0.78 },
  { rx: -0.06, ry: 0.1, s: 0.85 },
  { rx: 0.06, ry: 0.1, s: 0.85 },
  { rx: 0.0, ry: -0.26, s: 0.8 }
];

/** 每个气球的出场起始（从区域外飞入） */
const FLY_IN_STARTS = [
  { sx: -0.4, sy: -0.3 }, { sx: 1.4, sy: -0.2 }, { sx: -0.3, sy: -0.6 },
  { sx: 1.3, sy: -0.5 }, { sx: -0.5, sy: 0.4 }, { sx: 1.5, sy: 0.3 },
  { sx: -0.2, sy: 0.8 }, { sx: 1.2, sy: 0.7 }, { sx: -0.4, sy: 0.6 },
  { sx: 1.4, sy: -0.7 }
];

const DURATION = 1.6;

function drawMiniBalloon(ctx, shape, cx, cy, r, color, glowColor) {
  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 3;
  const grad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.35, r * 0.08, cx, cy, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, color + 'ee');
  grad.addColorStop(0.7, color);
  grad.addColorStop(1, color + '88');

  switch (shape) {
    case 'round':
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.28, cy - r * 0.28, r * 0.2, r * 0.12, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fill();
      break;
    case 'heart':
      ctx.save();
      ctx.translate(cx, cy - r * 0.15);
      ctx.scale(r / 40, r / 40);
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.bezierCurveTo(0, -40, -40, -40, -40, -8);
      ctx.bezierCurveTo(-40, 16, 0, 40, 0, 40);
      ctx.bezierCurveTo(0, 40, 40, 16, 40, -8);
      ctx.bezierCurveTo(40, -40, 0, -40, 0, -8);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.ellipse(-14, -18, 9, 5, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fill();
      ctx.restore();
      break;
    case 'star': {
      const spikes = 5, outerR = r, innerR = r * 0.42;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const a = (i * Math.PI) / spikes - Math.PI / 2;
        const rad = i % 2 === 0 ? outerR : innerR;
        if (i === 0) ctx.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        else ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(cx - r * 0.12, cy - r * 0.12, r * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fill();
      break;
    }
    case 'long':
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.5, r * 1.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.12, cy - r * 0.45, r * 0.1, r * 0.18, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fill();
      break;
    case 'animal':
      ctx.beginPath();
      ctx.arc(cx - r * 0.5, cy - r * 0.55, r * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + r * 0.5, cy - r * 0.55, r * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(cx - r * 0.22, cy - r * 0.1, r * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = '#1a0533';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + r * 0.22, cy - r * 0.1, r * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = '#1a0533';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.1, r * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = '#1a0533';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.18, cy - r * 0.28, r * 0.14, r * 0.08, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fill();
      break;
    case 'cloud': {
      const cc = [
        [0, 0, 0.6], [-0.45, 0.12, 0.4], [0.45, 0.12, 0.4],
        [-0.22, -0.38, 0.35], [0.22, -0.38, 0.35]
      ];
      ctx.beginPath();
      cc.forEach(([dx, dy, sr]) => ctx.arc(cx + dx * r, cy + dy * r, r * sr, 0, Math.PI * 2));
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.15, cy - r * 0.25, r * 0.12, r * 0.06, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fill();
      break;
    }
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.7, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.7, cy);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.7, cy);
      ctx.lineTo(cx, cy - r * 0.08);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();
      break;
    case 'twist':
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.25, cy - r * 0.3, r * 0.38, r * 0.65, -0.35, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.25, cy + r * 0.3, r * 0.38, r * 0.65, 0.35, 0, Math.PI * 2);
      ctx.fillStyle = color + 'cc';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.3, cy - r * 0.45, r * 0.08, r * 0.14, -0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fill();
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
        const px = cx + Math.cos(a) * r * 0.38;
        const py = cy + Math.sin(a) * r * 0.38;
        ctx.beginPath();
        ctx.arc(px, py, r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = color + 'cc';
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      break;
    case 'crown':
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.05, r * 0.78, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.78, cy - r * 0.28);
      ctx.lineTo(cx - r * 0.52, cy - r * 0.92);
      ctx.lineTo(cx - r * 0.18, cy - r * 0.38);
      ctx.lineTo(cx, cy - r * 0.96);
      ctx.lineTo(cx + r * 0.18, cy - r * 0.38);
      ctx.lineTo(cx + r * 0.52, cy - r * 0.92);
      ctx.lineTo(cx + r * 0.78, cy - r * 0.28);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
      break;
    default:
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawBow(ctx, bx, by, size, alpha, bowBounce) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const bounce = bowBounce || 0;

  ctx.beginPath();
  ctx.ellipse(bx - size * 0.4, by - size * 0.15, size * 0.45, size * 0.28, -0.3, 0, Math.PI * 2);
  const bl = ctx.createRadialGradient(bx - size * 0.4, by - size * 0.15, size * 0.05, bx - size * 0.4, by - size * 0.15, size * 0.45);
  bl.addColorStop(0, '#fff9c4');
  bl.addColorStop(0.5, '#ffd740');
  bl.addColorStop(1, '#ffab00');
  ctx.fillStyle = bl;
  ctx.shadowColor = '#ffd740';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.ellipse(bx + size * 0.4, by - size * 0.15, size * 0.45, size * 0.28, 0.3, 0, Math.PI * 2);
  const br = ctx.createRadialGradient(bx + size * 0.4, by - size * 0.15, size * 0.05, bx + size * 0.4, by - size * 0.15, size * 0.45);
  br.addColorStop(0, '#fff9c4');
  br.addColorStop(0.5, '#ffd740');
  br.addColorStop(1, '#ffab00');
  ctx.fillStyle = br;
  ctx.shadowColor = '#ffd740';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(bx, by + bounce * 0.3, size * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = '#ffab00';
  ctx.fill();

  const ribbonLen = size * 1.6;
  ctx.beginPath();
  ctx.moveTo(bx - size * 0.12, by + size * 0.1);
  ctx.quadraticCurveTo(bx - size * 0.5, by + ribbonLen * 0.6, bx - size * 0.6 + bounce, by + ribbonLen);
  ctx.quadraticCurveTo(bx - size * 0.15, by + ribbonLen * 0.5, bx - size * 0.05, by + size * 0.1);
  ctx.fillStyle = '#ffd740';
  ctx.shadowColor = '#ffab00';
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.moveTo(bx + size * 0.12, by + size * 0.1);
  ctx.quadraticCurveTo(bx + size * 0.5, by + ribbonLen * 0.6, bx + size * 0.6 - bounce, by + ribbonLen);
  ctx.quadraticCurveTo(bx + size * 0.15, by + ribbonLen * 0.5, bx + size * 0.05, by + size * 0.1);
  ctx.fillStyle = '#ffd740';
  ctx.shadowColor = '#ffab00';
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
}

function drawStringToBow(ctx, curX, curY, r, bCx, bowY, alphaOrStroke) {
  ctx.beginPath();
  ctx.moveTo(curX, curY + r * 0.85);
  ctx.quadraticCurveTo(
    curX + (bCx - curX) * 0.3,
    curY + r * 0.85 + (bowY - curY - r * 0.85) * 0.5,
    bCx,
    bowY
  );
  if (typeof alphaOrStroke === 'number') {
    ctx.strokeStyle = hexAlpha('#ffd740', alphaOrStroke * 0.7);
  } else {
    ctx.strokeStyle = alphaOrStroke;
  }
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{shape?:string,color?:string,glowColor?:string}>} balloons
 * @param {number} x,y,w,h 弹窗内花束区域（逻辑像素）
 * @param {number} elapsedSec 从 bouquetAnimStartMs 起算秒数
 */
function drawBouquetCompletionAnim(ctx, balloons, x, y, w, h, elapsedSec) {
  const list = balloons || [];
  const count = Math.min(list.length, 10);
  if (count === 0 || w < 8 || h < 8) return;

  const elapsed = Math.max(0, elapsedSec || 0);
  const t = Math.min(elapsed / DURATION, 1);
  const idleT = Math.max(0, elapsed - DURATION);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const W = w;
  const H = h;
  const bCx = x + W * 0.5;
  const tall = H > W * 1.08;
  // 略下移花束重心，减少区域底部相对统计条的留白
  const bCy = y + H * (tall ? 0.29 : 0.35);
  const ribbonBelow = W * 0.08 * 1.65 + 6;
  let bowY = y + H * (tall ? 0.70 : 0.65);
  if (bowY + ribbonBelow > y + H) {
    bowY = Math.max(y + H * 0.48, y + H - ribbonBelow);
  }
  const rySpread = tall ? 0.68 : 0.63;
  const baseR = Math.min(W, H) * 0.138;

  for (let i = 0; i < count; i++) {
    const slot = BOUQUET_SLOTS[i] || BOUQUET_SLOTS[0];
    const targetX = bCx + slot.rx * W * 0.72;
    const targetY = bCy + slot.ry * H * rySpread;
    const r = baseR * (slot.s || 0.85);
    const balloon = list[i] || { shape: 'round', color: '#ff6eb4', glowColor: '#ff6eb4' };

    let curX, curY, settleBob = 0;
    if (t < 1) {
      const appearDelay = i * 0.1;
      const appearT = Math.max(0, Math.min(1, (t - appearDelay) / 0.35));
      const start = FLY_IN_STARTS[i] || { sx: 0, sy: -1 };
      const startX = x + W * 0.5 + start.sx * W;
      const startY = bCy + start.sy * H;
      const flyIn = Math.min(appearT * 1.5, 1);
      curX = startX + (targetX - startX) * flyIn;
      curY = startY + (targetY - startY) * flyIn;
      settleBob = t >= 0.95 ? Math.sin(elapsed * 2.5 + i) * 1.5 : 0;
    } else {
      curX = targetX;
      curY = targetY;
      settleBob = Math.sin(idleT * 2.5 + i * 1.2) * 1.5;
    }

    const drawY = curY + settleBob;
    drawMiniBalloon(ctx, balloon.shape || 'round', curX, drawY, r, balloon.color || '#ff6eb4', balloon.glowColor || '#ff6eb4');

    if (t < 1) {
      if (t > 0.35 + i * 0.03 && t < 0.95) {
        const stringAlpha = Math.min(1, (t - 0.35 - i * 0.03) / 0.3);
        drawStringToBow(ctx, curX, drawY, r, bCx, bowY, stringAlpha);
      } else if (t >= 0.95) {
        drawStringToBow(ctx, curX, drawY, r, bCx, bowY, 'rgba(255,215,64,0.65)');
      }
    } else {
      drawStringToBow(ctx, curX, drawY, r, bCx, bowY, 'rgba(255,215,64,0.65)');
    }
  }

  const bowAlpha = t < 1 ? Math.max(0, Math.min(1, (t - 0.6) / 0.3)) : 1;
  if (bowAlpha > 0) {
    const bowSize = W * 0.08;
    const bowBounce = t >= 0.85 && t < 1 ? Math.sin((t - 0.85) * 8) * (1 - t) * 5 : t >= 1 ? Math.sin(idleT * 3) * 2 : 0;
    drawBow(ctx, bCx, bowY, bowSize, bowAlpha, bowBounce);
  }

  ctx.restore();
}

module.exports = { drawBouquetCompletionAnim };
