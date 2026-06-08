const cloud = require('wx-server-sdk')

const SUB_MCH_ID = process.env.SUB_MCH_ID || '你的商户号'
const CLOUD_ENV_ID = process.env.CLOUD_ENV_ID || 'cloud1-d2geerzff38fc214b'

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { totalFee, body, balloonId, goodsName, goodsContent } = event

  if (!balloonId || typeof balloonId !== 'string') {
    return { success: false, errMsg: 'balloonId 必填，需与 balloons 表 id 一致（如 legend_bubble_aurora）' }
  }
  if (!totalFee || totalFee <= 0) {
    return { success: false, errMsg: 'totalFee 无效' }
  }
  if (SUB_MCH_ID === '你的商户号') {
    return { success: false, errMsg: '请配置 SUB_MCH_ID（云函数环境变量或 createOrder/index.js）' }
  }

  const outTradeNo = 'ORD' + Date.now() + Math.random().toString(36).slice(2, 8)
  const now = Date.now()
  const orderData = {
    outTradeNo,
    openid,
    totalFee,
    totalFeeFen: totalFee,
    body: body || '气球充值',
    balloonId,
    goodsName: goodsName || '传奇气球礼包',
    goodsContent: goodsContent || (body || '传奇气球×1'),
    productType: 'balloon',
    quantity: 1,
    status: 'PENDING',
    deliverStatus: 'PENDING',
    createTime: now,
    payTime: 0,
    balloonSent: false,
    updatedAt: now
  }

  try {
    await db.collection('orders').add({ data: orderData })

    const payRes = await cloud.cloudPay.unifiedOrder({
      body: orderData.body,
      outTradeNo,
      spbillCreateIp: '127.0.0.1',
      subMchId: SUB_MCH_ID,
      totalFee,
      envId: CLOUD_ENV_ID,
      functionName: 'payNotify'
    })

    return { success: true, outTradeNo, payment: payRes.payment }
  } catch (e) {
    console.error(e)
    try {
      await db.collection('orders').where({ outTradeNo }).update({
        data: { status: 'PAY_FAIL', updatedAt: Date.now() }
      })
    } catch (_) { /* ignore */ }
    return { success: false, errMsg: e.message || String(e), outTradeNo }
  }
}
