// Home Scene - 主页 (PRD 1.2 优化版)
const { 
  drawBackground, drawText, drawButton, drawButtonGradient, drawImage, drawWrappedText, 
  gradientPink, gradientGold, showModal, showToast, roundRect, measureText, 
  beginScrollView, endScrollView, loadImages, getImage, drawModalBackground
} = require('../engine/canvas-ui');
const store = require('../store');
const cloudTeam = require('../cloud-team');
const { BALLOON_TYPES } = require('../balloons');
const UX = require('../ui-theme');
const { getCapsuleLayout } = require('../layout-safe');
const legalModal = require('../engine/legal-modal');
const settingsModal = require('../engine/settings-modal');
const { getUserAgreementText } = require('../legal-documents');
const { computeHomeStatsDisplay, getRealHomeStatsFromStore } = require('../home-stats-display');
const { isUserLoggedIn } = require('../auth-guard');

// 首页用到的 PNG 图标统一登记，方便 onShow 预加载与渲染时索引
const UI_IMG = {
  online: 'images/ui/online.png',           // 统计卡-在线玩家
  activeTeam: 'images/ui/active-team.png',  // 统计卡-活跃战队
  liveRank: 'images/ui/live-rank.png',      // 实时排名条左侧图标
  collection: 'images/ui/collection.png',   // 底栏-气球图鉴
  profile: 'images/ui/profile.png',         // 底栏-我的
  teamEmpty: 'images/ui/teamempty.png',     // 未入队主卡-中上方占位图
  popLogo: 'images/ui/POP-logo.png',        // 顶部 Hero 主视觉 LOGO
  setting: 'images/ui/setting.png'          // 左上角-设置入口
};
let _uiImgLoaded = false;                   // 是否已触发过一次预加载（onShow 内根据缓存命中再校验）

// 首页渲染快照：来自 store 的派生数据，render 直接读这份对象避免每帧重算
let state = {
  userAvatar: '', userNickName: '玩家', legendTotal: 0, legendTotalAll: 0, // 个人资料 + 图鉴进度
  lastLevel: 1, highestLevel: 1, isFirstTime: true,                        // 上次/最高关卡 + 是否首次进入
  isLoggedIn: false,                                                        // 微信授权登录态
  hasTeam: false, teamName: '', teamMemberCount: 0, teamPeriodClears: 0,    // 战队信息
  topTeams: [], recentBalloons: [],                                        // 排行榜前几 + 最近获得气球
  showLoginModal: false,                                                    // 微信授权登录弹窗
  showBouquetShareModal: false,                                             // 好友点开花束分享落地弹窗
  bouquetShare: null,                                                       // { shareTitle, posterTitle, subtitle, balloons }
  bouquetSharePosterPath: '',                                               // 与分享卡片一致的海报临时图
  bouquetSharePosterLoading: false,
  loginOverlayFromBouquet: false,
  showNotification: false, scrollY: 0, contentHeight: 0,                    // 通知弹窗 + 滚动相关
  displayTeamCount: 1, displayUserCount: 1                                  // 首页统计卡展示值（进入时计算一次）
};

// 统一主题 + 赛博霓虹首页（参考战队页视觉）
const THEME = {
  primary: UX.accentDeep,
  primaryGradient: [UX.accentDeep, UX.violetDeep],
  gold: UX.gold,
  silver: '#94a3b8',
  bronze: '#c2410c',
  textMain: UX.text,
  textSecondary: UX.textMuted,
  textTertiary: UX.textDim,
  bgCard: 'rgba(18,14,42,0.94)',
  bgCardHighlight: 'rgba(236,72,153,0.06)',
  borderLight: 'rgba(167,139,250,0.22)',
  borderPrimary: 'rgba(236,72,153,0.35)',
  neonPink: '#f472b6',
  neonCyan: '#22d3ee',
  neonGold: '#fcd34d',
  neonViolet: '#a78bfa',
  radius: {
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24
  },
  spacing: {
    base: 16,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32
  }
};

// 通用「霓虹卡片」：圆角矩形 + 半透填充 + 描边，几乎所有卡都基于它
function _drawNeonCard(ctx, x, y, w, h, r, fill, stroke, lineW) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineW || 1.15;
  ctx.stroke();
  ctx.restore();
}

// 数字千分位格式化：负值/非数字会被夹到 0 防止 NaN
function _fmtComma(n) {
  const s = String(Math.max(0, Math.round(Number(n) || 0)));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function _sumTeamPeriodClears(team) {
  if (!team) return 0;
  if (team.periodClears != null) return Number(team.periodClears) || 0;
  if (Array.isArray(team.members) && team.members.length) {
    return team.members.reduce((sum, m) => sum + (Number(m && m.periodClears) || 0), 0);
  }
  return 0;
}

/**
 * 在「一屏适配 ctx.scale(1, scaleY)」区域内绘制方形/比例正确的 icon：
 * 直接用 drawImage(x, y, w, h) 会被纵向压扁（X 不变，Y 乘 scaleY），
 * 这里把逻辑高度反向放大为 h / scaleY，并以原中心为锚点重算 Y，
 * 最终在屏幕上仍然是 w×h，避免变形。
 */
function _drawIconFit(ctx, img, x, y, w, h, scaleY) {
  const sy = scaleY > 0 ? scaleY : 1;
  if (sy >= 0.999) {
    drawImage(ctx, img, x, y, w, h);
    return;
  }
  const lh = h / sy;                     // 逻辑高度反向放大，使 lh * sy = h
  const cy = y + h / 2;                  // 原本期望的视觉中心
  const ly = cy - lh / 2;                // 反推左上角 Y，保持中心不动
  drawImage(ctx, img, x, ly, w, lh);
}

/** 按 measureText 宽度截断，超出 maxWidth 时末尾加省略号 */
function _truncateByMeasure(ctx, text, fontSize, fontWeight, maxWidth) {
  const s = String(text || '');
  if (!s) return '';
  if (maxWidth <= 0) return '…';
  if (measureText(ctx, s, fontSize, fontWeight) <= maxWidth) return s;
  const ell = '…';
  let cut = s;
  while (cut.length > 0 && measureText(ctx, cut + ell, fontSize, fontWeight) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return cut ? cut + ell : ell;
}

// 背景赛博网格：60×60px、极淡粉色（3% 透明度）
function _drawCyberGrid(ctx, W, H) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,80,200,0.03)';
  ctx.lineWidth = 1;
  const step = 60;
  for (let x = 0; x <= W; x += step) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
  }
  ctx.restore();
}

function _lerp(a, b, t) { return a + (b - a) * t; }

// 8 颗漂浮粒子（粉/青交替）：各自独立周期 7-21s 的 drift 动画
// keyframes 对齐：
//   0%/100% → (0, 0)        opacity 0.6
//   33%     → (5, -15)      opacity 1.0
//   66%     → (-4, -8)      opacity 0.8
const _PARTICLES = [
  { x: 0.08, y: 0.08, r: 2.0, period:  9000, phase: 0.00 },
  { x: 0.22, y: 0.20, r: 3.0, period: 13000, phase: 0.18 },
  { x: 0.40, y: 0.06, r: 1.8, period:  7000, phase: 0.35 },
  { x: 0.62, y: 0.22, r: 3.5, period: 16000, phase: 0.52 },
  { x: 0.80, y: 0.10, r: 2.2, period: 11000, phase: 0.06 },
  { x: 0.92, y: 0.30, r: 2.6, period: 19000, phase: 0.71 },
  { x: 0.28, y: 0.55, r: 4.0, period: 21000, phase: 0.42 },
  { x: 0.72, y: 0.68, r: 2.4, period: 15000, phase: 0.85 }
];

