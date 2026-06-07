/**
 * 气球赠送云函数客户端
 */
function _call(name, data) {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return Promise.resolve({ ok: false, reason: 'wx.cloud 不可用' });
  }
  return wx.cloud.callFunction({ name, data })
    .then((res) => res.result || { ok: false, reason: '空响应' })
    .catch((err) => ({
      ok: false,
      reason: (err && err.errMsg) || (err && err.message) || String(err)
    }));
}

function sendBalloonGift(balloonId, count) {
  return _call('sendBalloonGift', {
    balloonId,
    count: count != null ? count : 1
  });
}

function claimBalloonGift(giftId) {
  return _call('claimBalloonGift', { giftId });
}

function getBalloonGift(giftId) {
  return _call('getBalloonGift', { giftId });
}

module.exports = {
  sendBalloonGift,
  claimBalloonGift,
  getBalloonGift
};
