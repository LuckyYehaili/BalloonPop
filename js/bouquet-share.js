/**
 * 气球束「纯展示」分享：离屏 Canvas 生成海报图 → wx.shareAppMessage(imageUrl)
 * 不涉及资产；与气球赠送（giftId / 云库）无关。
 */
const { drawText, roundRect, showToast } = require('./engine/canvas-ui');
const { drawBouquetStillFrame } = require('./engine/bouquet-renderer');
const { BALLOON_TYPES } = require('./balloons');

const SHARE_W = 500;
const SHARE_H = 400;

/** 复用离屏画布，避免反复创建失败 */
let _shareCanvas = null;
let _shareCanvasW = 0;
let _shareCanvasH = 0;

function normalizeBalloonItem(item, fallbackMeta) {
  const meta = (item && item.balloonId && BALLOON_TYPES.find(x => x.id === item.balloonId)) || fallbackMeta || null;
  if (!meta) return item || { emoji: '🎈', shape: 'round', color: '#94a3b8', glowColor: '#64748b' };
  return Object.assign({}, item || {}, {
    emoji: item && item.emoji ? item.emoji : meta.emoji,
    shape: item && item.shape ? item.shape : meta.shape,
    color: item && item.color ? item.color : meta.color,
    glowColor: item && item.glowColor ? item.glowColor : meta.glowColor
  });
}

/** 通关列表等：{ balloonId, emoji, ... }[] */
function normalizeBalloonList(list) {
  const arr = list && list.length ? list : [];
  const normalized = arr.map(item => normalizeBalloonItem(item));
  if (!normalized.length) {
    return [{ emoji: '🎈', shape: 'round', color: '#94a3b8', glowColor: '#64748b' }];
  }
  return normalized;
}

/** 图鉴存档的一条气球束记录 */
function balloonsFromBouquetRecord(bq) {
  if (!bq) return normalizeBalloonList([]);
  let arr = [];
  if (bq.balloons && Array.isArray(bq.balloons) && bq.balloons.length) {
    arr = bq.balloons;
  } else if (bq.originalBalloons && bq.originalBalloons.length) {
    arr = bq.originalBalloons;
  } else if (bq.sourceBalloonId) {
    const m = BALLOON_TYPES.find(x => x.id === bq.sourceBalloonId);
    if (m) arr = [normalizeBalloonItem({ balloonId: m.id }, m)];
  }
  const normalized = arr.map(item => normalizeBalloonItem(item));
  if (!normalized.length) {
    return normalizeBalloonList([]);
  }
  if (normalized.length === 1) {
    return Array.from({ length: 8 }, () => Object.assign({}, normalized[0]));
  }
  return normalized;
}

/**
 * 小游戏中 wx.createCanvas() 首次调用返回上屏画布、后续返回离屏画布。
 * game.js 启动时已创建过上屏画布，故此处再调用得到的是离屏画布，
 * 且原生支持 canvas.toTempFilePath（比 createOffscreenCanvas 2d 更可靠）。
 */
function _tryCreateGameCanvas(wi, hi) {
  if (typeof wx === 'undefined' || typeof wx.createCanvas !== 'function') return null;
  try {
    const canvas = wx.createCanvas();
    if (canvas && typeof canvas.getContext === 'function') {
      canvas.width = wi;
      canvas.height = hi;
      const ctx = canvas.getContext('2d');
      if (ctx) return canvas;
    }
  } catch (e) {
    console.warn('[bouquet-share] createCanvas', e && (e.message || e));
  }
  return null;
}

function _tryCreateOffscreenCanvas(w, h) {
  if (typeof wx === 'undefined' || typeof wx.createOffscreenCanvas !== 'function') return null;
  const wi = Math.max(1, Math.round(w));
  const hi = Math.max(1, Math.round(h));
  try {
    const canvas = wx.createOffscreenCanvas({ type: '2d', width: wi, height: hi });
    if (canvas && typeof canvas.getContext === 'function') {
      canvas.width = wi;
      canvas.height = hi;
      const ctx = canvas.getContext('2d');
      if (ctx) return canvas;
    }
  } catch (e) {
    console.warn('[bouquet-share] createOffscreenCanvas', e && (e.message || e));
  }
  return null;
}

