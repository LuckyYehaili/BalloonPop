/** 赠礼云函数 reasonCode → 用户可见文案（前端映射，云侧 reason 为兜底） */
const GIFT_REASON_COPY = {
  claimed_by_self: '该气球你已经领取过啦',
  claimed_by_other: '该赠礼已被他人领取',
  expired: '赠礼已过期，无法领取',
  not_found: '赠礼链接不存在',
  self_gift: '不能领取自己送出的礼物',
  daily_limit: '今日领取次数已达上限',
  not_logged_in: '请先登录后再领取',
  invalid: '链接已失效'
};

function giftReasonMessage(result) {
  if (!result) return '领取失败';
  if (result.reasonCode && GIFT_REASON_COPY[result.reasonCode]) {
    return GIFT_REASON_COPY[result.reasonCode];
  }
  const reason = result.reason || '';
  if (reason.indexOf('不存在') >= 0) return GIFT_REASON_COPY.not_found;
  if (reason.indexOf('过期') >= 0) return GIFT_REASON_COPY.expired;
  if (reason.indexOf('上限') >= 0) return GIFT_REASON_COPY.daily_limit;
  if (reason.indexOf('自己') >= 0) return GIFT_REASON_COPY.self_gift;
  if (reason.indexOf('未登录') >= 0) return GIFT_REASON_COPY.not_logged_in;
  if (reason.indexOf('失效') >= 0) return GIFT_REASON_COPY.invalid;
  return reason || '领取失败';
}

module.exports = { giftReasonMessage, GIFT_REASON_COPY };
