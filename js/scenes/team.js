// 战队统一页：我的战队 / 战队排名 / 战队推荐（Canvas，与首页视觉一致）
const {
  drawBackground, drawText, drawButtonGradient, drawImage, showToast, roundRect,
  gradientPink, measureText, loadImages, getImage, drawModalBackground
} = require('../engine/canvas-ui');
const store = require('../store');
const cloudTeam = require('../cloud-team');
const { isInviteJoinCached, markInviteJoinSuccess } = require('../invite-cache');
const UX = require('../ui-theme');
const { getCapsuleLayout } = require('../layout-safe');
const { drawPageHeader } = require('../engine/page-header');
const { drawFormField } = require('../engine/form-field');

const NEON = '#ff50c8';
const VIOLET = '#7c4dff';
const CYAN = '#40e0d0';
const GOLD = '#ffd740';
const SILVER = '#c0c0c0';
const BRONZE = '#cd7f32';

const BADGES = ['🔥', '🌟', '🍬', '☁️', '🌌', '⚡', '🐉', '🌈', '✨', '💎'];
const SLOGANS = [
  '燃烧吧，气球战士！', '我们是最亮的星！', '甜蜜无敌，所向披靡', '高处不胜寒，我们偏要上',
  '探索宇宙，征服气球', '速度就是一切', '冷酷到底', '多彩人生，多彩气球', '热血燃爆', '无限可能',
  '一起冲榜，一起赢！', '压力之下，更显锋芒', '全队一心，其利断金'
];

// 创建战队表单：随机名称 + 配套描述
const TEAM_NAME_POOL = [
  { name: 'Jay的粉色泡泡团', desc: '以粉色泡泡为主题的可爱战队，适合所有喜欢轻松氛围的玩家加入！' },
  { name: '霓虹气球突击队',   desc: '速度与激情，每天都要冲榜 NO.1！' },
  { name: '糖果星河',         desc: '甜蜜可爱的小队，团结一致，享受每次挑战。' },
  { name: '云端梦想团',       desc: '在天空之上追逐每一只气球，做最闪亮的星！' },
  { name: '热血燃烧战队',     desc: '热血少年集合！我们要让所有气球听话！' },
  { name: '紫色闪电团',       desc: '速度无人能及，紫电劈空，气球必爆！' },
  { name: '冰川冒险队',       desc: '冷静而精准，刹在临界点前最美。' },
  { name: '彩虹猎手',         desc: '七色齐放，每一只气球都是我们的目标。' }
];
const TEAM_ICON_POOL = ['🎈','🌟','🍬','🌌','⚡','🔥','✨','💎','🌸','🐉'];

const TEAM_UI_IMG = {
  teamIcon:  'images/ui/balloon.png',   // 创建表单中央默认图标（粉色泡泡）
  lock:      'images/ui/lock.png',      // 仅通过邀请（未选中）
  lockOn:    'images/ui/lock-y.png',    // 仅通过邀请（选中态）
  freein:    'images/ui/freein.png',    // 用户可自主加入（未选中）
  freeinOn:  'images/ui/freein-y.png',  // 用户可自主加入（选中态）
  addPlus:   'images/ui/add_plus.png',  // 创建战队按钮前缀
  people:    'images/ui/people.png',    // 人数小图标
  tongguan:  'images/ui/Tongguan.png',  // 人均通关 / 通关类小图标
  trophy:    'images/ui/trophy.png',    // 排名 #1 装饰
  sparkle:   'images/ui/sparkle.png',   // 装饰
  no1:       'images/ui/NO1.png',       // 战队排名第 1 徽标
  no2:       'images/ui/NO2.png',       // 战队排名第 2 徽标
  no3:       'images/ui/NO3.png'        // 战队排名第 3 徽标
};
let _teamUiImgLoaded = false;

let state = {
  tab: 'recommend',                  // 'recommend' | 'rank' | 'my'
  scrollY: 0,
  scrollMax: 0,
  _scrollTop: -1,
  _scrollBottom: 0,
  scrollStartY: 0,
  scrollTouchStart: 0,
  isDraggingScroll: false,
  teams: [],
  rankTeams: [],
  recommendTeams: [],
  hasTeam: false,
  team: null,
  members: [],
  myRank: '-',
  refreshTimer: null,
  // —— 创建战队表单状态（在弹窗中使用） ——
  teamName: '',
  teamDesc: '',
  teamIconIdx: 0,
  joinType: 'open',                  // 'open' | 'invite'
  joinedId: null,
  nameError: '',
  showCreateModal: false,            // 创建战队弹窗
  showSuccessModal: false,           // 创建成功后引导弹窗
  showLeaveModal: false,             // 退出战队确认弹窗
  showJoinModal: false,              // 加入战队二次确认弹窗
  showRulesModal: false,             // 战队榜规则说明弹窗
  pendingJoinTeam: null,             // 待加入的战队（弹窗确认前暂存）
  createdTeamName: '',               // 成功弹窗用于展示
  editingField: null                 // 当前正在编辑的字段: 'name' | 'desc' | null
};

