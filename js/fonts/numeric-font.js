/**
 * 数字专用字体 — DIN Alternate（小游戏 Canvas 单模块集中配置）
 *
 * ── Web / 小程序组件（WXML + WXSS）中等价写法，后续字体托管到 HTTPS 后：
 * 1. 将文件放到可访问的 https://你的域名/.../DINAlternate.ttf
 * 2. 小程序后台「开发 → 开发管理 → 服务器域名」配置 downloadFile 合法域名
 * 3. 在组件 wxss 中：
 *
 * @font-face {
 *   font-family: 'DIN Alternate';
 *   src: url('https://你的域名/fonts/DINAlternate.ttf') format('truetype');
 *   font-weight: 100 900;
 *   font-display: swap;
 * }
 * .numeric { font-family: 'DIN Alternate', 'Helvetica Neue', monospace; }
 *
 * ── 小游戏 Canvas：使用 wx.loadFontFace，family 必须与下方 FONT_FACE_FAMILY 一致。
 *    调用 setNumericFontSourceUrl('https://...') 后再 loadNumericFont(cb)。
 */

const FONT_FACE_FAMILY = 'DIN Alternate';

/** Canvas ctx.font 用字栈（与 loadFontFace 的 family 一致） */
const FONT_STACK = '"DIN Alternate","DIN Alternate","Helvetica Neue",ui-monospace,monospace';

let _loadAttempted = false;

/** 远程或本地绝对地址；留空则不请求 loadFontFace，仅靠系统已安装/已缓存字族 */
let fontSourceUrl = '';

function setNumericFontSourceUrl(url) {
  fontSourceUrl = (url && String(url).trim()) || '';
}

function getNumericFontFaceFamily() {
  return FONT_FACE_FAMILY;
}

function getNumericFontStack() {
  return FONT_STACK;
}

/** @param {number|string} weight @param {number} sizePx */
function fontNumericString(sizePx, weight) {
  const w = weight != null && weight !== '' ? weight : 600;
  return `${w} ${sizePx}px ${FONT_STACK}`;
}

/**
 * 将字符串拆成「连续数字（含千分位 , .）」与「非数字」交替片段，便于分段设 font
 */
function segmentDigitRuns(text) {
  if (text == null || text === '') return [{ num: false, s: '' }];
  const str = String(text);
  const out = [];
  let i = 0;
  while (i < str.length) {
    const ch = str[i];
    if (ch >= '0' && ch <= '9') {
      let j = i + 1;
      while (j < str.length && /[\d,.]/.test(str[j])) j++;
      out.push({ num: true, s: str.slice(i, j) });
      i = j;
    } else {
      let j = i + 1;
      while (j < str.length && (str[j] < '0' || str[j] > '9')) j++;
      out.push({ num: false, s: str.slice(i, j) });
      i = j;
    }
  }
  return out;
}

function loadNumericFont(done) {
  const cb = typeof done === 'function' ? done : () => {};
  if (_loadAttempted) {
    cb();
    return;
  }
  _loadAttempted = true;
  if (!fontSourceUrl || typeof wx === 'undefined' || !wx.loadFontFace) {
    cb();
    return;
  }
  wx.loadFontFace({
    family: FONT_FACE_FAMILY,
    source: `url("${fontSourceUrl}")`,
    success() {
      cb();
    },
    fail(err) {
      console.warn('[numeric-font] loadFontFace failed', err);
      cb();
    }
  });
}

module.exports = {
  FONT_FACE_FAMILY,
  FONT_STACK,
  setNumericFontSourceUrl,
  getNumericFontFaceFamily,
  getNumericFontStack,
  fontNumericString,
  segmentDigitRuns,
  loadNumericFont
};
