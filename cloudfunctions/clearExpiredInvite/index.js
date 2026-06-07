const cloud = require('wx-server-sdk')
const { ok, fail } = require('./response.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const BATCH = 50

exports.main = async () => {
  try {
    const now = Date.now()
    const res = await db.collection('team_invites').where({
      status: 'active',
      expireTime: _.lte(now)
    }).limit(BATCH).get()

    const list = res.data || []
    let updated = 0
    for (const row of list) {
      await db.collection('team_invites').doc(row._id).update({
        data: { status: 'expired' }
      })
      updated += 1
    }

    return ok({ processed: list.length, expired: updated }, 'ok')
  } catch (e) {
    console.error('[clearExpiredInvite]', e)
    return fail(e.message || String(e))
  }
}
