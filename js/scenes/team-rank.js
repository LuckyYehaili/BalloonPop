// 兼容入口：统一跳转战队页「战队排名」Tab
module.exports = {
  onShow() {
    this.manager.switchTo('team', { tab: 'rank' });
  },
  render() {},
  onTouch() { return false; }
};
