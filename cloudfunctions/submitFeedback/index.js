const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const TITLE_MAX = 30
const CONTENT_MAX = 500

function sanitizeMobilePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11)
}

function validateMobilePhone(value) {
  const phone = sanitizeMobilePhone(value)
  if (!phone) return { ok: false, reason: '请填写手机号码' }
  if (!/^1[3-9]\d{9}$/.test(phone)) return { ok: false, reason: '请输入正确的 11 位手机号' }
  return { ok: true, phone }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    return { ok: false, reason: '未登录' }
  }

  const title = event && event.title ? String(event.title).trim() : ''
  const content = event && event.content ? String(event.content).trim() : ''
  const phoneCheck = validateMobilePhone(event && event.phone)
  const imageFileId = event && event.imageFileId ? String(event.imageFileId).trim() : ''

  if (!title) return { ok: false, reason: '请填写标题' }
  if (title.length > TITLE_MAX) return { ok: false, reason: '标题不超过' + TITLE_MAX + '字' }
  if (!content) return { ok: false, reason: '请填写内容' }
  if (content.length > CONTENT_MAX) return { ok: false, reason: '内容不超过' + CONTENT_MAX + '字' }
  if (!phoneCheck.ok) return { ok: false, reason: phoneCheck.reason }

  let nickName = '微信用户'
  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    if (userRes.data.length) {
      const u = userRes.data[0]
      nickName = u.nickName || u.nickname || nickName
    }
  } catch (e) {
    console.warn('[submitFeedback] load user', e)
  }

  const now = Date.now()
  try {
    await db.collection('user_feedback').add({
      data: {
        openid,
        nickName,
        phone: phoneCheck.phone,
        title,
        content,
        imageFileId: imageFileId || null,
        status: 'pending',
        createTime: now,
        updatedAt: now
      }
    })
    return { ok: true }
  } catch (e) {
    console.error('[submitFeedback]', e)
    return { ok: false, reason: '提交失败，请稍后再试' }
  }
}
