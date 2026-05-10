// 通用「表单字段」组件：标签 + 可选 chip + 输入框（单行/多行）+ 错误提示。
// 用于战队创建、个人资料编辑等任意需要输入的场景，统一视觉与交互。
//
// 设计约定：
//   - label 与输入框间距固定 8px（如需修改请改 LABEL_TO_INPUT_GAP）
//   - 单行输入：高 40px，多行：高 64px（也可通过 height 覆盖）
//   - drawFormField 只负责绘制并返回布局矩形；触摸交互由调用方用返回的
//     inputRect / chipRect 自行 addTouchable，便于在裁切+滚动场景中对齐屏幕坐标
//
// 用法（示意）：
//   const ff = require('../engine/form-field');
//   const r = ff.drawFormField(ctx, {
//     x, y, w,
//     label: '战队名称',
//     chip: { label: '↻ 随机', color: '#ff50c8', align: 'left' },  // 可选
//     value: state.teamName,
//     placeholder: '给你的战队起个名字',
//     error: state.nameError                                       // 可选
//   });
//   scene.manager.addTouchable(r.inputRect.x, r.inputRect.y - scrollY, r.inputRect.w, r.inputRect.h, 'editName');
//   if (r.chipRect) scene.manager.addTouchable(r.chipRect.x, r.chipRect.y - scrollY, r.chipRect.w, r.chipRect.h, 'randomName');

const { drawText, roundRect, measureText } = require('./canvas-ui');

const LABEL_TO_INPUT_GAP = 8;     // 用户约定：标签与输入框间距
const LABEL_FONT_SIZE = 12;
const LABEL_FONT_WEIGHT = 400;
const LABEL_HALF_HEIGHT = 6;      // fontSize 12 'middle' baseline 半高估算
const CHIP_FONT_SIZE = 12;
const CHIP_FONT_WEIGHT = 600;
const CHIP_HEIGHT = 22;
const CHIP_PAD_X = 9;
const INPUT_RADIUS = 12;
const INPUT_FONT_SIZE = 14;
const INPUT_FONT_WEIGHT = 500;
const INPUT_PAD_X = 14;
const MULTI_FONT_SIZE = 14;
const MULTI_LINE_HEIGHT = 20;

/** 多行文本：超出 maxW 自动换行，超过 maxLines 在末行末尾加省略号 */
function _drawClampedLines(ctx, text, x, y, maxW, lineH, color, fs, fw, maxLines) {
  const s = String(text || '');
  if (!s) return;
  let line = '';
  let lc = 0;
  let cy = y;
  for (let i = 0; i < s.length; i++) {
    const test = line + s[i];
    if (measureText(ctx, test, fs, fw) > maxW && line.length > 0) {
      if (lc === maxLines - 1) {
        while (line.length > 0 && measureText(ctx, line + '…', fs, fw) > maxW) line = line.slice(0, -1);
        drawText(ctx, line + '…', x, cy, color, fs, 'left', undefined, fw);
        return;
      }
      drawText(ctx, line, x, cy, color, fs, 'left', undefined, fw);
      line = s[i];
      cy += lineH;
      lc++;
    } else {
      line = test;
    }
  }
  if (line) drawText(ctx, line, x, cy, color, fs, 'left', undefined, fw);
}

/**
 * 绘制「标签 + 可选 chip + 输入框」字段。
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 *   @prop {number}  x, y, w
 *   @prop {string}  label
 *   @prop {string}  [labelColor]
 *   @prop {object}  [chip]              { label, color?, bg?, stroke?, align?: 'left'|'right' }
 *   @prop {string}  [value]
 *   @prop {string}  [placeholder]
 *   @prop {boolean} [multiline=false]
 *   @prop {number}  [height]            自定义输入框高（覆盖默认 40 / 64）
 *   @prop {number}  [maxLines=2]        多行最多行数
 *   @prop {string}  [error]             非空时输入框红色描边并在底部显示
 * @returns {{ bottom:number, inputRect:{x,y,w,h}, chipRect:{x,y,w,h}|null,
 *             yTop:number, inputY:number, inputH:number, errBottom:number }}
 */
