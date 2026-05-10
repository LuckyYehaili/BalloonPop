/**
 * 顶栏与微信胶囊对齐（逻辑像素，与 game.js canvas 尺寸一致）。
 * getCapsuleLayout() 可在每帧调用；内部为轻量同步 API。
 */
function getCapsuleLayout() {
  const fallback = {
    top: 28,
    bottom: 64,
    height: 32,
    left: 280,
    width: 88,
    statusBar: 24,
    windowWidth: 375,
    windowHeight: 812
  };

  if (typeof wx === 'undefined' || !wx.getSystemInfoSync) {
    const capsuleCenterY = fallback.top + fallback.height / 2;
    const contentTop = fallback.bottom + 10;
    const safeBottomInset = 20;
    return Object.assign({}, fallback, {
      capsuleCenterY,
      contentTop,
      innerTitleY: capsuleCenterY,
      navTitleY: capsuleCenterY,
      safeBottomInset
    });
  }

  const sys = wx.getSystemInfoSync();
  const statusBar = Number(sys.statusBarHeight) || 24;
  const windowWidth = Number(sys.windowWidth) || 375;
  const windowHeight = Number(sys.windowHeight) || Number(sys.screenHeight) || 667;

  let top = statusBar + 4;
  let bottom = statusBar + 36;
  let height = 32;
  let left = windowWidth - 96;
  let width = 88;

  if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
    try {
      const m = wx.getMenuButtonBoundingClientRect();
      if (m && typeof m.top === 'number' && typeof m.height === 'number' && m.height > 0) {
        top = m.top;
        bottom = m.bottom;
        height = m.height;
        if (typeof m.left === 'number') left = m.left;
        if (typeof m.width === 'number') width = m.width;
      }
    } catch (e) { /* 模拟器或异常时保持估算 */ }
  }

  const capsuleCenterY = top + height / 2;
  const contentTop = bottom + 10;

  /** 底部非安全区高度（如 Home 指示条），用于把操作钮整体上移 */
  let safeBottomInset = 0;
  if (sys.safeArea && typeof sys.safeArea.bottom === 'number') {
    safeBottomInset = Math.max(0, windowHeight - sys.safeArea.bottom);
  }
  safeBottomInset = Math.min(48, Math.round(safeBottomInset));

  return {
    top,
    bottom,
    height,
    left,
    width,
    statusBar,
    windowWidth,
    windowHeight,
    capsuleCenterY,
    contentTop,
    innerTitleY: capsuleCenterY,
    navTitleY: capsuleCenterY,
    safeBottomInset
  };
}

module.exports = { getCapsuleLayout };