/**
 * 获取分享用离屏画布。
 * 优先 wx.createCanvas()（离屏，支持 toTempFilePath），回退 createOffscreenCanvas。
 */
function _getShareCanvas(w, h) {
  const wi = Math.max(1, Math.round(w));
  const hi = Math.max(1, Math.round(h));
  if (_shareCanvas && _shareCanvasW === wi && _shareCanvasH === hi) {
    return { canvas: _shareCanvas, w: wi, h: hi };
  }
  const canvas = _tryCreateGameCanvas(wi, hi) || _tryCreateOffscreenCanvas(wi, hi);
  if (!canvas) return null;
  _shareCanvas = canvas;
  _shareCanvasW = wi;
  _shareCanvasH = hi;
  return { canvas, w: wi, h: hi };
}

function _waitNextFrame(canvas) {
  return new Promise((resolve) => {
    if (canvas && typeof canvas.requestAnimationFrame === 'function') {
      canvas.requestAnimationFrame(() => resolve());
      return;
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 48);
  });
}

function _waitPaintSettled(canvas) {
  return _waitNextFrame(canvas)
    .then(() => _waitNextFrame(canvas))
    .then(() => new Promise((resolve) => setTimeout(resolve, 64)));
}

function _base64FromDataUrl(dataUrl) {
  const s = String(dataUrl || '');
  const idx = s.indexOf(',');
  return idx >= 0 ? s.slice(idx + 1) : s.replace(/^data:image\/\w+;base64,/, '');
}

function _base64ToBuffer(base64) {
  if (typeof wx !== 'undefined' && typeof wx.base64ToArrayBuffer === 'function') {
    return wx.base64ToArrayBuffer(base64);
  }
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
    return buf.buffer;
  }
  return null;
}

function _writeBase64Png(base64Data) {
  return new Promise((resolve, reject) => {
    if (!wx.getFileSystemManager || !wx.env || !wx.env.USER_DATA_PATH) {
      reject(new Error('no fs'));
      return;
    }
    const fs = wx.getFileSystemManager();
    const filePath = wx.env.USER_DATA_PATH + '/bouquet_share_' + Date.now() + '.png';
    const base64 = _base64FromDataUrl(base64Data);
    const buffer = _base64ToBuffer(base64);
    const opts = {
      filePath,
      success: () => resolve(filePath),
      fail: (err) => reject(err || new Error('writeFile fail'))
    };
    if (buffer) {
      opts.data = buffer;
    } else {
      opts.data = base64;
      opts.encoding = 'base64';
    }
    fs.writeFile(opts);
  });
}

function _tempFileFromCanvasMethod(canvas, wi, hi) {
  return new Promise((resolve, reject) => {
    if (!canvas || typeof canvas.toTempFilePath !== 'function') {
      reject(new Error('no canvas.toTempFilePath'));
      return;
    }
    canvas.toTempFilePath({
      x: 0,
      y: 0,
      width: wi,
      height: hi,
      destWidth: wi,
      destHeight: hi,
      fileType: 'png',
      success(res) {
        if (res && res.tempFilePath) resolve(res.tempFilePath);
        else reject(new Error('empty canvas.toTempFilePath'));
      },
      fail(err) {
        reject(err || new Error('canvas.toTempFilePath fail'));
      }
    });
  });
}

function _tempFileFromWxApi(canvas, wi, hi) {
  return new Promise((resolve, reject) => {
    if (typeof wx.canvasToTempFilePath !== 'function') {
      reject(new Error('no wx.canvasToTempFilePath'));
      return;
    }
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: wi,
      height: hi,
      destWidth: wi,
      destHeight: hi,
      fileType: 'png',
      success(res) {
        if (res && res.tempFilePath) resolve(res.tempFilePath);
        else reject(new Error('empty wx tempFilePath'));
      },
      fail(err) {
        reject(err || new Error('wx.canvasToTempFilePath fail'));
      }
    });
  });
}

