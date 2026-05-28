// pages/index/index.js — 云数据库连通测试
const db = wx.cloud.database();

Page({
  data: {
    testUser: null,
    msg: '正在连接云数据库...',
    envId: 'cloud1-d2geerzff38fc214b',
    loading: true
  },

  onLoad() {
    this.testConnect();
  },

  onPullDownRefresh() {
    this.testConnect(() => {
      wx.stopPullDownRefresh();
    });
  },

  /** 连通测试：读取 users 中 openid = test_user_001 */
  testConnect(done) {
    const finish = typeof done === 'function' ? done : function () {};
    this.setData({ loading: true, msg: '正在连接云数据库...', testUser: null });

    if (!wx.cloud) {
      const msg = '❌ 连接失败：当前基础库不支持 wx.cloud';
      console.error(msg);
      this.setData({ msg: msg, loading: false });
      finish();
      return;
    }

    db.collection('users')
      .where({ openid: 'test_user_001' })
      .get()
      .then((res) => {
        if (res.data && res.data.length > 0) {
          const user = res.data[0];
          console.log('✅ 连通成功，用户数据：', user);
          this.setData({
            testUser: user,
            msg: '✅ 连通成功！读到用户数据',
            loading: false
          });
        } else {
          console.warn('⚠️ 连通成功，但未找到 test_user_001');
          this.setData({
            testUser: null,
            msg: '⚠️ 连通成功，但未找到 test_user_001',
            loading: false
          });
        }
        finish();
      })
      .catch((err) => {
        const errMsg = (err && err.errMsg) || (err && err.message) || String(err);
        console.error('❌ 云数据库连接失败：', err);
        this.setData({
          testUser: null,
          msg: '❌ 连接失败：' + errMsg,
          loading: false
        });
        finish();
      });
  },

  onTapRetry() {
    this.testConnect();
  }
});
