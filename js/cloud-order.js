/**
 * 订单记录：调用云函数 getOrderList 拉取当前用户 order_list 数据
 */

function fetchOrderList(opts) {
  const limit = (opts && opts.limit) || 50;
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return Promise.resolve({ ok: false, orders: [], errMsg: '云开发不可用' });
  }
  return wx.cloud.callFunction({
    name: 'getOrderList',
    data: { limit }
  }).then((res) => {
    const result = (res && res.result) || {};
    return {
      ok: !!result.ok,
      orders: Array.isArray(result.orders) ? result.orders : [],
      errMsg: result.errMsg || ''
    };
  }).catch((err) => {
    console.warn('[cloud-order] getOrderList', err);
    return {
      ok: false,
      orders: [],
      errMsg: (err && err.errMsg) || (err && err.message) || String(err)
    };
  });
}

module.exports = { fetchOrderList };
