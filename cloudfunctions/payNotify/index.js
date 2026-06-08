const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { out_trade_no, return_code, result_code, transaction_id, total_fee } = event
  const outTradeNo = out_trade_no
  if (!outTradeNo) {
    return { errcode: -4, errmsg: '缺少 out_trade_no' }
  }

  const idempotencyKey = transaction_id ? `cb:${transaction_id}` : `cb:${outTradeNo}`
  const now = Date.now()

  const dup = await db.collection('pay_callbacks').where({ idempotencyKey }).limit(1).get()
  if (dup.data.length > 0 && dup.data[0].handleStatus === 'HANDLED') {
    return { errcode: 0, errmsg: 'ok' }
  }

  await logCallback({
    transactionId: transaction_id || '',
    outTradeNo,
    totalFeeFen: total_fee || 0,
    callbackTime: now,
    raw: event,
    idempotencyKey,
    handleStatus: 'PENDING',
    handledAt: 0,
    handleError: null
  })

  if (return_code !== 'SUCCESS' || result_code !== 'SUCCESS') {
    await markCallback(idempotencyKey, 'FAILED', '支付失败')
    return { errcode: -1, errmsg: '支付失败' }
  }

  try {
    const orderRes = await db.collection('orders').where({ outTradeNo }).limit(1).get()
    if (!orderRes.data.length) {
      await markCallback(idempotencyKey, 'FAILED', '订单不存在')
      return { errcode: -3, errmsg: '订单不存在' }
    }

    const order = orderRes.data[0]

    if (order.deliverStatus === 'DELIVERED' || order.balloonSent === true) {
      await markCallback(idempotencyKey, 'HANDLED', null)
      return { errcode: 0, errmsg: 'ok' }
    }

    if (total_fee && order.totalFee != null && Number(total_fee) !== Number(order.totalFee)) {
      await markCallback(idempotencyKey, 'FAILED', '金额不一致')
      return { errcode: -5, errmsg: '金额不一致' }
    }

    await db.collection('orders').doc(order._id).update({
      data: {
        status: 'PAY_SUCCESS',
        payTime: now,
        transactionId: transaction_id || order.transactionId || '',
        updatedAt: now
      }
    })

    await sendBalloon(order)

    await db.collection('orders').doc(order._id).update({
      data: {
        deliverStatus: 'DELIVERED',
        deliverTime: now,
        balloonSent: true,
        updatedAt: now
      }
    })

    await writeOrderList(order, transaction_id, now)

    await markCallback(idempotencyKey, 'HANDLED', null)
    return { errcode: 0, errmsg: 'ok' }
  } catch (e) {
    console.error(e)
    await markCallback(idempotencyKey, 'FAILED', e.message || String(e))
    return { errcode: -2, errmsg: e.message || String(e) }
  }
}

/** 写入订单记录（供「订单中心」展示）；orderNo 取微信交易号，缺失时回退商户单号。幂等去重。 */
async function writeOrderList(order, transactionId, now) {
  const orderNo = transactionId || order.transactionId || order.outTradeNo
  try {
    const exist = await db.collection('order_list').where({ orderNo }).limit(1).get()
    if (exist.data && exist.data.length) return

    const priceYuan = Math.round((Number(order.totalFee) || 0)) / 100
    await db.collection('order_list').add({
      data: {
        openid: order.openid,
        orderNo,
        goodsName: order.goodsName || '传奇气球礼包',
        goodsContent: order.goodsContent || order.body || '传奇气球×1',
        price: priceYuan,
        createTime: order.createTime || now,
        payTime: now,
        status: 'completed'
      }
    })
  } catch (e) {
    console.warn('[payNotify] writeOrderList failed:', e && (e.message || e))
  }
}

async function logCallback(row) {
  try {
    await db.collection('pay_callbacks').add({ data: row })
  } catch (e) {
    console.warn('[payNotify] callback log exists:', row.idempotencyKey)
  }
}

async function markCallback(idempotencyKey, handleStatus, handleError) {
  await db.collection('pay_callbacks').where({ idempotencyKey }).update({
    data: {
      handleStatus,
      handledAt: Date.now(),
      handleError: handleError || null
    }
  })
}

async function sendBalloon(order) {
  const openid = order.openid
  const balloonId = order.balloonId
  const quantity = order.quantity || 1
  const t = Date.now()

  if (!openid) throw new Error('订单缺少 openid')
  if (!balloonId) throw new Error('订单缺少 balloonId')

  const invRes = await db.collection('balloon_inventory').where({ openid, balloonId }).limit(1).get()

  if (invRes.data.length > 0) {
    await db.collection('balloon_inventory').doc(invRes.data[0]._id).update({
      data: {
        count: _.inc(quantity),
        source: 'purchase',
        giftable: true,
        updatedAt: t
      }
    })
    return
  }

  await db.collection('balloon_inventory').add({
    data: {
      openid,
      balloonId,
      count: quantity,
      source: 'purchase',
      giftable: true,
      updatedAt: t
    }
  })
}
