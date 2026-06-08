/**
 * 订单记录查询：返回当前登录用户 order_list 中的订单（按下单时间倒序）
 * 仅返回本人 openid 的数据，满足支付合规「订单中心」展示需求。
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const MAX_LIMIT = 100

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    return { ok: false, errMsg: '未登录', orders: [] }
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(event && event.limit) || 50))

  try {
    const res = await db.collection('order_list')
      .where({ openid })
      .orderBy('createTime', 'desc')
      .limit(limit)
      .get()
    const orders = (res.data || []).map((o) => ({
      orderNo: o.orderNo || '',
      goodsName: o.goodsName || '',
      goodsContent: o.goodsContent || '',
      price: typeof o.price === 'number' ? o.price : Number(o.price) || 0,
      createTime: o.createTime || 0,
      payTime: o.payTime || 0,
      status: o.status || 'completed'
    }))
    return { ok: true, orders }
  } catch (e) {
    console.error('[getOrderList]', e)
    return { ok: false, errMsg: e.message || String(e), orders: [] }
  }
}
