# BalloonPop 上线前代码审查报告

> 审查日期：2026-05-29  
> 范围：前端小游戏（`js/`、`game.js`）、云函数（`cloudfunctions/`）、打包与合规文档

---

## 一、本次已直接修复的 Bug

| 问题 | 位置 | 处理 |
|------|------|------|
| 云登录失败时伪造「离线登录成功」、随机昵称 | `js/scenes/home.js` `loginWithWeChat` | 已改为统一提示「登录失败，请检查网络后重试」，不再写入假登录态 |
| 通关第 4 关后「今日通关」统计恒为 0 | `js/scenes/battle.js` + `js/store.js` | 第 4 关完整通关时补充调用 `store.recordFullClear()`（与 `addClearRecord`、云端 `recordFullClear` 并行） |
| 购买确认弹窗在正式环境仍写「演示」 | `js/scenes/collection.js` `_drawPurchaseConfirm` | 按 `useMockPay()` 区分标题与说明文案 |
| 分享失败被 `.catch(() => {})` 静默吞掉 | `battle.js` / `collection.js` | 已移除空 catch；`shareBouquetAsImage` 内部会 toast 并打 warn |
| 触控调试日志在真机刷屏 | `scene-manager.js`、`canvas-ui.js` | `console.log` 仅在 `isDevelopEnv()` 时输出 |

---

## 二、历史会话中已修复（请确认已部署/提测）

| 问题 | 处理 | 备注 |
|------|------|------|
| `scripts/share-flow-selftest.js` 真机 SyntaxError | `project.config.json` 忽略 `scripts/` 目录 | 已配置 |
| 创建战队 `docId必须为字符串或数字` | 9 个云函数 `team-utils.js` 中 `bumpDailyAction` 改用 `where().update()` | **需重新上传部署相关云函数** |
| 弹窗正文溢出裁切 | `drawWrappedText` + 动态弹窗高度 | 战队规则等弹窗 |
| 花束分享图生成失败 | `bouquet-share.js` 离屏 Canvas + 多路径导出回退 | 真机再验 |
| 通关弹窗花束偏低 | `layout-safe.centerModalY()` | 真机再验 |
| 音效处补充震动 | `audio.vibrateFor()` 接入战斗场景 | — |
| 隐私/用户协议/儿童隐私全文 | `legal-documents.js` + `legal-modal.js` | 2 个新文件尚未入库，见下文 |

---

## 三、待你决策的功能 / 需求项

以下不属于「一行能修好的 bug」，需要产品、运营或合规侧确认后再改。

### 3.1 支付与商户

| 项 | 现状 | 建议 |
|----|------|------|
| 子商户号 | `createOrder` 中 `SUB_MCH_ID` 默认为占位「你的商户号」 | 云函数环境变量配置真实 `SUB_MCH_ID`；部署 `createOrder`、`payNotify` |
| 模拟支付 | 开发版/体验版默认 `mock_pay`；`realPay=1` 可强制真支付 | 提审正式版前确认 `release` 走真支付链路 |
| iOS 购买 | `collection.openPurchaseConfirm` 直接 toast「iOS暂未开放购买」 | 与软著/苹果政策对齐；法务文案是否需单独说明 |
| 关内购传奇 | `battle.js` 内同样有支付确认与 mock 分支 | 与图鉴购买策略保持一致 |

### 3.2 激励视频广告

| 项 | 现状 | 建议 |
|----|------|------|
| 广告实现 | `watchAdContinue` / `watchAdRetry` / `watchAdGetRetries` 均为 `setTimeout` 模拟 | 接入微信激励视频组件（`wx.createRewardedVideoAd`）并处理加载失败、中途关闭 |
| 合规表述 | 隐私政策写明接入腾讯广告 SDK | 真接入前可暂改文案为「计划接入」；接入后补隐私政策版本与弹窗 |

### 3.3 云定时任务（运维）

| 云函数 | 用途 | 状态 |
|--------|------|------|
| `checkExpiredGifts` | 过期礼物退回 | 代码已有 `config.json` 示例，**控制台需配置定时触发器** |
| `settleTeamRankRewards` | 周榜结算发奖 | 同上，建议周日 9:00 |
| `clearExpiredInvite` | 清理过期战队邀请 | 需配置定时触发器 |

