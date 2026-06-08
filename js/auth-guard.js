/**
 * 登录态判断（排除 mock_ openid 占位）
 */
const store = require('./store');

function isUserLoggedIn(user) {
  const u = user || store.getUser() || {};
  if (!u.isLoggedIn) return false;
  const openid = String(u.openid || '');
  if (!openid || openid.indexOf('mock_') === 0) return false;
  return true;
}

module.exports = { isUserLoggedIn };
