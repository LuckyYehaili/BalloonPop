// 兼容入口：统一跳转战队页（创建战队见 team 场景「发现战队」）
module.exports = {
  onShow(data) {
    this.manager.switchTo('team', data);
  },
  render() {},
  onTouch() { return false; }
};
