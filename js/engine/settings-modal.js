// 共享「设置」弹窗：背景音乐 / 游戏音效 / 震动反馈
// 首页左上角与「我的」页共用，保证内容与交互一致。
// 开关即时生效并写入本地缓存（store.updateSettings）；无缓存默认全开。
const { drawText, roundRect, drawToggle, drawModalBackground } = require('./canvas-ui');
const store = require('../store');
const { syncBgmFromSettings } = require('../audio');

let _open = false;

function openSettingsModal() { _open = true; }
function closeSettingsModal() { _open = false; }
function isSettingsModalOpen() { return _open; }

const STROKE = 'rgba(255,80,200,0.22)';
const MUTED = 'rgba(255,255,255,0.45)';

const TOGGLES = [
  { label: '背景音乐', desc: '关卡与首页循环播放', key: 'musicOn' },
  { label: '游戏音效', desc: '打气、成功、爆炸等音效', key: 'soundOn' },
  { label: '震动反馈', desc: '成功/失败弹窗触感反馈', key: 'vibrationOn' }
];

function _toggle(key) {
  const s = store.getSettings();
  const next = s[key] === false; // 当前关→开，当前开→关
  const patch = {};
  patch[key] = next;
  store.updateSettings(patch);
  if (key === 'musicOn') {
    try { syncBgmFromSettings(); } catch (_) { /* ignore */ }
  }
}

/**
 * 绘制设置弹窗（含遮罩、点击外部关闭）。须在场景 render 末尾调用。
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} scene 需有 scene.manager.addTouchable
 */
function drawSettingsModal(ctx, scene, W, H) {
  if (!_open) return;
  drawModalBackground(ctx, W, H);

  const PAD = 22;
  const titleH = 30;
  const rowH = 64;
  const mw = Math.min(W - 64, 360);
  const mx = (W - mw) / 2;
  const mh = PAD + titleH + 8 + TOGGLES.length * rowH + PAD;
  const my = Math.max(36, Math.round((H - mh) / 2));

  // 整屏吸收：点弹窗外关闭（先注册，后注册的按钮优先命中）
  scene.manager.addTouchable(0, 0, W, H, function () { closeSettingsModal(); });

  ctx.save();
  roundRect(ctx, mx, my, mw, mh, 24);
  const bg = ctx.createLinearGradient(mx, my, mx, my + mh);
  bg.addColorStop(0, 'rgba(25,8,50,0.99)');
  bg.addColorStop(1, 'rgba(10,2,25,0.99)');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = STROKE;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();

  // 卡片本体吸收：点弹窗内空白不关闭、不穿透
  scene.manager.addTouchable(mx, my, mw, mh, function () {});

  drawText(ctx, '✕', mx + mw - 24, my + 24, MUTED, 14, 'center');
  scene.manager.addTouchable(mx + mw - 44, my + 4, 44, 44, function () { closeSettingsModal(); });
  drawText(ctx, '设置', W / 2, my + PAD + 10, '#ffffff', 16, 'center', undefined, 700);

  const settings = store.getSettings();
  const rowsTop = my + PAD + titleH + 8;
  TOGGLES.forEach((tg, i) => {
    const ry = rowsTop + i * rowH;
    if (i > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(mx + PAD, ry, mw - PAD * 2, 1);
    }
    drawText(ctx, tg.label, mx + PAD, ry + 24, 'rgba(255,255,255,0.9)', 14, 'left', undefined, 600);
    drawText(ctx, tg.desc, mx + PAD, ry + 44, MUTED, 11, 'left', undefined, 400);
    const tw = 50;
    const th = 30;
    const tx = mx + mw - PAD - tw;
    const ty = ry + (rowH - th) / 2;
    drawToggle(ctx, tx, ty, settings[tg.key] !== false);
    const key = tg.key;
    scene.manager.addTouchable(tx - 10, ty - 8, tw + 20, th + 16, function () { _toggle(key); });
  });
}

module.exports = {
  openSettingsModal,
  closeSettingsModal,
  isSettingsModalOpen,
  drawSettingsModal
};
