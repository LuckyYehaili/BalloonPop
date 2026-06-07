/** 气球赠送云函数共用：时区、限额、库存读写 */

const GIFT_TTL_MS = 24 * 3600000
const DAILY_SEND_LIMIT = 20
const DAILY_RECEIVE_LIMIT = 20
const MAX_GIFT_COUNT = 10

function getChinaDayRange(nowMs) {
  const now = nowMs != null ? nowMs : Date.now()
  const offset = 8 * 3600000
  const d = new Date(now + offset)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  const start = Date.UTC(y, m, day) - offset
  return { start, end: start + 86400000 }
}

function genGiftId() {
  return 'gift_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
}

async function countTodaySends(db, _, fromOpenid) {
  const { start, end } = getChinaDayRange()
  const res = await db.collection('gifts').where({
    fromOpenid,
    createTime: _.gte(start).and(_.lt(end))
  }).count()
  return res.total || 0
}

async function countTodayReceives(db, _, toOpenid) {
  const { start, end } = getChinaDayRange()
  const res = await db.collection('gifts').where({
    toOpenid,
    status: 'claimed',
    claimTime: _.gte(start).and(_.lt(end))
  }).count()
  return res.total || 0
}

async function restoreSenderInventory(transaction, db, _, fromOpenid, balloonId, count) {
  const invRes = await transaction.collection('balloon_inventory').where({
    openid: fromOpenid,
    balloonId
  }).get()

  const now = Date.now()
  if (invRes.data.length > 0) {
    const doc = invRes.data[0]
    const nextCount = (doc.count || 0) + count
    await transaction.collection('balloon_inventory').doc(doc._id).update({
      data: {
        count: nextCount,
        source: 'purchase',
        giftable: true,
        updatedAt: now
      }
    })
    return
  }

  await transaction.collection('balloon_inventory').add({
    data: {
      openid: fromOpenid,
      balloonId,
      count,
      source: 'purchase',
      giftable: true,
      updatedAt: now
    }
  })
}

async function creditReceiverInventory(transaction, db, _, toOpenid, balloonId, count) {
  const invRes = await transaction.collection('balloon_inventory').where({
    openid: toOpenid,
    balloonId
  }).get()

  const now = Date.now()
  if (invRes.data.length === 0) {
    await transaction.collection('balloon_inventory').add({
      data: {
        openid: toOpenid,
        balloonId,
        count,
        source: 'gift',
        giftable: false,
        updatedAt: now
      }
    })
    return
  }

  const doc = invRes.data[0]
  const nextCount = (doc.count || 0) + count
  const patch = {
    count: nextCount,
    updatedAt: now
  }
  if (doc.source !== 'purchase') {
    patch.source = 'gift'
    patch.giftable = false
  }
  await transaction.collection('balloon_inventory').doc(doc._id).update({ data: patch })
}

module.exports = {
  GIFT_TTL_MS,
  DAILY_SEND_LIMIT,
  DAILY_RECEIVE_LIMIT,
  MAX_GIFT_COUNT,
  getChinaDayRange,
  genGiftId,
  countTodaySends,
  countTodayReceives,
  restoreSenderInventory,
  creditReceiverInventory
}
