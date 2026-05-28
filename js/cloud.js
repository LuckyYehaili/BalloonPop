// 微信云开发 — 对应小程序 App.onLaunch 里的 wx.cloud.init
const CLOUD_ENV = 'cloud1-d2geerzff38fc214b';

let _inited = false;
let _db = null;

/** game.js 已先执行 wx.cloud.init 时调用，避免重复 init */
function markInitialized() {
  _inited = true;
}

/** ① 全局初始化（game.js 最前面已 init 时可不调；否则调用一次） */
function initCloud() {
  if (_inited) return true;
  if (typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.init !== 'function') {
    console.error('[cloud] 请使用 2.2.3 或以上基础库，并开通云开发');
    return false;
  }
  try {
    wx.cloud.init({
      env: CLOUD_ENV,
      traceUser: true
    });
    _inited = true;
    console.log('☁️ 云开发初始化完成', CLOUD_ENV);
    return true;
  } catch (e) {
    console.error('[cloud] init 失败:', e && (e.message || e));
    return false;
  }
}

/** 云数据库实例（init 之后调用） */
function getDatabase() {
  if (!initCloud()) return null;
  if (!_db) _db = wx.cloud.database();
  return _db;
}

/** ② 连通测试：读 users 集合（对应 pages/index/index.js 的 testConnect） */
function testConnectUsers(openid) {
  const id = openid || 'test_user_001';
  const db = getDatabase();
  if (!db) {
    return Promise.resolve({
      ok: false,
      msg: '❌ 连接失败：wx.cloud 不可用',
      user: null
    });
  }
  return db.collection('users').where({ openid: id }).get()
    .then((res) => {
      if (res.data && res.data.length > 0) {
        console.log('用户数据：', res.data[0]);
        return {
          ok: true,
          msg: '✅ 连通成功！读到用户数据',
          user: res.data[0]
        };
      }
      return {
        ok: true,
        msg: '⚠️ 连通成功，但未找到 ' + id,
        user: null
      };
    })
    .catch((err) => {
      console.error(err);
      const errMsg = (err && err.errMsg) || (err && err.message) || String(err);
      return {
        ok: false,
        msg: '❌ 连接失败：' + errMsg,
        user: null
      };
    });
}

/** 按 openid 读取单条用户（业务用） */
function fetchUserByOpenid(openid) {
  return testConnectUsers(openid).then((r) => r.user);
}

const dbApi = require('./cloud-db');
const cloudPay = require('./cloud-pay');
const cloudLoginApi = require('./cloud-login');

module.exports = {
  CLOUD_ENV,
  markInitialized,
  initCloud,
  getDatabase,
  testConnectUsers,
  fetchUserByOpenid,
  // 增删改查（见 js/cloud-db.js）
  add: dbApi.add,
  queryWhere: dbApi.queryWhere,
  getById: dbApi.getById,
  updateById: dbApi.updateById,
  removeById: dbApi.removeById,
  createUser: dbApi.createUser,
  findUsersByOpenid: dbApi.findUsersByOpenid,
  updateUser: dbApi.updateUser,
  updateUserByOpenid: dbApi.updateUserByOpenid,
  getTeamsByLeaderOpenid: dbApi.getTeamsByLeaderOpenid,
  createOrder: cloudPay.createOrder,
  createLegendOrder: cloudPay.createLegendOrder,
  purchaseLegendBalloon: cloudPay.purchaseLegendBalloon,
  canUseRealPay: cloudPay.canUseRealPay,
  cloudLogin: cloudLoginApi.cloudLogin
};
