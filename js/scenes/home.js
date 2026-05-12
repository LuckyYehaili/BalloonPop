// Home Scene - 主页 (PRD 1.2 优化版)
const { 
  drawBackground, drawText, drawButton, drawButtonGradient, drawImage, drawWrappedText, 
  gradientPink, gradientGold, showModal, showToast, roundRect, measureText, 
  beginScrollView, endScrollView, loadImages, getImage, drawModalBackground
} = require('../engine/canvas-ui');
const store = require('../store');
const { BALLOON_TYPES } = require('../balloons');
const UX = require('../ui-theme');
const { getCapsuleLayout } = require('../layout-safe');

// 首页用到的 PNG 图标统一登记，方便 onShow 预加载与渲染时索引
const UI_IMG = {
  online: 'images/ui/online.png',           // 统计卡-在线玩家
  activeTeam: 'images/ui/active-team.png',  // 统计卡-活跃战队
  liveRank: 'images/ui/live-rank.png',      // 实时排名条左侧图标
  collection: 'images/ui/collection.png',   // 底栏-气球图鉴
  profile: 'images/ui/profile.png',         // 底栏-我的
  teamDetail: 'images/ui/teamdetail.png',   // 主卡-查看战队详情
  teamEmpty: 'images/ui/teamempty.png',     // 未入队主卡-中上方占位图
  popLogo: 'images/ui/POP-logo.png'         // 顶部 Hero 主视觉 LOGO
};
let _uiImgLoaded = false;                   // 是否已触发过一次预加载（onShow 内根据缓存命中再校验）

// 首页渲染快照：来自 store 的派生数据，render 直接读这份对象避免每帧重算
let state = {
  userAvatar: '', userNickName: '玩家', legendTotal: 0, legendTotalAll: 0, // 个人资料 + 图鉴进度
  lastLevel: 1, highestLevel: 1, isFirstTime: true,                        // 上次/最高关卡 + 是否首次进入
  hasTeam: false, teamName: '', teamMemberCount: 0, teamDailyClears: 0,    // 战队信息
  topTeams: [], recentBalloons: [],                                        // 排行榜前几 + 最近获得气球
  showNotification: false, scrollY: 0, contentHeight: 0                    // 通知弹窗 + 滚动相关
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

// 背景赛博网格：纯装饰，颜色非常淡，每 30px 画一格
function _drawCyberGrid(ctx, W, H) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,80,200,0.035)';
  ctx.lineWidth = 1;
  const step = 30;
  for (let x = 0; x <= W; x += step) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
  }
  ctx.restore();
}

