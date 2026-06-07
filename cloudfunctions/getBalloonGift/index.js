const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function fail(reason, reasonCode) {
  return { ok: false, reason, reasonCode }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    return fail('请先登录后再领取', 'not_logged_in')
  }

  const giftId = event && event.giftId ? String(event.giftId) : ''
  if (!giftId) {
    return fail('缺少 giftId', 'invalid')
  }

  try {
    const giftRes = await db.collection('gifts').where({ giftId }).limit(1).get()
    if (!giftRes.data.length) {
      return fail('赠礼链接不存在', 'not_found')
    }

    const gift = giftRes.data[0]
    const now = Date.now()

    if (gift.status === 'claimed') {
      if (gift.toOpenid === openid) {
        return fail('该气球你已经领取过啦', 'claimed_by_self')
      }
      return fail('该赠礼已被他人领取', 'claimed_by_other')
    }
    if (gift.status === 'expired') {
      return fail('赠礼已过期，无法领取', 'expired')
    }
    if (gift.status !== 'pending') {
      return fail('链接已失效', 'invalid')
    }
    if (gift.expireTime && gift.expireTime <= now) {
      return fail('赠礼已过期，无法领取', 'expired')
    }
    if (gift.fromOpenid === openid) {
      return fail('不能领取自己送出的礼物', 'self_gift')
    }

    let fromNickName = '好友'
    if (gift.fromOpenid) {
      const userRes = await db.collection('users').where({ openid: gift.fromOpenid }).limit(1).get()
      if (userRes.data.length && userRes.data[0].nickName) {
        fromNickName = String(userRes.data[0].nickName)
      }
    }

    return {
      ok: true,
      giftId,
      balloonId: gift.balloonId,
      count: gift.count || 1,
      fromNickName,
      fromOpenid: gift.fromOpenid
    }
  } catch (e) {
    console.error('[getBalloonGift]', e)
    return fail(e.message || String(e), 'invalid')
  }
}
