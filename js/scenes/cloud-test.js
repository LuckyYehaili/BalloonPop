// 云数据库连通测试页（对应小程序 pages/index：JS 读库 + WXML 展示）
const { drawBackground, drawText, drawButtonGradient, drawWrappedText, roundRect } = require('../engine/canvas-ui');
const { drawPageHeader } = require('../engine/page-header');
const cloud = require('../cloud');

const TEST_OPENID = 'test_user_001';

let state = {
  msg: '正在连接云数据库...',
  testUser: null,
  loading: true
};

module.exports = {
  onShow() {
    this.testConnect();
  },

  testConnect() {
    state.loading = true;
    state.msg = '正在连接云数据库...';
    state.testUser = null;
    cloud.testConnectUsers(TEST_OPENID).then((r) => {
      state.msg = r.msg;
      state.testUser = r.user;
      state.loading = false;
    });
  },

  render(ctx, W, H) {
    const scene = this;
    drawBackground(ctx, W, H, ['#080520', '#0d0b3a', '#08082a', '#050518']);

    const { contentTop } = drawPageHeader(ctx, scene, W, {
      title: '云连通测试',
      onBack: 'goBack'
    });

    const pad = 20;
    const cardX = 16;
    const cardW = W - 32;
    let y = contentTop + 12;

    ctx.save();
    roundRect(ctx, cardX, y, cardW, 56, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(167,139,250,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, '环境', cardX + pad, y + 18, 'rgba(255,255,255,0.5)', 12, 'left', undefined, 400);
    drawText(ctx, cloud.CLOUD_ENV, cardX + pad, y + 38, '#a78bfa', 11, 'left', undefined, 500);

    y += 56 + 14;

    const msgH = drawWrappedText(ctx, state.msg, cardX + pad, y + 8, cardW - pad * 2, 22, '#ffffff', 15, 500) || 44;
    y += msgH + 20;

    if (state.testUser) {
      ctx.save();
      roundRect(ctx, cardX, y, cardW, 88, 14);
      ctx.fillStyle = 'rgba(0,230,118,0.08)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,230,118,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      drawText(ctx, 'nickName：' + (state.testUser.nickName || '—'), cardX + pad, y + 28, '#ffffff', 14, 'left', undefined, 500);
      drawText(ctx, 'currentLevel：' + (state.testUser.currentLevel != null ? state.testUser.currentLevel : '—'), cardX + pad, y + 56, '#ffffff', 14, 'left', undefined, 500);
      y += 88 + 16;
    }

    const btnH = 48;
    const retry = drawButtonGradient(ctx, cardX + pad, y, cardW - pad * 2, btnH,
      state.loading ? '读取中…' : '重新测试', 'rgba(255,255,255,0.1)', '#fff', 14, 14, undefined, 600);
    if (!state.loading) {
      scene.manager.addTouchable(retry.x, retry.y, retry.w, retry.h, 'testConnect');
    }

    drawText(ctx, 'openid: ' + TEST_OPENID, W / 2, H - 36, 'rgba(255,255,255,0.35)', 11, 'center', undefined, 400);
  },

  goBack() {
    this.manager.switchTo('home');
  }
};
