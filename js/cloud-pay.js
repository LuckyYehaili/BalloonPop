/**
 * 云支付：createOrder → 调起支付 → 轮询发货（单个传奇）
 */
const { useMockPay, readIOS, isDevelopEnv } = require('./platform');

const LEGEND_PRICE_YUAN_DEFAULT = 1.99;

function createOrder({ totalFee, body, balloonId, goodsName, goodsContent }) {
  if (!balloonId) return Promise.reject(new Error('balloonId 必填'));
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return Promise.reject(new Error('wx.cloud 不可用'));
  }
  return wx.cloud.callFunction({
    name: 'createOrder',
    data: { totalFee, body, balloonId, goodsName, goodsContent }
  }).then((res) => {
    const result = res.result || {};
    if (!result.success) {
      return Promise.reject(new Error(result.errMsg || '创建订单失败'));
    }
    return result;
  });
}

function createLegendOrder(balloonId, options) {
  const opts = options || {};
  const totalFee = opts.totalFee != null
    ? opts.totalFee
    : Math.round((opts.priceYuan != null ? opts.priceYuan : LEGEND_PRICE_YUAN_DEFAULT) * 100);
  const legendName = (opts.meta && opts.meta.name) ? opts.meta.name : '传奇气球';
  const body = opts.body || (opts.meta && opts.meta.name ? '传奇·' + opts.meta.name : '传奇气球');
  const goodsName = opts.goodsName || '传奇气球礼包';
  const goodsContent = opts.goodsContent || (legendName + '×1');
  return createOrder({ totalFee, body, balloonId, goodsName, goodsContent });
}

/** 云开发统一下单返回的 payment 调起微信支付 */
function invokeCloudPayment(payment) {
  return new Promise((resolve, reject) => {
    if (!payment) {
      reject(new Error('payment 为空'));
      return;
    }
    if (typeof wx.requestPayment !== 'function') {
      reject(new Error('当前环境不支持 wx.requestPayment，请用 mockPay=1 调试'));
      return;
    }
    const opts = Object.assign({}, payment, {
      success: resolve,
      fail: reject
    });
    wx.requestPayment(opts);
  });
}

function getOrderByNo(outTradeNo) {
  return wx.cloud.callFunction({
    name: 'getOrder',
    data: { outTradeNo }
  }).then((res) => {
    const r = res.result || {};
    if (!r.ok) return null;
    return r.order;
  });
}

/** 等待 payNotify 把订单标为已发货 */
function pollOrderDelivered(outTradeNo, options) {
  const maxAttempts = (options && options.maxAttempts) || 20;
  const intervalMs = (options && options.intervalMs) || 800;
  let attempts = 0;

  function tick() {
    return getOrderByNo(outTradeNo).then((order) => {
      if (order && (order.deliverStatus === 'DELIVERED' || order.balloonSent === true)) {
        return order;
      }
      attempts += 1;
      if (attempts >= maxAttempts) {
        return Promise.reject(new Error('支付成功，发货确认超时，请稍后在图鉴查看'));
      }
      return new Promise((r) => setTimeout(r, intervalMs)).then(tick);
    });
  }
  return tick();
}

function canUseRealPay() {
  if (readIOS()) return false;
  if (useMockPay()) return false;
  return typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callFunction === 'function';
}

/**
 * 购买单个传奇：真支付或 mock
 * @returns {Promise<{ channel: 'cloud_pay'|'mock_pay', outTradeNo?: string, order?: object }>}
 */
function purchaseLegendBalloon(balloonId, options) {
  const opts = options || {};
  if (!canUseRealPay()) {
    if (useMockPay() && typeof console !== 'undefined') {
      console.log('[cloud-pay] 模拟支付 mock_pay（无需商户号） balloonId=', balloonId);
    }
    return Promise.resolve({ channel: 'mock_pay' });
  }
  return createLegendOrder(balloonId, opts)
    .then((created) => invokeCloudPayment(created.payment).then(() => created))
    .then((created) => pollOrderDelivered(created.outTradeNo, opts.poll).then((order) => ({
      channel: 'cloud_pay',
      outTradeNo: created.outTradeNo,
      order
    })));
}

module.exports = {
  LEGEND_PRICE_YUAN_DEFAULT,
  createOrder,
  createLegendOrder,
  invokeCloudPayment,
  getOrderByNo,
  pollOrderDelivered,
  canUseRealPay,
  purchaseLegendBalloon,
  useMockPay,
  isDevelopEnv
};
