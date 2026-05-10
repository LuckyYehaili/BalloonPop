// 通用页面顶栏：返回按钮 + 标题（可选 emoji 前缀），与微信胶囊按钮纵向对齐。
//
// 用法：
//   const { drawPageHeader } = require('../engine/page-header');
//   const { contentTop } = drawPageHeader(ctx, this, W, { title: '战队', iconEmoji: '🎈' });
//   // contentTop 是顶栏下方"安全的内容起始 y"，可直接接着布局
//
// 注意：本项目使用纯 Canvas 2D + canvas-ui 引擎 + wx 小游戏 API；
// 不引入 React/DOM/Tailwind 等 Web 端运行时。后续所有页面顶栏统一调用此组件。

const { drawText, roundRect } = require('./canvas-ui');
const { getCapsuleLayout } = require('../layout-safe');

const NEON = '#ff50c8';

/**
 * 绘制顶栏。
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} scene  当前场景实例（需 scene.manager.addTouchable）
 * @param {number} W      画布逻辑宽度
 * @param {object} opts
 *   @prop {string}  title         主标题文案
 *   @prop {string}  [iconEmoji]   标题左侧可选 emoji（带粉色发光）
 *   @prop {string|Function} [onBack='goBack']  返回按钮 handler（string 或 fn）
 *   @prop {boolean} [showBack=true]            是否显示返回按钮
 *   @prop {boolean} [showDivider=true]         顶栏下方是否绘制一条粉色分隔线
 * @returns {{ contentTop: number, headerBottom: number, capsuleCenterY: number }}
 */
function drawPageHeader(ctx, scene, W, opts) {
  const o = opts || {};
  const title = o.title || '';
  const iconEmoji = o.iconEmoji || '';
  const onBack = o.onBack || 'goBack';
  const showBack = o.showBack !== false;
  const showDivider = o.showDivider !== false;

  const L = getCapsuleLayout();
  const padding = 16;
  const btnSize = Math.max(32, Math.round(L.height || 32)); // 与胶囊等高
  const btnX = padding;
  const btnCy = L.capsuleCenterY;                            // 与胶囊垂直中心对齐
  const btnY = btnCy - btnSize / 2;

  if (showBack) {
    ctx.save();
    roundRect(ctx, btnX, btnY, btnSize, btnSize, Math.round(btnSize * 0.3));
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,200,0.32)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, '←', btnX + btnSize / 2, btnCy, NEON, 18, 'center', undefined, 600);
    // 触区略大于按钮本身，方便点击
    scene.manager.addTouchable(btnX - 4, btnY - 4, btnSize + 8, btnSize + 8, onBack);
  }

  // 标题左侧起点：返回按钮右边 + 间距；若不显示返回按钮就紧贴左 padding
  const titleX0 = (showBack ? btnX + btnSize : padding) + 12;

  if (iconEmoji) {
    ctx.save();
    ctx.shadowColor = 'rgba(255,80,200,0.45)';
    ctx.shadowBlur = 10;
    drawText(ctx, iconEmoji, titleX0, btnCy, '#fff', 17, 'left', undefined, 400);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // 标题（粗体白色 + 粉色发光），紧跟 emoji 右侧
  const titleX = iconEmoji ? titleX0 + 22 : titleX0;
  drawText(ctx, title, titleX, btnCy, '#ffffff', 17, 'left', 'rgba(255,80,200,0.55)', 800);

  // 顶栏底部 + 内容起始
  const headerBottom = Math.max(L.bottom || 0, btnY + btnSize) + 8;

  if (showDivider) {
    ctx.fillStyle = 'rgba(255,80,200,0.08)';
    ctx.fillRect(padding, headerBottom, W - padding * 2, 1);
  }
  const contentTop = headerBottom + (showDivider ? 10 : 8);

  return {
    contentTop,
    headerBottom,
    capsuleCenterY: btnCy
  };
}

module.exports = { drawPageHeader };
