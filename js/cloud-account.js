/**
 * 账号注销：调用云函数删除云端数据并清空本地存储
 */

const store = require('./store');

function deleteUserAccountCloud() {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return Promise.resolve({ success: false, msg: '云开发不可用' });
  }
  return wx.cloud.callFunction({
    name: 'deleteUserData',
    data: { confirm: true }
  }).then((res) => {
    const result = (res && res.result) || {};
    if (result.success) {
      store.requestAccountDeletion();
    }
    return result;
  }).catch((err) => {
    console.warn('[cloud-account] deleteUserData', err);
    return {
      success: false,
      msg: (err && err.errMsg) || (err && err.message) || String(err)
    };
  });
}

module.exports = { deleteUserAccountCloud };
