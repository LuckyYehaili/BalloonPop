const cloud = require('wx-server-sdk')
const {
  DAILY_RECEIVE_LIMIT,
  countTodayReceives,
  creditReceiverInventory
} = require('./gift-utils')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function fail(reason, reasonCode) {
  return { ok: false, reason, reasonCode }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const toOpenid = wxContext.OPENID
  if (!toOpenid) {
    return fail('请先登录后再领取', 'not_logged_in')
  }

  const giftId = event && event.giftId ? String(event.giftId) : ''
  if (!giftId) {
    return fail('缺少 giftId', 'invalid')
  }

  try {
    const receivedToday = await countTodayReceives(db, _, toOpenid)
    if (receivedToday >= DAILY_RECEIVE_LIMIT) {
      return fail('今日领取次数已达上限', 'daily_limit')
    }

    const now = Date.now()
    let resultPayload = null

    await db.runTransaction(async (transaction) => {
      const giftRes = await transaction.collection('gifts').where({ giftId }).limit(1).get()
      if (!giftRes.data.length) {
        const err = new Error('赠礼链接不存在')
        err.reasonCode = 'not_found'
        throw err
      }

      const gift = giftRes.data[0]

      if (gift.status === 'claimed') {
        const err = new Error(
          gift.toOpenid === toOpenid ? '该气球你已经领取过啦' : '该赠礼已被他人领取'
        )
        err.reasonCode = gift.toOpenid === toOpenid ? 'claimed_by_self' : 'claimed_by_other'
        throw err
      }
      if (gift.status === 'expired') {
        const err = new Error('赠礼已过期，无法领取')
        err.reasonCode = 'expired'
        throw err
      }
      if (gift.status !== 'pending') {
        const err = new Error('链接已失效')
        err.reasonCode = 'invalid'
        throw err
      }
      if (gift.expireTime && gift.expireTime <= now) {
        const err = new Error('赠礼已过期，无法领取')
        err.reasonCode = 'expired'
        throw err
      }
      if (gift.fromOpenid === toOpenid) {
        const err = new Error('不能领取自己送出的礼物')
        err.reasonCode = 'self_gift'
        throw err
      }

      await transaction.collection('gifts').doc(gift._id).update({
        data: {
          status: 'claimed',
          toOpenid,
          claimTime: now
        }
      })

      await creditReceiverInventory(
        transaction, db, _, toOpenid, gift.balloonId, gift.count || 1
      )

      resultPayload = {
        balloonId: gift.balloonId,
        count: gift.count || 1,
        fromOpenid: gift.fromOpenid
      }
    })

    return {
      ok: true,
      giftId,
      balloonId: resultPayload.balloonId,
      count: resultPayload.count,
      fromOpenid: resultPayload.fromOpenid
    }
  } catch (e) {
    console.error('[claimBalloonGift]', e)
    return fail(e.message || String(e), e.reasonCode || 'invalid')
  }
}
