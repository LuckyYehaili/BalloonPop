/**
 * 用户建议与反馈：可选配图上传 + 云函数入库（openid / 昵称由云端写入）
 */

function sanitizeMobilePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

function validateMobilePhone(value) {
  const phone = sanitizeMobilePhone(value);
  if (!phone) return { ok: false, reason: '请填写手机号码' };
  if (!/^1[3-9]\d{9}$/.test(phone)) return { ok: false, reason: '请输入正确的 11 位手机号' };
  return { ok: true, phone };
}

function chooseFeedbackImage(opts) {
  if (typeof wx === 'undefined') {
    return Promise.reject(new Error('当前环境不支持选图'));
  }
  const sourceType = (opts && Array.isArray(opts.sourceType) && opts.sourceType.length)
    ? opts.sourceType
    : ['album', 'camera'];
  return new Promise((resolve, reject) => {
    const done = (path) => {
      if (path) resolve(path);
      else reject(new Error('未选择图片'));
    };
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType,
        success(res) {
          const file = res.tempFiles && res.tempFiles[0];
          done(file && file.tempFilePath);
        },
        fail: reject
      });
      return;
    }
    if (wx.chooseImage) {
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType,
        success(res) {
          done(res.tempFilePaths && res.tempFilePaths[0]);
        },
        fail: reject
      });
      return;
    }
    reject(new Error('当前环境不支持选图'));
  });
}

function uploadFeedbackImage(tempFilePath) {
  if (!tempFilePath) return Promise.resolve('');
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.uploadFile) {
    return Promise.reject(new Error('云存储不可用'));
  }
  const extMatch = String(tempFilePath).match(/\.(\w+)(?:\?|$)/);
  const ext = extMatch ? extMatch[1] : 'jpg';
  const cloudPath = 'feedback/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  return wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath })
    .then((res) => (res && res.fileID) || '')
    .catch((err) => Promise.reject(new Error((err && err.errMsg) || '图片上传失败')));
}

function submitFeedback({ title, content, phone, imageFileId }) {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return Promise.reject(new Error('云服务不可用'));
  }
  return wx.cloud.callFunction({
    name: 'submitFeedback',
    data: {
      title: title || '',
      content: content || '',
      phone: phone || '',
      imageFileId: imageFileId || ''
    }
  }).then((res) => {
    const result = (res && res.result) || {};
    if (result.ok) return result;
    return Promise.reject(new Error(result.reason || '提交失败'));
  });
}

function submitFeedbackWithImage({ title, content, phone, imagePath }) {
  const upload = imagePath ? uploadFeedbackImage(imagePath) : Promise.resolve('');
  return upload.then((imageFileId) => submitFeedback({ title, content, phone, imageFileId }));
}

module.exports = {
  sanitizeMobilePhone,
  validateMobilePhone,
  chooseFeedbackImage,
  uploadFeedbackImage,
  submitFeedback,
  submitFeedbackWithImage
};