// 背景 8 颗呼吸彩点：颜色粉/青交替，亮度随时间正弦波动
function _drawParticles(ctx, W, H, timeMs) {
  const t = (timeMs || 0) * 0.001;
  ctx.save();
  for (let i = 0; i < 8; i++) {
    const px = (0.08 + (i % 4) * 0.22) * W;        // X 按列分布
    const py = (0.06 + ((i * 17) % 65) / 100) * H; // Y 用素数 17 打散，避免成行
    const r = 1.2 + (i % 3) * 0.6;
    const a = 0.25 + Math.sin(t * 1.4 + i) * 0.12; // 透明度呼吸
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? `rgba(255,80,200,${a})` : `rgba(64,224,208,${a * 0.9})`;
    ctx.shadowColor = i % 2 === 0 ? 'rgba(255,80,200,0.4)' : 'rgba(64,224,208,0.35)';
    ctx.shadowBlur = 4 + i;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/** 首页底部彩色气球：顺序由小变大、波峰沿队列移动，类似 loading 点 */
function _drawTrailLoadingDots(ctx, cx, baseY, timeMs) {
  const trail = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣'];                // 6 个气球颜色
  const off = [-64, -40, -14, 14, 40, 64];                            // 与中心点的横向偏移
  const n = trail.length;
  const floatIdx = (timeMs / 520) % n;                                // 当前波峰所在的浮点索引
  const baseSizes = [13, 14, 15, 15.5, 16, 17];                       // 每个气球基础字号
  for (let i = 0; i < n; i++) {
    let di = floatIdx - i;
    if (di > n / 2) di -= n;                                          // 让 di 在环形序列里走最近距离
    if (di < -n / 2) di += n;
    const sigma = 0.55;
    const peak = Math.exp(-(di * di) / (2 * sigma * sigma));          // 高斯权重，距离波峰越近越亮越大
    const scale = 0.38 + 0.82 * peak;
    const alpha = 0.5 + 0.5 * peak;
    const bob = Math.sin(timeMs * 0.0024 + i * 0.65) * 2.5 * (0.35 + peak); // 上下浮动
    ctx.save();
    ctx.translate(cx + off[i], baseY + bob);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    if (peak > 0.25) {                                                // 仅在亮气球上加发光，省 GPU
      ctx.shadowColor = i % 2 === 0 ? 'rgba(255,80,200,0.45)' : 'rgba(64,224,208,0.4)';
      ctx.shadowBlur = 6 + peak * 10;
    }
    const fs = baseSizes[i];
    ctx.font = `500 ${fs}px ${UX.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(trail[i], 0, 0);
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
  y += 26 + 44 + 36;              // 装饰气球区
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
      clears: Math.max(100, Math.round((t.dailyTotalClears || 0) * 160 + 4200)) // 把通关数 × 系数 + 基线，做出"看起来更大"的展示数字
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
    this._refresh();
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
        .sort((a, b) => new Date(b[1].acquiredAt || 0) - new Date(a[1].acquiredAt || 0))    // 按获得时间倒序
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
      state.hasTeam = !!team;
      state.teamName = team?team.name:'';
      state.teamMemberCount = team?(team.members?team.members.length:team.memberCount||0):0;
      state.teamDailyClears = team?(team.dailyTotalClears||0):0;
      state.topTeams = ranked.slice(0,5);
      state.recentBalloons = ownedList;

      // 首次未授权通知：弹一次通知弹窗，并记录提示时间，避免反复打扰
      if (!store.isNotificationAuthorized() && !(store.getUser().lastNotificationPrompt)) {
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

    // —— Hero：顶部 POP-LOGO 主视觉（呼吸缩放 + 粉色光晕） ——
    const heroR = 40;                                  // 占位半径，沿用一屏适配里的尺寸
    const logoSize = heroR * 2 + 16;                   // LOGO 容器尺寸（直径 + 一点余量）
    const hy = y + heroR;                              // 容器中心 Y
    const heroPulse = 1 + 0.05 * Math.sin(t * 0.0028); // 整体微微缩放呼吸
    ctx.save();
    ctx.translate(cx, hy);
    ctx.scale(heroPulse, heroPulse);
    ctx.translate(-cx, -hy);
    ctx.shadowColor = 'rgba(255,80,200,0.55)';
    ctx.shadowBlur = 22;
    _drawIconFit(ctx, UI_IMG.popLogo, cx - logoSize / 2, hy - logoSize / 2, logoSize, logoSize, scaleY); // 居中绘制 LOGO（容器控大小，纵向缩放反向补偿避免压扁）
    ctx.shadowBlur = 0;
    ctx.restore();
    y = hy + heroR + 24;                                                                       // 圆圈底到标题：固定 48px
    drawText(ctx, '不准爆！', cx, y, '#ffffff', 24, 'center', 'rgba(255,80,200,0.75)', 700);    // 主标题（粉色发光）
    y += 32;
    drawText(ctx, '按住充气，在临界点精准松手！', cx, y, 'rgba(255,255,255,0.45)', 12, 'center', undefined, 400); // 副标题第一行
    y += 16;
    drawText(ctx, '就是这么刺激！', cx, y, 'rgba(255,255,255,0.45)', 12, 'center', undefined, 400); // 副标题第二行
    y += 26;

    // 装饰气球：loading 式顺序放大（波峰沿队列移动）
    const baseY = y + 26;
    _drawTrailLoadingDots(ctx, cx, baseY, t);
    y = baseY + 44;
    // 主视觉与卡片区之间留白：让统计卡、轮播、主卡整体下移
    y += 36;

    // —— 双列全局统计 ——
    const rankedAll = store.getRankedTeams() || [];                                    // 全部战队排行数据
    const sumClears = rankedAll.reduce((a, x) => a + (x.dailyTotalClears || 0), 0);    // 累加所有战队今日通关数
    const onlineV = _fmtComma(8800 + sumClears * 4 + state.highestLevel * 90);         // 在线玩家展示值（千分位）
    const activeV = _fmtComma(Math.max(1, rankedAll.length) * 37 + 1980);              // 活跃战队展示值（千分位）
    const hw = (W - padding * 2 - 10) / 2;                                             // 单卡宽度：屏宽减去左右 padding 与中间 10px 间隙后平分
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
    const dotX0 = W - padding - 52;                                                                                // 与下方轮播点左对齐
    const clearsRight = dotX0 - 8;                                                                                 // 通关文案右缘距圆点区 8px
    const clearsX = clearsRight - clearsW;
    const nameMaxRight = clearsX - 16;                                                                             // 队名与「通关」固定 16px 间距
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
    const totalClearsShow = _fmtComma(state.teamDailyClears * 88 + 9200); // 总通关展示值（系数放大）
    const myContribShow = _fmtComma(state.teamDailyClears * 22 + 400);    // 我的贡献展示值

    if (state.hasTeam) {
      // —— 已加入战队：展示战队名、徽章、人数、3 项数据、查看详情、开始挑战 ——
      // 布局原则：顶/底 PAD 相等；按钮统一倒角；开始挑战在「查看战队详情」按钮下方。
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

      // 查看战队详情入口（先于开始挑战按钮，icon+文字+› 整组居中）
      _drawNeonCard(ctx, cardX + 16, linkY, cardW - 32, linkH, btnRadius, 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.12)', 1);
      const linkText = '查看战队详情与贡献榜 ›';
      const linkIconSize = 16;
      const linkGap = 16;
      const linkTextW = measureText(ctx, linkText, 12, 400);
      const linkTotalW = linkIconSize + linkGap + linkTextW;
      const linkBtnCx = cardX + 16 + (cardW - 32) / 2;
      const linkIconX = linkBtnCx - linkTotalW / 2;
      const linkTextX = linkIconX + linkIconSize + linkGap;
      const linkCy = linkY + linkH / 2;
      _drawIconFit(ctx, UI_IMG.teamDetail, linkIconX, linkCy - linkIconSize / 2, linkIconSize, linkIconSize, scaleY);
      drawText(ctx, linkText, linkTextX, linkCy, 'rgba(255,255,255,0.5)', 12, 'left', undefined, 400);
      scene.manager.addTouchable(cardX + 16, sy(linkY, linkH), cardW - 32, sh(linkH), 'goToTeamDetail');

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
      drawText(ctx, '▶  开始挑战', cx, startY + startH / 2, '#ffffff', 18, 'center', 'rgba(0,0,0,0.25)', 700);
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
      const jBtn = drawButtonGradient(ctx, cardX + 16, joinY, cardW - 32, joinBtnH, '＋ 创建/加入战队', gradientPink, '#fff', 14, 14, undefined, 500);
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
      drawText(ctx, '▶  开始挑战', cx, startY + startBtnH / 2, '#ffffff', 16, 'center', 'rgba(0,0,0,0.25)', 700);
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

    // 8. 通知弹窗（尺寸与字号随屏宽收敛，避免占满屏、字过大）
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

  },
  // 触摸：首页本身不消费触摸事件，只交给 SceneManager 的 touchable 命中区
  onTouch(type, x, y) {
    if (type !== 'end' && type !== 'tap') return false;
    return false;
  },
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
  }
};