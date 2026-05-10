/**
 * 全局 UI 令牌 — 微信小游戏 Canvas 2D
 * 方向：深空冷底 + 青紫高光 + 克制粉（仅强调/危险）
 * 字体：系统中文栈（无需额外字体文件）
 */
module.exports = {
  font: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',

  // 文本层级
  text: '#eef2ff',
  textMuted: 'rgba(238,242,255,0.58)',
  textDim: 'rgba(238,242,255,0.38)',
  textInverse: '#0b1020',

  // 品牌高光（主交互、描边）—— 整体下调饱和度，避免真机显示过艳
  accent: '#7dd3fc',
  accentDeep: '#38bdf8',
  violet: '#a78bfa',
  violetDeep: '#818cf8',
  danger: '#f87171',
  success: '#86efac',
  successDeep: '#4ade80',
  gold: '#fcd34d',
  // amber 用于「超压」填充与超压辉光：换成浅红 (light rose)，避免与目标区绿色冲突显黄
  amber: '#fda4af',

  // 线框 / 玻璃
  stroke: 'rgba(125,211,252,0.22)',
  strokeSoft: 'rgba(148,163,184,0.14)',
  strokeViolet: 'rgba(167,139,250,0.32)',
  glass: 'rgba(15,23,42,0.72)',
  glassLight: 'rgba(255,255,255,0.06)',

  // 常用整串（Canvas 直接用）
  shadowTitle: 'rgba(56,189,248,0.35)',
  shadowAccent: 'rgba(167,139,250,0.4)',
  panelStroke: 'rgba(125,211,252,0.18)',
  pillGoldStroke: 'rgba(252,211,77,0.42)',
  ambientBalloon: 'rgba(56,189,248,0.06)',
  cardCurrentFill: 'rgba(56,189,248,0.1)',
  cardCurrentStroke: 'rgba(125,211,252,0.45)',
  cardEmptyStroke: 'rgba(148,163,184,0.12)',
  cardDoneStroke: 'rgba(74,222,128,0.38)',
  cardDoneFill: 'rgba(34,197,94,0.1)'
};