/** 离屏 canvas → 本地临时图（小游戏优先 canvas.toTempFilePath，再回退 toDataURL） */
function _exportCanvasToTempFile(canvas, w, h) {
  const wi = Math.round(w);
  const hi = Math.round(h);

  const tryDataUrl = () => {
    if (!canvas || typeof canvas.toDataURL !== 'function') {
      return Promise.reject(new Error('no toDataURL'));
    }
    let dataUrl = '';
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch (e) {
      return Promise.reject(e || new Error('toDataURL throw'));
    }
    if (!dataUrl || dataUrl.length < 64) {
      return Promise.reject(new Error('empty dataUrl'));
    }
    return _writeBase64Png(dataUrl);
  };

  return _tempFileFromCanvasMethod(canvas, wi, hi)
    .catch((err) => {
      console.warn('[bouquet-share] canvas.toTempFilePath fallback wx API', err && (err.errMsg || err.message || err));
      return _tempFileFromWxApi(canvas, wi, hi);
    })
    .catch((err) => {
      console.warn('[bouquet-share] wx.canvasToTempFilePath fallback toDataURL', err && (err.errMsg || err.message || err));
      return tryDataUrl();
    });
}

let _bgImg = null;
let _bgImgLoaded = false;
let _bgImgFailed = false;

function _loadBgImage() {
  if (_bgImgLoaded || _bgImgFailed || typeof wx === 'undefined' || typeof wx.createImage !== 'function') return;
  _bgImg = wx.createImage();
  _bgImg.onload = () => { _bgImgLoaded = true; };
  _bgImg.onerror = () => { _bgImgFailed = true; _bgImg = null; };
  _bgImg.src = 'images/ui/bg2.jpg';
}

function _drawSharePoster(ctx, W, H, balloons, posterTitle, subtitle) {
  ctx.clearRect(0, 0, W, H);

  // 黑色圆角容器
  const cardX = 8;
  const cardY = 8;
  const cardW = W - 16;
  const cardH = H - 16;
  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, 20);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.strokeStyle = 'rgba(134,239,172,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  const headline = posterTitle || '气球束';
  const titleY = 34;
  drawText(ctx, headline, W / 2, titleY, '#86efac', 17, 'center', 'rgba(134,239,172,0.4)', 800);

  let top = 52;
  if (subtitle) {
    drawText(ctx, subtitle, W / 2, top + 10, 'rgba(167,243,208,0.75)', 11, 'center', undefined, 500);
    top = 72;
  } else {
    top = 58;
  }

  const padX = 28;
  const bottom = 28;
  const bqY = top;
  const bqH = H - top - bottom;
  const bqW = W - padX * 2;

  // bg2.jpg 在气球束后面作为背景
  if (!_bgImgLoaded && !_bgImgFailed) _loadBgImage();
  if (_bgImgLoaded && _bgImg) {
    ctx.save();
    // 裁剪到气球区域，避免溢出卡片
    roundRect(ctx, cardX + 2, cardY + 2, cardW - 4, cardH - 4, 18);
    ctx.clip();
    ctx.drawImage(_bgImg, cardX, bqY, cardW, bqH);
    // 气球区域底部渐隐，让黑底托住文字
    const fadeGrad = ctx.createLinearGradient(0, bqY + bqH - 40, 0, bqY + bqH);
    fadeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    fadeGrad.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(cardX, bqY + bqH - 40, cardW, 40);
    // 顶部也渐隐，让标题清晰
    const fadeTop = ctx.createLinearGradient(0, bqY, 0, bqY + 30);
    fadeTop.addColorStop(0, 'rgba(0,0,0,0.85)');
    fadeTop.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fadeTop;
    ctx.fillRect(cardX, bqY, cardW, 30);
    ctx.restore();
  }

  drawBouquetStillFrame(ctx, balloons, padX, bqY, bqW, bqH, { layout: 'centered' });

  drawText(ctx, '不准爆！', W / 2, H - 16, 'rgba(134,239,172,0.45)', 11, 'center', undefined, 500);
}

