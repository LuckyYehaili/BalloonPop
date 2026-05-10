// Balloon renderer - 纯 Canvas 2D 气球绘制 (从 balloon-display 组件迁移)
const { createRaf } = require('../raf');
const raf = createRaf();

function hexAlpha(hex, a) {
  const alpha = Math.max(0, Math.min(255, Math.round(a*255))).toString(16).padStart(2,'0');
  return hex + alpha;
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
      ctx.beginPath(); ctx.ellipse(tx-r*0.28, ty-r*0.28, r*0.2, r*0.12, -Math.PI/4, 0, Math.PI*2); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
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
      ctx.beginPath(); ctx.ellipse(-18,-22,12,7,-0.5,0,Math.PI*2); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill();
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
      ctx.beginPath(); ctx.arc(tx-r*0.15, ty-r*0.15, r*0.16, 0, Math.PI*2); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
      if (!noRope) {
        ctx.beginPath(); ctx.moveTo(tx, ty+r*0.5+10); ctx.quadraticCurveTo(tx+ropeBend, ty+r*0.5+10+ropeMid, tx, ty+r*0.5+10+ropeLen); ctx.strokeStyle = balloonColor+'80'; ctx.lineWidth = 2; ctx.stroke();
      }
      break;
    }
    case 'long': {
      const lg=ctx.createRadialGradient(tx-r*0.2,ty-r*0.5,r*0.05,tx,ty,r*1.2); lg.addColorStop(0,'#fff');lg.addColorStop(0.25,balloonColor+'ee');lg.addColorStop(1,balloonColor+'dd');
      ctx.beginPath(); ctx.ellipse(tx,ty,r*0.55,r*1.2,0,0,Math.PI*2); ctx.fillStyle = lg; ctx.fill(); ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.ellipse(tx-r*0.15,ty-r*0.5,r*0.12,r*0.22,-0.3,0,Math.PI*2); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill();
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
      ctx.beginPath(); ctx.ellipse(tx-r*0.25,ty-r*0.35,r*0.18,r*0.1,-0.4,0,Math.PI*2); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill();
      if (!noRope) {
        ctx.beginPath(); ctx.moveTo(tx,ty+r+6); ctx.quadraticCurveTo(tx+ropeBend,ty+r+6+ropeMid,tx,ty+r+6+ropeLen); ctx.strokeStyle = balloonColor+'80'; ctx.lineWidth=2; ctx.stroke();
      }
      break;
    }
    case 'cloud': {
      ctx.beginPath(); ctx.arc(tx,ty,r*0.7,0,Math.PI*2); ctx.arc(tx-r*0.55,ty+r*0.15,r*0.5,0,Math.PI*2); ctx.arc(tx+r*0.55,ty+r*0.15,r*0.5,0,Math.PI*2);
      ctx.arc(tx-r*0.3,ty-r*0.45,r*0.42,0,Math.PI*2); ctx.arc(tx+r*0.3,ty-r*0.45,r*0.42,0,Math.PI*2);
      ctx.fillStyle = grad; ctx.fill(); ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.ellipse(tx-r*0.2,ty-r*0.3,r*0.15,r*0.08,-0.3,0,Math.PI*2); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill();
      if (!noRope) {
        ctx.beginPath(); ctx.moveTo(tx,ty+r*0.65+8); ctx.quadraticCurveTo(tx+ropeBend,ty+r*0.65+8+ropeMid,tx,ty+r*0.65+8+ropeLen); ctx.strokeStyle = balloonColor+'80'; ctx.lineWidth=2; ctx.stroke();
      }
      break;
    }
    case 'diamond': {
      ctx.beginPath(); ctx.moveTo(tx,ty-r); ctx.lineTo(tx+r*0.75,ty); ctx.lineTo(tx,ty+r); ctx.lineTo(tx-r*0.75,ty); ctx.closePath(); ctx.fillStyle=grad; ctx.fill(); ctx.shadowBlur=0;
      ctx.beginPath(); ctx.moveTo(tx,ty-r); ctx.lineTo(tx+r*0.75,ty); ctx.lineTo(tx,ty-r*0.1); ctx.closePath(); ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(tx,ty-r); ctx.lineTo(tx-r*0.75,ty); ctx.lineTo(tx,ty-r*0.1); ctx.closePath(); ctx.fillStyle='rgba(255,255,255,0.15)'; ctx.fill();
      if (!noRope) {
        ctx.beginPath(); ctx.moveTo(tx,ty+r*0.5+8); ctx.quadraticCurveTo(tx+ropeBend,ty+r*0.5+8+ropeMid,tx,ty+r*0.5+8+ropeLen); ctx.strokeStyle=balloonColor+'80'; ctx.lineWidth=2; ctx.stroke();
      }
      break;
    }
    case 'twist': {
      ctx.beginPath(); ctx.ellipse(tx-r*0.28,ty-r*0.38,r*0.42,r*0.72,-0.35,0,Math.PI*2); ctx.fillStyle=grad; ctx.fill(); ctx.shadowBlur=0;
      ctx.beginPath(); ctx.ellipse(tx+r*0.28,ty+r*0.38,r*0.42,r*0.72,0.35,0,Math.PI*2); ctx.fillStyle=balloonColor+'cc'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(tx-r*0.35,ty-r*0.55,r*0.1,r*0.18,-0.35,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.fill();
      if (!noRope) {
        ctx.beginPath(); ctx.moveTo(tx,ty+r*0.7+8); ctx.quadraticCurveTo(tx+ropeBend,ty+r*0.7+8+ropeMid,tx,ty+r*0.7+8+ropeLen); ctx.strokeStyle=balloonColor+'80'; ctx.lineWidth=2; ctx.stroke();
      }
      break;
    }
    case 'flower': {
      for(let i=0;i<5;i++){const a=(i*Math.PI*2)/5-Math.PI/2;const px=tx+Math.cos(a)*r*0.45,py=ty+Math.sin(a)*r*0.45;const pg=ctx.createRadialGradient(px,py,r*0.05,px,py,r*0.45);pg.addColorStop(0,'#fff');pg.addColorStop(0.3,balloonColor+'ee');pg.addColorStop(1,balloonColor+'dd');ctx.beginPath();ctx.arc(px,py,r*0.42,0,Math.PI*2);ctx.fillStyle=pg;ctx.fill();}
      ctx.shadowBlur=0; ctx.beginPath(); ctx.arc(tx,ty,r*0.32,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
      if (!noRope) {
        ctx.beginPath(); ctx.moveTo(tx,ty+r*0.42+8); ctx.quadraticCurveTo(tx+ropeBend,ty+r*0.42+8+ropeMid,tx,ty+r*0.42+8+ropeLen); ctx.strokeStyle=balloonColor+'80'; ctx.lineWidth=2; ctx.stroke();
      }
      break;
    }
    case 'crown': {
      ctx.beginPath(); ctx.arc(tx,ty+r*0.1,r*0.85,0,Math.PI*2); ctx.fillStyle=grad; ctx.fill(); ctx.shadowBlur=0;
      ctx.beginPath(); ctx.moveTo(tx-r*0.85,ty-r*0.3); ctx.lineTo(tx-r*0.6,ty-r); ctx.lineTo(tx-r*0.22,ty-r*0.45); ctx.lineTo(tx,ty-r*1.05); ctx.lineTo(tx+r*0.22,ty-r*0.45); ctx.lineTo(tx+r*0.6,ty-r); ctx.lineTo(tx+r*0.85,ty-r*0.3); ctx.closePath(); ctx.fillStyle=grad; ctx.fill();
      [tx-r*0.6,tx,tx+r*0.6].forEach((gx,gi)=>{ctx.beginPath();ctx.arc(gx,ty-r*0.85,r*0.1,0,Math.PI*2);ctx.fillStyle=['#ff1744','#ffd740','#00e5ff'][gi];ctx.fill();});
      ctx.beginPath();ctx.ellipse(tx-r*0.22,ty-r*0.1,r*0.18,r*0.1,-0.4,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.4)';ctx.fill();
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

function drawBalloon(ctx, W, areaTop, areaH, pressure, color, glowColor, shape, isExploding, isSuccess, dpr) {
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
    // idle 起始 0.55x（原 0.4x，过小），充满 1.15x（原 1.3x，避免触顶）
    const scale = 0.55 + (dp / 100) * 0.6;
    const r = baseR * scale;
    const cx = _balloonCX;
    const cy = _balloonCY;
    // 高压时震颤 (匹配备份: >=80 && <100)
    const tremble = dp >= 80 && dp < 100 ? Math.sin(_time * 15) * (dp - 79) * 0.3 : 0;

    // 绘制气球本体 (绳子已在各个 shape 内绘制)
    drawBalloonShape(ctx, shape, cx, cy, r, color, glowColor, tremble, dp, isSuccess, _time, dpr);

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
    const br = baseR * (0.8 + Math.random() * 0.2);
    drawBalloonShape(ctx, b.shape||'round', bx, by, br, b.color||'#ff6eb4', b.glowColor||'#ff6eb4', 0, 50, false, _time, 2);
  });
}

module.exports = { drawBalloon, drawBalloonShape, drawBouquet, spawnExplosion, resetParticles, getBalloonCenter, hexAlpha };
