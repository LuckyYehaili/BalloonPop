// Scene Manager - 场景管理器
const canvasUI = require('../engine/canvas-ui');
const store = require('../store');
const { isDevelopEnv } = require('../platform');
const legalModal = require('../engine/legal-modal');
const { isUserLoggedIn } = require('../auth-guard');
const { centerModalY } = require('../layout-safe');
const {
  drawText, drawButtonGradient, drawModalBackground, drawWrappedText,
  gradientPink, roundRect, handleTouchTap, showToast
} = canvasUI;

class SceneManager {
  constructor(canvas, ctx, width, height) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.scenes = {};
    this.currentScene = null;
    this.currentSceneName = '';
    this.touchables = [];
    this.dpr = Math.min(wx.getSystemInfoSync().pixelRatio || 2, 2.5);
    this.pendingSwitch = null;
    this.lastFrameTime = 0;
    this.showExitGameConfirm = false;
    this.pendingNavigation = null;
  }

  register(name, scene) {
    scene.manager = this;
    scene.store = store;
    scene.canvasUI = canvasUI;
    scene.W = this.width;
    scene.H = this.height;
    scene.dpr = this.dpr;
    this.scenes[name] = scene;
  }

  switchTo(name, data) {
    this.showExitGameConfirm = false;
    const payload = data || null;
    if (!isUserLoggedIn() && name !== 'home') {
      this.pendingNavigation = { name, data: payload };
      if (this.currentSceneName === 'home' && this.scenes.home) {
        if (typeof this.scenes.home.promptLogin === 'function') {
          this.scenes.home.promptLogin();
        }
        return;
      }
      name = 'home';
      data = Object.assign({}, payload || {}, { requireLogin: true });
    } else if (isUserLoggedIn()) {
      this.pendingNavigation = null;
    }
    if (this.currentScene && this.currentScene.onHide) this.currentScene.onHide();
    this.currentSceneName = name;
    this.currentScene = this.scenes[name];
    if (this.currentScene) {
      this.currentScene.W = this.width;
      this.currentScene.H = this.height;
      if (this.currentScene.onShow) this.currentScene.onShow(data);
      if (name === 'home' && data && data.requireLogin && typeof this.currentScene.promptLogin === 'function') {
        this.currentScene.promptLogin();
      }
    }
  }

  consumePendingNavigation() {
    const pending = this.pendingNavigation;
    this.pendingNavigation = null;
    return pending;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    if (this.currentScene) {
      this.currentScene.W = width;
      this.currentScene.H = height;
    }
  }

  /** 系统返回键：先关弹窗，否则弹出退出游戏确认 */
  handleBackButton() {
    if (this.showExitGameConfirm) {
      this.showExitGameConfirm = false;
      return true;
    }
    if (canvasUI.getModalStack().length > 0) {
      canvasUI.closeModal();
      return true;
    }
    if (legalModal.isLegalModalOpen()) {
      legalModal.closeLegalModal();
      if (typeof wx !== 'undefined' && wx.hideKeyboard) wx.hideKeyboard();
      return true;
    }
    const scene = this.currentScene;
    if (scene && typeof scene.handleBackButton === 'function' && scene.handleBackButton()) {
      return true;
    }
    this.showExitGameConfirm = true;
    return true;
  }

  _drawExitGameConfirm(ctx, W, H) {
    const mw = W - 92;
    const mh = 248;
    const mx = 46;
    const my = centerModalY(H, mh, { minTop: 48, bottomInset: 24 });
    ctx.save();
    roundRect(ctx, mx, my, mw, mh, 24);
    const bg = ctx.createLinearGradient(mx, my, mx, my + mh);
    bg.addColorStop(0, 'rgba(25,8,50,0.99)');
    bg.addColorStop(1, 'rgba(10,2,25,0.99)');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,200,0.24)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, '是否退出游戏？', W / 2, my + 108, '#ffffff', 16, 'center', undefined, 800);
    drawWrappedText(
      ctx,
      '退出后将返回微信对话列表',
      mx + 28,
      my + 132,
      mw - 56,
      20,
      'rgba(255,255,255,0.88)',
      14,
      400
    );
    const btnW = (mw - 58) / 2;
    const by = my + mh - 62;
    const cancel = drawButtonGradient(ctx, mx + 22, by, btnW, 42, '取消', 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0.55)', 14, 14, undefined, 600);
    const ok = drawButtonGradient(ctx, mx + 36 + btnW, by, btnW, 42, '确认退出', gradientPink, '#fff', 14, 14, undefined, 700);
    const self = this;
    this.addTouchable(cancel.x, cancel.y, cancel.w, cancel.h, () => { self.showExitGameConfirm = false; });
    this.addTouchable(ok.x, ok.y, ok.w, ok.h, () => { self._confirmExitGame(); });
  }

  _confirmExitGame() {
    this.showExitGameConfirm = false;
    if (typeof wx !== 'undefined' && typeof wx.exitMiniProgram === 'function') {
      try {
        wx.exitMiniProgram({
          fail: () => showToast('请从右上角胶囊「···」选择关闭')
        });
      } catch (e) {
        showToast('请从右上角胶囊「···」选择关闭');
      }
      return;
    }
    showToast('当前环境不支持退出');
  }

  render(time) {
    this.lastFrameTime = time;
    const ctx = this.ctx;
    this.touchables = [];

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    const W = this.width;
    const H = this.height;

    if (this.currentScene && this.currentScene.render) {
      this.currentScene.render(ctx, W, H, time);
    }

    if (this.showExitGameConfirm) {
      drawModalBackground(ctx, W, H);
      this._drawExitGameConfirm(ctx, W, H);
    }

    // Draw modals on top
    const modals = canvasUI.getModalStack();
    if (modals.length > 0) {
      canvasUI.drawModalBackground(ctx, W, H);
      const m = modals[modals.length - 1];
      canvasUI.drawModal(ctx, Object.assign({}, m, { logicalWidth: W, logicalHeight: H }), this.touchables);
    }

    // Draw toast
    canvasUI.drawToast(ctx, W, H);

    ctx.restore();
  }

  addTouchable(x, y, w, h, handler, data) {
    if (typeof handler === 'string') {
      this.touchables.push({ x, y, w, h, handler, data });
    } else if (typeof handler === 'function') {
      this.touchables.push({ x, y, w, h, handler, data });
    }
  }

  handleTouch(type, x, y) {
    if (isDevelopEnv()) {
      console.log('[SceneManager.handleTouch] type=' + type + ' x=' + x + ' y=' + y + ' touchables=' + this.touchables.length);
    }
    // ── 'start' / 'begin' : 只转发给场景，不触发 touchable ──
    if (type === 'start' || type === 'begin') {
      if (!this.showExitGameConfirm && this.currentScene && this.currentScene.onTouch) {
        this.currentScene.onTouch(type, x, y);
      }
      return;
    }
    // ── 'end' / 'tap' / 'move' : 正常分发 ──
    if (type === 'end' || type === 'tap' || type === 'move') {
      if (this.showExitGameConfirm) {
        if (type === 'tap') handleTouchTap(this.touchables, x, y, this.currentScene);
        return;
      }
      if (canvasUI.getModalStack().length > 0) {
        if (type === 'tap') {
          const handled = canvasUI.handleTouchTap(this.touchables, x, y, this.currentScene);
          if (handled) return;
        }
        return;
      }
      if (this.currentScene && this.currentScene.onTouch) {
        const handled = this.currentScene.onTouch(type, x, y);
        if (handled) return;
      }
      if (type === 'tap') {
        canvasUI.handleTouchTap(this.touchables, x, y, this.currentScene);
      }
    }
  }
}

module.exports = { SceneManager };
