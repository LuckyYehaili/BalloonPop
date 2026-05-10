// Gauge / 仪表盘 + 中心打气按钮 Canvas 渲染 (参考原小程序 gauge-button 组件优化)
const UX = require('../ui-theme');

function drawGauge(ctx, cx, cy, SIZE, pressure, targetMin, targetMax, isHidden, isHolding, time, isDisabled) {
  const R = SIZE * 0.38;
  const startAngle = Math.PI * 0.62;
  const endAngle = Math.PI * 2.38;
  const totalAngle = endAngle - startAngle;

  // ─── 1. 外圈旋转光环 ────────────────────
  const dashR = SIZE * 0.46;
  ctx.save();
  ctx.strokeStyle = isHolding ? 'rgba(251,113,133,0.28)' : 'rgba(56,189,248,0.14)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 8]);
  ctx.lineDashOffset = isHolding ? time * 120 : time * 40;
  ctx.beginPath(); ctx.arc(cx, cy, dashR, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ─── 2. 环境光晕 ────────────────────────
  const ambientR = SIZE * 0.44;
  const ambGrad = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, ambientR);
  if (isHolding) {
    ambGrad.addColorStop(0, 'rgba(251,113,133,0.14)');
    ambGrad.addColorStop(1, 'rgba(251,113,133,0)');
  } else {
    ambGrad.addColorStop(0, 'rgba(56,189,248,0.1)');
    ambGrad.addColorStop(1, 'rgba(56,189,248,0)');
  }
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, ambientR, 0, Math.PI * 2);
  ctx.fillStyle = ambGrad; ctx.fill();
  ctx.restore();

  // ─── 3. Track 背景弧 ────────────────────
  ctx.beginPath(); ctx.arc(cx, cy, R, startAngle, endAngle);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.stroke();

  // ─── 4. 目标区 / 安全区发光（柔化：低饱和绿 + 弱 glow） ──
  const tStart = startAngle + (targetMin / 100) * totalAngle;
  const tEnd = startAngle + (targetMax / 100) * totalAngle;
  const pulse = Math.sin(time * 3) * 0.35 + 0.65;
  ctx.beginPath(); ctx.arc(cx, cy, R, tStart, tEnd);
  ctx.strokeStyle = `rgba(134,239,172,${0.45 + pulse * 0.28})`;
  ctx.lineWidth = 16; ctx.lineCap = 'butt';
  ctx.shadowColor = '#86efac'; ctx.shadowBlur = 8 + pulse * 4;
  ctx.stroke(); ctx.shadowBlur = 0;

  // ─── 5. 压力填充弧（柔化：弱 glow，超压用浅红） ────────
  if (pressure > 0) {
    const pAngle = startAngle + (Math.min(pressure, 100) / 100) * totalAngle;
    const gradStart = { x: cx + Math.cos(startAngle) * R, y: cy + Math.sin(startAngle) * R };
    const gradEnd = { x: cx + Math.cos(pAngle) * R, y: cy + Math.sin(pAngle) * R };
    const grad = ctx.createLinearGradient(gradStart.x, gradStart.y, gradEnd.x, gradEnd.y);
    if (pressure < targetMin) {
      grad.addColorStop(0, UX.accent); grad.addColorStop(1, UX.accentDeep);
    } else if (pressure <= targetMax) {
      grad.addColorStop(0, UX.success); grad.addColorStop(1, '#7dd3c0');
    } else {
      grad.addColorStop(0, UX.amber); grad.addColorStop(1, UX.danger);
    }
    ctx.beginPath(); ctx.arc(cx, cy, R, startAngle, pAngle);
    ctx.strokeStyle = grad; ctx.lineWidth = 16; ctx.lineCap = 'butt';
    const fillGlow = pressure > targetMax ? UX.danger : pressure >= targetMin ? UX.successDeep : UX.accentDeep;
    ctx.shadowColor = fillGlow; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;
  }

  // ─── 6. 刻度线 ──────────────────────────
  for (let i = 0; i <= 20; i++) {
    const angle = startAngle + (i / 20) * totalAngle;
    const isMajor = i % 5 === 0;
    const inner = R - (isMajor ? 24 : 14);
    const outer = R + 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.strokeStyle = isMajor ? 'rgba(226,232,240,0.42)' : 'rgba(148,163,184,0.18)';
    ctx.lineWidth = isMajor ? 2.2 : 1; ctx.stroke();
  }

  // ─── 7. 指针 ────────────────────────────
  if (!isHidden) {
    const needleAngle = startAngle + (Math.min(pressure, 100) / 100) * totalAngle;
    const needleLen = R - 20;
    const nx = cx + Math.cos(needleAngle) * needleLen;
    const ny = cy + Math.sin(needleAngle) * needleLen;
    const needleColor = pressure > targetMax ? UX.danger : pressure >= targetMin ? UX.success : UX.violet;
    const tailAngle = needleAngle + Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(tailAngle) * 16, cy + Math.sin(tailAngle) * 16);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = needleColor; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    ctx.shadowColor = needleColor; ctx.shadowBlur = 16; ctx.stroke(); ctx.shadowBlur = 0;
    // 中心圆点
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = needleColor; ctx.shadowColor = needleColor; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  }

  // ─── 8. 中心打气按钮 (核心交互元素) ──────
  const btnR = SIZE * 0.21;

  if (isDisabled) {
    // ── 置灰状态：灰色按钮 +「按住充气」同字号 ──
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy + 4, btnR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill();
    ctx.restore();

    const disGrad = ctx.createLinearGradient(cx, cy - btnR, cx, cy + btnR);
    disGrad.addColorStop(0, '#64748b'); disGrad.addColorStop(1, '#334155');
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, btnR, 0, Math.PI * 2);
    ctx.fillStyle = disGrad; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font = `700 14px ${UX.font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('按住充气', cx, cy);
    ctx.restore();
    return;
  }

  // ── 正常 / 按住状态 ──
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy + 4, btnR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
  ctx.restore();

  const btnGrad = ctx.createLinearGradient(cx, cy - btnR, cx, cy + btnR);
  if (isHolding) {
    btnGrad.addColorStop(0, '#fb923c'); btnGrad.addColorStop(1, '#e11d48');
  } else {
    btnGrad.addColorStop(0, '#818cf8'); btnGrad.addColorStop(1, '#2563eb');
  }
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, btnR, 0, Math.PI * 2);
  ctx.fillStyle = btnGrad; ctx.fill();
  ctx.shadowColor = isHolding ? 'rgba(251,113,133,0.5)' : 'rgba(99,102,241,0.45)';
  ctx.shadowBlur = 14; ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2; ctx.stroke(); ctx.shadowBlur = 0;
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx - btnR * 0.15, cy - btnR * 0.35, btnR * 0.55, btnR * 0.32, -0.1, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx + btnR * 0.05, cy + btnR * 0.45, btnR * 0.6, btnR * 0.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.font = `700 14px ${UX.font}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 4;
  ctx.fillText('按住充气', cx, cy);
  ctx.shadowBlur = 0;
  ctx.restore();

  if (!isHolding) {
    const shimmerAngle = (time * 2.5) % (Math.PI * 2);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, btnR * 0.92, 0, Math.PI * 2); ctx.clip();
    const sx = cx + Math.cos(shimmerAngle) * btnR * 1.2;
    const sy = cy + Math.sin(shimmerAngle) * btnR * 1.2;
    const sg = ctx.createLinearGradient(sx - btnR, sy - btnR, sx + btnR, sy + btnR);
    sg.addColorStop(0, 'transparent');
    sg.addColorStop(0.48, 'rgba(255,255,255,0.2)');
    sg.addColorStop(0.55, 'rgba(255,255,255,0.15)');
    sg.addColorStop(1, 'transparent');
    ctx.fillStyle = sg;
    ctx.fillRect(cx - btnR, cy - btnR, btnR * 2, btnR * 2);
    ctx.restore();
  }

  if (isHolding) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.arc(cx, cy, btnR * 1.08, 0, Math.PI * 2);
    ctx.strokeStyle = UX.danger; ctx.lineWidth = 3;
    ctx.shadowColor = UX.danger; ctx.shadowBlur = 18; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.restore();
  }
}

module.exports = { drawGauge };
