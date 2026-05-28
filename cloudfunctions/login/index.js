const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const userRes = await db.collection('users').where({ openid }).limit(1).get()
  if (userRes.data.length > 0) {
    return {
      openid,
      userInfo: userRes.data[0]
    }
  }

  const now = Date.now()
  const newUser = {
    openid,
    nickName: '微信用户',
    level: 1,
    score: 0,
    createTime: now,
    updatedAt: now
  }
  await db.collection('users').add({ data: newUser })

  return {
    openid,
    userInfo: newUser
  }
}