function _trimQueryText(s, maxLen) {
  const t = s == null ? '' : String(s);
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function _safeDecode(s) {
  try {
    return decodeURIComponent(String(s));
  } catch (_) {
    return String(s);
  }
}

function parseBouquetShareFromQuery(q) {
  if (!q || String(q.bq) !== '1') return null;
  const ids = q.b
    ? _safeDecode(q.b).split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const balloons = ids.length
    ? normalizeBalloonList(ids.map(id => normalizeBalloonItem({ balloonId: id })))
    : normalizeBalloonList([]);
  return {
    shareTitle: q.t ? _safeDecode(q.t) : '好友分享了一束气球',
    posterTitle: q.pt ? _safeDecode(q.pt) : '气球束',
    subtitle: q.s ? _safeDecode(q.s) : '',
    balloons
  };
}

function buildBouquetShareQuery(opts) {
  const balloons = opts.balloons || [];
  const shareTitle = opts.shareTitle || opts.title || '我收集了一束气球，快来看看！';
  const posterTitle = opts.posterTitle || shareTitle;
  const subtitle = opts.subtitle || '';
  const ids = balloons.map(b => (b && b.balloonId) || '').filter(Boolean);
  const parts = [
    'scene=home',
    'bq=1',
    't=' + encodeURIComponent(_trimQueryText(shareTitle, 80)),
    'pt=' + encodeURIComponent(_trimQueryText(posterTitle, 48)),
    's=' + encodeURIComponent(_trimQueryText(subtitle, 48)),
    'b=' + encodeURIComponent(ids.join(','))
  ];
  return parts.join('&');
}

/** 离屏绘制海报并导出为临时图片路径 */
function createBouquetPosterFile(opts) {
  const balloons = normalizeBalloonList(opts && opts.balloons);
  const posterTitle = (opts && opts.posterTitle) || '气球束';
  const subtitle = (opts && opts.subtitle) || '';

  if (typeof wx === 'undefined') {
    return Promise.reject(new Error('no wx'));
  }

  const pack = _getShareCanvas(SHARE_W, SHARE_H);
  if (!pack) {
    return Promise.reject(new Error('offscreen canvas unavailable'));
  }

  const { canvas, w, h } = pack;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('no ctx'));

  _drawSharePoster(ctx, w, h, balloons, posterTitle, subtitle);

  return _waitPaintSettled(canvas)
    .then(() => _exportCanvasToTempFile(canvas, w, h))
    .catch((err) => {
      _shareCanvas = null;
      _shareCanvasW = 0;
      _shareCanvasH = 0;
      throw err;
    });
}

function shareBouquetAsImage(opts) {
  const balloons = normalizeBalloonList(opts && opts.balloons);
  const shareTitle = opts.shareTitle || opts.title || '我收集了一束气球，快来看看！';
  const posterTitle = opts.posterTitle || shareTitle;
  const subtitle = opts.subtitle || '';
  const query = opts.query
    || (opts.viewerLanding ? buildBouquetShareQuery({ balloons, shareTitle, posterTitle, subtitle }) : 'scene=home');

  if (typeof wx === 'undefined') {
    showToast('当前环境不支持分享');
    return Promise.reject(new Error('no wx'));
  }

  return createBouquetPosterFile({ balloons, posterTitle, subtitle }).then((path) => {
    if (!path) throw new Error('empty path');
    if (typeof wx.shareAppMessage === 'function') {
      try {
        wx.shareAppMessage({
          title: shareTitle,
          imageUrl: path,
          query
        });
        return path;
      } catch (e) {
        showToast('请使用右上角菜单分享');
        throw e;
      }
    }
    showToast('请使用右上角菜单分享');
    throw new Error('no shareAppMessage');
  }).catch((err) => {
    if (err && err.message !== 'no shareAppMessage') {
      console.warn('[bouquet-share] share', err && (err.errMsg || err.message || err));
      showToast('分享图生成失败，请稍后再试');
    }
    throw err;
  });
}

module.exports = {
  normalizeBalloonList,
  balloonsFromBouquetRecord,
  buildBouquetShareQuery,
  parseBouquetShareFromQuery,
  createBouquetPosterFile,
  shareBouquetAsImage,
  /** 供自测：导出回退逻辑 */
  _exportCanvasToTempFile
};
