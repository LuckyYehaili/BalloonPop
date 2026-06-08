/** 注销账号：退回待领取礼物到赠送人 */

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

module.exports = { restoreSenderInventory }