/** 按 measureText 宽度截断字符串，超出 maxWidth 时末尾加省略号 */
function _truncateByMeasure(ctx, text, maxWidth, fontSize, fontWeight) {
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

function _hash(str) {
  let h = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
  return Math.abs(h);
}

/** 贡献榜成员头像 URL：本人用微信 user.avatar，他人可读 m.avatar */
function _memberAvatarUrl(m, user) {
  if (!m) return '';
  if (user && m.openid === user.openid) return String((user.avatar) || '').trim();
  return String((m.avatar) || '').trim();
}

let _contribAvatarPreloadKey = '';

/** 预加载贡献榜会用到的网络头像（写入 canvas-ui 的 getImage 缓存） */
function _preloadMemberAvatars(members) {
  const user = store.getUser() || {};
  const seen = {};
  const urls = [];
  (members || []).forEach((m) => {
    const u = _memberAvatarUrl(m, user);
    if (u && !seen[u]) { seen[u] = true; urls.push(u); }
  });
  const key = urls.join('\0');
  if (key === _contribAvatarPreloadKey) return;
  _contribAvatarPreloadKey = key;
  if (urls.length) loadImages(urls, () => {});
}

/** 无头像时的占位底色（按 openid 稳定分配） */
function _memberFallbackFill(openid) {
  const h = _hash(openid || 'x');
  const hue = 220 + (h % 100);
  const sat = 28 + (h % 20);
  const lig = 22 + (h % 14);
  return 'hsl(' + hue + ',' + sat + '%,' + lig + '%)';
}

/**
 * 在 (cx,cy) 绘制半径 r 的圆形头像（微信头像 URL）；无图时首字 + 柔和底色。
 */
function _drawCircleAvatar(ctx, avatarUrl, cx, cy, r, nick, ringColor, fillKey) {
  const img = avatarUrl && getImage(avatarUrl);
  const hasImg = !!(img && img.width && img.height);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (hasImg) {
    const d = r * 2;
    const iw = img.width;
    const ih = img.height;
    const s = Math.max(d / iw, d / ih);
    const dw = iw * s;
    const dh = ih * s;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    ctx.fillStyle = _memberFallbackFill(fillKey || nick || 'x');
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const initial = (nick || '?').charAt(0);
    drawText(ctx, initial, cx, cy, 'rgba(255,255,255,0.92)', Math.max(11, Math.floor(r * 1.05)), 'center', undefined, 600);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor || 'rgba(255,255,255,0.22)';
  ctx.lineWidth = hasImg ? 1.5 : 1.2;
  ctx.stroke();
}

function _fmtComma(n) {
  const s = String(Math.max(0, Math.round(Number(n) || 0)));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function _teamDisplayScore(t) {
  const clears = t.periodClears || 0;
  const h = _hash(t.id);
  return clears * 180 + 42000 + (h % 8000);
}

function _teamMeta(t) {
  const h = _hash(t.id);
  const members = Math.max(1, t.memberCount || 1);
  const active = Math.max(1, Math.min(members, Math.floor(members * (0.42 + (h % 18) / 100))));
  return {
    badge: BADGES[h % BADGES.length],
    slogan: SLOGANS[h % SLOGANS.length],
    active,
    activePct: Math.round((active / members) * 100)
  };
}

function _drawCyberGrid(ctx, W, H) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,80,200,0.032)';
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

function _drawParticles(ctx, W, H, timeMs) {
  const t = (timeMs || 0) * 0.001;
  ctx.save();
  for (let i = 0; i < 6; i++) {
    const px = (0.1 + (i % 3) * 0.28) * W;
    const py = (0.05 + ((i * 13) % 60) / 100) * H;
    const r = 1 + (i % 3) * 0.5;
    const a = 0.22 + Math.sin(t * 1.2 + i) * 0.1;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? `rgba(255,80,200,${a})` : `rgba(64,224,208,${a * 0.85})`;
    ctx.shadowColor = i % 2 === 0 ? 'rgba(255,80,200,0.35)' : 'rgba(64,224,208,0.3)';
    ctx.shadowBlur = 3 + i;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function _tabGradient(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, NEON);
  g.addColorStop(1, VIOLET);
  return g;
}

/**
 * 计算到「本统计周期结束」的剩余时间。
 * 周期为 周日 ~ 下周六；下个周期开始于「下个周日 00:00」，即本周期结束的瞬间。
 * 返回格式：「X 天 HH 时 MM 分 SS 秒」
 */
function _formatPeriodCountdown(now) {
  const t = now || new Date();
  const day = t.getDay();                                // 0=周日, 6=周六
  const daysUntilNextSunday = ((7 - day) % 7) || 7;       // 距下个周日的天数（最少 1，最多 7）
  const next = new Date(t.getFullYear(), t.getMonth(), t.getDate() + daysUntilNextSunday, 0, 0, 0, 0);
  let ms = next.getTime() - t.getTime();
  if (ms < 0) ms = 0;
  const dd = Math.floor(ms / 86400000); ms -= dd * 86400000;
  const hh = Math.floor(ms / 3600000);  ms -= hh * 3600000;
  const mm = Math.floor(ms / 60000);    ms -= mm * 60000;
  const ss = Math.floor(ms / 1000);
  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
  return dd + ' 天 ' + pad2(hh) + ' 时 ' + pad2(mm) + ' 分 ' + pad2(ss) + ' 秒';
}

/**
 * 排名提示（tabs 下方两行小字，不参与滚动）。
 * 行 1：仅展示前 10 名战队，数据每 5 分钟刷新一次
 * 行 2：距本周期结束还剩 X 天 HH 时 MM 分 SS 秒
 */
function _drawRankHint(ctx, x, y, w) {
  const remain = _formatPeriodCountdown();
  const color = 'rgba(255,255,255,0.42)';
  drawText(ctx, '仅展示前 10 名战队，数据每 5 分钟刷新一次', x + w / 2, y + 9,  color, 12, 'center', undefined, 400);
  drawText(ctx, '距本周期结束还剩 ' + remain,             x + w / 2, y + 27, color, 12, 'center', undefined, 400);
}
const RANK_HINT_H = 38;

function _drawRankCard(ctx, scene, W, x, y, w, team, idx, myTeamId, cardH, registerHit) {
  const isMy = myTeamId && team.id === myTeamId;
  const meta = _teamMeta(team);
  const totalClears = team.periodClears || 0;            // 周期累计：本周总通关
  const memberCount = Math.max(0, team.memberCount || 0);
  const avgClears = memberCount > 0 ? Math.round(totalClears / memberCount) : 0;  // 人均通关次数
  const rankColors = [GOLD, SILVER, BRONZE];
  const isTop3 = idx < 3;

  ctx.save();
  roundRect(ctx, x, y, w, cardH, 16);
  if (isMy) {
    const bg = ctx.createLinearGradient(x, y, x + w, y + cardH);
    bg.addColorStop(0, 'rgba(255,80,200,0.1)');
    bg.addColorStop(1, 'rgba(124,77,255,0.08)');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,200,0.45)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(255,80,200,0.2)';
    ctx.shadowBlur = 12;
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // 排名标识（左侧 18px 处垂直居中）：
  //  - 前 3 名：使用 images/ui/NO{1,2,3}.png 徽标（带各自金/银/铜光晕）
  //  - 4 名后：纯数字（20 号粗体）
  const cxRank = x + 20;
  const cyMid = y + cardH / 2;
  if (isTop3) {
    const noImgKey = ['no1', 'no2', 'no3'][idx];
    const noImg = TEAM_UI_IMG[noImgKey];
    const img = noImg ? getImage(noImg) : null;
    if (img) {
      const sz = 32;                                 // 徽标大小（与卡高 84 视觉平衡）
      ctx.save();
      ctx.shadowColor = rankColors[idx];             // 金/银/铜柔光，与徽标主色呼应
      ctx.shadowBlur = 10;
      drawImage(ctx, noImg, cxRank - sz / 2, cyMid - sz / 2, sz, sz);
      ctx.restore();
    } else {
      // 兜底：图片尚未加载完成，临时退化为金/银/铜数字
      drawText(ctx, String(idx + 1), cxRank, cyMid, rankColors[idx], 20, 'center', 'rgba(255,255,255,0.35)', 800);
    }
  } else {
    drawText(ctx, String(team.rank || idx + 1), cxRank, cyMid, 'rgba(255,255,255,0.55)', 20, 'center', undefined, 800);
  }

  // 队徽 40×40，相对卡片纵向居中
  const bx = x + 40;
  const by = y + (cardH - 40) / 2;
  ctx.save();
  roundRect(ctx, bx, by, 40, 40, 10);
  ctx.fillStyle = 'rgba(255,80,200,0.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,80,200,0.22)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(meta.badge, bx + 20, by + 20);
  ctx.restore();

  // 三行文本布局：[队名 + 本周总通关] / [slogan] / [人数 + 人均通关]
  const tx0 = bx + 48;
  const nameFs = 14, lineFs = 11;
  const gap1 = 8, gap2 = 8;                                  // 行间净间距（和上下行字号无关）
  const blockH = nameFs + gap1 + lineFs + gap2 + lineFs;     // = 14 + 8 + 11 + 8 + 11 = 52
  const blockTop = y + (cardH - blockH) / 2;
  const nameCy   = blockTop + nameFs / 2;
  const sloganCy = blockTop + nameFs + gap1 + lineFs / 2;
  const statCy   = blockTop + nameFs + gap1 + lineFs + gap2 + lineFs / 2;

  // 行 1 左：队名 + 我的徽标
  drawText(ctx, team.name, tx0, nameCy, isMy ? NEON : '#ffffff', nameFs, 'left', isMy ? 'rgba(255,80,200,0.35)' : undefined, 700);
  if (isMy) {
    const nameW = measureText(ctx, team.name, nameFs);
    const tagX = tx0 + nameW + 6;
    const tagY = nameCy - 8;
    ctx.save();
    roundRect(ctx, tagX, tagY, 28, 16, 4);
    ctx.fillStyle = 'rgba(255,80,200,0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,200,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, '我的', tagX + 14, nameCy, NEON, 12, 'center', undefined, 600);
  }

  // 行 1 右：本周总通关（粉色霓虹强调，与右内边距 16 对齐）
  drawText(ctx, _fmtComma(totalClears), x + w - 16, nameCy, NEON, nameFs, 'right', 'rgba(255,80,200,0.35)', 700);

  // 行 2：队伍 slogan
  drawText(ctx, meta.slogan, tx0, sloganCy, 'rgba(255,255,255,0.38)', lineFs, 'left', undefined, 400);

  // 行 3：左 — people 图标 + 人数；右 — Tongguan 图标 + 人均通关（与文案垂直居中）
  const statIcon = 12;
  const statIconGap = 4;
  const peoplePath = TEAM_UI_IMG.people;
  if (getImage(peoplePath)) {
    drawImage(ctx, peoplePath, tx0, statCy - statIcon / 2, statIcon, statIcon);
  }
  drawText(ctx, memberCount + '/20人', tx0 + statIcon + statIconGap, statCy, 'rgba(255,255,255,0.42)', lineFs, 'left', undefined, 400);

  const avgStr = '人均通关 ' + _fmtComma(avgClears) + ' 次';
  const avgW = measureText(ctx, avgStr, lineFs, 400);
  const rightEdge = x + w - 16;
  const tgPath = TEAM_UI_IMG.tongguan;
  if (getImage(tgPath)) {
    const iconLeft = rightEdge - avgW - statIconGap - statIcon;
    drawImage(ctx, tgPath, iconLeft, statCy - statIcon / 2, statIcon, statIcon);
  }
  drawText(ctx, avgStr, rightEdge, statCy, 'rgba(255,255,255,0.42)', lineFs, 'right', undefined, 400);

  if (registerHit !== false) {
    scene.manager.addTouchable(x, y, w, cardH, () => scene._tapTeamRow(team));
  }
}

/** 初始化创建战队表单：随机一组（名称 + 描述 + 图标） */
function _initCreateForm() {
  const idxN = Math.floor(Math.random() * TEAM_NAME_POOL.length);
  const idxI = Math.floor(Math.random() * TEAM_ICON_POOL.length);
  state.teamName = TEAM_NAME_POOL[idxN].name;
  state.teamDesc = TEAM_NAME_POOL[idxN].desc;
  state.teamIconIdx = idxI;
  state.joinType = 'open';
  state.nameError = '';
  state.joinedId = null;
}

/** 在保持「不与当前一致」前提下随机一个池子里的索引 */
function _nextRandomIdx(curIdx, len) {
  if (len <= 1) return 0;
  let next = curIdx;
  while (next === curIdx) next = Math.floor(Math.random() * len);
  return next;
}

module.exports = {
  onShow(data) {
    // 预加载战队页用到的 PNG，缺图就重试
    const needReload = !_teamUiImgLoaded || Object.values(TEAM_UI_IMG).some(p => !getImage(p));
    if (needReload) {
      _teamUiImgLoaded = true;
      loadImages(Object.values(TEAM_UI_IMG), () => {});
    }
    const d = data || {};
    // 兼容旧调用：'discover' 视为新的 'recommend'
    if (d.tab === 'rank' || d.tab === 'my' || d.tab === 'recommend') state.tab = d.tab;
    else if (d.tab === 'discover') state.tab = 'recommend';
    else if (d.action === 'create') state.tab = 'recommend';   // 旧入口：进推荐页，不自动弹创建弹窗
    else state.tab = store.getTeam() ? 'my' : 'recommend';
    if (!store.getTeam()) _initCreateForm();
    // 进入页面默认关闭所有弹窗
    state.showCreateModal = false;
    state.showSuccessModal = false;
    state.showLeaveModal = false;
    state.showJoinModal = false;
    state.showRulesModal = false;
    state.pendingJoinTeam = null;
    state.scrollY = 0;
    cloudTeam.syncTeamFromCloud().finally(() => {
      this._loadTeams();
      if (d.autoJoinTeamId) {
        this._handleAutoJoinFromShare(String(d.autoJoinTeamId), d.inviteToken ? String(d.inviteToken) : '');
      }
    });
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(() => {
      cloudTeam.syncTeamFromCloud().finally(() => this._loadTeams(true));
    }, 30000);
  },
  onHide() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
    state.isDraggingScroll = false;
  },
  _handleAutoJoinFromShare(teamId, inviteToken) {
    const existing = store.getTeam();
    if (existing) {
      const myId = existing.teamId || existing.id;
      if (String(myId) === String(teamId)) {
        showToast('你已在该战队中');
        state.tab = 'my';
      } else {
        showToast('你已加入其他战队');
      }
      return;
    }
    if (inviteToken && isInviteJoinCached(teamId, inviteToken)) {
      showToast('你已在该战队中');
      state.tab = 'my';
      cloudTeam.syncTeamFromCloud().finally(() => this._loadTeams());
      return;
    }
    showToast('加入中…');
    const p = inviteToken
      ? cloudTeam.handleTeamInvite(inviteToken, 'accept')
      : cloudTeam.joinTeam(teamId);
    p.then((r) => {
      if (r.success) {
        if (inviteToken) markInviteJoinSuccess(teamId, inviteToken);
        showToast('加入成功');
        state.tab = 'my';
        this._loadTeams();
      } else {
        const msg = r.msg || '加入失败';
        showToast(msg.indexOf('已加入') >= 0 ? '你已加入其他战队' : msg);
      }
    });
  },

  _loadTeams(silent) {
    state.rankTeams = store.getRankedTeams() || [];
    state.recommendTeams = store.getRecommendTeams() || [];
    state.teams = state.tab === 'rank' ? state.rankTeams : state.recommendTeams;
    const team = store.getTeam();
    const ranked = state.rankTeams;
    state.hasTeam = !!team;
    state.team = team;
    if (team && team.members) {
      state.members = [...team.members].sort((a, b) => (b.periodClears || 0) - (a.periodClears || 0));
      _preloadMemberAvatars(state.members);
    } else {
      state.members = [];
    }
    const myRank = team ? ranked.findIndex(t => t.id === team.id) : -1;
    state.myRank = myRank >= 0 ? String(myRank + 1) : '—';
    // 兜底：状态与数据不一致时纠正 tab
    if (state.hasTeam && state.tab === 'recommend') state.tab = 'my';
    if (!state.hasTeam && state.tab === 'my') state.tab = 'recommend';
  },

  _tapTeamRow(t) {
    const my = store.getTeam();
    const tid = t.teamId || t.id;
    if (!tid || String(tid).indexOf('mock_team_') === 0) {
      showToast('战队数据未同步，请稍后重试');
      cloudTeam.syncTeamFromCloud().finally(() => this._loadTeams());
      return;
    }
    if (my && (my.id === tid || my.teamId === tid)) {
      state.tab = 'my';
      state.scrollY = 0;
      return;
    }
    if (t.joinType === 'invite') {
      showToast('该战队仅支持邀请加入');
      return;
    }
    cloudTeam.joinTeam(tid).then((r) => {
      if (r.success) {
        showToast('加入成功');
        this._loadTeams();
        state.tab = 'my';
      } else {
        showToast(r.msg || '加入失败');
      }
    });
  },

  render(ctx, W, H, timeMs) {
    const scene = this;
    const L = getCapsuleLayout();
    this._loadTeams(true);

    drawBackground(ctx, W, H, ['#080520', '#0d0b3a', '#08082a', '#050518']);
    _drawCyberGrid(ctx, W, H);
    _drawParticles(ctx, W, H, timeMs);

    const cx = W / 2;
    ctx.save();
    const amb = ctx.createRadialGradient(cx, L.contentTop * 0.6, 0, cx, H * 0.35, W * 0.75);
    amb.addColorStop(0, 'rgba(255,80,200,0.08)');
    amb.addColorStop(0.45, 'rgba(124,77,255,0.05)');
    amb.addColorStop(1, 'transparent');
    ctx.fillStyle = amb;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // —— 统一顶栏：与微信胶囊纵向对齐（无副标题、无装饰图标） ——
    const header = drawPageHeader(ctx, scene, W, {
      title: '战队',
      onBack: 'goBack'
    });
    let y = header.contentTop;

    // —— 活动说明横幅（点击查看规则） ——
    const bannerH = 64;
    const bannerX = 16;
    const bannerW = W - 32;
    const bannerY = y;
    this._drawActivityBanner(ctx, bannerX, bannerY, bannerW, bannerH);
    scene.manager.addTouchable(bannerX, bannerY, bannerW, bannerH, 'openRulesModal');
    y += bannerH + 12;

    const pageContentTop = y;   // 滚动起手区起点（让 tabs 区也能触发列表滚动）

    // —— Tabs（仅在已加入战队时绘制在顶部；未入队时由新版「创建+推荐/排名」分支自己渲染） ——
    if (state.hasTeam) {
      const tabH = 40;
      const tabGap = 8;
      const tabW = (W - 32 - tabGap) / 2;
      const tab1X = 16;
      const tab2X = 16 + tabW + tabGap;
      const tabs = [{ key: 'my', label: '我的战队', x: tab1X }, { key: 'rank', label: '战队排名', x: tab2X }];
      tabs.forEach((t) => {
        const active = state.tab === t.key;
        ctx.save();
        roundRect(ctx, t.x, y, tabW, tabH, 14);
        if (active) {
          const g = _tabGradient(ctx, t.x, y, tabW, tabH);
          ctx.fillStyle = g;
          ctx.shadowColor = 'rgba(255,80,200,0.35)';
          ctx.shadowBlur = 14;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.04)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
        drawText(ctx, t.label, t.x + tabW / 2, y + tabH / 2, active ? '#ffffff' : 'rgba(255,255,255,0.45)', 14, 'center', active ? 'rgba(255,255,255,0.25)' : undefined, 700);
        scene.manager.addTouchable(t.x, y, tabW, tabH, () => {
          state.tab = t.key;
          state.scrollY = 0;
        });
      });
      y += tabH + 10;
    }

    // my-team：邀请/退出已并入顶部概览卡，底部仅留 home 指示条安全间距
    const myBottomReserve = L.safeBottomInset + 8;
    const contentBottom = H - myBottomReserve;
    const myId = state.team && state.team.id;
    const scrollZoneTop = y;

    if (!state.hasTeam) {
      // —— 未入队：[Tabs] + [列表(滚动)] + [固定底部 CTA] ——
      // 按 mobile-game-ui：CTA 位于拇指热区，按钮底缘与 home 指示条留 12px；
      // 列表能在首屏放下时仅在按钮上方加一道灰色横线分隔；列表更长则上方使用渐隐遮罩。
      const tabsH = 44;
      const cardGap = 12;
      // 卡高：推荐保持 108，排名缩为 84（已去掉活跃度进度条 / 今日活跃 X 人）
      const cardH = state.tab === 'recommend' ? 108 : 84;
      const ctaBtnH = 48;
      const ctaBottomGap = 12;                                     // 按钮底 → safe area 顶
      const fadeH = 14;                                            // 列表底部渐隐高度
      const listTop = y;
      // 仅推荐 Tab 才显示底部「创建队伍」按钮；战队排名 Tab 不需要
      const showCta = state.tab === 'recommend';

      // Tabs（不滚动）
      this._drawRecommendTabs(ctx, W, listTop, tabsH);
      this._registerRecommendTabsTouches(scene, W, listTop, tabsH);
      const scrollViewTop = listTop + tabsH + 14;

      // CTA 固定位置：底部安全区上方（不显示 CTA 时让滚动区贴到底部安全区）
      const ctaY = H - L.safeBottomInset - ctaBottomGap - ctaBtnH;
      const scrollViewBottom = showCta ? (ctaY - 8) : (H - L.safeBottomInset - 8);
      const scrollAreaH = Math.max(0, scrollViewBottom - scrollViewTop);

      // 排名 Tab 仅展示前 10 名战队（推荐 Tab 全量展示）
      const visibleTeams = state.tab === 'rank'
        ? state.rankTeams.slice(0, 10)
        : state.recommendTeams;
      // 排名 Tab 在 10 个战队下方追加一段提示（提示参与滚动）
      const showRankHint = state.tab === 'rank';
      const rankHintGap = 16;                                       // 末条战队与提示间距

      // 列表内容高度（排名 Tab 多预留提示行）
      const listH = visibleTeams.length * (cardH + cardGap) + 12
                  + (showRankHint ? (rankHintGap + RANK_HINT_H) : 0);
      state.scrollMax = Math.max(0, listH - scrollAreaH);
      const overflow = listH > scrollAreaH;

      // 1) 列表绘制（裁切 + 平移）
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, scrollViewTop, W, scrollAreaH);
      ctx.clip();
      ctx.translate(0, -state.scrollY);
      let ly = scrollViewTop;
      const contentTopWorld = ly;
      if (visibleTeams.length === 0) {
        const emptyMsg = state.tab === 'rank' ? '本周暂无上榜战队' : '暂无可加入的公开战队';
        drawText(ctx, emptyMsg, W / 2, scrollViewTop + Math.min(48, scrollAreaH / 2), 'rgba(255,255,255,0.38)', 13, 'center', undefined, 400);
      } else if (state.tab === 'recommend') {
        visibleTeams.forEach((team, idx) => {
          this._drawRecommendCard(ctx, W, 14, ly, W - 28, team, idx);
          ly += cardH + cardGap;
        });
      } else if (state.tab === 'rank') {
        visibleTeams.forEach((team, idx) => {
          _drawRankCard(ctx, scene, W, 16, ly, W - 32, team, idx, null, cardH, false);
          ly += cardH + cardGap;
        });
        // 末条战队下方留 16px，再画两行提示（随列表一起滚动）
        ly = ly - cardGap + rankHintGap;
        _drawRankHint(ctx, 16, ly, W - 32);
        ly += RANK_HINT_H;
      }
      ctx.restore();

      // 2) 列表触区
      // 注：「战队排名」tab 仅作展示，整卡不挂触区（避免反复触发 _tapTeamRow → 加入失败 toast）
      if (state.tab === 'recommend') {
        let ly2 = contentTopWorld;
        visibleTeams.forEach((team) => {
          const sy = ly2 - state.scrollY;
          if (sy + cardH > scrollViewTop && sy < scrollViewBottom) {
            scene.manager.addTouchable(14, sy, W - 28, cardH, () => scene._tapJoinRecommend(team));
          }
          ly2 += cardH + cardGap;
        });
      }

      // 3) 列表底部过渡：
      //    - 列表溢出 → 渐隐遮罩，提示上方仍有内容
      //    - 列表能放下 + 显示 CTA → 一道灰色细线分隔
      //    - 列表能放下 + 不显示 CTA → 不画分隔线
      if (overflow) {
        const fadeY = scrollViewBottom - fadeH;
        const fade = ctx.createLinearGradient(0, fadeY, 0, scrollViewBottom + 4);
        fade.addColorStop(0, 'rgba(8,5,32,0)');
        fade.addColorStop(1, 'rgba(8,5,32,1)');
        ctx.fillStyle = fade;
        ctx.fillRect(0, fadeY, W, fadeH + 4);
      } else if (showCta) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(16, ctaY - 8, W - 32, 1);
      }

      // 4) CTA：固定吸底（仅推荐 Tab 显示）
      if (showCta) {
        this._drawCreateCtaButton(ctx, 16, ctaY, W - 32, ctaBtnH);
        if (!state.showCreateModal && !state.showSuccessModal) {
          scene.manager.addTouchable(16, ctaY, W - 32, ctaBtnH, 'openCreateModal');
        }
      }

      // 滚动手势可用区：从 tabs 上方开始，这样手指在 tabs 区域滑动也能滚动列表
      // tabs 本身不会移动（绘制在 clip+translate 之外）
      state._scrollTop = pageContentTop;
      state._scrollBottom = scrollViewBottom;

      // 创建战队弹窗（仅未入队页才需要打开）
      if (state.showCreateModal) {
        state._scrollTop = -1;
        this._renderCreateModal(ctx, W, H, scene);
      }
      // 加入战队二次确认弹窗（未入队页同样可触发，注意：在 return 之前渲染！）
      if (state.showJoinModal) {
        state._scrollTop = -1;
        this._renderJoinModal(ctx, W, H, scene);
      }
      // 规则说明弹窗（未入队页同样可触发）
      if (state.showRulesModal) {
        state._scrollTop = -1;
        this._renderRulesModal(ctx, W, H, scene);
      }
      return;
    }

    if (state.tab === 'rank') {
      const cardH = 84;                                             // 与未入队 rank 卡保持一致
      const gap = 8;
      const listTop = y;

      // 仅展示前 10 名战队，提示放在 10 个战队下方（参与滚动）
      const rankTeams = state.rankTeams.slice(0, 10);
      const rankHintGap = 16;                                       // 末条战队与提示间距
      const totalH = rankTeams.length * (cardH + gap) + 24
                   + (rankHintGap + RANK_HINT_H);
      state.scrollMax = Math.max(0, totalH - (contentBottom - listTop));

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, listTop, W, Math.max(0, contentBottom - listTop));
      ctx.clip();
      ctx.translate(0, -state.scrollY);
      let ly = listTop + 8;
      rankTeams.forEach((team, idx) => {
        _drawRankCard(ctx, scene, W, 16, ly, W - 32, team, idx, myId, cardH, false);
        ly += cardH + gap;
      });
      // 末条战队下方留 16px，再画两行提示
      ly = ly - gap + rankHintGap;
      _drawRankHint(ctx, 16, ly, W - 32);
      ctx.restore();
      // 注：「战队排名」tab 仅作展示，已加入战队后点击不再触发任何交互/toast
    } else if (state.tab === 'my' && state.hasTeam) {
      const t = state.team;
      const listTop = y;

      // ─── 战队概览卡（信息 + 邀请/退出 操作）布局尺寸 ───
      const PAD = 16;
      const cardX = 16;
      const cardW = W - 32;
      const headerH = 56;     // 队伍 icon + 名称区高度
      const gapHeaderStat = 16;
      const statH = 68;       // 单个 stat 子卡高度
      const gapStatBtn = 16;
      const startBtnH = 48;
      const gapStartInvite = 12;
      const inviteBtnH = 48;
      const gapInviteLeave = 12;
      const leaveTextH = 22;
      const overviewH = PAD + headerH + gapHeaderStat + statH + gapStatBtn + startBtnH + gapStartInvite + inviteBtnH + gapInviteLeave + leaveTextH + PAD;

      const rowH = 64;
      // listH = [顶 8] + 概览卡 + [概览->标题 24] + [标题区(28+14=42)] + [行 i*rowH] + [底 24]
      const listH = 8 + overviewH + 24 + 42 + state.members.length * rowH + 24;
      state.scrollMax = Math.max(0, listH - (contentBottom - listTop));

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, listTop, W, Math.max(0, contentBottom - listTop));
      ctx.clip();
      ctx.translate(0, -state.scrollY);
      let ly = listTop + 8;

      // 战队概览卡 - 与「战队推荐」卡风格一致：紫黑渐变 + 紫色细描边
      const cardY = ly;
      ctx.save();
      roundRect(ctx, cardX, cardY, cardW, overviewH, 18);
      const cg = ctx.createLinearGradient(cardX, cardY, cardX, cardY + overviewH);
      cg.addColorStop(0, 'rgba(38,22,68,0.78)');
      cg.addColorStop(1, 'rgba(20,12,42,0.78)');
      ctx.fillStyle = cg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(167,139,250,0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // ── Header：图标 + 名称/标语 + 「人数 X」chip ──
      const iconX = cardX + PAD;
      const iconY = cardY + PAD;
      const iconS = 48;
      ctx.save();
      roundRect(ctx, iconX, iconY, iconS, iconS, 12);
      const ig = ctx.createLinearGradient(iconX, iconY, iconX + iconS, iconY + iconS);
      ig.addColorStop(0, 'rgba(124,77,255,0.28)');
      ig.addColorStop(1, 'rgba(255,80,200,0.16)');
      ctx.fillStyle = ig;
      ctx.fill();
      ctx.strokeStyle = 'rgba(167,139,250,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      drawText(ctx, '⭐', iconX + iconS / 2, iconY + iconS / 2 + 2, GOLD, 22, 'center', undefined, 400);

      // 「人数 X」chip 先量宽，便于给名称留出截断宽度
      const mc = t.memberCount || (t.members ? t.members.length : 0);
      const chipText = '人数 ' + mc;
      const chipFs = 11;
      const chipFw = 600;
      const chipPadX = 12;
      const chipH = 26;
      const chipW = measureText(ctx, chipText, chipFs, chipFw) + chipPadX * 2;
      const chipX = cardX + cardW - PAD - chipW;
      const chipY = iconY + (iconS - chipH) / 2;
      ctx.save();
      roundRect(ctx, chipX, chipY, chipW, chipH, 13);
      ctx.fillStyle = 'rgba(255,80,200,0.08)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,200,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      drawText(ctx, chipText, chipX + chipW / 2, chipY + chipH / 2, NEON, chipFs, 'center', undefined, chipFw);

      // 名称 / 标语（截断到 chip 左侧 8px 之前）
      const nameX = iconX + iconS + 12;
      const nameMaxW = chipX - 8 - nameX;
      const teamNameRaw = t.name || '我的战队';
      const teamNameShow = _truncateByMeasure(ctx, teamNameRaw, nameMaxW, 17, 700);
      drawText(ctx, teamNameShow, nameX, iconY + 18, '#fff', 17, 'left', 'rgba(255,255,255,0.2)', 700);
      const sloganRaw = (t.description && String(t.description).trim()) || '我们是最亮的星！';
      const sloganShow = _truncateByMeasure(ctx, sloganRaw, nameMaxW, 12, 400);
      drawText(ctx, sloganShow, nameX, iconY + 40, 'rgba(255,255,255,0.45)', 12, 'left', undefined, 400);

      // ── Stats：3 个独立子卡 ──
      const statRowY = cardY + PAD + headerH + gapHeaderStat;
      const statGap = 8;
      const subCardW = (cardW - PAD * 2 - statGap * 2) / 3;
      const clears = t.periodClears || 0;
      const totalShow = _fmtComma(clears * 88 + 9200);
      const rankShow = 'NO.' + state.myRank;
      const me = (t.members || []).find(m => m.openid === store.getUser().openid) || (t.members || [])[0];
      const myContrib = _fmtComma((me && me.periodClears ? me.periodClears : 0) * 120 + 400);
      const stats = [
        { val: totalShow, lab: '总通关',   col: NEON },
        { val: rankShow,  lab: '本周排名', col: GOLD },
        { val: myContrib, lab: '我的贡献', col: CYAN }
      ];
      stats.forEach((s, i) => {
        const sx = cardX + PAD + i * (subCardW + statGap);
        ctx.save();
        roundRect(ctx, sx, statRowY, subCardW, statH, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        drawText(ctx, s.val, sx + subCardW / 2, statRowY + 26, s.col, 18, 'center', 'rgba(255,255,255,0.15)', 700);
        drawText(ctx, s.lab, sx + subCardW / 2, statRowY + 50, 'rgba(255,255,255,0.45)', 12, 'center', undefined, 400);
      });

      const btnX = cardX + PAD;
      const btnW = cardW - PAD * 2;
      const violetPinkGrad = (c, gx, gy, gw, gh) => {
        const g = c.createLinearGradient(gx, gy, gx + gw, gy + gh);
        g.addColorStop(0, '#7c4dff');
        g.addColorStop(1, '#ff50c8');
        return g;
      };

      // ── 开始挑战 主按钮（紫粉渐变） ──
      const startY = statRowY + statH + gapStatBtn;
      drawButtonGradient(ctx, btnX, startY, btnW, startBtnH, '开始挑战', violetPinkGrad, '#fff', 14, 14, 'rgba(255,80,200,0.4)', 700);
      scene.manager.addTouchable(btnX, startY - state.scrollY, btnW, startBtnH, 'startChallenge');

      // ── 邀请队员（次级描边按钮） ──
      const inviteY = startY + startBtnH + gapStartInvite;
      ctx.save();
      roundRect(ctx, btnX, inviteY, btnW, inviteBtnH, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      drawText(ctx, '邀请队员', btnX + btnW / 2, inviteY + inviteBtnH / 2, 'rgba(255,255,255,0.85)', 15, 'center', undefined, 600);
      scene.manager.addTouchable(btnX, inviteY - state.scrollY, btnW, inviteBtnH, 'inviteTeammates');

      // ── 退出战队 文字（柔和警示色） ──
      const leaveCy = inviteY + inviteBtnH + gapInviteLeave + leaveTextH / 2;
      drawText(ctx, '退出战队', cardX + cardW / 2, leaveCy, 'rgba(255,107,138,0.78)', 13, 'center', undefined, 500);
      const leaveTouchW = 120;
      scene.manager.addTouchable((W - leaveTouchW) / 2, leaveCy - leaveTextH / 2 - state.scrollY, leaveTouchW, leaveTextH + 6, 'onLeaveTap');

      ly += overviewH + 24;
      drawText(ctx, '本周贡献榜', 24, ly + 10, '#ffffff', 15, 'left', UX.shadowTitle, 700);
      // 标题文字中心在 ly+10、字号 15 → 视觉底约 ly+18；再加 24px 间距 → 首行卡顶 ly+42
      ly += 42;

      const userOpenid = store.getUser().openid;
      const user = store.getUser() || {};
      const rowFs = 12;
      const rankFs = 11;
      const cardLeft = 16;        // 行卡左缘
      const rankX = cardLeft + 24; // NO.X 距行卡左侧 24px
      state.members.forEach((m, i) => {
        const rowY = ly + i * rowH;
        const rowInnerH = rowH - 6;
        const rowCy = rowY + rowInnerH / 2;
        const borderColors = [GOLD, '#60a5fa', NEON];
        const isTop3 = i < 3;
        const isMe = m.openid === userOpenid;
        ctx.save();
        roundRect(ctx, cardLeft, rowY, W - cardLeft * 2, rowInnerH, 14);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fill();
        ctx.strokeStyle = isTop3 ? borderColors[i] + '88' : (isMe ? 'rgba(255,80,200,0.45)' : 'rgba(255,255,255,0.08)');
        ctx.lineWidth = isTop3 || isMe ? 1.5 : 1;
        if (isTop3 || isMe) {
          ctx.shadowColor = isMe ? 'rgba(255,80,200,0.2)' : borderColors[i];
          ctx.shadowBlur = isMe ? 10 : 6;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();

        const rankStr = 'NO.' + (i + 1);
        const rankColor = isTop3 ? borderColors[i] : 'rgba(255,255,255,0.38)';
        drawText(ctx, rankStr, rankX, rowCy, rankColor, rankFs, 'left', undefined, 700);

        const rankW = measureText(ctx, rankStr, rankFs, 700);
        const avR = 16;
        const avCx = rankX + rankW + 12 + avR;
        const avatarUrl = _memberAvatarUrl(m, user);
        const ringCol = isTop3 ? borderColors[i] + 'aa' : (isMe ? 'rgba(255,80,200,0.55)' : 'rgba(255,255,255,0.2)');
        _drawCircleAvatar(ctx, avatarUrl, avCx, rowCy, avR, m.nickName || '队友', ringCol, m.openid);

        let nameX = avCx + avR + 12;
        const nick = m.nickName || '队友';
        drawText(ctx, nick, nameX, rowCy, '#ffffff', rowFs, 'left', undefined, 600);
        nameX += measureText(ctx, nick, rowFs, 600) + 8;
        if (m.isLeader) {
          ctx.save();
          roundRect(ctx, nameX, rowCy - 8, 36, 16, 4);
          ctx.fillStyle = 'rgba(255,215,64,0.15)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,215,64,0.35)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
          drawText(ctx, '队长', nameX + 18, rowCy, GOLD, 12, 'center', undefined, 600);
          nameX += 44;
        }
        if (isMe) {
          ctx.save();
          roundRect(ctx, nameX, rowCy - 8, 26, 16, 4);
          ctx.fillStyle = 'rgba(255,80,200,0.15)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,80,200,0.35)';
          ctx.stroke();
          ctx.restore();
          drawText(ctx, '我', nameX + 13, rowCy, NEON, 12, 'center', undefined, 600);
        }

        // 右侧改为「本周通关次数 xxx」：标签灰、数值霓虹粉强调
        const weekClears = (m.periodClears || 0);
        const rightEdge = W - 28;
        const valueStr = _fmtComma(weekClears);
        const labelStr = '本周通关次数 ';
        const valueW = measureText(ctx, valueStr, rowFs, 700);
        drawText(ctx, valueStr, rightEdge, rowCy, NEON, rowFs, 'right', 'rgba(255,80,200,0.25)', 700);
        drawText(ctx, labelStr, rightEdge - valueW, rowCy, 'rgba(255,255,255,0.45)', rowFs, 'right', undefined, 400);
      });

      ctx.restore();
      // 注：邀请队员 / 退出战队 现已并入顶部概览卡，不再绘制底部独立按钮。
    }

    if (state.tab === 'rank' || (state.tab === 'my' && state.hasTeam)) {
      // 同未入队页：把 tabs 也纳入滚动起手区
      state._scrollTop = pageContentTop;
      state._scrollBottom = contentBottom;
    } else {
      state._scrollTop = -1;
      state._scrollBottom = contentBottom;
    }

    // 创建成功后引导弹窗（创建后已 hasTeam，需在 my-team 分支之上叠加）
    if (state.showSuccessModal) {
      state._scrollTop = -1;
      this._renderSuccessModal(ctx, W, H, scene);
    }

    // 退出战队确认弹窗（最顶层，任意 tab 均可触发）
    if (state.showLeaveModal) {
      state._scrollTop = -1;
      this._renderLeaveModal(ctx, W, H, scene);
    }

    // 加入战队二次确认弹窗（最顶层）
    if (state.showJoinModal) {
      state._scrollTop = -1;
      this._renderJoinModal(ctx, W, H, scene);
    }

    // 战队榜规则说明弹窗（最顶层）
    if (state.showRulesModal) {
      state._scrollTop = -1;
      this._renderRulesModal(ctx, W, H, scene);
    }
  },

  // ─── 底部「创建队伍」CTA：紫→粉渐变（与战队推荐 tab 同色系） ───
  _drawCreateCtaButton(ctx, x, y, w, h) {
    const violetPinkGrad = (c, gx, gy, gw, gh) => {
      const g = c.createLinearGradient(gx, gy, gx + gw, gy + gh);
      g.addColorStop(0, '#7c4dff');   // 左上：紫
      g.addColorStop(1, '#ff50c8');   // 右下：粉
      return g;
    };
    drawButtonGradient(ctx, x, y, w, h, '', violetPinkGrad, '#fff', 14, 14, 'rgba(255,80,200,0.4)', 700);
    const text = '创建队伍';
    const fs = 14;
    const fw = 700;
    const hasImg = !!getImage(TEAM_UI_IMG.addPlus);
    const iconSize = hasImg ? 16 : 0;
    const gap = hasImg ? 8 : 0;
    const tw = measureText(ctx, text, fs, fw);
    const total = iconSize + gap + tw;
    const startX = x + (w - total) / 2;
    if (hasImg) drawImage(ctx, TEAM_UI_IMG.addPlus, startX, y + (h - iconSize) / 2, iconSize, iconSize);
    drawText(ctx, text, startX + iconSize + gap, y + h / 2, '#fff', fs, 'left', 'rgba(255,80,200,0.35)', fw);
  },

  // ─── 创建战队：弹窗 ───────────────────────────────
  _renderCreateModal(ctx, W, H, scene) {
    drawModalBackground(ctx, W, H);
    // 1) 全屏背景：点击空白处关闭弹窗
    scene.manager.addTouchable(0, 0, W, H, 'cancelCreateModal');

    // 弹窗位置/尺寸：左右各 40px → 弹窗宽 W-80；表单与按钮在弹窗内再各留 24px
    const sideMargin = 40;             // 弹窗距屏幕左右
    const innerPad = 24;               // 表单/按钮 距弹窗左右
    const cardW = W - sideMargin * 2;
    const formH = this._measureCreateFormH(); // 仅表单内容高度（已含上下 24 padding）
    const bottomBtnH = 44;
    const bottomBlockH = bottomBtnH + 16 + 16; // 与表单间距 + 底部内边距 + 按钮
    const totalH = formH + bottomBlockH;
    const cardX = sideMargin;
    const cardY = Math.max(20, (H - totalH) / 2);

    // 2) 卡片区域 no-op：拦截卡内空白处的点击（避免被全屏背景误关）
    scene.manager.addTouchable(cardX, cardY, cardW, totalH, () => {});

    // 弹窗主卡（不再嵌套内层 form 卡，唯一的卡背）
    ctx.save();
    roundRect(ctx, cardX, cardY, cardW, totalH, 20);
    const cardBg = ctx.createLinearGradient(cardX, cardY, cardX, cardY + totalH);
    cardBg.addColorStop(0, '#1a0f3a');
    cardBg.addColorStop(1, '#0e0822');
    ctx.fillStyle = cardBg;
    ctx.fill();
    ctx.shadowColor = 'rgba(124,77,255,0.35)';
    ctx.shadowBlur = 24;
    ctx.strokeStyle = 'rgba(255,80,200,0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // 表单内容（不再画自己的卡边/底）
    this._drawCreateForm(ctx, W, cardX, cardY, cardW, formH);

    // 底部「取消 / 保存」：左右各 24px 距弹窗
    const bY = cardY + formH + 16;
    const gap = 12;
    const innerW = cardW - innerPad * 2;
    const bw = (innerW - gap) / 2;
    const cancelX = cardX + innerPad;
    const saveX = cancelX + bw + gap;
    // 取消（边框/灰）
    ctx.save();
    roundRect(ctx, cancelX, bY, bw, bottomBtnH, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, '取消', cancelX + bw / 2, bY + bottomBtnH / 2, 'rgba(255,255,255,0.85)', 14, 'center', undefined, 600);
    // 3) 取消 / 保存按钮
    scene.manager.addTouchable(cancelX, bY, bw, bottomBtnH, 'cancelCreateModal');
    drawButtonGradient(ctx, saveX, bY, bw, bottomBtnH, '保存', gradientPink, '#fff', 14, 14, 'rgba(255,80,200,0.35)', 700);
    scene.manager.addTouchable(saveX, bY, bw, bottomBtnH, 'confirmCreate');

    // 4) 表单内具体可交互项（最后注册，命中优先级最高）
    this._registerCreateFormTouchesAbsolute(scene);
  },

  // 弹窗内的触区注册：直接用 state._formLayout（已是世界坐标，等同屏幕坐标）
  _registerCreateFormTouchesAbsolute(scene) {
    const lay = state._formLayout;
    if (!lay) return;
    const tap = (rect, handler) => {
      if (!rect) return;
      scene.manager.addTouchable(rect.x, rect.y, rect.w, rect.h, handler);
    };
    tap(lay.iconRefresh, 'refreshTeamIcon');
    tap(lay.name && lay.name.inputRect, 'editTeamName');
    tap(lay.name && lay.name.chipRect,  'randomTeamName');
    tap(lay.desc && lay.desc.inputRect, 'editTeamDesc');
    tap(lay.seg1, () => { state.joinType = 'open'; });
    tap(lay.seg2, () => { state.joinType = 'invite'; });
    // 注意：弹窗模式下不再注册表单内的「创建战队」按钮触区，
    // 由弹窗底部独立的「保存」按钮统一调用 confirmCreate
  },

  // ─── 创建成功后：邀请/开始引导弹窗 ───
  _renderSuccessModal(ctx, W, H, scene) {
    drawModalBackground(ctx, W, H);
    // 全屏吸收点击（不关闭，避免误触）
    scene.manager.addTouchable(0, 0, W, H, () => {});

    const cardW = W - 80;
    const cardH = 220;
    const cardX = 40;
    const cardY = (H - cardH) / 2;
    ctx.save();
    roundRect(ctx, cardX, cardY, cardW, cardH, 18);
    const g = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    g.addColorStop(0, 'rgba(30,10,50,0.98)');
    g.addColorStop(1, 'rgba(20,5,40,0.98)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,200,0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    drawText(ctx, '🎉  战队创建成功！', cardX + cardW / 2, cardY + 36, '#fff', 18, 'center', 'rgba(255,80,200,0.55)', 800);
    drawText(ctx, state.createdTeamName || '我的战队', cardX + cardW / 2, cardY + 64, NEON, 14, 'center', undefined, 700);
    drawText(ctx, '邀请队友一起冲榜，或立刻开始挑战！', cardX + cardW / 2, cardY + 96, 'rgba(255,255,255,0.6)', 12, 'center', undefined, 400);

    const btnH = 44;
    const gap = 10;
    const bY = cardY + cardH - btnH - 18;
    const innerW = cardW - 32;
    const bw = (innerW - gap) / 2;
    const inviteX = cardX + 16;
    const startX = inviteX + bw + gap;
    // 邀请队友
    ctx.save();
    roundRect(ctx, inviteX, bY, bw, btnH, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, '邀请队友', inviteX + bw / 2, bY + btnH / 2, 'rgba(255,255,255,0.9)', 14, 'center', undefined, 600);
    scene.manager.addTouchable(inviteX, bY, bw, btnH, 'inviteTeammates');
    // 开始挑战（粉紫渐变）
    drawButtonGradient(ctx, startX, bY, bw, btnH, '开始挑战', gradientPink, '#fff', 14, 12, 'rgba(255,80,200,0.35)', 700);
    scene.manager.addTouchable(startX, bY, bw, btnH, 'startChallengeFromSuccess');
  },

  // ─── 退出战队确认弹窗 ───────────────────────────────────────
  _renderLeaveModal(ctx, W, H, scene) {
    drawModalBackground(ctx, W, H);
    scene.manager.addTouchable(0, 0, W, H, () => { state.showLeaveModal = false; });

    const cardW = W - 80;
    const cardX = 40;
    const cardH = 210;
    const cardY = (H - cardH) / 2;

    // 卡背：深紫渐变 + 红警描边
    ctx.save();
    roundRect(ctx, cardX, cardY, cardW, cardH, 18);
    const bg = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    bg.addColorStop(0, '#1a0f3a');
    bg.addColorStop(1, '#0e0822');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.shadowColor = 'rgba(255,107,138,0.4)';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = 'rgba(255,107,138,0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // 标题
    drawText(ctx, '退出战队', cardX + cardW / 2, cardY + 36, '#fff', 18, 'center', 'rgba(255,107,138,0.5)', 800);

    // 说明文字（分两行，二次确认对话框正文统一 14）
    drawText(ctx, '确定退出当前战队吗？', cardX + cardW / 2, cardY + 70, 'rgba(255,255,255,0.75)', 14, 'center', undefined, 400);
    drawText(ctx, '退出后当天无法再创建或加入任何战队', cardX + cardW / 2, cardY + 96, 'rgba(255,107,138,0.85)', 14, 'center', undefined, 400);

    // 按钮行
    const btnH = 44;
    const gap = 10;
    const innerW = cardW - 48;
    const bw = (innerW - gap) / 2;
    const bY = cardY + cardH - btnH - 20;
    const cancelX = cardX + 24;
    const confirmX = cancelX + bw + gap;

    // 取消按钮
    ctx.save();
    roundRect(ctx, cancelX, bY, bw, btnH, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, '取消', cancelX + bw / 2, bY + btnH / 2, 'rgba(255,255,255,0.85)', 14, 'center', undefined, 600);

    // 确定按钮（红警渐变）
    ctx.save();
    roundRect(ctx, confirmX, bY, bw, btnH, 12);
    const rg = ctx.createLinearGradient(confirmX, bY, confirmX + bw, bY + btnH);
    rg.addColorStop(0, 'rgba(255,60,100,0.85)');
    rg.addColorStop(1, 'rgba(255,107,138,0.85)');
    ctx.fillStyle = rg;
    ctx.shadowColor = 'rgba(255,60,100,0.4)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    drawText(ctx, '确定退出', confirmX + bw / 2, bY + btnH / 2, '#fff', 14, 'center', undefined, 700);

    // ⚠️ 触区注册顺序 = LIFO 命中：后注册者先命中。
    // 因此先注册「卡片 no-op」（兜底，吃掉卡片空白处的点击防穿透），
    // 再注册具体按钮，按钮才能优先命中。
    scene.manager.addTouchable(cardX, cardY, cardW, cardH, () => {});
    scene.manager.addTouchable(cancelX, bY, bw, btnH, 'cancelLeaveModal');
    scene.manager.addTouchable(confirmX, bY, bw, btnH, 'confirmLeave');
  },

  // ─── 加入战队二次确认弹窗 ───────────────────────────────────
  _renderJoinModal(ctx, W, H, scene) {
    drawModalBackground(ctx, W, H);
    scene.manager.addTouchable(0, 0, W, H, 'cancelJoinModal');

    const cardW = W - 80;
    const cardX = 40;
    const cardH = 230;
    const cardY = (H - cardH) / 2;
    const team = state.pendingJoinTeam;

    // 卡背：深紫渐变 + 紫粉描边（与创建/成功弹窗同色系）
    ctx.save();
    roundRect(ctx, cardX, cardY, cardW, cardH, 18);
    const bg = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    bg.addColorStop(0, '#1a0f3a');
    bg.addColorStop(1, '#0e0822');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.shadowColor = 'rgba(124,77,255,0.4)';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = 'rgba(255,80,200,0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // 标题
    drawText(ctx, '加入战队', cardX + cardW / 2, cardY + 36, '#fff', 18, 'center', 'rgba(255,80,200,0.5)', 800);

    // 战队名（突出展示，最长截断）
    if (team && team.name) {
      const maxNameW = cardW - 48;
      const nameShow = _truncateByMeasure(ctx, team.name, maxNameW, 14, 700);
      drawText(ctx, nameShow, cardX + cardW / 2, cardY + 64, NEON, 14, 'center', undefined, 700);
    }

    // 说明文字（分两行，二次确认对话框正文统一 14）
    drawText(ctx, '每天最多只能加入一支战队', cardX + cardW / 2, cardY + 100, 'rgba(255,255,255,0.75)', 14, 'center', undefined, 400);
    drawText(ctx, '确认加入该战队吗？', cardX + cardW / 2, cardY + 126, 'rgba(255,255,255,0.75)', 14, 'center', undefined, 400);

    // 按钮行
    const btnH = 44;
    const gap = 10;
    const innerW = cardW - 48;
    const bw = (innerW - gap) / 2;
    const bY = cardY + cardH - btnH - 20;
    const cancelX = cardX + 24;
    const confirmX = cancelX + bw + gap;

    // 取消按钮（描边/灰）
    ctx.save();
    roundRect(ctx, cancelX, bY, bw, btnH, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, '取消', cancelX + bw / 2, bY + btnH / 2, 'rgba(255,255,255,0.85)', 14, 'center', undefined, 600);

    // 确认加入按钮（紫→粉渐变）
    const violetPinkGrad = (c, gx, gy, gw, gh) => {
      const g = c.createLinearGradient(gx, gy, gx + gw, gy + gh);
      g.addColorStop(0, '#7c4dff');
      g.addColorStop(1, '#ff50c8');
      return g;
    };
    drawButtonGradient(ctx, confirmX, bY, bw, btnH, '确认加入', violetPinkGrad, '#fff', 14, 12, 'rgba(255,80,200,0.4)', 700);

    // ⚠️ 触区注册顺序 = LIFO 命中：后注册者先命中。
    // 因此先注册「卡片 no-op」（兜底，吃掉卡片空白处的点击防穿透），
    // 再注册具体按钮，按钮才能优先命中。
    scene.manager.addTouchable(cardX, cardY, cardW, cardH, () => {});
    scene.manager.addTouchable(cancelX, bY, bw, btnH, 'cancelJoinModal');
    scene.manager.addTouchable(confirmX, bY, bw, btnH, 'confirmJoin');
  },

  // ─── 顶部活动横幅：战队榜奖励说明（点击查看完整规则） ───
  _drawActivityBanner(ctx, x, y, w, h) {
    // 卡背：紫黑渐变 + 金色细描边（突出"奖励"语义，并与下面卡片区分）
    ctx.save();
    roundRect(ctx, x, y, w, h, 16);
    const bg = ctx.createLinearGradient(x, y, x + w, y + h);
    bg.addColorStop(0, 'rgba(58,32,12,0.88)');
    bg.addColorStop(1, 'rgba(28,14,52,0.88)');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,64,0.45)';
    ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(255,215,64,0.18)';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // 左侧奖杯 emoji（带金色发光）
    const trophyCx = x + 28;
    const trophyCy = y + h / 2;
    drawText(ctx, '🏆', trophyCx, trophyCy, GOLD, 26, 'center', 'rgba(255,215,64,0.55)', 400);

    // 主标题 + 副标题
    const textX = x + 56;
    drawText(ctx, '战队榜前5名 获得传奇气球', textX, y + 22, GOLD, 14, 'left', 'rgba(255,215,64,0.4)', 700);
    drawText(ctx, '每周结算 · 限定传说外观', textX, y + 44, 'rgba(255,255,255,0.55)', 12, 'left', undefined, 400);

    // 右侧 › 提示
    drawText(ctx, '›', x + w - 18, trophyCy, 'rgba(255,215,64,0.65)', 20, 'center', undefined, 400);
  },

  // ─── 战队榜规则说明弹窗 ───────────────────────────────────
  _renderRulesModal(ctx, W, H, scene) {
    drawModalBackground(ctx, W, H);
    scene.manager.addTouchable(0, 0, W, H, 'closeRulesModal');

    const cardW = W - 80;
    const cardX = 40;

    // 规则内容：标题 ↑ 解释 ↓ 上下两行展示，分组之间留 16px
    const rules = [
      { label: '奖品', text: '战队榜前 5 名战队，全员获得限定传奇气球外观' },
      { label: '统计', text: '每周日 ~ 下周六 为一个周榜周期，按周期累计战队总通关' },
      { label: '发奖', text: '周日上午 9:00 检查周榜前 5 并发放上一周期奖品，请留意通知' },
      { label: '提示', text: '退出战队后当天无法再加入或创建战队' }
    ];
    // 视觉度量
    const pad = 24;                                     // 卡片内左右内边距
    const titleH = 16;                                  // 标题字号高度参考
    const titleTop = 24;                                // 标题距卡顶
    const titleToBody = 24;                             // 标题与正文区起始的间距
    const labelFs = 12;                                 // 行内小标题（辅助 12）
    const textFs = 14;                                  // 行内解释（正文 14）
    const labelToText = 8;                              // 同组：标题与解释之间的间距
    const groupGap = 16;                                // 不同组之间的间距
    const groupH = labelFs + labelToText + textFs;      // 单组高度
    const rulesH = rules.length * groupH + (rules.length - 1) * groupGap;
    const btnH = 44;
    const bodyToBtn = 24;                               // 正文末尾到按钮的间距
    const btnToBottom = 20;                             // 按钮到卡底
    const cardH = titleTop + titleH + titleToBody + rulesH + bodyToBtn + btnH + btnToBottom;
    const cardY = (H - cardH) / 2;

    // 卡背：与其它弹窗同色系（深紫渐变 + 金色描边强调奖励主题）
    ctx.save();
    roundRect(ctx, cardX, cardY, cardW, cardH, 18);
    const bg = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    bg.addColorStop(0, '#1a0f3a');
    bg.addColorStop(1, '#0e0822');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.shadowColor = 'rgba(255,215,64,0.35)';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = 'rgba(255,215,64,0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // 标题
    drawText(ctx, '🏆 战队榜活动规则', cardX + cardW / 2, cardY + titleTop + titleH / 2, GOLD, 18, 'center', 'rgba(255,215,64,0.5)', 800);

    // 正文：每组上下两行（标题 + 解释），组间 16px
    const labelColor = NEON;
    const textColor = 'rgba(255,255,255,0.78)';
    const bodyTop = cardY + titleTop + titleH + titleToBody;
    rules.forEach((r, i) => {
      const groupTop = bodyTop + i * (groupH + groupGap);
      const labelCy = groupTop + labelFs / 2;
      const textCy = groupTop + labelFs + labelToText + textFs / 2;
      drawText(ctx, r.label, cardX + pad, labelCy, labelColor, labelFs, 'left', undefined, 700);
      drawText(ctx, r.text, cardX + pad, textCy, textColor, textFs, 'left', undefined, 400);
    });

    // 关闭按钮（紫粉渐变，整条）
    const btnY = cardY + cardH - btnH - btnToBottom;
    const btnX = cardX + pad;
    const btnW = cardW - pad * 2;
    const violetPinkGrad = (c, gx, gy, gw, gh) => {
      const g = c.createLinearGradient(gx, gy, gx + gw, gy + gh);
      g.addColorStop(0, '#7c4dff');
      g.addColorStop(1, '#ff50c8');
      return g;
    };
    // ⚠️ 卡片 no-op 必须先注册，按钮后注册才能命中优先
    scene.manager.addTouchable(cardX, cardY, cardW, cardH, () => {});
    drawButtonGradient(ctx, btnX, btnY, btnW, btnH, '我知道了', violetPinkGrad, '#fff', 14, 12, 'rgba(255,80,200,0.4)', 700);
    scene.manager.addTouchable(btnX, btnY, btnW, btnH, 'closeRulesModal');
  },

  openRulesModal() {
    state.showRulesModal = true;
  },
  closeRulesModal() {
    state.showRulesModal = false;
  },

  // ─── 创建战队表单（仅在弹窗内使用，不含底部 CTA） ─────────
  _measureCreateFormH() {
    const errH = state.nameError ? 22 : 0;
    const PAD = 24; // 表单内容距弹窗左右/上下各 24px
    // 顶 PAD + 标题(≈18) + 8 + icon 56 + 18
    // + 名称(12+8+40+errH) + 16 + 描述(12+8+64) + 16 + 加入方式(12+8+36) + 底 PAD
    return PAD + 18 + 8 + 56 + 18 + (12 + 8 + 40 + errH) + 16 + (12 + 8 + 64) + 16 + (12 + 8 + 36) + PAD;
  },

  _drawCreateForm(ctx, W, x, y, w, h) {
    const cardX = x;
    const cardY = y;
    const cardW = w;
    // const cardH = h; // 已无内层卡，无需感知高度
    const PAD = 24; // 与 _measureCreateFormH 保持一致

    // 注意：弹窗已绘制唯一的主卡背景，这里不再嵌套内层 form 卡片，
    // 直接在弹窗内绘制内容。

    // 标题（视觉顶 = cardY + PAD）
    const titleCy = cardY + PAD + 9;
    ctx.save();
    ctx.shadowColor = 'rgba(255,80,200,0.5)';
    ctx.shadowBlur = 10;
    drawText(ctx, '🎖 创建我的战队', cardX + PAD, titleCy, '#fff', 18, 'left', undefined, 800);
    ctx.shadowBlur = 0;
    ctx.restore();

    // 队伍图标（圆角方 + 居中 emoji + 右下角刷新按钮）
    const iconSize = 56;
    const iconX = cardX + (cardW - iconSize) / 2;
    const iconY = cardY + PAD + 18 + 8; // 标题视觉底 + 8
    ctx.save();
    roundRect(ctx, iconX, iconY, iconSize, iconSize, 14);
    const ig = ctx.createLinearGradient(iconX, iconY, iconX + iconSize, iconY + iconSize);
    ig.addColorStop(0, 'rgba(255,80,200,0.18)');
    ig.addColorStop(1, 'rgba(124,77,255,0.18)');
    ctx.fillStyle = ig;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,200,0.35)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, TEAM_ICON_POOL[state.teamIconIdx % TEAM_ICON_POOL.length], iconX + iconSize / 2, iconY + iconSize / 2 + 2, '#fff', 28, 'center', undefined, 400);
    // 右下刷新按钮（粉紫渐变小圆）
    const refR = 11;
    const refCx = iconX + iconSize - 4;
    const refCy = iconY + iconSize - 4;
    ctx.save();
    ctx.beginPath();
    ctx.arc(refCx, refCy, refR, 0, Math.PI * 2);
    const rg = ctx.createLinearGradient(refCx - refR, refCy - refR, refCx + refR, refCy + refR);
    rg.addColorStop(0, NEON);
    rg.addColorStop(1, VIOLET);
    ctx.fillStyle = rg;
    ctx.shadowColor = 'rgba(255,80,200,0.5)';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, '↻', refCx, refCy + 1, '#fff', 12, 'center', undefined, 700);

    // —— 战队名称（label↕input 8px；点击「随机」会同步更新名称 + 描述） ——
    const fieldX = cardX + PAD;
    const fieldW = cardW - PAD * 2;
    const nameTop = iconY + iconSize + 18;
    const rName = drawFormField(ctx, {
      x: fieldX, y: nameTop, w: fieldW,
      label: '战队名称',
      chip: { label: '↻ 随机', color: NEON, align: 'left' },
      value: state.teamName,
      placeholder: '给你的战队起个名字',
      error: state.nameError,
      active: state.editingField === 'name'
    });

    // —— 战队说明（移除 AI 推荐 chip，由名称区的「随机」按钮联动更新） ——
    const descTop = rName.bottom + 16;
    const rDesc = drawFormField(ctx, {
      x: fieldX, y: descTop, w: fieldW,
      label: '战队说明',
      value: state.teamDesc,
      placeholder: '介绍一下你的战队',
      multiline: true,
      active: state.editingField === 'desc'
    });

    // —— 加入方式（segmented：freein.svg + lock.svg） ——
    const joinLabelTop = rDesc.bottom + 16;
    drawText(ctx, '加入方式', fieldX, joinLabelTop + 6, 'rgba(255,255,255,0.4)', 12, 'left', undefined, 400);
    const segY = joinLabelTop + 12 + 8; // 与 form-field 内 label↕input 8px 规则一致
    const segH = 36;
    const segGap = 8;
    const segW = (fieldW - segGap) / 2;
    const seg1X = fieldX;
    const seg2X = seg1X + segW + segGap;
    const segments = [
      { key: 'open',   img: TEAM_UI_IMG.freein, imgOn: TEAM_UI_IMG.freeinOn, label: '用户可自主加入', x: seg1X },
      { key: 'invite', img: TEAM_UI_IMG.lock,   imgOn: TEAM_UI_IMG.lockOn,   label: '仅通过邀请',     x: seg2X }
    ];
    segments.forEach((s) => {
      const active = state.joinType === s.key;
      const segImg = active ? s.imgOn : s.img;
      ctx.save();
      roundRect(ctx, s.x, segY, segW, segH, 10);
      ctx.fillStyle = active ? 'rgba(255,80,200,0.12)' : 'rgba(255,255,255,0.03)';
      ctx.fill();
      ctx.strokeStyle = active ? 'rgba(255,80,200,0.4)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      // 图标 + 文本水平居中（图未加载时退化为只居中文本）
      const txtFs = 12;
      const txtFw = 700;
      const labelW = measureText(ctx, s.label, txtFs, txtFw);
      const hasImg = !!getImage(segImg);
      const iconBoxSize = hasImg ? 14 : 0;
      const gap = hasImg ? 6 : 0;
      const totalW = iconBoxSize + gap + labelW;
      const startX = s.x + (segW - totalW) / 2;
      if (hasImg) drawImage(ctx, segImg, startX, segY + (segH - iconBoxSize) / 2, iconBoxSize, iconBoxSize);
      drawText(ctx, s.label, startX + iconBoxSize + gap, segY + segH / 2, active ? NEON : 'rgba(255,255,255,0.45)', txtFs, 'left', undefined, txtFw);
    });

    // 缓存布局：供弹窗内触区注册使用（弹窗内不滚动，世界坐标 = 屏幕坐标）
    state._formLayout = {
      iconRefresh: { x: refCx - refR - 4, y: refCy - refR - 4, w: (refR + 4) * 2, h: (refR + 4) * 2 },
      name: rName,
      desc: rDesc,
      seg1: { x: seg1X, y: segY, w: segW, h: segH },
      seg2: { x: seg2X, y: segY, w: segW, h: segH }
    };
  },

  /** 多行文本（保留旧引用，避免外部依赖；新代码直接用 form-field） */
  _drawWrappedTextLines(ctx, text, x, y, maxW, lineH, color, fs, fw, maxLines) {
    const s = String(text || '');
    if (!s) return;
    let line = '';
    let lineCount = 0;
    let curY = y;
    for (let i = 0; i < s.length; i++) {
      const test = line + s[i];
      const tw = measureText(ctx, test, fs, fw);
      if (tw > maxW && line.length > 0) {
        // 末行 + 省略
        if (lineCount === maxLines - 1) {
          while (line.length > 0 && measureText(ctx, line + '…', fs, fw) > maxW) line = line.slice(0, -1);
          drawText(ctx, line + '…', x, curY, color, fs, 'left', undefined, fw);
          return;
        }
        drawText(ctx, line, x, curY, color, fs, 'left', undefined, fw);
        line = s[i];
        curY += lineH;
        lineCount++;
        if (lineCount >= maxLines) return;
      } else {
        line = test;
      }
    }
    if (line) drawText(ctx, line, x, curY, color, fs, 'left', undefined, fw);
  },

  _drawRecommendTabs(ctx, W, y, h) {
    const gap = 10;
    const tabW = (W - 32 - gap) / 2;
    [
      { key: 'recommend', label: '战队推荐', x: 16 },
      { key: 'rank',      label: '战队排名', x: 16 + tabW + gap }
    ].forEach((t) => {
      const active = state.tab === t.key;
      ctx.save();
      roundRect(ctx, t.x, y, tabW, h, 16);
      ctx.fillStyle = active ? 'rgba(255,80,200,0.12)' : 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.strokeStyle = active ? 'rgba(255,80,200,0.4)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      if (active) {
        ctx.shadowColor = 'rgba(255,80,200,0.2)';
        ctx.shadowBlur = 10;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
      drawText(ctx, t.label, t.x + tabW / 2, y + h / 2, active ? NEON : 'rgba(255,255,255,0.45)', 14, 'center', undefined, 700);
    });
  },

  _registerRecommendTabsTouches(scene, W, y, h) {
    const gap = 10;
    const tabW = (W - 32 - gap) / 2;
    scene.manager.addTouchable(16, y, tabW, h, () => {
      state.tab = 'recommend';
      state.scrollY = 0;
      state.teams = state.recommendTeams;
    });
    scene.manager.addTouchable(16 + tabW + gap, y, tabW, h, () => {
      state.tab = 'rank';
      state.scrollY = 0;
      state.teams = state.rankTeams;
    });
  },

  _drawRecommendCard(ctx, W, x, y, w, team, idx) {
    const meta = _teamMeta(team);
    const cardH = 108;
    const isJoined = state.joinedId === team.id;
    const joinable = team.memberCount < 60;
    const rank = team.rank || (idx + 1);

    // 卡背：用紫黑渐变 + 紫色细边，从背景里"立起来"
    ctx.save();
    roundRect(ctx, x, y, w, cardH, 16);
    const cg = ctx.createLinearGradient(x, y, x, y + cardH);
    cg.addColorStop(0, 'rgba(38,22,68,0.78)');
    cg.addColorStop(1, 'rgba(20,12,42,0.78)');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(167,139,250,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // 头像（48x48 圆角，emoji 居中）
    const ax = x + 14;
    const ay = y + 14;
    const aS = 48;
    ctx.save();
    roundRect(ctx, ax, ay, aS, aS, 12);
    ctx.fillStyle = 'rgba(255,80,200,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,200,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, meta.badge, ax + aS / 2, ay + aS / 2 + 2, '#fff', 22, 'center', undefined, 400);

    // 名称
    const tx0 = ax + aS + 12;
    drawText(ctx, team.name, tx0, y + 22, '#ffffff', 14, 'left', 'rgba(255,255,255,0.15)', 700);
    // 排名 chip（前三才显示）
    let chipRight = tx0 + measureText(ctx, team.name, 14, 700) + 8;
    if (rank <= 3) {
      const rankLabel = rank === 1 ? '🏆 NO.1' : rank === 2 ? '🥈 NO.2' : '🥉 NO.3';
      const rcW = measureText(ctx, rankLabel, 12, 600) + 14;
      ctx.save();
      roundRect(ctx, chipRight, y + 12, rcW, 20, 10);
      ctx.fillStyle = 'rgba(255,215,64,0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,64,0.32)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      drawText(ctx, rankLabel, chipRight + rcW / 2, y + 22, GOLD, 12, 'center', undefined, 600);
    }
    // 标语
    drawText(ctx, meta.slogan, tx0, y + 44, 'rgba(255,255,255,0.4)', 12, 'left', undefined, 400);

    // 加入按钮（右上）
    const btnW = 60;
    const btnH = 32;
    const btnX = x + w - 14 - btnW;
    const btnY = y + 14;
    if (isJoined) {
      ctx.save();
      roundRect(ctx, btnX, btnY, btnW, btnH, 12);
      ctx.fillStyle = 'rgba(64,224,208,0.15)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(64,224,208,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      drawText(ctx, '✓ 已申请', btnX + btnW / 2, btnY + btnH / 2, CYAN, 12, 'center', undefined, 700);
    } else if (!joinable) {
      ctx.save();
      roundRect(ctx, btnX, btnY, btnW, btnH, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      drawText(ctx, '人数已满', btnX + btnW / 2, btnY + btnH / 2, 'rgba(255,255,255,0.3)', 12, 'center', undefined, 700);
    } else {
      ctx.save();
      roundRect(ctx, btnX, btnY, btnW, btnH, 12);
      ctx.fillStyle = 'rgba(255,80,200,0.05)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,200,0.6)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
      drawText(ctx, '加入', btnX + btnW / 2, btnY + btnH / 2, NEON, 12, 'center', undefined, 700);
    }

    // 底栏：人数 + 本周总通关 + 累计总通关
    const footY = y + cardH - 18;
    drawText(ctx, '👤 ' + (team.memberCount || 0) + '/20人', x + 14, footY, 'rgba(255,255,255,0.45)', 12, 'left', undefined, 400);
    const weekClearShow = '🔥 本周总通关 ' + _fmtComma(team.periodClears || 0);
    drawText(ctx, weekClearShow, x + 14 + 100, footY, 'rgba(255,255,255,0.45)', 12, 'left', undefined, 400);
    const totalShow = '累计总通关 ' + _fmtComma(_teamDisplayScore(team));
    drawText(ctx, totalShow, x + w - 14, footY, 'rgba(255,255,255,0.65)', 12, 'right', undefined, 600);
  },

  // ─── 表单事件 ───
  refreshTeamIcon() {
    state.teamIconIdx = _nextRandomIdx(state.teamIconIdx, TEAM_ICON_POOL.length);
  },
  randomTeamName() {
    const cur = TEAM_NAME_POOL.findIndex(n => n.name === state.teamName);
    const next = _nextRandomIdx(cur < 0 ? 0 : cur, TEAM_NAME_POOL.length);
    state.teamName = TEAM_NAME_POOL[next].name;
    state.teamDesc = TEAM_NAME_POOL[next].desc;
    state.nameError = '';
  },
  aiSuggestDesc() {
    const cur = TEAM_NAME_POOL.findIndex(n => n.name === state.teamName);
    const next = _nextRandomIdx(cur < 0 ? 0 : cur, TEAM_NAME_POOL.length);
    state.teamName = TEAM_NAME_POOL[next].name;
    state.teamDesc = TEAM_NAME_POOL[next].desc;
    state.nameError = '';
  },
  // ── 键盘监听（只注册一次，整个 team 场景共享） ──────────────
  _initKeyboardListeners() {
    if (this._keyboardInited) return;
    this._keyboardInited = true;
    if (typeof wx === 'undefined') return;
    wx.onKeyboardInput && wx.onKeyboardInput((res) => {
      if (state.editingField === 'name') {
        state.teamName = res.value;
        state.nameError = '';
      } else if (state.editingField === 'desc') {
        state.teamDesc = res.value;
      }
    });
    wx.onKeyboardConfirm && wx.onKeyboardConfirm((res) => {
      if (state.editingField === 'name') {
        state.teamName = (res.value || '').trim();
        state.nameError = '';
      } else if (state.editingField === 'desc') {
        state.teamDesc = (res.value || '').trim();
      }
      state.editingField = null;
      wx.hideKeyboard && wx.hideKeyboard();
    });
    wx.onKeyboardComplete && wx.onKeyboardComplete(() => {
      state.editingField = null;
    });
  },
  editTeamName() {
    this._initKeyboardListeners();
    state.editingField = 'name';
    if (typeof wx !== 'undefined' && wx.showKeyboard) {
      wx.showKeyboard({
        defaultValue: state.teamName || '',
        maxLength: 10,
        multiple: false,
        confirmHold: false,
        confirmType: 'done',
      });
    }
  },
  editTeamDesc() {
    this._initKeyboardListeners();
    state.editingField = 'desc';
    if (typeof wx !== 'undefined' && wx.showKeyboard) {
      wx.showKeyboard({
        defaultValue: state.teamDesc || '',
        maxLength: 60,
        multiple: true,
        confirmHold: true,
        confirmType: 'send',
      });
    }
  },
  _tapJoinRecommend(team) {
    if (!team) return;
    if (state.joinedId === team.id) return;
    // 二次确认：弹窗里说明每日最多加入一支战队
    state.pendingJoinTeam = team;
    state.showJoinModal = true;
  },
  cancelJoinModal() {
    state.showJoinModal = false;
    state.pendingJoinTeam = null;
  },
  confirmJoin() {
    const team = state.pendingJoinTeam;
    state.showJoinModal = false;
    state.pendingJoinTeam = null;
    if (!team) return;
    const tid = team.teamId || team.id;
    if (!tid || String(tid).indexOf('mock_team_') === 0) {
      showToast('战队数据未同步，请稍后重试');
      cloudTeam.syncTeamFromCloud().finally(() => this._loadTeams());
      return;
    }
    cloudTeam.joinTeam(tid).then((r) => {
      if (r.success) {
        state.joinedId = tid;
        showToast('加入成功');
        this._loadTeams();
        state.tab = 'my';
      } else {
        showToast(r.msg || '加入失败');
      }
    });
  },

  confirmCreate() {
    // 先收键盘
    state.editingField = null;
    if (typeof wx !== 'undefined' && wx.hideKeyboard) wx.hideKeyboard();
    const name = (state.teamName || '').trim();
    if (!name) { state.nameError = '战队名称不能为空'; return; }
    if (name.length < 2 || name.length > 16) { state.nameError = '名称长度需为 2-16 个字符'; return; }
    const iconKey = 'icon_balloon_' + String((state.teamIconIdx % 5) + 1).padStart(2, '0');
    cloudTeam.createTeam({
      name,
      description: (state.teamDesc || '').trim(),
      joinType: state.joinType,
      iconKey
    }).then((r) => {
      if (r.success) {
        state.createdTeamName = name;
        state.showCreateModal = false;
        state.showSuccessModal = true;
        this._loadTeams();
      } else {
        showToast(r.msg || '创建失败');
      }
    });
  },

  // 打开创建战队弹窗
  openCreateModal() {
    _initCreateForm();
    state.showCreateModal = true;
    state.showSuccessModal = false;
  },
  // 取消创建
  cancelCreateModal() {
    state.showCreateModal = false;
    state.nameError = '';
    state.editingField = null;
    if (typeof wx !== 'undefined' && wx.hideKeyboard) wx.hideKeyboard();
  },
  // 成功后：邀请队友（调用分享）
  inviteTeammates() {
    state.showSuccessModal = false;
    this.onShareTeam();
    state.tab = 'my';
  },
  // 我的战队卡：开始挑战
  startChallenge() {
    if (this.manager) this.manager.switchTo('battle');
  },
  // 成功后：直接开始挑战
  startChallengeFromSuccess() {
    state.showSuccessModal = false;
    state.tab = 'my';
    this.startChallenge();
  },

  onPoster() {
    showToast('海报生成中…');
  },
  onShareTeam() {
    const team = state.team || store.getTeam();
    if (!team) { showToast('暂无战队'); return; }
    const teamId = team.teamId || team.id;
    const title = '一起来「不准爆！」战队：' + (team.name || '气球挑战');
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
  onLeaveTap() {
    // 打开自定义确认弹窗（与全局色系一致）
    state.showLeaveModal = true;
  },
  cancelLeaveModal() {
    state.showLeaveModal = false;
  },
  confirmLeave() {
    state.showLeaveModal = false;
    cloudTeam.leaveTeam().then((r) => {
      if (r.success) {
        showToast('已退出战队');
        this._loadTeams();
        state.tab = 'recommend';
        _initCreateForm();
      } else {
        showToast(r.msg || '退出失败');
      }
    });
  },

  goBack() {
    this.manager.switchTo('home');
  },

  onTouch(type, x, y) {
    const top = state._scrollTop;
    const bottom = state._scrollBottom;
    if (top < 0) return false;
    if (type === 'start' || type === 'begin') {
      if (y >= top && y <= bottom && state.scrollMax > 0) {
        state.isDraggingScroll = true;
        state.scrollTouchStart = y;
        state.scrollStartY = state.scrollY;
      } else state.isDraggingScroll = false;
      return false;
    }
    if (type === 'move' && state.isDraggingScroll) {
      const dy = y - state.scrollTouchStart;
      state.scrollY = Math.max(0, Math.min(state.scrollMax, state.scrollStartY - dy));
      return true;
    }
    if (type === 'end' || type === 'tap') {
      state.isDraggingScroll = false;
    }
    return false;
  }
};