function drawFormField(ctx, opts) {
  const o = opts || {};
  const x = o.x;
  const yTop = o.y;
  const w = o.w;
  const labelText = o.label || '';
  const labelCy = yTop + LABEL_HALF_HEIGHT;
  const inputH = o.height || (o.multiline ? 64 : 40);
  const inputY = yTop + LABEL_HALF_HEIGHT * 2 + LABEL_TO_INPUT_GAP;

  // 标签
  drawText(ctx, labelText, x, labelCy, o.labelColor || 'rgba(255,255,255,0.4)', LABEL_FONT_SIZE, 'left', undefined, LABEL_FONT_WEIGHT);

  // 可选 chip
  let chipRect = null;
  if (o.chip) {
    const c = o.chip;
    const chipText = c.label || '';
    const chipTextW = measureText(ctx, chipText, CHIP_FONT_SIZE, CHIP_FONT_WEIGHT);
    const chipW = chipTextW + CHIP_PAD_X * 2;
    let chipX;
    if (c.align === 'right') {
      chipX = x + w - chipW;
    } else {
      const labelW = measureText(ctx, labelText, LABEL_FONT_SIZE, LABEL_FONT_WEIGHT);
      chipX = x + labelW + 10;
    }
    const chipY = labelCy - CHIP_HEIGHT / 2;
    const color = c.color || '#ff50c8';
    const isCyan = color === '#40e0d0';
    const bg = c.bg || (isCyan ? 'rgba(64,224,208,0.1)' : 'rgba(255,80,200,0.1)');
    const stroke = c.stroke || (isCyan ? 'rgba(64,224,208,0.25)' : 'rgba(255,80,200,0.25)');
    ctx.save();
    roundRect(ctx, chipX, chipY, chipW, CHIP_HEIGHT, CHIP_HEIGHT / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, chipText, chipX + chipW / 2, chipY + CHIP_HEIGHT / 2, color, CHIP_FONT_SIZE, 'center', undefined, CHIP_FONT_WEIGHT);
    chipRect = { x: chipX, y: chipY, w: chipW, h: CHIP_HEIGHT };
  }

  // 输入框背景（active 时加亮描边）
  const isActive = !!o.active;
  ctx.save();
  roundRect(ctx, x, inputY, w, inputH, INPUT_RADIUS);
  ctx.fillStyle = isActive ? 'rgba(255,80,200,0.06)' : 'rgba(255,255,255,0.04)';
  ctx.fill();
  if (o.error) {
    ctx.strokeStyle = 'rgba(255,100,100,0.55)';
    ctx.lineWidth = 1.5;
  } else if (isActive) {
    ctx.strokeStyle = 'rgba(255,80,200,0.75)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(255,80,200,0.3)';
    ctx.shadowBlur = 6;
  } else {
    ctx.strokeStyle = 'rgba(255,80,200,0.22)';
    ctx.lineWidth = 1;
  }
  ctx.stroke();
  ctx.restore();

  const value = o.value || '';
  const placeholder = o.placeholder || '';
  const isPlaceholder = !value && !isActive;
  const showText = value || (isActive ? '' : placeholder);
  const textColor = isPlaceholder ? 'rgba(255,255,255,0.32)' : '#ffffff';

  if (o.multiline) {
    _drawClampedLines(ctx, showText, x + INPUT_PAD_X, inputY + 14, w - INPUT_PAD_X * 2, MULTI_LINE_HEIGHT, textColor, MULTI_FONT_SIZE, 400, o.maxLines || 2);
    // 光标：光标显示在已有文字末尾（多行：最后一行末）
    if (isActive) {
      const cursorVisible = Math.floor(Date.now() / 500) % 2 === 0;
      if (cursorVisible) {
        const lines = value.split('\n');
        const lastLine = lines[lines.length - 1] || '';
        const lIdx = Math.min(lines.length - 1, (o.maxLines || 2) - 1);
        const cursorX = x + INPUT_PAD_X + measureText(ctx, lastLine, MULTI_FONT_SIZE, 400);
        const cursorY = inputY + 14 + lIdx * MULTI_LINE_HEIGHT;
        ctx.save();
        ctx.fillStyle = '#ff50c8';
        ctx.fillRect(cursorX + 1, cursorY - MULTI_FONT_SIZE / 2 - 1, 2, MULTI_FONT_SIZE + 2);
        ctx.restore();
      }
    }
  } else {
    drawText(ctx, showText, x + INPUT_PAD_X, inputY + inputH / 2, textColor, INPUT_FONT_SIZE, 'left', undefined, INPUT_FONT_WEIGHT);
    // 光标：追加在文字末尾
    if (isActive) {
      const cursorVisible = Math.floor(Date.now() / 500) % 2 === 0;
      if (cursorVisible) {
        const textW = measureText(ctx, value, INPUT_FONT_SIZE, INPUT_FONT_WEIGHT);
        const cursorX = x + INPUT_PAD_X + textW + 1;
        ctx.save();
        ctx.fillStyle = '#ff50c8';
        ctx.fillRect(cursorX, inputY + inputH / 2 - INPUT_FONT_SIZE / 2 - 1, 2, INPUT_FONT_SIZE + 2);
        ctx.restore();
      }
    }
  }

  // 错误提示
  let errBottom = inputY + inputH;
  if (o.error) {
    drawText(ctx, o.error, x, inputY + inputH + 14, '#ff6464', 12, 'left', undefined, 500);
    errBottom = inputY + inputH + 22;
  }

  return {
    bottom: errBottom,
    inputRect: { x, y: inputY, w, h: inputH },
    chipRect,
    yTop,
    inputY,
    inputH,
    errBottom
  };
}

module.exports = { drawFormField, LABEL_TO_INPUT_GAP };