详见 `cloudfunctions/README.md` 与 `docs/frontend-cloud-api.md`。

### 3.4 合规与文案一致性

| 项 | 现状 | 建议 |
|----|------|------|
| 反馈入口 | 法律文档写「游戏主界面设置-反馈」；实际为个人中心「联系客服」toast 邮箱 | 二选一：改文档路径描述，或在战斗设置/个人中心增加明确「意见反馈」入口 |
| 首次隐私同意 | 仅在登录弹窗底部链到协议；无独立首次启动同意弹窗 | 隐私政策第九条写「重大变更启动弹窗」— 首启是否要做同意勾选，需合规确认 |
| 文档日期 | 隐私政策「2026年08月08日」、用户协议「2026年05月08日」等不一致 | 统一为实际上线/修订日期 |
| 资料编辑 | `profile.editProfile` →「资料编辑暂未开放」 | 若短期不做，可在 UI 隐藏入口 |

### 3.5 账号与数据

| 项 | 现状 | 建议 |
|----|------|------|
| 未登录 openid | `store` 默认 `mock_*` openid，未登录可走本地玩法 | 云端战队/赠礼/排行等是否强制登录前置 — 目前部分场景已做，可全局梳理 |
| 账号注销 | 法律文档承诺 15 工作日处理；代码仅有 `requestAccountDeletion` 清本地 | 是否需要云函数侧删用户数据流程 |
| 本地 mock 战队 | `store` 含 `mock_team_*` 演示数据 | 正式环境是否剥离或仅在开发版注入 |

### 3.6 开发调试入口（提审前处理）

| 入口 | 说明 |
|------|------|
| `debugLevelComplete=1` | 直达关卡完成弹窗，便于 UI 调试 |
| `cloudTest=1` | 云连通测试场景 |
| `project.config.json` 编译模式 | 「模拟支付」「云开发连通测试」 |

提审前建议：确认正式版无法通过普通分享链接触发上述参数，或接受仅为开发者工具编译模式可见。

---

## 四、技术债 / 低优先级

- `battle.js` 音频链路大量 `console.log`（canplay/play/stop），建议与触控日志一样包 `isDevelopEnv()`
- `js/cloud.js` 初始化与用户数据 `console.log` 可在 release 关闭
- `store.recordFullClear` 含 10 分钟间隔、每日 20 次上限 — 与云端 `recordFullClear` 规则是否完全一致，需对照云函数逻辑
- 战队页对 `mock_team_*` 有特殊判断，与云端战队混用时注意测试

---

## 五、上线前检查清单（建议顺序）

1. **Git**：提交未入库文件 `js/legal-documents.js`、`js/engine/legal-modal.js` 及本会话所有修改
2. **云函数**：上传 `createTeam` 等含 `team-utils` 修复的函数；配置 `SUB_MCH_ID`；部署 `createOrder` / `payNotify`
3. **定时器**：控制台配置 `checkExpiredGifts`、`settleTeamRankRewards`、`clearExpiredInvite`
4. **真机回归**：
   - 微信登录成功/失败
   - 创建战队
   - 第 4 关通关后个人中心「今日通关」+1
   - 花束分享图生成与好友打开落地页
   - 图鉴购买（演示模式 / `realPay=1` 真支付各测一次）
   - 战队规则/说明类长文案弹窗无裁切
5. **合规**：核对隐私政策与实际 SDK（广告、支付、云开发）一致；反馈入口与文档描述对齐
6. **提审包**：确认 `packOptions.ignore` 含 `scripts`、`cloudfunctions` 等

---

## 六、审查人待办（给你）

- [ ] 阅读第三节，逐项勾选「做 / 不做 / 延期」
- [ ] 配置商户号与云定时触发器
- [ ] 重新部署战队相关云函数
- [ ] 真机完成第五节回归
- [ ] 决定首启隐私弹窗与反馈入口方案后告知，可再改一版

---

## 七、相关文档

- [前端云 API 说明](./frontend-cloud-api.md)
- [云函数 README](../cloudfunctions/README.md)
- 分享链路自测：`node scripts/share-flow-selftest.js`（仅本地，不打进小游戏包）
