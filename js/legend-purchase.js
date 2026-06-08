/**
 * 传奇气球购买：图鉴 / 关内共用文案、iOS 拦截与支付流程
 */
const store = require('./store');
const { purchaseLegendBalloon, useMockPay, LEGEND_PRICE_YUAN_DEFAULT } = require('./cloud-pay');
const { readIOS } = require('./platform');
const { syncBalloonInventoryFromCloud } = require('./cloud-login');

const IOS_PURCHASE_BLOCKED_MSG = 'iOS暂未开放购买';

function isLegendPurchaseBlocked() {
  return readIOS();
}

function toastIfLegendPurchaseBlocked(showToast) {
  if (isLegendPurchaseBlocked()) {
    if (typeof showToast === 'function') showToast(IOS_PURCHASE_BLOCKED_MSG);
    return true;
  }
  return false;
}

/**
 * @param {object} meta - 气球元数据
 * @param {string} [extraDesc] - 追加说明（如关内自动装备）
 */
function getLegendPurchaseConfirmCopy(meta, extraDesc) {
  const name = (meta && meta.name) || '传奇气球';
  const isMock = useMockPay();
  let desc = isMock
    ? '此为演示流程，未接入真实支付。购买后将获得 1 个「' + name + '」。'
    : '支付后将获得 1 个「' + name + '」，请确认金额后完成付款。';
  if (extraDesc) desc += '\n' + extraDesc;
  return {
    title: isMock ? '确认购买（演示）' : '确认购买',
    desc,
    confirmLabel: '确认购买',
    isMockPay: isMock
  };
}

function getLegendPurchaseSuccessToast(channel) {
  return channel === 'cloud_pay' ? '购买成功' : '购买成功（演示）';
}

/**
 * 执行传奇购买（与图鉴 confirmPurchase 一致）
 * @param {object} opts
 * @param {string} opts.balloonId
 * @param {object} [opts.meta]
 * @param {number} [opts.priceYuan]
 * @param {function} [opts.showToast]
 * @param {function} [opts.onSuccess] - 库存入账后回调（关内可在此装备）
 */
function runLegendPurchase(opts) {
  const o = opts || {};
  const balloonId = o.balloonId;
  const meta = o.meta;
  const showToast = o.showToast;
  const priceYuan = o.priceYuan != null ? o.priceYuan : LEGEND_PRICE_YUAN_DEFAULT;

  if (!balloonId) return Promise.reject(new Error('缺少 balloonId'));
  if (toastIfLegendPurchaseBlocked(showToast)) {
    return Promise.resolve({ blocked: true });
  }

  if (typeof showToast === 'function') showToast('支付处理中…');

  return purchaseLegendBalloon(balloonId, { meta, priceYuan })
    .then((payResult) => {
      const channel = payResult.channel || 'mock_pay';
      const finish = () => {
        store.addTransaction({
          type: 'purchase',
          balloonId,
          quantity: 1,
          counterparty: '',
          status: 'success',
          channel,
          outTradeNo: payResult.outTradeNo || ''
        });
        if (typeof showToast === 'function') {
          showToast(getLegendPurchaseSuccessToast(channel));
        }
        if (typeof o.onSuccess === 'function') o.onSuccess({ channel, payResult });
        return { channel, payResult };
      };
      if (channel === 'cloud_pay') {
        return syncBalloonInventoryFromCloud().then(finish);
      }
      store.addBalloon(balloonId, 1, 'purchase');
      return finish();
    });
}

module.exports = {
  IOS_PURCHASE_BLOCKED_MSG,
  LEGEND_PRICE_YUAN_DEFAULT,
  isLegendPurchaseBlocked,
  toastIfLegendPurchaseBlocked,
  getLegendPurchaseConfirmCopy,
  getLegendPurchaseSuccessToast,
  runLegendPurchase
};