function _drawParticles(ctx, W, H, timeMs) {
  const t = timeMs || 0;
  ctx.save();
  for (let i = 0; i < _PARTICLES.length; i++) {
    const c = _PARTICLES[i];
    const phase = (((t / c.period) + c.phase) % 1 + 1) % 1;
    let dx, dy, a;
    if (phase < 0.33) {
      const f = phase / 0.33;
      dx = _lerp(0,    5, f); dy = _lerp(0,  -15, f); a = _lerp(0.6, 1.0, f);
    } else if (phase < 0.66) {
      const f = (phase - 0.33) / 0.33;
      dx = _lerp(5,   -4, f); dy = _lerp(-15, -8, f); a = _lerp(1.0, 0.8, f);
    } else {
      const f = (phase - 0.66) / 0.34;
      dx = _lerp(-4,   0, f); dy = _lerp(-8,   0, f); a = _lerp(0.8, 0.6, f);
    }
    const isPink = i % 2 === 0;
    const px = c.x * W + dx;
    const py = c.y * H + dy;
    ctx.beginPath();
    ctx.arc(px, py, c.r, 0, Math.PI * 2);
    ctx.fillStyle = isPink ? `rgba(255,80,200,${a})` : `rgba(64,224,208,${a * 0.9})`;
    ctx.shadowColor = isPink ? 'rgba(255,80,200,0.4)' : 'rgba(64,224,208,0.35)';
    ctx.shadowBlur = 4 + c.r * 2;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

// 6 颗装饰气球：emoji 横排，尺寸 16→31，各自独立 float（周期 / 延迟错开形成波浪）
// float keyframes:  0%/100% translateY(0) → 50% translateY(-8)，ease-in-out
const _DECOR_BALLOONS = [
  { emoji: '🔴', size: 16, period: 2500, delay:    0, alpha: 0.70, glow: 'rgba(255,80,80,0.4)'   },
  { emoji: '🟠', size: 19, period: 2800, delay:  400, alpha: 0.75, glow: 'rgba(255,145,0,0.4)'   },
  { emoji: '🟡', size: 22, period: 3100, delay:  800, alpha: 0.80, glow: 'rgba(255,215,64,0.4)'  },
  { emoji: '🟢', size: 25, period: 3400, delay: 1200, alpha: 0.85, glow: 'rgba(80,220,160,0.4)'  },
  { emoji: '🔵', size: 28, period: 3700, delay: 1600, alpha: 0.90, glow: 'rgba(80,160,255,0.4)'  },
  { emoji: '🟣', size: 31, period: 4000, delay: 2000, alpha: 0.95, glow: 'rgba(168,85,247,0.4)'  }
];

function _drawDecorBalloons(ctx, cx, baseY, timeMs) {
  const n = _DECOR_BALLOONS.length;
  const gap = 36;
  const startX = cx - gap * (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const b = _DECOR_BALLOONS[i];
    const phase = ((((timeMs - b.delay) / b.period) % 1) + 1) % 1;
    const dy = -4 * (1 - Math.cos(phase * Math.PI * 2));            // ease-in-out 0..-8..0
    const px = startX + i * gap;
    const py = baseY + dy;
    ctx.save();
    ctx.globalAlpha = b.alpha;
    ctx.shadowColor = b.glow;
    ctx.shadowBlur = 10;
    ctx.font = `500 ${b.size}px ${UX.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(b.emoji, px, py);
    ctx.restore();
  }
}

/** 与 render 主体内 y 累加一致（逻辑高度，不含顶部胶囊与安全区）
 *  作用：给一屏适配 scaleY = availH / bodyLogicalH 计算，避免内容溢出或留白。
 *  改了任何一段固定高度（Hero、统计卡、轮播、主卡、底栏）都要同步这里 */
function _homeLogicalBodyHeight(hasTeam) {
  let y = 0;
  const heroR = 24;
  y += heroR + heroR + 48;        // Hero：圆圈直径 + 圈到标题 48px
  y += 30 + 16 + 26;              // 标题 + 两行说明 + 留白
  y += 26 + 44 + 20;              // 装饰气球区（卡片区上移 16px）
  y += 66 + 10;                   // 双列统计卡
  y += 46 + 12;                   // 实时排名轮播
  y += (hasTeam ? 280 : 264) + 12;// 主卡（有/无战队两种高度；无战队已去掉三栏小卡）
  y += 58 + 12;                   // 底栏
  return y;
}

// 实时排名轮播的数据源：优先取真实排行榜前几，没有就回落到内置 fallback
function _carouselTeamList() {
  if (state.topTeams && state.topTeams.length) {
    return state.topTeams.map(t => ({
      rank: t.rank,
      name: t.name,
      clears: Math.max(100, Math.round((t.periodClears || 0) * 160 + 4200)) // 把通关数 × 系数 + 基线，做出"看起来更大"的展示数字
    }));
  }
  return [
    { rank: 1, name: '烈焰骑士团', clears: 15680 },
    { rank: 2, name: '霓虹战队', clears: 12840 },
    { rank: 3, name: '糖果联盟', clears: 9820 },
    { rank: 4, name: '云端神殿', clears: 11230 },
    { rank: 5, name: '星河探险队', clears: 7650 }
  ];
}

module.exports = {
  // 进入首页：缺图就重新预加载，再刷新一次状态快照
  onShow(data) {
    const needReload = !_uiImgLoaded || Object.values(UI_IMG).some(p => !getImage(p));
    if (needReload) {
      _uiImgLoaded = true;
      loadImages(Object.values(UI_IMG), () => {});
    }
    const d = data || {};
    if (d.bouquetShare) {
      state.showBouquetShareModal = true;
      state.bouquetShare = d.bouquetShare;
      state.bouquetSharePosterPath = '';
      state.bouquetSharePosterLoading = true;
      state.showLoginModal = false;
      const { createBouquetPosterFile } = require('../bouquet-share');
      const payload = d.bouquetShare;
      createBouquetPosterFile({
        balloons: payload.balloons,
        posterTitle: payload.posterTitle,
        subtitle: payload.subtitle
      }).then((path) => {
        if (!state.showBouquetShareModal || state.bouquetShare !== payload) return;
        state.bouquetSharePosterPath = path;
        state.bouquetSharePosterLoading = false;
        if (path) loadImages([path], () => {});
      }).catch(() => {
        if (state.showBouquetShareModal && state.bouquetShare === payload) {
          state.bouquetSharePosterLoading = false;
        }
      });
    } else {
      state.showBouquetShareModal = false;
      state.bouquetShare = null;
      state.bouquetSharePosterPath = '';
      state.bouquetSharePosterLoading = false;
      state.loginOverlayFromBouquet = false;
    }
    const { cloudLogin } = require('../cloud-login');
    cloudLogin().finally(() => {
      cloudTeam.syncTeamFromCloud().finally(() => this._refresh());
    });
  },
  // 把 store 里散乱的数据整理成 render 一次性可用的 state（避免每帧 IO/计算）
  _refresh() {
    try {
      const user = store.getUser() || {};
      const team = store.getTeam();
      const ranked = store.getRankedTeams() || [];
      const owned = store.getOwnedBalloons() || {};
      const totalLegends = (BALLOON_TYPES || []).filter(b=>b&&b.isPaid).length;             // 全部可购买的传说气球总数
      const legendCount = Object.keys(owned).filter(id=>{                                   // 当前持有的传说气球数量
        const b=BALLOON_TYPES.find(t=>t.id===id);
        return b&&b.isPaid&&owned[id]&&owned[id].quantity>0;
      }).length;
      const ownedList = Object.entries(owned)
        .filter(([id, info]) => {                                                           // 仅保留库存>0 的气球
          const b = BALLOON_TYPES.find(t => t.id === id);
          return b && info && info.quantity > 0;
        })
        .sort((a, b) => store.parseStoredTime(b[1].acquiredAt) - store.parseStoredTime(a[1].acquiredAt))    // 按获得时间倒序（iOS 安全解析）
        .slice(0, 3)                                                                        // 只展示最近 3 个
        .map(([id,info])=>{
          const bd=BALLOON_TYPES.find(t=>t.id===id);
          return bd?{id:bd.id,emoji:bd.emoji,color:bd.color,name:bd.name}:null;
        }).filter(Boolean);

      state.userAvatar = (user.avatar)||'';
      state.userNickName = (user.nickName)||'玩家';
      state.legendTotal = legendCount;
      state.legendTotalAll = totalLegends;
      state.lastLevel = store.getLastPlayedLevel() || 1;
      state.highestLevel = store.getHighestLevel() || 1;
      state.isFirstTime = !!user.isFirstTime;
      state.isLoggedIn = isUserLoggedIn(user);
      state.hasTeam = !!team;
      state.teamName = team?team.name:'';
      state.teamMemberCount = team?(team.members?team.members.length:team.memberCount||0):0;
      state.teamPeriodClears = _sumTeamPeriodClears(team);
      state.topTeams = ranked.slice(0,5);
      state.recentBalloons = ownedList;

      const homeStats = computeHomeStatsDisplay(getRealHomeStatsFromStore(store));
      state.displayTeamCount = homeStats.displayTeamCount;
      state.displayUserCount = homeStats.displayUserCount;

      // 未登录（含 mock_ openid）：强制登录弹窗；花束落地页先展示花束，点「进入游戏」再叠登录
      if (!state.isLoggedIn && !state.showBouquetShareModal) {
        state.showLoginModal = true;
      }

      // 首次未授权通知：登录后再提示，避免与登录弹窗叠层
      if (state.isLoggedIn && !store.isNotificationAuthorized() && !(store.getUser().lastNotificationPrompt)) {
        state.showNotification = true;
        store.updateUser({lastNotificationPrompt: Date.now()});
      }
    } catch (e) {
      console.error('[home._refresh] 数据刷新失败:', e.message, e.stack);
    }
  },
  render(ctx, W, H, timeMs) {
    const t = timeMs || 0;
    drawBackground(ctx, W, H, ['#080520', '#0d0b3a', '#08082a', '#050518']); // 渐变深色背景
    _drawCyberGrid(ctx, W, H);                                                // 装饰网格
    _drawParticles(ctx, W, H, t);                                             // 呼吸彩点

    const scene = this;
    const padding = THEME.spacing.base;     // 全局左右内边距（16）
    const L = getCapsuleLayout();           // 顶部胶囊安全区信息（不同手机不同）
    const cx = W / 2;

    // 顶部柔光氛围：中心放射渐变到透明，强化"光从上方洒下"的感觉
    ctx.save();
    const amb = ctx.createRadialGradient(cx, L.contentTop * 0.5, 0, cx, H * 0.35, W * 0.75);
    amb.addColorStop(0, 'rgba(255,80,200,0.1)');
    amb.addColorStop(0.4, 'rgba(124,77,255,0.06)');
    amb.addColorStop(1, 'transparent');
    ctx.fillStyle = amb;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // —— 一屏适配：把"逻辑高度"映射到"可用高度"，整体仅纵向缩放 ——
    const safeB = Math.max(8, L.safeBottomInset || 0);                 // 底部安全区
    const topY = Math.max(L.contentTop + 2, 48);                       // 内容起始 Y（避开胶囊）
    const availH = Math.max(1, H - topY - safeB - 8);                  // 可用绘制高度
    const bodyLogicalH = _homeLogicalBodyHeight(state.hasTeam);        // 设计稿逻辑总高度
    let scaleY = bodyLogicalH > 0 ? availH / bodyLogicalH : 1;
    if (!Number.isFinite(scaleY) || scaleY <= 0) scaleY = 1;
    scaleY = Math.min(1, scaleY);                                      // 不放大，最多 1:1
    scene._homeFit = { topY, scaleY };
    const sy = (relY, relH) => topY + relY * scaleY;                   // 把 render 内 y 转屏幕 y（用于 addTouchable）
    const sh = (relH) => relH * scaleY;                                // 同理转高度

    ctx.save();
    ctx.translate(0, topY);                                            // 整块往下平移到 topY
    ctx.scale(1, scaleY);                                              // 仅纵向 scale，避免横向被拉伸
    let y = 0;                                                         // 之后所有区块的 y 累加都基于 0

    // —— Hero：顶部 POP-LOGO 主视觉（3s 上下浮动 + 粉色发光） ——
    const heroR = 40;                                          // 占位半径，沿用一屏适配里的尺寸
    const logoSize = heroR * 2 + 16;                           // LOGO 容器尺寸（直径 + 一点余量）
    const hyBase = y + heroR;                                  // 容器基线中心 Y（用于布局，不随动画偏移）
    const heroPhase = ((t % 3000) / 3000);                     // 0..1
    const heroDy = -4 * (1 - Math.cos(heroPhase * Math.PI * 2)); // ease-in-out: 0 → -8 → 0
    const hy = hyBase + heroDy;                                // 实际绘制中心
    ctx.save();
    ctx.shadowColor = 'rgba(255,80,200,0.3)';
    ctx.shadowBlur = 30;
    _drawIconFit(ctx, UI_IMG.popLogo, cx - logoSize / 2, hy - logoSize / 2, logoSize, logoSize, scaleY); // 居中绘制 LOGO（容器控大小，纵向缩放反向补偿避免压扁）
    ctx.shadowBlur = 0;
    ctx.restore();
    y = hyBase + heroR + 24;                                                                   // 圆圈底到标题：固定 48px（用基线，不受动画影响）
    drawText(ctx, '不准爆！', cx, y, '#ffffff', 24, 'center', 'rgba(255,80,200,0.75)', 700);    // 主标题（粉色发光）
    y += 32;
    drawText(ctx, '按住充气，在临界点精准松手！', cx, y, 'rgba(255,255,255,0.45)', 12, 'center', undefined, 400); // 副标题第一行
    y += 16;
    drawText(ctx, '就是这么刺激！', cx, y, 'rgba(255,255,255,0.45)', 12, 'center', undefined, 400); // 副标题第二行
    y += 26;

    // 装饰气球：6 颗 emoji 横排，各自独立 float（周期 2.5~4.0s、延迟 0~2.0s）
    const baseY = y + 26;
    _drawDecorBalloons(ctx, cx, baseY, t);
    y = baseY + 44;
    y += 20;

    // —— 双列全局统计（进入首页时计算一次，停留期间固定） ——
    const onlineV = _fmtComma(state.displayUserCount);
    const activeV = _fmtComma(state.displayTeamCount);
    const hw = (W - padding * 2 - 10) / 2;
    const hh = 66;                                                                     // 单卡高度
    const heroStats = [                                                                // 两张统计卡的数据源
      { img: UI_IMG.online, val: onlineV, lab: '在线玩家', col: '#ff50c8', sh: 'rgba(255,80,200,0.45)' },     // 左卡：在线玩家
      { img: UI_IMG.activeTeam, val: activeV, lab: '活跃战队', col: '#ff50c8', sh: 'rgba(255,80,200,0.45)' }  // 右卡：活跃战队
    ];
    heroStats.forEach((d, i) => {
      const sx = padding + i * (hw + 10);                                              // 当前卡左上角 X：左 padding + 第 i 张卡的横向偏移
      _drawNeonCard(ctx, sx, y, hw, hh, 14, 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.14)', 1); // 绘制霓虹底卡（圆角 14、半透白填充与描边）
      const iconLeft = sx + 24;                                                      // 图标左对齐：距卡左 24px
      const iconTop = y + 17;                                                        // 图标顶边
      // icon container: 32x32 (no extra background; PNG already includes it)         // 图标固定 32×32，PNG 自带底色
      _drawIconFit(ctx, d.img, iconLeft, iconTop, 32, 32, scaleY);
      const textLeft = iconLeft + 32 + 16;                                            // 文字左对齐起点：紧跟图标右侧 16px
      ctx.save();
      ctx.shadowColor = d.sh;                                                          // 数值文字阴影色（霓虹粉）
      ctx.shadowBlur = 8;                                                              // 数值文字模糊半径
      drawText(ctx, d.val, textLeft, y + 30, d.col, 24, 'left', undefined, 700);       // 数值左对齐
      ctx.shadowBlur = 0;                                                              // 重置阴影，避免影响后续文字
      ctx.restore();
      drawText(ctx, d.lab, textLeft, y + 50, 'rgba(255,255,255,0.38)', 12, 'left', undefined, 400); // 标签左对齐，与数值同列
    });
    y += hh + 10;                                                                      // 整块向下推进：卡高 + 与下一区块 10px 间距

    // —— 实时排名轮播 ——
    const carousel = _carouselTeamList();                       // 排行榜数据（最多 5 条）
    const cIdx = Math.floor(t / 3000) % carousel.length;        // 每 3 秒切下一条
    const cur = carousel[cIdx];
    const tickH = 46;                                           // 单行高度
    // 背景：金/粉渐变，金色描边，强调"实时"质感
    ctx.save();
    roundRect(ctx, padding, y, W - padding * 2, tickH, 14);
    const tg = ctx.createLinearGradient(padding, y, W - padding, y + tickH);
    tg.addColorStop(0, 'rgba(255,215,64,0.1)');
    tg.addColorStop(1, 'rgba(255,80,200,0.06)');
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,64,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    _drawIconFit(ctx, UI_IMG.liveRank, padding + 12, y + tickH / 2 - 8, 16, 16, scaleY);                              // 左侧图标
    const rankLabelText = '战队排名';
    const rankLabelFs = 12;
    const rankLabelX = padding + 34;
    const rankLabelW = measureText(ctx, rankLabelText, rankLabelFs, 400);
    drawText(ctx, rankLabelText, rankLabelX, y + tickH / 2, 'rgba(255,255,255,0.48)', rankLabelFs, 'left', undefined, 400);
    // 「实时排名」与「NO.」之间的灰色竖线分隔
    const sepGap = 6;
    const sepX = rankLabelX + rankLabelW + sepGap;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sepX + 0.5, y + tickH / 2 - 7);
    ctx.lineTo(sepX + 0.5, y + tickH / 2 + 7);
    ctx.stroke();
    ctx.restore();
    const rankStartX = sepX + sepGap;
    const rankText = 'NO.' + cur.rank;
    const rankFs = 12;
    const rankW = measureText(ctx, rankText, rankFs, 700);
    drawText(ctx, rankText, rankStartX, y + tickH / 2, '#ffd740', rankFs, 'left', undefined, 700);
    const nameStartX = rankStartX + rankW + 8;                                                                      // NO. 与队名间距 8px
    const clearsStr = '通关' + _fmtComma(cur.clears) + '次';
    const clearsFs = 12;
    const clearsFw = 400;
    const clearsW = measureText(ctx, clearsStr, clearsFs, clearsFw);
    const dotX0 = W - padding - 52 - 8;                                                                            // 轮播点左移 8px
    const clearsRight = dotX0 - 8;                                                                                 // 通关文案右缘距圆点区 8px
    const clearsX = clearsRight - clearsW;
    const nameMaxRight = clearsX - 8;                                                                              // 队名与「通关」间距 8px（超长会截断 + …）
    const nameMaxW = Math.max(12, nameMaxRight - nameStartX);
    const dispName = _truncateByMeasure(ctx, cur.name || '', 12, 400, nameMaxW);
    drawText(ctx, dispName, nameStartX, y + tickH / 2, '#ffffff', 12, 'left', undefined, 400);
    drawText(ctx, clearsStr, clearsX, y + tickH / 2, 'rgba(255,255,255,0.35)', clearsFs, 'left', undefined, clearsFw);
    // 右侧轮播指示器：当前条用胶囊高亮，其它条用小圆点（dotX0 与上式一致，为通关区让位）
    for (let di = 0; di < carousel.length; di++) {
      const active = di === cIdx;
      ctx.save();
      ctx.beginPath();
      if (active) {
        roundRect(ctx, dotX0 + di * 10, y + tickH / 2 - 2, 12, 4, 2);
      } else {
        ctx.arc(dotX0 + di * 10 + 2, y + tickH / 2, 2, 0, Math.PI * 2);
      }
      ctx.fillStyle = active ? '#ffd740' : 'rgba(255,255,255,0.2)';
      ctx.fill();
      ctx.restore();
    }
    scene.manager.addTouchable(padding, sy(y, tickH), W - padding * 2, sh(tickH), 'goToRankList'); // 整条点击跳排行榜
    y += tickH + 12;

    // —— 主卡：战队 + 开始挑战（霓虹描边） ——
    const cardW = W - padding * 2;                            // 主卡宽度
    const cardX = padding;
    const myTeam = store.getTeam();
    const allR = store.getRankedTeams() || [];
    let rankDisp = '—';                                       // 我的战队当前排名（# 形式）
    if (myTeam) {
      const idx = allR.findIndex(x => x.id === myTeam.id);
      if (idx >= 0) rankDisp = 'NO.' + (idx + 1);
    }
    const totalClearsShow = _fmtComma(state.teamPeriodClears);             // 战队本周总通关
    const myContribShow = _fmtComma(state.teamPeriodClears * 22 + 400);    // 我的贡献展示值

    if (state.hasTeam) {
      // —— 已加入战队：展示战队名、徽章、人数、3 项数据、查看详情、开始挑战 ——
      // 布局原则：顶/底 PAD 相等；按钮统一倒角；开始挑战在「详情 / 邀请」双按钮下方。
      const PAD = 20;                  // 卡片顶/底内边距（保持上下一致）
      const badgeS = 52;
      const statH = 54;
      const linkH = 40;
      const startH = 52;
      const btnRadius = 14;            // 两个按钮统一倒角
      const gapHeaderStat = 16;        // 头部 → 三栏数据
      const gapStatLink = 14;          // 三栏数据 → 查看详情
      const gapLinkStart = 12;         // 查看详情 → 开始挑战
      const badgeY = y + PAD;
      const statsY = badgeY + badgeS + gapHeaderStat;       // y + 88
      const linkY = statsY + statH + gapStatLink;           // y + 156
      const startY = linkY + linkH + gapLinkStart;          // y + 208
      const mainH = (startY - y) + startH + PAD;            // = 280

      ctx.save();
      roundRect(ctx, cardX, y, cardW, mainH, 22);
      const mg = ctx.createLinearGradient(cardX, y, cardX + cardW, y + mainH);
      mg.addColorStop(0, 'rgba(30,10,50,0.88)');
      mg.addColorStop(1, 'rgba(20,5,40,0.94)');
      ctx.fillStyle = mg;
      ctx.fill();
      ctx.shadowColor = 'rgba(255,80,200,0.45)';
      ctx.shadowBlur = 22;
      ctx.strokeStyle = 'rgba(255,80,200,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // 战队徽章方块（左上角）
      const bx = cardX + 18;
      const by = badgeY;
      const bs = badgeS;
      ctx.save();
      roundRect(ctx, bx, by, bs, bs, 12);
      const bgg = ctx.createLinearGradient(bx, by, bx + bs, by + bs);
      bgg.addColorStop(0, 'rgba(255,80,200,0.2)');
      bgg.addColorStop(1, 'rgba(124,77,255,0.18)');
      ctx.fillStyle = bgg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,200,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      drawText(ctx, '🌟', bx + bs / 2, by + bs / 2 + 4, '#ff50c8', 26, 'center');                                // 徽章中心 emoji
      ctx.restore();
      // 战队名（与徽章顶留 16px 视觉对齐 → 文本中线 = badgeY + 16）
      drawText(ctx, state.teamName || '我的战队', bx + bs + 12, badgeY + 16, '#ffffff', 18, 'left', 'rgba(255,80,200,0.55)', 700);
      drawText(ctx, '我们是最亮的星！', bx + bs + 12, badgeY + 38, 'rgba(255,255,255,0.45)', 12, 'left', undefined, 400);
      // 右上角"人数"小胶囊（与战队名垂直对齐）
      const chipH = 26;
      const chipY = badgeY + (bs - chipH) / 2 - 7;       // 与名称视觉对齐
      ctx.save();
      roundRect(ctx, cardX + cardW - 78, chipY, 62, chipH, 10);
      ctx.fillStyle = 'rgba(255,80,200,0.14)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,200,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      drawText(ctx, '人数' + state.teamMemberCount, cardX + cardW - 47, chipY + chipH / 2, '#ff50c8', 12, 'center', undefined, 700);

      // 三栏数据：本周总通关 / 本周排名 / 我的贡献
      const innerY = statsY;
      const iw = (cardW - 36) / 3;
      const stats3 = [
        { v: totalClearsShow, lab: '本周总通关', c: '#ff50c8' },
        { v: rankDisp, lab: '本周排名', c: '#ffd740' },
        { v: myContribShow, lab: '我的贡献', c: '#40e0d0' }
      ];
      stats3.forEach((s, i) => {
        const ix = cardX + 12 + i * (iw + 6);                                                                       // 当前小卡左边 X
        _drawNeonCard(ctx, ix, innerY, iw, statH, 10, 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.08)', 0.8);
        ctx.save();
        ctx.shadowColor = s.c;
        ctx.shadowBlur = 6;
        drawText(ctx, s.v, ix + iw / 2, innerY + 22, s.c, 14, 'center', undefined, 700);                            // 数值
        ctx.shadowBlur = 0;
        ctx.restore();
        drawText(ctx, s.lab, ix + iw / 2, innerY + 44, 'rgba(255,255,255,0.38)', 12, 'center', undefined, 400);     // 标签（统一 12 号）
      });

      // 查看战队详情 / 邀请队员：并列同式霓虹底按钮，无图标
      const linkMidGap = 10;
      const linkBtnW = (cardW - 32 - linkMidGap) / 2;
      const linkLeftX = cardX + 16;
      const linkRightX = linkLeftX + linkBtnW + linkMidGap;
      const linkCy = linkY + linkH / 2;
      _drawNeonCard(ctx, linkLeftX, linkY, linkBtnW, linkH, btnRadius, 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.12)', 1);
      _drawNeonCard(ctx, linkRightX, linkY, linkBtnW, linkH, btnRadius, 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.12)', 1);
      const detailLabel = '查看战队详情与贡献榜';
      let detailFs = 12;
      while (detailFs >= 10 && measureText(ctx, detailLabel, detailFs, 400) > linkBtnW - 10) detailFs -= 1;
      drawText(ctx, detailLabel, linkLeftX + linkBtnW / 2, linkCy, 'rgba(255,255,255,0.55)', detailFs, 'center', undefined, 400);
      drawText(ctx, '邀请队员', linkRightX + linkBtnW / 2, linkCy, 'rgba(255,255,255,0.55)', 12, 'center', undefined, 400);
      scene.manager.addTouchable(linkLeftX, sy(linkY, linkH), linkBtnW, sh(linkH), 'goToTeamDetail');
      scene.manager.addTouchable(linkRightX, sy(linkY, linkH), linkBtnW, sh(linkH), 'inviteTeammatesFromHome');

      // 开始挑战主按钮（紫→粉渐变，与「邀请队员」按钮配色统一）
      ctx.save();
      roundRect(ctx, cardX + 16, startY, cardW - 32, startH, btnRadius);
      const sg = ctx.createLinearGradient(cardX + 16, startY, cardX + cardW - 16, startY + startH);
      sg.addColorStop(0, '#7c4dff');
      sg.addColorStop(1, '#ff50c8');
      ctx.fillStyle = sg;
      ctx.fill();
      ctx.shadowColor = 'rgba(124,77,255,0.55)';
      ctx.shadowBlur = 22;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
      drawText(ctx, '开始挑战', cx, startY + startH / 2, '#ffffff', 14, 'center', 'rgba(0,0,0,0.25)', 700);
      scene.manager.addTouchable(cardX + 16, sy(startY, startH), cardW - 32, sh(startH), 'startChallenge');

      y += mainH + 12;
    } else {
      // —— 未加入战队：中上方 teamempty 图 + 文案 + 创建/加入 + 开始挑战 ——
      const joinBtnH = 40;                    // 创建/加入按钮高
      const startBtnH = 44;                   // 开始挑战按钮高
      const gapAfterSubtitle = 28;            // 副标题与主按钮间距
      const teamImgSize = 64;                 // 未入队主视觉图容器（正方形）
      const teamImgTop = y + 22;             // 卡片内靠上
      const copyY0 = teamImgTop + teamImgSize + 20; // 主标题 Y（图下方留白）
      const joinY = copyY0 + 24 + gapAfterSubtitle;
      const startY = joinY + joinBtnH + 12;
      const mainH = startY + startBtnH + 18 - y;

      ctx.save();
      roundRect(ctx, cardX, y, cardW, mainH, 22);
      const mg = ctx.createLinearGradient(cardX, y, cardX + cardW, y + mainH);
      mg.addColorStop(0, 'rgba(30,10,50,0.88)');
      mg.addColorStop(1, 'rgba(20,5,40,0.94)');
      ctx.fillStyle = mg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,200,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      _drawIconFit(ctx, UI_IMG.teamEmpty, cx - teamImgSize / 2, teamImgTop, teamImgSize, teamImgSize, scaleY);
      drawText(ctx, '还没有加入战队', cx, copyY0, '#ffffff', 16, 'center', 'rgba(255,80,200,0.4)', 700);          // 主标题
      drawText(ctx, '加入战队，与队友一起冲榜赢奖励', cx, copyY0 + 24, 'rgba(255,255,255,0.45)', 12, 'center', undefined, 400); // 副标题

      // 创建/加入战队按钮
      const jBtn = drawButtonGradient(ctx, cardX + 16, joinY, cardW - 32, joinBtnH, '加入战队', gradientPink, '#fff', 14, 14, undefined, 500);
      scene.manager.addTouchable(jBtn.x, sy(jBtn.y, jBtn.h), jBtn.w, sh(jBtn.h), 'goToCreateTeam');

      // 开始挑战（未入队状态，同色系：紫→粉）
      ctx.save();
      roundRect(ctx, cardX + 16, startY, cardW - 32, startBtnH, 14);
      const sg = ctx.createLinearGradient(cardX + 16, startY, cardX + cardW - 16, startY + startBtnH);
      sg.addColorStop(0, '#7c4dff');
      sg.addColorStop(1, '#ff50c8');
      ctx.fillStyle = sg;
      ctx.shadowColor = 'rgba(124,77,255,0.45)';
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
      drawText(ctx, '开始挑战', cx, startY + startBtnH / 2, '#ffffff', 14, 'center', 'rgba(0,0,0,0.25)', 700);
      scene.manager.addTouchable(cardX + 16, sy(startY, startBtnH), cardW - 32, sh(startBtnH), 'startChallenge');

      y += mainH + 12;
    }

    // —— 底栏：图鉴 + 我的（无 Tab 导航条） ——
    const menuH = 58;                                    // 单格高度
    const mw = (cardW - 10) / 2;                         // 单格宽度（两格中间留 10px 间隙）
    const menuY = y;
    const menus = [                                      // 两格的数据结构：图标 + 标题 + 描述 + 跳转 handler
      {
        g0: '#40e0d0', g1: '#7c4dff', img: UI_IMG.collection, title: '气球图鉴', desc: '点亮专属成就',
        x: padding, h: 'goToCollection'
      },
      {
        g0: '#ff50c8', g1: '#ff9100', img: UI_IMG.profile, title: '我的', desc: '查看战绩与设置',
        x: padding + mw + 10, h: 'goToProfile'
      }
    ];
    menus.forEach(m => {
      _drawNeonCard(ctx, m.x, menuY, mw, menuH, 14, 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.14)', 1);
      // 内容上下整体居中：图标 40×40 居中；标题 13/desc 12，行距 6，块高 31，居中放
      const iconSize = 40;
      const iconY = menuY + (menuH - iconSize) / 2;
      _drawIconFit(ctx, m.img, m.x + 10, iconY, iconSize, iconSize, scaleY);
      const titleFs = 13;
      const descFs = 12;
      const lineGap = 6;
      const blockH = titleFs + lineGap + descFs;             // = 31
      const blockTop = menuY + (menuH - blockH) / 2;          // 块顶
      const titleCy = blockTop + titleFs / 2;                 // 标题中线
      const descCy = blockTop + titleFs + lineGap + descFs / 2; // 描述中线
      drawText(ctx, m.title, m.x + 52, titleCy, '#fff', titleFs, 'left', undefined, 700);                    // 标题
      drawText(ctx, m.desc, m.x + 52, descCy, 'rgba(255,255,255,0.35)', descFs, 'left', undefined, 400);    // 描述（统一 12 号）
      scene.manager.addTouchable(m.x, sy(menuY, menuH), mw, sh(menuH), m.h);                                 // 整格点击
    });
    y += menuH + 12;
    ctx.restore();                                        // 收束 translate/scale，对应 render 顶部的 save

    state.contentHeight = topY + y * scaleY + safeB + 10; // 记录内容总高，便于将来做滚动

    // 左上角「设置」入口（与「我的」共用同一设置弹窗）；被其它全屏弹窗遮挡时不绘制
    if (!state.showBouquetShareModal && !state.showLoginModal && !state.showNotification) {
      this._drawTopSettingsButton(ctx, scene, W, L);
    }

    // 7. 好友花束分享落地弹窗（进入游戏后叠授权，不关花束层）
    if (state.showBouquetShareModal && state.bouquetShare) {
      this._drawBouquetShareModal(ctx, W, H);
      if (state.showLoginModal && state.loginOverlayFromBouquet) {
        this._drawLoginModal(ctx, W, H);
      }
      if (legalModal.isLegalModalOpen()) {
        legalModal.drawLegalModal(ctx, scene, W, H, { borderColor: UX.strokeViolet, closeHandler: 'closeLegalModal' });
      }
      return;
    }

    // 8. 微信授权登录弹窗（非花束叠层场景）
    if (state.showLoginModal) {
      this._drawLoginModal(ctx, W, H);
      if (legalModal.isLegalModalOpen()) {
        legalModal.drawLegalModal(ctx, scene, W, H, { borderColor: UX.strokeViolet, closeHandler: 'closeLegalModal' });
      }
      return;
    }

    // 9. 通知弹窗（尺寸与字号随屏宽收敛，避免占满屏、字过大）
    if (state.showNotification) {
      drawModalBackground(ctx, W, H);
      const pad = 18;                       // 内边距
      const side = 40;                      // 弹窗距屏幕左右（与全局一致）
      const mw = W - side * 2;              // 弹窗宽度 W-80
      const mh = 206;                       // 弹窗高度
      const mx = side;
      const my = (H - mh) / 2;              // 居中 Y
      const rx = THEME.radius.md;
      ctx.save();
      roundRect(ctx, mx, my, mw, mh, rx);
      const bg = ctx.createLinearGradient(mx, my, mx, my + mh);
      bg.addColorStop(0, 'rgba(20,5,40,0.98)');
      bg.addColorStop(1, 'rgba(10,2,25,0.98)');
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = UX.strokeViolet;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      drawText(ctx, '接收游戏通知', W / 2, my + pad + 8, THEME.textMain, 18, 'center', UX.shadowTitle, 700);
      drawWrappedText(
        ctx, '是否允许接收游戏服务通知？我们会在战队排名、奖励发放时通知你。',
        mx + pad, my + pad + 32, mw - pad * 2, 20, THEME.textSecondary, 14, 400
      );

      const btnGap = 8;
      const btnW = mw - pad * 2;
      const btn1H = 40;
      const btn2H = 36;
      const btn1 = drawButtonGradient(
        ctx, mx + pad, my + mh - pad - btn2H - btnGap - btn1H, btnW, btn1H,
        '允许通知', gradientPink, '#fff', 14, 12, undefined, 400
      );
      scene.manager.addTouchable(btn1.x, btn1.y, btn1.w, btn1.h, 'onNotificationConfirm');
      const btn2 = drawButtonGradient(
        ctx, mx + pad, my + mh - pad - btn2H, btnW, btn2H,
        '暂不开启', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.88)', 14, 12, undefined, 400
      );
      scene.manager.addTouchable(btn2.x, btn2.y, btn2.w, btn2.h, 'onNotificationCancel');
    }

    // 10. 设置弹窗：置于最顶层（点击外部/✕ 关闭）
    settingsModal.drawSettingsModal(ctx, scene, W, H);

  },
  // 左上角设置按钮：屏幕坐标系，与右上角胶囊垂直居中对齐
  _drawTopSettingsButton(ctx, scene, W, L) {
    const size = Math.max(32, Math.min(40, (L && L.height) || 32));
    const x = THEME.spacing.base;                       // 左内边距 16
    const cyY = (L && L.capsuleCenterY) || (size / 2 + 8);
    const yTop = cyY - size / 2;
    ctx.save();
    roundRect(ctx, x, yTop, size, size, size / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    const pad = 8;
    if (getImage(UI_IMG.setting)) {
      drawImage(ctx, UI_IMG.setting, x + pad, yTop + pad, size - pad * 2, size - pad * 2);
    } else {
      drawText(ctx, '⚙', x + size / 2, cyY, '#ffffff', 18, 'center');
    }
    scene.manager.addTouchable(x, yTop, size, size, 'openSettings');
  },
  // 触摸：首页本身不消费触摸事件，只交给 SceneManager 的 touchable 命中区
  onTouch(type, x, y) {
    if (settingsModal.isSettingsModalOpen()) return false; // 弹窗由 touchable 命中处理，禁止穿透
    if (legalModal.handleLegalModalTouch(type, x, y)) return true;
    if (legalModal.isLegalModalOpen()) return false;
    if (type !== 'end' && type !== 'tap') return false;
    return false;
  },
  openSettings() { settingsModal.openSettingsModal(); },
  // ─── Handlers（由 addTouchable 用字符串名调用）──────────────────────────────
  startChallenge() {                           // 主按钮：开始挑战
    const user = store.getUser();
    store.setLastPlayedLevel(state.lastLevel); // 同步上次关卡
    this.manager.switchTo('battle');
  },
  goToTeamDetail() {                           // 战队详情入口；未入队则跳创建流程
    if (!state.hasTeam) { this.manager.switchTo('team', { action: 'create' }); return; }
    this.manager.switchTo('team', { tab: 'my' });
  },
  inviteTeammatesFromHome() {                  // 与战队页一致：调起分享邀请
    if (!state.hasTeam) {
      this.manager.switchTo('team', { action: 'create' });
      return;
    }
    const team = store.getTeam();
    if (!team) {
      this.manager.switchTo('team', { action: 'create' });
      return;
    }
    const teamId = team.teamId || team.id;
    const title = '一起来「不准爆！」战队：' + (state.teamName || team.name || '气球挑战');
    cloudTeam.inviteToTeam(teamId).then((r) => {
      if (!r.success) {
        showToast(r.msg || '生成邀请失败');
        return;
      }
      const token = r.data && r.data.inviteToken;
      const query = token
        ? ('teamId=' + encodeURIComponent(teamId) + '&inviteToken=' + encodeURIComponent(token))
        : ('teamId=' + encodeURIComponent(teamId));
      if (typeof wx !== 'undefined' && wx.shareAppMessage) {
        try {
          wx.shareAppMessage({ title, imageUrl: '', query });
        } catch (e) {
          showToast('请使用右上角菜单分享');
        }
      } else {
        showToast('请使用右上角菜单分享');
      }
    });
  },
  goToCreateTeam() {                           // 创建/加入战队
    this.manager.switchTo('team', { action: 'create' });
  },
  goToRankList() {                             // 实时排名条点击：跳战队页的排行榜 Tab
    this.manager.switchTo('team', { tab: 'rank' });
  },
  goToCollection() {                           // 底栏：气球图鉴
    this.manager.switchTo('collection');
  },
  goToProfile() {                              // 底栏：我的
    this.manager.switchTo('profile');
  },
  onNotificationConfirm() {                    // 通知弹窗：允许
    state.showNotification = false;
    store.setNotificationAuthorized(true);
    showToast('已开启通知');
  },
  onNotificationCancel() {                     // 通知弹窗：暂不开启
    state.showNotification = false;
    store.setNotificationAuthorized(false);
  },

  // ─── 好友花束分享落地弹窗 ─────────────────────────────────
  _drawBouquetShareModal(ctx, W, H) {
    const scene = this;
    const payload = state.bouquetShare;
    if (!payload) return;

    drawModalBackground(ctx, W, H);
    scene.manager.addTouchable(0, 0, W, H, '_bouquetShareModalAbsorb');

    const side = 28;
    const mw = Math.min(W - side * 2, 360);
    const imgH = Math.round(mw * 0.72);
    const copyH = 44;
    const disclaimerH = 28;
    const btnH = 46;
    const btnGap = 10;
    const pad = 20;
    const posterReady = !state.bouquetSharePosterLoading && !!state.bouquetSharePosterPath;
    const mh = pad + copyH + 12 + imgH + 8 + disclaimerH + pad + btnH + btnGap + btnH + pad;
    const mx = (W - mw) / 2;
    const my = Math.max(48, (H - mh) / 2);

    ctx.save();
    roundRect(ctx, mx, my, mw, mh, 20);
    const bg = ctx.createLinearGradient(mx, my, mx, my + mh);
    bg.addColorStop(0, 'rgba(10,46,36,0.98)');
    bg.addColorStop(1, 'rgba(4,18,14,0.98)');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(134,239,172,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    const copyY = my + pad;
    drawWrappedText(
      ctx,
      payload.shareTitle || '好友分享了一束气球',
      mx + pad, copyY, mw - pad * 2, 20,
      'rgba(167,243,208,0.92)', 15, 600
    );

    const imgX = mx + pad;
    const imgY = copyY + copyH + 12;
    const imgW = mw - pad * 2;
    ctx.save();
    roundRect(ctx, imgX, imgY, imgW, imgH, 12);
    ctx.clip();
    const poster = state.bouquetSharePosterPath && getImage(state.bouquetSharePosterPath);
    if (poster) {
      drawImage(ctx, state.bouquetSharePosterPath, imgX, imgY, imgW, imgH);
    } else if (state.bouquetSharePosterLoading) {
      ctx.fillStyle = 'rgba(6,26,20,0.9)';
      ctx.fillRect(imgX, imgY, imgW, imgH);
      drawText(ctx, '加载分享图…', imgX + imgW / 2, imgY + imgH / 2, 'rgba(134,239,172,0.7)', 14, 'center', undefined, 500);
    } else {
      ctx.fillStyle = 'rgba(6,26,20,0.9)';
      ctx.fillRect(imgX, imgY, imgW, imgH);
      drawText(ctx, '预览加载失败', imgX + imgW / 2, imgY + imgH / 2, 'rgba(248,113,113,0.85)', 14, 'center', undefined, 500);
    }
    ctx.restore();

    const discY = imgY + imgH + 8;
    drawWrappedText(
      ctx,
      '本分享仅作展示，不包含任何道具发放。',
      mx + pad, discY, mw - pad * 2, 14,
      'rgba(134,239,172,0.55)', 11, 400
    );

    const btnW = mw - pad * 2;
    const btnX = mx + pad;
    const enterY = discY + disclaimerH + pad;
    const enterGrad = (c, gx, gy, gw, gh) => {
      const g = c.createLinearGradient(gx, gy, gx, gy + gh);
      g.addColorStop(0, '#34d399');
      g.addColorStop(1, '#10b981');
      return g;
    };
    const enterLabel = state.bouquetSharePosterLoading ? '加载中…' : '进入游戏';
    const b1 = drawButtonGradient(
      ctx, btnX, enterY, btnW, btnH, enterLabel,
      posterReady ? enterGrad : 'rgba(255,255,255,0.06)',
      posterReady ? '#042f2e' : 'rgba(255,255,255,0.28)',
      15, 12, posterReady ? 'rgba(52,211,153,0.35)' : undefined, 700
    );
    if (posterReady) scene.manager.addTouchable(b1.x, b1.y, b1.w, b1.h, 'bouquetShareEnterGame');

    const exitY = enterY + btnH + btnGap;
    const b2 = drawButtonGradient(ctx, btnX, exitY, btnW, btnH, '退出游戏', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.75)', 15, 12, undefined, 500);
    scene.manager.addTouchable(b2.x, b2.y, b2.w, b2.h, 'bouquetShareExitGame');
  },
  _bouquetShareModalAbsorb() { /* 阻断首页其它点击 */ },
  bouquetShareEnterGame() {
    state.loginOverlayFromBouquet = true;
    state.showLoginModal = true;
  },
  bouquetShareExitGame() {
    this.exitMiniProgram();
  },

  // ─── 微信授权登录弹窗 ────────────────────────────────────
  promptLogin() {
    if (state.showBouquetShareModal) return;
    state.showLoginModal = true;
  },
  _drawLoginModal(ctx, W, H) {
    const scene = this;
    drawModalBackground(ctx, W, H);
    // 1) 整屏吸收点（先于按钮注册）：登录弹窗打开期间禁掉首页其它触区，
    //    避免「弹窗打开还能点开始挑战」的穿透 bug。
    scene.manager.addTouchable(0, 0, W, H, '_loginModalAbsorb');

    const side = 36;
    const mw = Math.min(W - side * 2, 360);
    const mh = 400;
    const mx = (W - mw) / 2;
    const my = Math.max(60, (H - mh) / 2);
    const rx = 22;

    // 卡片背景：紫黑渐变 + 粉色描边发光
    ctx.save();
    roundRect(ctx, mx, my, mw, mh, rx);
    const bg = ctx.createLinearGradient(mx, my, mx, my + mh);
    bg.addColorStop(0, 'rgba(30,10,52,0.96)');
    bg.addColorStop(1, 'rgba(10,2,28,0.98)');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.shadowColor = 'rgba(255,80,200,0.35)';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = 'rgba(255,80,200,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // LOGO（已在 onShow 预加载 popLogo）
    const logoSize = 84;
    const logoX = W / 2 - logoSize / 2;
    const logoY = my + 28;
    ctx.save();
    ctx.shadowColor = 'rgba(255,80,200,0.4)';
    ctx.shadowBlur = 22;
    if (getImage(UI_IMG.popLogo)) {
      drawImage(ctx, UI_IMG.popLogo, logoX, logoY, logoSize, logoSize);
    } else {
      // 兜底：还没加载完也不要空白
      ctx.beginPath();
      ctx.arc(W / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,80,200,0.18)';
      ctx.fill();
      drawText(ctx, '🎈', W / 2, logoY + logoSize / 2 + 4, '#fff', 36, 'center');
    }
    ctx.restore();

    const titleY = logoY + logoSize + 24;
    drawText(ctx, '欢迎来到 不准爆！', W / 2, titleY, '#ffffff', 18, 'center', 'rgba(255,80,200,0.55)', 700);

    drawWrappedText(
      ctx,
      '授权获取你的微信昵称和头像，用于展示个人资料、战队成员与排行榜信息。',
      mx + 24, titleY + 26, mw - 48, 20,
      'rgba(255,255,255,0.6)', 13, 400
    );

    // 主按钮：微信一键登录（紫→粉渐变胶囊）
    const btnH = 48;
    const btnW = mw - 48;
    const btnX = mx + 24;
    const policyH = 16;
    const skipH = 36;
    const gap = 12;
    const bottomPad = 22;
    const btnY = my + mh - bottomPad - policyH - gap - skipH - gap - btnH;

    ctx.save();
    roundRect(ctx, btnX, btnY, btnW, btnH, 24);
    const bg2 = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
    bg2.addColorStop(0, '#7c4dff');
    bg2.addColorStop(1, '#ff50c8');
    ctx.fillStyle = bg2;
    ctx.shadowColor = 'rgba(255,80,200,0.45)';
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    drawText(ctx, '微信一键登录', W / 2, btnY + btnH / 2, '#ffffff', 16, 'center', 'rgba(0,0,0,0.25)', 700);
    scene.manager.addTouchable(btnX, btnY, btnW, btnH, 'loginWithWeChat');

    // 副按钮：退出游戏（直接关闭小程序）
    const skipY = btnY + btnH + gap;
    drawText(ctx, '退出游戏', W / 2, skipY + skipH / 2, 'rgba(255,255,255,0.55)', 13, 'center', undefined, 500);
    scene.manager.addTouchable(W / 2 - 96, skipY, 192, skipH, 'exitMiniProgram');

    // 协议（《用户协议》《隐私政策》可点击）
    const policyY = skipY + skipH + gap;
    const policyCy = policyY + policyH / 2;
    const policyFs = 11;
    const policyPrefix = '登录即表示同意';
    const policyMid = '和';
    const agreementLink = '《用户协议》';
    const privacyLink = '《隐私政策》';
    const prefixW = measureText(ctx, policyPrefix, policyFs, 400);
    const agreementW = measureText(ctx, agreementLink, policyFs, 500);
    const midW = measureText(ctx, policyMid, policyFs, 400);
    const privacyW = measureText(ctx, privacyLink, policyFs, 500);
    const totalW = prefixW + agreementW + midW + privacyW;
    let lx = W / 2 - totalW / 2;
    drawText(ctx, policyPrefix, lx, policyCy, 'rgba(255,255,255,0.32)', policyFs, 'left', undefined, 400);
    lx += prefixW;
    const agreementX = lx;
    drawText(ctx, agreementLink, lx, policyCy, 'rgba(125,211,252,0.88)', policyFs, 'left', undefined, 500);
    scene.manager.addTouchable(agreementX, policyY - 2, agreementW, policyH + 6, 'openAgreement');
    lx += agreementW;
    drawText(ctx, policyMid, lx, policyCy, 'rgba(255,255,255,0.32)', policyFs, 'left', undefined, 400);
    lx += midW;
    const privacyX = lx;
    drawText(ctx, privacyLink, lx, policyCy, 'rgba(125,211,252,0.88)', policyFs, 'left', undefined, 500);
    scene.manager.addTouchable(privacyX, policyY - 2, privacyW, policyH + 6, 'openPrivacy');
  },
  _loginModalAbsorb() { /* 吸收弹窗外的所有点击，阻断穿透 */ },
  openAgreement() {
    legalModal.openLegalDocument('用户协议', getUserAgreementText());
  },
  openPrivacy() {
    legalModal.openPrivacyPolicy();
  },
  closeLegalModal() {
    legalModal.closeLegalModal();
  },
  _legalModalAbsorb() { /* 阻断穿透 */ },
  loginWithWeChat() {
    const scene = this;
    const fromBouquet = !!state.loginOverlayFromBouquet;
    const { cloudLogin } = require('../cloud-login');
    showToast('登录中…');
    cloudLogin({ explicit: true }).then((r) => {
      if (r.ok) {
        state.showLoginModal = false;
        state.loginOverlayFromBouquet = false;
        if (fromBouquet) {
          state.showBouquetShareModal = false;
          state.bouquetShare = null;
          state.bouquetSharePosterPath = '';
          state.bouquetSharePosterLoading = false;
        }
        scene._refresh();
        showToast('登录成功');
        const pending = scene.manager.consumePendingNavigation();
        if (pending) {
          scene.manager.switchTo(pending.name, pending.data);
        }
        return;
      }
      showToast('登录失败，请检查网络后重试');
    });
  },
  exitMiniProgram() {                          // 副按钮：退出游戏 → 先二次确认
    // 不直接关闭，先弹「是否退出游戏」确认（由 SceneManager 统一渲染与处理）
    this.manager.showExitGameConfirm = true;
  },

  handleBackButton() {
    if (settingsModal.isSettingsModalOpen()) {
      settingsModal.closeSettingsModal();
      return true;
    }
    if (state.showNotification) {
      state.showNotification = false;
      return true;
    }
    if (state.showLoginModal) {
      this.manager.showExitGameConfirm = true;
      return true;
    }
    if (state.showBouquetShareModal) {
      state.showBouquetShareModal = false;
      state.bouquetShare = null;
      state.bouquetSharePosterPath = '';
      state.bouquetSharePosterLoading = false;
      return true;
    }
    return false;
  }
};