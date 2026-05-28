/**
 * 云数据库增删改查封装（小游戏端）
 *
 * 用法示例：
 *   const dbApi = require('./cloud-db');
 *   dbApi.createUser('oXXX', { nickName: '微信用户', level: 1, score: 0 });
 *   dbApi.queryWhere('teams', { leaderOpenid: 'oXXX' });
 *   dbApi.updateById('users', '记录_id', { score: 100 });
 */
const cloud = require('./cloud');

function _getDb() {
  const db = cloud.getDatabase();
  if (!db) throw new Error('云数据库未初始化，请确认 game.js 已 wx.cloud.init');
  return db;
}

function _errMsg(err) {
  return (err && err.errMsg) || (err && err.message) || String(err);
}

// ─── 通用 CRUD ─────────────────────────────────────────────

/** 新增一条记录，返回 { _id, errMsg, stats } */
function add(collection, data) {
  return _getDb().collection(collection).add({ data });
}

/** 条件查询，返回记录数组 */
function queryWhere(collection, where, options) {
  const limit = (options && options.limit) || 20;
  const skip = (options && options.skip) || 0;
  const orderBy = options && options.orderBy;
  const order = (options && options.order) || 'desc';

  let q = _getDb().collection(collection).where(where);
  if (orderBy) q = q.orderBy(orderBy, order);
  return q.skip(skip).limit(limit).get().then((res) => res.data || []);
}

/** 按文档 _id 查单条 */
function getById(collection, docId) {
  return _getDb().collection(collection).doc(docId).get()
    .then((res) => (res.data || null));
}

/** 按 _id 更新（部分字段） */
function updateById(collection, docId, data) {
  return _getDb().collection(collection).doc(docId).update({ data });
}

/** 按 _id 删除 */
function removeById(collection, docId) {
  return _getDb().collection(collection).doc(docId).remove();
}

// ─── users 业务示例 ─────────────────────────────────────────

/** 4.1 创建用户 */
function createUser(openid, fields) {
  const f = fields || {};
  return add('users', {
    openid,
    nickName: f.nickName != null ? f.nickName : '微信用户',
    level: f.level != null ? f.level : 1,
    score: f.score != null ? f.score : 0,
    createTime: Date.now(),
    updatedAt: Date.now()
  });
}

/** 按 openid 查用户（数组，通常 0 或 1 条） */
function findUsersByOpenid(openid) {
  return queryWhere('users', { openid: openid });
}

/** 4.3 按文档 _id 改分数等字段 */
function updateUser(docId, data) {
  return updateById('users', docId, Object.assign({}, data, { updatedAt: Date.now() }));
}

/** 按 openid 更新（先查再改，省去手动拿 _id） */
function updateUserByOpenid(openid, data) {
  return findUsersByOpenid(openid).then((list) => {
    if (!list.length) return Promise.reject(new Error('用户不存在: ' + openid));
    return updateUser(list[0]._id, data);
  });
}

// ─── teams 业务示例 ─────────────────────────────────────────

/** 4.2 查自己当队长的队伍 */
function getTeamsByLeaderOpenid(leaderOpenid) {
  return queryWhere('teams', { leaderOpenid: leaderOpenid });
}

module.exports = {
  add,
  queryWhere,
  getById,
  updateById,
  removeById,
  createUser,
  findUsersByOpenid,
  updateUser,
  updateUserByOpenid,
  getTeamsByLeaderOpenid,
  _errMsg
};
