/**
 * 气球束「纯展示」分享：离屏 Canvas 生成海报图 → wx.shareAppMessage(imageUrl)
 * 不涉及资产；与气球赠送（giftId / 云库）无关。
 */
const { drawText, roundRect, showToast } = require('./engine/canvas-ui');
const { drawBouquetStillFrame } = require('./engine/bouquet-renderer');
const { BALLOON_TYPES } = require('./balloons');

const SHARE_W = 500;
const SHARE_H = 400;

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

function _createShareCanvas(w, h) {
  if (typeof wx === 'undefined') return null;
  if (typeof wx.createOffscreenCanvas === 'function') {
    return wx.createOffscreenCanvas({ type: '2d', width: w, height: h });
  }
  const c = wx.createCanvas();
  c.width = w;
  c.height = h;
  return c;
}

function _drawSharePoster(ctx, W, H, balloons, posterTitle, subtitle) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a2e24');
  bg.addColorStop(0.55, '#061a16');
  bg.addColorStop(1, '#030e0c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  roundRect(ctx, 8, 8, W - 16, H - 16, 20);
  ctx.strokeStyle = 'rgba(134,239,172,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  const headline = posterTitle || '气球束';
  drawText(ctx, headline, W / 2, 36, '#86efac', 17, 'center', 'rgba(134,239,172,0.4)', 800);
  let top = 64;
  if (subtitle) {
    drawText(ctx, subtitle, W / 2, 58, 'rgba(167,243,208,0.75)', 12, 'center', undefined, 500);
    top = 72;
  }

  const padX = 36;
  const bottom = 36;
  const bqY = top;
  const bqH = H - top - bottom;
  const bqW = W - padX * 2;
  drawBouquetStillFrame(ctx, balloons, padX, bqY, bqW, bqH);

  drawText(ctx, '不准爆！', W / 2, H - 18, 'rgba(134,239,172,0.45)', 11, 'center', undefined, 500);
}

function _trimQueryText(s, maxLen) {
  const t = s == null ? '' : String(s);
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

/** 从启动 query 解析好友落地页所需的花束数据 */
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

/** 生成带好友落地深链的启动参数（scene=home&bq=1&…） */
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
  const balloons = opts.balloons || [];
  const posterTitle = opts.posterTitle || '气球束';
  const subtitle = opts.subtitle || '';

  if (typeof wx === 'undefined') {
    return Promise.reject(new Error('no wx'));
  }

  const canvas = _createShareCanvas(SHARE_W, SHARE_H);
  if (!canvas) return Promise.reject(new Error('no canvas'));
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('no ctx'));

  _drawSharePoster(ctx, SHARE_W, SHARE_H, balloons, posterTitle, subtitle);

  return new Promise((resolve, reject) => {
    const fileOpts = {
      canvas,
      x: 0,
      y: 0,
      width: SHARE_W,
      height: SHARE_H,
      destWidth: SHARE_W,
      destHeight: SHARE_H,
      fileType: 'jpg',
      quality: 0.9,
      success(res) {
        if (res.tempFilePath) resolve(res.tempFilePath);
        else reject(new Error('empty path'));
      },
      fail(err) {
        reject(err || new Error('export fail'));
      }
    };
    if (typeof wx.canvasToTempFilePath === 'function') {
      wx.canvasToTempFilePath(fileOpts);
    } else {
      reject(new Error('no canvasToTempFilePath'));
    }
  });
}

/**
 * @param {Object} opts
 * @param {Array} opts.balloons 已 normalize 的气球列表
 * @param {string} [opts.shareTitle] 微信分享卡片标题
 * @param {string} [opts.title] 同 shareTitle（兼容）
 * @param {string} [opts.posterTitle] 海报主标题；默认取 shareTitle
 * @param {string} [opts.subtitle] 海报副标题一行
 * @param {string} [opts.query] 启动参数；viewerLanding 为 true 时自动生成 bq=1 深链
 * @param {boolean} [opts.viewerLanding] 好友打开后首页展示花束弹窗
 */
function shareBouquetAsImage(opts) {
  const balloons = opts.balloons || [];
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
      console.warn('[bouquet-share] share', err);
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
  shareBouquetAsImage
};
