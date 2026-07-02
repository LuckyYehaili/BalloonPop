// Ballon-hot 气球皮肤数据配置
// 4 关 × 10 普通气球 + 30 传奇限定。
//
// 普通气球顺序严格按设计稿排版（编辑顺序即关内顺序，emoji-sequences.js 会按
// level 顺序逐个 slice(0, 10) 取出）。每关第 10 个固定为传奇位 🔶（占位）：
//   - 装备了传奇气球：第 10 个由所选传奇覆盖（battle.js 中按 balloonIdx===9 判定）；
//   - 未装备传奇：使用关卡对应的 🔶 占位作为「将出现传奇的位置」。
// 编辑指引：
//   - 仅修改 _LEVEL_BALLOONS / _LEGEND_BALLOONS 即可改名 / 改色 / 改 shape。
//   - 顺序变更会直接影响 emoji-sequences.js 关内 10 个气球的排布，谨慎调整。

const RARITY_COMMON = { rarity: '普通', color: '#aaaaaa' };
const RARITY_RARE   = { rarity: '稀有', color: '#4fc3f7' };
const RARITY_EPIC   = { rarity: '史诗', color: '#ce93d8' };
const RARITY_LEGEND = { rarity: '传说', color: '#ffd700' };

// 普通气球行格式：[id, name, emoji, shape, color, glowColor, level, rarity, unlocked]
const _LEVEL_BALLOONS = [
  // ── 第 1 关 · 糖果乐园 ─────────────────────────
  ['l1_orange',           '蜜橙圆球',     '🟠',     'round',   '#ff9800', '#ffb74d', 1, RARITY_COMMON, true],
  ['l1_star',             '闪耀甜星',     '⭐',     'star',    '#ffd740', '#ffea00', 1, RARITY_COMMON, true],
  ['l1_lollipop',         '棒棒糖',       '🍭',     'twist',   '#ff80ab', '#f06292', 1, RARITY_COMMON, true],
  ['l1_strawberry',       '红心草莓',     '🍓',     'heart',   '#ff5252', '#e53935', 1, RARITY_RARE,   true],
  ['l1_peach',            '蜜桃熊宝',     '🍑',     'animal',  '#ffcc80', '#ffab40', 1, RARITY_RARE,   true],
  ['l1_watermelon',       '西瓜冰沙',     '🍉',     'round',   '#66bb6a', '#43a047', 1, RARITY_RARE,   true],
  ['l1_candy',            '晶糖棉花云',   '🍬',     'cloud',   '#e1bee7', '#ba68c8', 1, RARITY_RARE,   true],
  ['l1_donut',            '甜甜圈钻',     '🍩',     'diamond', '#ffe082', '#ffb74d', 1, RARITY_EPIC,   true],
  ['l1_cherry',           '樱桃双旋',     '🍒',     'twist',   '#e53935', '#ff8a80', 1, RARITY_EPIC,   true],
  ['l1_legend_slot',      '蜜橙幻芒',     '🔶',     'crown',   '#ffd740', '#ffea00', 1, RARITY_LEGEND, false],

  // ── 第 2 关 · 霓虹街道 ─────────────────────────
  ['l2_purple_heart',     '紫电闪心',     '💜',     'heart',   '#b388ff', '#7c4dff', 2, RARITY_COMMON, true],
  ['l2_thunder',          '雷霆闪电',     '⚡',     'long',    '#ffeb3b', '#fbc02d', 2, RARITY_COMMON, true],
  ['l2_neon_star',        '霓虹之星',     '🌟',     'star',    '#fff176', '#fbc02d', 2, RARITY_COMMON, true],
  ['l2_magic_wand',       '魔法权杖',     '🪄',     'long',    '#b388ff', '#9575cd', 2, RARITY_RARE,   true],
  ['l2_alley_cat',        '街角小猫',     '🐱',     'animal',  '#ffa726', '#fb8c00', 2, RARITY_RARE,   true],
  ['l2_beer',             '麦芽气泡',     '🍺',     'cloud',   '#ffd54f', '#ffa000', 2, RARITY_RARE,   true],
  ['l2_rainbow',          '霓虹彩虹',     '🌈',     'twist',   '#ff8a80', '#7c4dff', 2, RARITY_RARE,   true],
  ['l2_hibiscus',         '霓虹蕊红',     '🌺',     'flower',  '#ec407a', '#ad1457', 2, RARITY_EPIC,   true],
  ['l2_night_strawberry', '夜市草莓',     '🍓',     'heart',   '#d81b60', '#880e4f', 2, RARITY_EPIC,   true],
  ['l2_legend_slot',      '霓虹幻芒',     '🔶',     'crown',   '#ffd740', '#ffea00', 2, RARITY_LEGEND, false],

  // ── 第 3 关 · 暗红熔炉 ─────────────────────────
  ['l3_firecracker',      '爆裂炮仗',     '🧨',     'long',    '#d32f2f', '#b71c1c', 3, RARITY_COMMON, true],
  ['l3_burning_heart',    '燃心炽焰',     '❤️',     'heart',   '#ff5252', '#b71c1c', 3, RARITY_COMMON, true],
  ['l3_flame',            '灼热火焰',     '🔥',     'long',    '#ff6f00', '#bf360c', 3, RARITY_COMMON, true],
  ['l3_swords',           '双锋利刃',     '⚔️',     'twist',   '#e53935', '#7f0000', 3, RARITY_RARE,   true],
  ['l3_shield',           '烈焰守护',     '🛡️',     'diamond', '#ffab00', '#bf360c', 3, RARITY_RARE,   true],
  ['l3_dust',             '灰烬之雾',     '💨',     'cloud',   '#9e9e9e', '#616161', 3, RARITY_RARE,   true],
  ['l3_red_gem',          '流火宝晶',     '💠',     'diamond', '#ef5350', '#b71c1c', 3, RARITY_RARE,   true],
  ['l3_spiral',           '熔岩漩涡',     '🌀',     'twist',   '#ff5722', '#bf360c', 3, RARITY_EPIC,   true],
  ['l3_jack',             '烈焰南瓜',     '🎃',     'round',   '#f57c00', '#e65100', 3, RARITY_EPIC,   true],
  ['l3_legend_slot',      '熔焰幻芒',     '🔶',     'crown',   '#ffd740', '#ffea00', 3, RARITY_LEGEND, false],

  // ── 第 4 关 · 云端神殿 ─────────────────────────
  ['l4_moon',             '银月之光',     '🌙',     'round',   '#e1f5fe', '#90caf9', 4, RARITY_COMMON, true],
  ['l4_white_heart',      '纯洁白心',     '🤍',     'heart',   '#ffffff', '#cfd8dc', 4, RARITY_COMMON, true],
  ['l4_rocket',           '神殿火箭',     '🚀',     'long',    '#b3e5fc', '#0288d1', 4, RARITY_COMMON, true],
  ['l4_glow_heart',       '神圣之心',     '💖',     'heart',   '#f8bbd0', '#ec407a', 4, RARITY_RARE,   true],
  ['l4_cloudy',           '云层余光',     '⛅',     'cloud',   '#cfd8dc', '#90a4ae', 4, RARITY_RARE,   true],
  ['l4_crystal',          '神谕水晶',     '🔮',     'diamond', '#ce93d8', '#7b1fa2', 4, RARITY_RARE,   true],
  ['l4_tornado',          '神殿龙卷',     '🌪️',     'twist',   '#b39ddb', '#7e57c2', 4, RARITY_RARE,   true],
  ['l4_ice',              '冻结晶体',     '🧊',     'diamond', '#80deea', '#0097a7', 4, RARITY_EPIC,   true],
  ['l4_sun_behind',       '破云朝阳',     '🌤️',     'cloud',   '#ffe082', '#ffa000', 4, RARITY_EPIC,   true],
  ['l4_legend_slot',      '神殿幻芒',     '🔶',     'crown',   '#ffd740', '#ffea00', 4, RARITY_LEGEND, false]
];

