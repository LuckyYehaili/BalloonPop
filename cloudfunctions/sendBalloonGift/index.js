const cloud = require('wx-server-sdk')
const {
  GIFT_TTL_MS,
  DAILY_SEND_LIMIT,
  MAX_GIFT_COUNT,
  genGiftId,
  countTodaySends
} = require('./gift-utils')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const fromOpenid = wxContext.OPENID
  if (!fromOpenid) {
    return { ok: false, reason: '未登录' }
  }

  const balloonId = event && event.balloonId ? String(event.balloonId) : ''
  let count = parseInt(event && event.count, 10)
  if (!Number.isFinite(count) || count < 1) count = 1
  if (count > MAX_GIFT_COUNT) {
    return { ok: false, reason: '单次赠送最多' + MAX_GIFT_COUNT + '个' }
  }
  if (!balloonId) {
    return { ok: false, reason: '缺少 balloonId' }
  }

  const toOpenid = event && event.toOpenid ? String(event.toOpenid) : ''

  try {
    const sentToday = await countTodaySends(db, _, fromOpenid)
    if (sentToday >= DAILY_SEND_LIMIT) {
      return { ok: false, reason: '今日赠送已达上限(' + DAILY_SEND_LIMIT + '次)' }
    }

    const giftId = genGiftId()
    const now = Date.now()
    const expireTime = now + GIFT_TTL_MS

    await db.runTransaction(async (transaction) => {
      const invRes = await transaction.collection('balloon_inventory').where({
        openid: fromOpenid,
        balloonId
      }).get()

      if (!invRes.data.length) {
        throw new Error('未拥有该气球')
      }

      const inv = invRes.data[0]
      if (inv.source !== 'purchase' || inv.giftable !== true) {
        throw new Error('仅本人购买且可赠送的气球可转赠')
      }
      const available = inv.count || 0
      if (available < count) {
        throw new Error('可赠送气球不足')
      }

      const nextCount = available - count
      if (nextCount <= 0) {
        await transaction.collection('balloon_inventory').doc(inv._id).remove()
      } else {
        await transaction.collection('balloon_inventory').doc(inv._id).update({
          data: {
            count: nextCount,
            updatedAt: now
          }
        })
      }

      await transaction.collection('gifts').add({
        data: {
          giftId,
          fromOpenid,
          toOpenid,
          balloonId,
          count,
          status: 'pending',
          createTime: now,
          expireTime
        }
      })
    })

    return {
      ok: true,
      giftId,
      balloonId,
      count,
      expireTime
    }
  } catch (e) {
    console.error('[sendBalloonGift]', e)
    return { ok: false, reason: e.message || String(e) }
  }
}
