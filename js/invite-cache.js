/** 战队邀请深链：仅缓存「加入成功」的 token，5 分钟内重复打开不再请求云函数 */
const CACHE_MS = 5 * 60 * 1000;
const KEY_PREFIX = '__bp_invite_ok_';

function _read(token) {
  if (typeof wx === 'undefined' || !wx.getStorageSync || !token) return null;
  try {
    const raw = wx.getStorageSync(KEY_PREFIX + token);
    if (!raw || !raw.ts) return null;
    if (Date.now() - raw.ts > CACHE_MS) return null;
    return raw;
  } catch (_) {
    return null;
  }
}

function isInviteJoinCached(teamId, inviteToken) {
  if (!inviteToken) return false;
  const row = _read(String(inviteToken));
  return !!(row && String(row.teamId) === String(teamId));
}

function markInviteJoinSuccess(teamId, inviteToken) {
  if (typeof wx === 'undefined' || !wx.setStorageSync || !inviteToken) return;
  try {
    wx.setStorageSync(KEY_PREFIX + String(inviteToken), {
      teamId: String(teamId),
      inviteToken: String(inviteToken),
      ts: Date.now()
    });
  } catch (_) { /* ignore */ }
}

module.exports = { isInviteJoinCached, markInviteJoinSuccess, CACHE_MS };