// 传奇气球行格式：[id, name, emoji, shape, color, glowColor]
const _LEGEND_BALLOONS = [
  ['legend_royal_crown',     '至尊王冠',   '👑', 'crown',   '#ffd700', '#ff8f00'],
  ['legend_bubble_aurora',   '极光气泡',   '🫧', 'cloud',   '#80deea', '#00acc1'],
  ['legend_dazzling_spark',  '璀璨闪光',   '✨', 'star',    '#fff176', '#fdd835'],
  ['legend_trophy',          '冠军奖杯',   '🏆', 'crown',   '#ffca28', '#fb8c00'],
  ['legend_unicorn',         '独角神兽',   '🦄', 'animal',  '#ce93d8', '#ab47bc'],
  ['legend_lion',            '雄狮之王',   '🦁', 'animal',  '#ffa726', '#ef6c00'],
  ['legend_eagle',           '苍穹之鹰',   '🦅', 'animal',  '#8d6e63', '#4e342e'],
  ['legend_wolf',            '月光之狼',   '🐺', 'animal',  '#b0bec5', '#607d8b'],
  ['legend_crocodile',       '沼泽鳄王',   '🐊', 'animal',  '#66bb6a', '#2e7d32'],
  ['legend_peacock',         '流羽孔雀',   '🦚', 'animal',  '#26c6da', '#00838f'],
  ['legend_whale',           '深海巨鲸',   '🐳', 'animal',  '#4fc3f7', '#0277bd'],
  ['legend_dolphin',         '灵动海豚',   '🐬', 'animal',  '#4dd0e1', '#00838f'],
  ['legend_bee',             '蜜糖蜜蜂',   '🐝', 'animal',  '#ffd54f', '#ff8f00'],
  ['legend_ladybug',         '幸运瓢虫',   '🐞', 'animal',  '#ef5350', '#c62828'],
  ['legend_crystal_ball',    '占卜水晶',   '🔮', 'diamond', '#ba68c8', '#6a1b9a'],
  ['legend_galaxy_spin',     '星河旋转',   '💫', 'twist',   '#b388ff', '#7c4dff'],
  ['legend_love_gift',       '爱意礼盒',   '💝', 'heart',   '#ec407a', '#ad1457'],
  ['legend_wind_chime',      '风铃叮咚',   '🎐', 'long',    '#4dd0e1', '#0097a7'],
  ['legend_saturn',          '土星之环',   '🪐', 'diamond', '#ffd54f', '#ef6c00'],
  ['legend_snowflake',       '永恒雪花',   '❄️', 'star',    '#e3f2fd', '#90caf9'],
  ['legend_blueberry',       '蓝莓琥珀',   '🫐', 'round',   '#5c6bc0', '#283593'],
  ['legend_evil_eye',        '守护之眼',   '🧿', 'diamond', '#29b6f6', '#01579b'],
  ['legend_tiger',           '兽王虎影',   '🐯', 'animal',  '#ffb74d', '#e65100'],
  ['legend_falling_star',    '流星陨光',   '💫', 'twist',   '#fff59d', '#f57f17'],
  ['legend_diamond',         '永恒钻石',   '💎', 'diamond', '#80d8ff', '#40c4ff'],
  ['legend_party_popper',    '庆典礼炮',   '🎉', 'long',    '#ff5252', '#d50000'],
  ['legend_confetti_ball',   '五彩礼球',   '🎊', 'round',   '#ec407a', '#c2185b'],
  ['legend_gift_box',        '神秘礼盒',   '🎁', 'heart',   '#ff80ab', '#ad1457'],
  ['legend_ribbon',          '缎带蝴蝶',   '🎀', 'flower',  '#f48fb1', '#e91e63'],
  ['legend_cake',            '至福蛋糕',   '🎂', 'round',   '#ffcdd2', '#ec407a']
];

