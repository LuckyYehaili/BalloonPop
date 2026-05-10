// Scene Manager - 场景管理器
const canvasUI = require('../engine/canvas-ui');
const store = require('../store');

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
    if (this.currentScene && this.currentScene.onHide) this.currentScene.onHide();
    this.currentSceneName = name;
    this.currentScene = this.scenes[name];
    if (this.currentScene) {
      this.currentScene.W = this.width;
      this.currentScene.H = this.height;
      if (this.currentScene.onShow) this.currentScene.onShow(data);
    }
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    if (this.currentScene) {
      this.currentScene.W = width;
      this.currentScene.H = height;
    }
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
    console.log('[SceneManager.handleTouch] type=' + type + ' x=' + x + ' y=' + y + ' touchables=' + this.touchables.length);
    // ── 'start' / 'begin' : 只转发给场景，不触发 touchable ──
    if (type === 'start' || type === 'begin') {
      if (this.currentScene && this.currentScene.onTouch) {
        this.currentScene.onTouch(type, x, y);
      }
      return;
    }
    // ── 'end' / 'tap' / 'move' : 正常分发 ──
    // 注：game.js 在同一次松手会先发 'tap' 再发 'end'；可点击区只在 'tap' 上命中一次，
    // 避免开关等被 handleTouchTap 连点两次（看起来「点了没反应」）。
    if (type === 'end' || type === 'tap' || type === 'move') {
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
