/**
 * 首页「活跃战队 / 在线玩家」展示值：真实后台数据 + 分时段随机浮动（进入首页时计算一次）
 */

const TIME_SLOTS = {
  night: {
    team: [0, 10],
    users: [13, 43]
  },
  morning: {
    team: [45, 65],
    users: [283, 383]
  },
  afternoon: {
    team: [60, 80],
    users: [373, 483]
  },
  evening: {
    team: [75, 100],
    users: [473, 613]
  }
};

function _randomInt(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi < lo) return lo;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** 根据本地小时返回时段 key；读取异常时返回 morning（06:00-12:00 兜底） */
function getTimeSlotKey(date) {
  try {
    const d = date || new Date();
    const hour = d.getHours();
    if (hour >= 18 || hour < 1) return 'evening';
    if (hour >= 1 && hour < 6) return 'night';
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'morning';
  } catch (_) {
    return 'morning';
  }
}

function getTimeSlotFloats(date) {
  const key = getTimeSlotKey(date);
  const slot = TIME_SLOTS[key] || TIME_SLOTS.morning;
  return {
    slotKey: key,
    teamFloat: _randomInt(slot.team[0], slot.team[1]),
    userFloat: _randomInt(slot.users[0], slot.users[1])
  };
}

function _positiveInt(n) {
  const v = Math.floor(Number(n) || 0);
  return Math.max(1, v);
}

/**
 * @param {object} real - { teamCount, userCount } 来自云端同步的真实值
 * @param {Date} [date]
 * @returns {{ displayTeamCount, displayUserCount, realTeamCount, realUserCount, teamFloat, userFloat, slotKey }}
 */
function computeHomeStatsDisplay(real, date) {
  const realTeamCount = Math.max(0, Math.floor(Number(real && real.teamCount) || 0));
  const realUserCount = Math.max(0, Math.floor(Number(real && real.userCount) || 0));
  const floats = getTimeSlotFloats(date);
  return {
    realTeamCount,
    realUserCount,
    teamFloat: floats.teamFloat,
    userFloat: floats.userFloat,
    slotKey: floats.slotKey,
    displayTeamCount: _positiveInt(realTeamCount + floats.teamFloat),
    displayUserCount: _positiveInt(realUserCount + floats.userFloat)
  };
}

/** 从 store 读取真实战队数、活跃人数（成员数之和） */
function getRealHomeStatsFromStore(store) {
  const ranked = (store.getRankedTeams && store.getRankedTeams()) || [];
  if (ranked.length) {
    return {
      teamCount: ranked.length,
      userCount: ranked.reduce((sum, t) => sum + (t.memberCount || 0), 0)
    };
  }
  const recommend = (store.getRecommendTeams && store.getRecommendTeams()) || [];
  const ids = new Set();
  let userCount = 0;
  recommend.forEach((t) => {
    if (!t) return;
    const id = t.id || t.teamId;
    if (id && !ids.has(id)) {
      ids.add(id);
      userCount += t.memberCount || 0;
    }
  });
  return {
    teamCount: ids.size,
    userCount
  };
}

module.exports = {
  TIME_SLOTS,
  getTimeSlotKey,
  getTimeSlotFloats,
  computeHomeStatsDisplay,
  getRealHomeStatsFromStore
};