function _buildCommon(rows) {
  return rows.map(function (row, idx) {
    const id = row[0], name = row[1], emoji = row[2];
    const shape = row[3], color = row[4], glow = row[5];
    const level = row[6], r = row[7], unlocked = row[8];
    const slot = (idx % 10) + 1;
    const unlockCondition = slot === 10
      ? '装备传奇气球后激活该位置'
      : '第' + level + '关第' + slot + '个';
    return {
      id: id,
      name: name,
      emoji: emoji,
      rarity: r.rarity,
      rarityColor: r.color,
      unlockCondition: unlockCondition,
      unlocked: unlocked,
      isPaid: false,
      price: null,
      color: color,
      glowColor: glow,
      level: level,
      shape: shape
    };
  });
}

function _buildLegend(rows) {
  return rows.map(function (row) {
    return {
      id: row[0],
      name: row[1],
      emoji: row[2],
      rarity: RARITY_LEGEND.rarity,
      rarityColor: RARITY_LEGEND.color,
      unlockCondition: '限定付费解锁',
      unlocked: false,
      isPaid: true,
      price: '¥6',
      color: row[4],
      glowColor: row[5],
      level: 0,
      shape: row[3]
    };
  });
}

const BALLOON_TYPES = _buildCommon(_LEVEL_BALLOONS).concat(_buildLegend(_LEGEND_BALLOONS));

