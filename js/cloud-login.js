/**
 * 云函数 login：拉取/创建 users 记录，并同步到本地 store
 */
const store = require('./store');

function cloudLogin() {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return Promise.resolve({ ok: false, reason: 'wx.cloud 不可用' });
  }
  return wx.cloud.callFunction({ name: 'login' })
    .then((res) => {
      const result = res.result || {};
      const userInfo = result.userInfo || {};
      const openid = result.openid || userInfo.openid || '';
      store.updateUser({
        openid,
        nickName: userInfo.nickName || userInfo.nickname || '微信用户',
        avatar: userInfo.avatar || userInfo.avatarUrl || '',
        isLoggedIn: true,
        isFirstTime: false
      });
      return { ok: true, openid, userInfo };
    })
    .catch((err) => {
      console.warn('[cloud-login]', err);
      return { ok: false, reason: (err && err.errMsg) || String(err) };
    });
}

module.exports = { cloudLogin };
