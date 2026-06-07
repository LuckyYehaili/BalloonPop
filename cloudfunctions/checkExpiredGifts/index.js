const cloud = require('wx-server-sdk')
const { restoreSenderInventory } = require('./gift-utils')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const BATCH_LIMIT = 50

exports.main = async (event) => {
  const now = Date.now()
  const limit = (event && event.limit) || BATCH_LIMIT

  try {
    const expiredRes = await db.collection('gifts').where({
      status: 'pending',
      expireTime: _.lte(now)
    }).orderBy('expireTime', 'asc').limit(limit).get()

    const gifts = expiredRes.data || []
    if (!gifts.length) {
      return { ok: true, processed: 0, expired: 0, errors: [] }
    }

    let expired = 0
    const errors = []

    for (const gift of gifts) {
      try {
        await db.runTransaction(async (transaction) => {
          const fresh = await transaction.collection('gifts').doc(gift._id).get()
          const row = fresh.data
          if (!row) return
          if (row.status !== 'pending') return
          if (row.expireTime > now) return

          await transaction.collection('gifts').doc(gift._id).update({
            data: {
              status: 'expired',
              expiredAt: now
            }
          })

          await restoreSenderInventory(
            transaction, db, _, row.fromOpenid, row.balloonId, row.count || 1
          )
        })
        expired += 1
      } catch (e) {
        console.error('[checkExpiredGifts] gift', gift.giftId, e)
        errors.push({ giftId: gift.giftId, reason: e.message || String(e) })
      }
    }

    return {
      ok: true,
      processed: gifts.length,
      expired,
      errors
    }
  } catch (e) {
    console.error('[checkExpiredGifts]', e)
    return { ok: false, reason: e.message || String(e) }
  }
}
