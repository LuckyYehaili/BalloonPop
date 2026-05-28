/** 平台能力检测（iOS 虚拟支付、调试开关等） */

function readIOS() {
  try {
    const sys = wx.getSystemInfoSync();
    const p = (sys.platform || '').toLowerCase();
    const sysName = (sys.system || '').toLowerCase();
    return p === 'ios' || sysName.indexOf('ios') >= 0;
  } catch (_) {
    return false;
  }
}

function readLaunchQuery() {
  try {
    if (typeof wx === 'undefined' || !wx.getLaunchOptionsSync) return {};
    return wx.getLaunchOptionsSync().query || {};
  } catch (_) {
    return {};
  }
}

/** 开发版 / 体验版（未配商户号、等软著期间默认模拟支付） */
function isDevelopEnv() {
  try {
    if (typeof wx === 'undefined' || !wx.getAccountInfoSync) return true;
    const v = wx.getAccountInfoSync().miniProgram.envVersion;
    return v === 'develop' || v === 'trial';
  } catch (_) {
    return true;
  }
}

/**
 * 是否走模拟支付（不调 createOrder / 微信收银台）
 * - mockPay=1：强制模拟
 * - realPay=1：强制真支付（商户号配好后用）
 * - 开发版/体验版：默认模拟；正式版 release 才走真支付
 */
function useMockPay() {
  const q = readLaunchQuery();
  if (String(q.realPay) === '1' || String(q.real_pay) === '1') return false;
  if (String(q.mockPay) === '1' || String(q.mock_pay) === '1') return true;
  return isDevelopEnv();
}

module.exports = {
  readIOS,
  readLaunchQuery,
  isDevelopEnv,
  useMockPay
};
