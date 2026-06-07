/**
 * 云函数 login：拉取/创建 users 记录，并同步到本地 store
 * 登录后拉取 balloon_inventory，合并本人购买库存（跨设备可赠送）
 */
const store = require('./store');
const { syncTeamFromCloud } = require('./cloud-team');

function syncBalloonInventoryFromCloud() {
  if (typeof wx === 'undefined' || !wx.cloud) {
    return Promise.resolve({ ok: false, reason: 'wx.cloud 不可用' });
  }
  const db = wx.cloud.database();
  if (!db) return Promise.resolve({ ok: false, reason: '数据库不可用' });
  return db.collection('balloon_inventory').limit(100).get()
    .then((res) => {
      const list = res.data || [];
      store.mergeInventoryFromCloud(list);
      return { ok: true, count: list.length };
    })
    .catch((err) => {
      console.warn('[cloud-login] syncBalloonInventory', err);
      return { ok: false, reason: (err && err.errMsg) || String(err) };
    });
}

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
      return syncBalloonInventoryFromCloud()
        .then((sync) => syncTeamFromCloud().then((teamSync) => ({
          ok: true,
          openid,
          userInfo,
          inventorySync: sync,
          teamSync
        })));
    })
    .catch((err) => {
      console.warn('[cloud-login]', err);
      return { ok: false, reason: (err && err.errMsg) || String(err) };
    });
}

module.exports = { cloudLogin, syncBalloonInventoryFromCloud };
