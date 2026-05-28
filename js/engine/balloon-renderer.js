// Balloon renderer - 纯 Canvas 2D 气球绘制 (从 balloon-display 组件迁移)
const { createRaf } = require('../raf');
const raf = createRaf();

function hexAlpha(hex, a) {
  const alpha = Math.max(0, Math.min(255, Math.round(a*255))).toString(16).padStart(2,'0');
  return hex + alpha;
}

function glowAlpha(color, a) {
  const h = (color || '#ff6eb4').replace('#', '');
  const alpha = Math.max(0, Math.min(255, Math.round(a * 255))).toString(16).padStart(2, '0');
  return '#' + h + alpha;
}

/** 气球背后环境光晕（独立绘制，不依赖 fillText 的 shadowBlur，避免充气变大后光晕消失） */
function drawBalloonAmbientHalo(ctx, tx, ty, r, glowColor, color) {
  const gc = glowColor || color || '#ff6eb4';
  const haloR = r * 1.65;
  const g = ctx.createRadialGradient(tx, ty, r * 0.12, tx, ty, haloR);
  g.addColorStop(0, glowAlpha(gc, 0.28));
  g.addColorStop(0.45, glowAlpha(gc, 0.12));
  g.addColorStop(1, glowAlpha(gc, 0));
  ctx.save();
  ctx.beginPath();
  ctx.arc(tx, ty, haloR, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

function drawBalloonShape(ctx, shape, cx, cy, r, balloonColor, glowColor, tremble, pressure, isSuccess, time, dpr, hideRope) {
  const tx = cx + (tremble||0);
  const ty = cy + (tremble||0)*0.5;
  dpr = dpr || 2;
  const noRope = hideRope === true;
  // 绳子长度跟随气球半径，避免气球小时绳子过长（最长约 r 一倍）
  const ropeLen = Math.max(28, Math.min(72, r * 1.0));
  const ropeMid = ropeLen * 0.45;
  const ropeBend = Math.max(8, ropeLen * 0.18);

  ctx.shadowColor = glowColor;
  ctx.shadowBlur = Math.round(2/dpr);

  const grad = ctx.createRadialGradient(tx - r*0.25, ty - r*0.3, r*0.08, tx, ty, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.2, balloonColor + 'ee');
  grad.addColorStop(0.7, balloonColor);
  grad.addColorStop(1, balloonColor + 'dd');

  switch (shape) {
    case 'round': {
      ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI*2); ctx.fillStyle = grad; ctx.fill(); ctx.shadowBlur = 0;
      if (!noRope) {
        ctx.beginPath(); ctx.ellipse(tx, ty+r+6, 5, 8, 0, 0, Math.PI*2); ctx.fillStyle = balloonColor; ctx.fill();
        ctx.beginPath(); ctx.moveTo(tx, ty+r+14); ctx.quadraticCurveTo(tx+ropeBend, ty+r+14+ropeMid, tx, ty+r+14+ropeLen); ctx.strokeStyle = balloonColor+'80'; ctx.lineWidth = 2; ctx.stroke();
      }
      break;
    }
    case 'heart': {
      const s = r/55; ctx.save(); ctx.translate(tx, ty-r*0.1); ctx.scale(s,s);
      ctx.beginPath(); ctx.moveTo(0,-10); ctx.bezierCurveTo(0,-50,-55,-50,-55,-10); ctx.bezierCurveTo(-55,20,0,55,0,55); ctx.bezierCurveTo(0,55,55,20,55,-10); ctx.bezierCurveTo(55,-50,0,-50,0,-10);
      ctx.fillStyle = grad; ctx.fill(); ctx.shadowBlur = 0;
      ctx.restore();
      if (!noRope) {
        ctx.beginPath(); ctx.moveTo(tx, ty+r+10); ctx.quadraticCurveTo(tx+ropeBend, ty+r+10+ropeMid, tx, ty+r+10+ropeLen); ctx.strokeStyle = balloonColor+'80'; ctx.lineWidth = 2; ctx.stroke();
      }
      break;
    }
    case 'star': {
      const spikes=5, outerR=r, innerR=r*0.45;
      ctx.beginPath();
      for(let i=0;i<spikes*2;i++){const a=(i*Math.PI)/spikes-Math.PI/2;const rad=i%2===0?outerR:innerR;if(i===0)ctx.moveTo(tx+Math.cos(a)*rad,ty+Math.sin(a)*rad);else ctx.lineTo(tx+Math.cos(a)*rad,ty+Math.sin(a)*rad);}
      ctx.closePath(); ctx.fillStyle = grad; ctx.fill(); ctx.shadowBlur = 0;
      if (!noRope) {
        ctx.beginPath(); ctx.moveTo(tx, ty+r*0.5+10); ctx.quadraticCurveTo(tx+ropeBend, ty+r*0.5+10+ropeMid, tx, ty+r*0.5+10+ropeLen); ctx.strokeStyle = balloonColor+'80'; ctx.lineWidth = 2; ctx.stroke();
      }
      break;
    }
    case 'long': {
      const lg=ctx.createRadialGradient(tx-r*0.2,ty-r*0.5,r*0.05,tx,ty,r*1.2); lg.addColorStop(0,'#fff');lg.addColorStop(0.25,balloonColor+'ee');lg.addColorStop(1,balloonColor+'dd');
      ctx.beginPath(); ctx.ellipse(tx,ty,r*0.55,r*1.2,0,0,Math.PI*2); ctx.fillStyle = lg; ctx.fill(); ctx.shadowBlur = 0;
      if (!noRope) {
        ctx.beginPath(); ctx.ellipse(tx,ty+r*1.2+5,5,8,0,0,Math.PI*2); ctx.fillStyle = balloonColor; ctx.fill();
        ctx.beginPath(); ctx.moveTo(tx,ty+r*1.2+13); ctx.quadraticCurveTo(tx+ropeBend,ty+r*1.2+13+ropeMid,tx,ty+r*1.2+13+ropeLen); ctx.strokeStyle = balloonColor+'80'; ctx.lineWidth=2; ctx.stroke();
      }
      break;
    }
    case 'animal': {
      ctx.beginPath(); ctx.arc(tx-r*0.55,ty-r*0.65,r*0.38,0,Math.PI*2); ctx.fillStyle = balloonColor; ctx.fill();
      ctx.beginPath(); ctx.arc(tx+r*0.55,ty-r*0.65,r*0.38,0,Math.PI*2); ctx.fillStyle = balloonColor; ctx.fill();
      ctx.beginPath(); ctx.arc(tx,ty,r,0,Math.PI*2); ctx.fillStyle = grad; ctx.fill(); ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(tx-r*0.28,ty-r*0.15,r*0.1,0,Math.PI*2); ctx.fillStyle = '#1a0533'; ctx.fill();
      ctx.beginPath(); ctx.arc(tx+r*0.28,ty-r*0.15,r*0.1,0,Math.PI*2); ctx.fillStyle = '#1a0533'; ctx.fill();
      ctx.beginPath(); ctx.arc(tx,ty+r*0.12,r*0.1,0,Math.PI*2); ctx.fillStyle = '#1a0533'; ctx.fill();
      if (!noRope) {
        ctx.beginPath(); ctx.moveTo(tx,ty+r+6); ctx.quadraticCurveTo(tx+ropeBend,ty+r+6+ropeMid,tx,ty+r+6+ropeLen); ctx.strokeStyle = balloonColor+'80'; ctx.lineWidth=2; ctx.stroke();
      }
      break;
    }
    case 'cloud': {
      ctx.beginPath(); ctx.arc(tx,ty,r*0.7,0,Math.PI*2); ctx.arc(tx-r*0.55,ty+r*0.15,r*0.5,0,Math.PI*2); ctx.arc(tx+r*0.55,ty+r*0.15,r*0.5,0,Math.PI*2);
      ctx.arc(tx-r*0.3,ty-r*0.45,r*0.42,0,Math.PI*2); ctx.arc(tx+r*0.3,ty-r*0.45,r*0.42,0,Math.PI*2);
      ctx.fillStyle = grad; ctx.fill(); ctx.shadowBlur = 0;
      if (!noRope) {
        ctx.beginPath(); ctx.moveTo(tx,ty+r*0.65+8); ctx.quadraticCurveTo(tx+ropeBend,ty+r*0.65+8+ropeMid,tx,ty+r*0.65+8+ropeLen); ctx.strokeStyle = balloonColor+'80'; ctx.lineWidth=2; ctx.stroke();
      }
      break;
    }
    case 'diamond': {
      ctx.beginPath(); ctx.moveTo(tx,ty-r); ctx.lineTo(tx+r*0.75,ty); ctx.lineTo(tx,ty+r); ctx.lineTo(tx-r*0.75,ty); ctx.closePath(); ctx.fillStyle=grad; ctx.fill(); ctx.shadowBlur=0;
      if (!noRope) {
        ctx.beginPath(); ctx.moveTo(tx,ty+r*0.5+8); ctx.quadraticCurveTo(tx+ropeBend,ty+r*0.5+8+ropeMid,tx,ty+r*0.5+8+ropeLen); ctx.strokeStyle=balloonColor+'80'; ctx.lineWidth=2; ctx.stroke();
      }
      break;
    }
    case 'twist': {
      ctx.beginPath(); ctx.ellipse(tx-r*0.28,ty-r*0.38,r*0.42,r*0.72,-0.35,0,Math.PI*2); ctx.fillStyle=grad; ctx.fill(); ctx.shadowBlur=0;
      ctx.beginPath(); ctx.ellipse(tx+r*0.28,ty+r*0.38,r*0.42,r*0.72,0.35,0,Math.PI*2); ctx.fillStyle=balloonColor+'cc'; ctx.fill();
      if (!noRope) {
        ctx.beginPath(); ctx.moveTo(tx,ty+r*0.7+8); ctx.quadraticCurveTo(tx+ropeBend,ty+r*0.7+8+ropeMid,tx,ty+r*0.7+8+ropeLen); ctx.strokeStyle=balloonColor+'80'; ctx.lineWidth=2; ctx.stroke();
      }
      break;
    }
    case 'flower': {
      for(let i=0;i<5;i++){const a=(i*Math.PI*2)/5-Math.PI/2;const px=tx+Math.cos(a)*r*0.45,py=ty+Math.sin(a)*r*0.45;const pg=ctx.createRadialGradient(px,py,r*0.05,px,py,r*0.45);pg.addColorStop(0,balloonColor+'ee');pg.addColorStop(0.3,balloonColor+'ee');pg.addColorStop(1,balloonColor+'dd');ctx.beginPath();ctx.arc(px,py,r*0.42,0,Math.PI*2);ctx.fillStyle=pg;ctx.fill();}
      ctx.shadowBlur=0; ctx.beginPath(); ctx.arc(tx,ty,r*0.32,0,Math.PI*2); ctx.fillStyle=balloonColor+'cc'; ctx.fill();
      if (!noRope) {
        ctx.beginPath(); ctx.moveTo(tx,ty+r*0.42+8); ctx.quadraticCurveTo(tx+ropeBend,ty+r*0.42+8+ropeMid,tx,ty+r*0.42+8+ropeLen); ctx.strokeStyle=balloonColor+'80'; ctx.lineWidth=2; ctx.stroke();
      }
      break;
    }
    case 'crown': {
      ctx.beginPath(); ctx.arc(tx,ty+r*0.1,r*0.85,0,Math.PI*2); ctx.fillStyle=grad; ctx.fill(); ctx.shadowBlur=0;
      ctx.beginPath(); ctx.moveTo(tx-r*0.85,ty-r*0.3); ctx.lineTo(tx-r*0.6,ty-r); ctx.lineTo(tx-r*0.22,ty-r*0.45); ctx.lineTo(tx,ty-r*1.05); ctx.lineTo(tx+r*0.22,ty-r*0.45); ctx.lineTo(tx+r*0.6,ty-r); ctx.lineTo(tx+r*0.85,ty-r*0.3); ctx.closePath(); ctx.fillStyle=grad; ctx.fill();
      [tx-r*0.6,tx,tx+r*0.6].forEach((gx,gi)=>{ctx.beginPath();ctx.arc(gx,ty-r*0.85,r*0.1,0,Math.PI*2);ctx.fillStyle=['#ff1744','#ffd740','#00e5ff'][gi];ctx.fill();});
      if (!noRope) {
        ctx.beginPath();ctx.moveTo(tx,ty+r*0.95+6);ctx.quadraticCurveTo(tx+ropeBend,ty+r*0.95+6+ropeMid,tx,ty+r*0.95+6+ropeLen);ctx.strokeStyle=balloonColor+'80';ctx.lineWidth=2;ctx.stroke();
      }
      break;
    }
    default: {
      ctx.beginPath(); ctx.arc(tx,ty,r,0,Math.PI*2); ctx.fillStyle=grad; ctx.fill(); ctx.shadowBlur=0;
    }
  }
  ctx.shadowBlur = 0;
}

// ─── Balloon Rendering Full (优化版) ────────
let _particles = [];
let _time = 0;
let _displayPressure = 0; // 平滑过渡的气压值
let _balloonCX = 160, _balloonCY = 200; // 记录当前气球中心 (用于爆炸定位)

function drawBalloon(ctx, W, areaTop, areaH, pressure, color, glowColor, shape, isExploding, isSuccess, dpr, emoji) {
  _time += 0.04;
  // 平滑动画：display pressure 跟随 real pressure
  _displayPressure += (pressure - _displayPressure) * 0.18;
  const dp = _displayPressure;

  // 计算气球中心 (areaTop 为游戏区顶部Y, areaH 为游戏区高度)
  _balloonCX = W / 2;
  _balloonCY = areaTop + areaH * 0.48;
  
  if (isExploding) {
    _particles = _particles.filter(p => p.life > 0);
    _particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.5; p.life -= 0.022;
      const alpha = Math.floor(p.life * 255).toString(16).padStart(2, '0');
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color + alpha;
      ctx.shadowColor = p.color; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
    });
    // 爆炸中心闪光 (以气球中心为准)
    if (_particles.length > 0 && _particles[0].life > 0.7) {
      const flashAlpha = (_particles[0].life - 0.7) / 0.3;
      ctx.beginPath(); ctx.arc(_balloonCX, _balloonCY, 80 * flashAlpha, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha * 0.85})`;
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 40; ctx.fill(); ctx.shadowBlur = 0;
    }
  } else {
    // baseR 自适应可用区域：避免在大屏真机上气球过小、绳子过长
    // 兼顾横向 W 与纵向 areaH，并夹在 [60, 100] 之间
    const baseR = Math.max(60, Math.min(100, Math.min(W * 0.22, areaH * 0.28)));
    // idle 约 0.55x；高压至满气在原先线性放大上再约 +20%（二次项压低端、顶在满气）
    const t = dp / 100;
    const scale = 0.55 + t * 0.6 + t * t * 0.23;
    const r = baseR * scale;
    const cx = _balloonCX;
    const cy = _balloonCY;
    // 高压时震颤 (匹配备份: >=80 && <100)
    const tremble = dp >= 80 && dp < 100 ? Math.sin(_time * 15) * (dp - 79) * 0.3 : 0;

    if (emoji) {
      const tx = cx + tremble;
      const ty = cy + tremble * 0.5;
      const emojiSize = Math.round(r * 1.35);

      // 环境光晕先画（随 r 缩放，充气过程中不会消失）
      drawBalloonAmbientHalo(ctx, tx, ty, r, glowColor, color);

      // 绳子先画、emoji 后画；绳子起点伸进 emoji 内部，视觉上会贴住主体边缘。
      ctx.save();
      const ropeTop = ty + emojiSize * 0.28;
      const ropeLen = Math.max(43, Math.min(91, r * 1.26));
      const ropeBend = Math.max(8, ropeLen * 0.18);
      ctx.beginPath();
      ctx.moveTo(tx, ropeTop);
      ctx.quadraticCurveTo(tx + ropeBend, ropeTop + ropeLen * 0.45, tx, ropeTop + ropeLen);
      ctx.strokeStyle = (color || '#ff6eb4') + '99';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // 用 emoji 本身作为完整气球外形；字号随气压放大，保留充气反馈。
      ctx.save();
      ctx.font = emojiSize + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = glowColor || color;
      ctx.shadowBlur = Math.max(14, Math.round(r * 0.22));
      ctx.fillStyle = '#ffffff';
      ctx.fillText(emoji, tx, ty);
      ctx.shadowBlur = 0;
      ctx.restore();
    } else {
      drawBalloonAmbientHalo(ctx, cx + tremble, cy + tremble * 0.5, r, glowColor, color);
      // 无 emoji 的旧数据仍走矢量气球外形。
      drawBalloonShape(ctx, shape, cx, cy, r, color, glowColor, tremble, dp, isSuccess, _time, dpr);
    }

    // 成功光环 (匹配备份的脉冲光环)
    if (isSuccess) {
      const pulse = Math.sin(_time * 8) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 20 + pulse * 20, 0, Math.PI * 2);
      const alphaHex = Math.floor(pulse * 200).toString(16).padStart(2, '0');
      ctx.strokeStyle = glowColor + alphaHex;
      ctx.lineWidth = 4;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 20;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }
}

function getBalloonCenter() { return { x: _balloonCX, y: _balloonCY }; }

function spawnExplosion(cx, cy) {
  const colors = ['#ff6eb4', '#ffd740', '#69ff47', '#40c4ff', '#e040fb', '#ff9100', '#ff50c8', '#00e5ff'];
  _particles = Array.from({ length: 80 }, () => ({
    x: cx || 160, y: cy || 180,
    vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 22 - 6,
    r: Math.random() * 12 + 3, color: colors[Math.floor(Math.random() * colors.length)], life: 1
  }));
}

function resetParticles() { _particles = []; _time = 0; _displayPressure = 0; }

/** 矢量爆炸图标（弹窗等 UI 用，真机不依赖 emoji 字体） */
function drawExplosionBurst(ctx, cx, cy, size) {
  const r = size * 0.42;
  ctx.save();
  ctx.translate(cx, cy);

  const halo = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r * 1.35);
  halo.addColorStop(0, 'rgba(255,200,80,0.55)');
  halo.addColorStop(0.5, 'rgba(255,100,40,0.22)');
  halo.addColorStop(1, 'rgba(255,80,40,0)');
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
  ctx.fillStyle = halo;
  ctx.fill();

  const spikes = 10;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i * Math.PI) / spikes - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.42;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const burst = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  burst.addColorStop(0, '#fff8e1');
  burst.addColorStop(0.35, '#ffb74d');
  burst.addColorStop(0.75, '#ff7043');
  burst.addColorStop(1, '#e64a19');
  ctx.fillStyle = burst;
  ctx.shadowColor = 'rgba(255,120,40,0.9)';
  ctx.shadowBlur = Math.round(size * 0.22);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = '#fffde7';
  ctx.fill();

  ctx.restore();
}

// ─── Bouquet Renderer ──────────────────────
function drawBouquet(ctx, balloons, cx, cy, size) {
  const count = Math.min(balloons.length, 10);
  const angleStep = Math.PI * 0.6 / Math.max(count - 1, 1);
  const startAngle = Math.PI * 0.7;
  const baseR = size * 0.2;

  balloons.slice(0, count).forEach((b, i) => {
    const angle = startAngle + i * angleStep;
    const bx = cx + Math.cos(angle) * size * 0.22;
    const by = cy - Math.sin(angle) * size * 0.18;
    const br = baseR * (0.82 + (i % 3) * 0.06);
    ctx.save();
    ctx.font = Math.round(br * 1.65) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = b.glowColor || b.color || 'rgba(255,255,255,0.45)';
    ctx.shadowBlur = Math.max(6, Math.round(br * 0.28));
    ctx.fillText(b.emoji || '🎈', bx, by);
    ctx.restore();
  });
}

module.exports = { drawBalloon, drawBalloonShape, drawBouquet, drawExplosionBurst, spawnExplosion, resetParticles, getBalloonCenter, hexAlpha };
