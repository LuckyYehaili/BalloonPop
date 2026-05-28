// 微信小程序全局入口（连通测试用）
// 注意：当前仓库主工程 compileType 为「小游戏」(game.js)，本文件仅在 compileType 为「小程序」时由工具加载。
// 推荐：用微信开发者工具单独打开 cloud-connect-mp/ 目录进行页面连通测试。

App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上基础库');
      return;
    }
    wx.cloud.init({
      env: 'cloud1-d2geerzff38fc214b',
      traceUser: true
    });
    console.log('☁️ 云开发初始化完成', 'cloud1-d2geerzff38fc214b');
  }
});
