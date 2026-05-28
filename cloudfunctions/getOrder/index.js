const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { outTradeNo } = event
  if (!outTradeNo) {
    return { ok: false, errMsg: '缺少 outTradeNo' }
  }
  const res = await db.collection('orders').where({ outTradeNo }).limit(1).get()
  const order = res.data[0] || null
  return { ok: !!order, order }
}
