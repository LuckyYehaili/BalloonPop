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
  // 确保目标区至少有最小弧度，单点目标也能显示为可见的绿色线
  const minArcFraction = 0.8 / 100; // 至少占 0.8% 的弧长
  const tEnd = Math.max(startAngle + (targetMax / 100) * totalAngle, tStart + minArcFraction * totalAngle);
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
  const labelFs = Math.max(10, Math.round(btnR * 0.34));

  function _drawPumpBtnLabel(text, color, alpha) {
    ctx.save();
    ctx.font = `600 ${labelFs}px ${UX.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color || '#fff';
    ctx.globalAlpha = alpha != null ? alpha : 1;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 2;
    ctx.fillText(text, cx, cy);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** 顶部高光：缩小、降透明度；按住时用暖色弱高光，避免白块发脏 */
  function _drawPumpBtnSpecular(holding) {
    if (holding) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx - btnR * 0.12, cy - btnR * 0.28, btnR * 0.32, btnR * 0.14, -0.12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,220,200,0.1)';
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx - btnR * 0.1, cy - btnR * 0.32, btnR * 0.38, btnR * 0.18, -0.1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    ctx.restore();
  }

  if (isDisabled) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy + 4, btnR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill();
    ctx.restore();

    const disGrad = ctx.createLinearGradient(cx, cy - btnR, cx, cy + btnR);
    disGrad.addColorStop(0, '#64748b'); disGrad.addColorStop(1, '#334155');
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, btnR, 0, Math.PI * 2);
    ctx.fillStyle = disGrad; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();

    _drawPumpBtnLabel('按住充气', 'rgba(255,255,255,0.55)', 1);
    return;
  }

  // ── 正常 / 按住状态 ──
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy + 4, btnR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();
  ctx.restore();

  const btnGrad = ctx.createLinearGradient(cx, cy - btnR, cx, cy + btnR);
  if (isHolding) {
    btnGrad.addColorStop(0, '#f97316');
    btnGrad.addColorStop(0.55, '#ef4444');
    btnGrad.addColorStop(1, '#dc2626');
  } else {
    btnGrad.addColorStop(0, '#7c8ff5');
    btnGrad.addColorStop(0.5, '#5b6ee8');
    btnGrad.addColorStop(1, '#3b5bdb');
  }
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, btnR, 0, Math.PI * 2);
  ctx.fillStyle = btnGrad; ctx.fill();
  ctx.strokeStyle = isHolding ? 'rgba(255,180,160,0.22)' : 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = isHolding ? 'rgba(239,68,68,0.35)' : 'rgba(99,102,241,0.35)';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  _drawPumpBtnSpecular(isHolding);

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx + btnR * 0.04, cy + btnR * 0.42, btnR * 0.45, btnR * 0.14, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fill();
  ctx.restore();

  _drawPumpBtnLabel('按住充气', '#fff', 1);

  if (!isHolding) {
    const shimmerAngle = (time * 2.5) % (Math.PI * 2);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, btnR * 0.92, 0, Math.PI * 2); ctx.clip();
    const sx = cx + Math.cos(shimmerAngle) * btnR * 1.2;
    const sy = cy + Math.sin(shimmerAngle) * btnR * 1.2;
    const sg = ctx.createLinearGradient(sx - btnR, sy - btnR, sx + btnR, sy + btnR);
    sg.addColorStop(0, 'transparent');
    sg.addColorStop(0.48, 'rgba(255,255,255,0.08)');
    sg.addColorStop(0.55, 'rgba(255,255,255,0.06)');
    sg.addColorStop(1, 'transparent');
    ctx.fillStyle = sg;
    ctx.fillRect(cx - btnR, cy - btnR, btnR * 2, btnR * 2);
    ctx.restore();
  }

  if (isHolding) {
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.beginPath(); ctx.arc(cx, cy, btnR * 1.06, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,120,90,0.85)'; ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(239,68,68,0.45)'; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.restore();
  }
}

module.exports = { drawGauge };