const LEVELS = [
  { id: 1, name: "糖果乐园", targetMin: 70, targetMax: 85, background: "candy",  description: "甜蜜的开始",         difficulty: 1, zoneWidth: 15, emojiSeq: "candy",
    balloonRanges: [[72,79],[74,81],[71,78],[75,82],[73,80],[70,77],[74,81],[72,79],[75,82],[71,78]] },
  { id: 2, name: "霓虹街道", targetMin: 78, targetMax: 88, background: "neon",   description: "城市的夜晚",         difficulty: 2, zoneWidth: 10, emojiSeq: "neon",
    balloonRanges: [[79,82],[81,84],[78,81],[82,85],[80,83],[77,80],[81,84],[79,82],[82,85],[78,81]] },
  { id: 3, name: "暗红熔炉", targetMin: 80, targetMax: 87, background: "lava",   description: "极限高温挑战",       difficulty: 3, zoneWidth: 7,  emojiSeq: "lava",
    balloonRanges: [[81,83],[83,85],[80,82],[84,86],[82,84],[79,81],[83,85],[81,83],[84,86],[80,82]] },
  { id: 4, name: "云端神殿", targetMin: 83, targetMax: 86, background: "temple", description: "隐藏指针，感受气息", difficulty: 4, zoneWidth: 3,  emojiSeq: "temple",
    balloonRanges: [[83,83],[85,85],[82,82],[86,86],[84,84],[81,81],[85,85],[83,83],[86,86],[82,82]] }
];

const TEAM_MEMBERS = [
  { rank: 1, avatar: "", avatarColor: "#ff6eb4", name: "糖果小仙女", score: 2840, isLeader: true },
  { rank: 2, avatar: "", avatarColor: "#40c4ff", name: "霓虹战士",   score: 2310 },
  { rank: 3, avatar: "", avatarColor: "#b388ff", name: "星河漫游者", score: 1980 },
  { rank: 4, avatar: "", avatarColor: "#ff6d00", name: "烈焰骑士",   score: 1750 },
  { rank: 5, avatar: "", avatarColor: "#69ff47", name: "薄荷冰淇淋", score: 1620 }
];

module.exports = { BALLOON_TYPES, LEVELS, TEAM_MEMBERS };
