# 云函数说明（BalloonPop）

环境 ID：`cloud1-d2geerzff38fc214b`

## 函数列表

| 函数 | 作用 |
|------|------|
| `login` | 按 OPENID 查询/创建 `users` |
| `createOrder` | 创建 `orders` + 统一下单 |
| `payNotify` | 支付回调：写 `pay_callbacks`、发货 `balloon_inventory` |
| `getOrder` | 客户端轮询订单发货状态 |
| `sendBalloonGift` | 发起赠送：扣减 `balloon_inventory`，写入 `gifts`（pending） |
| `claimBalloonGift` | 领取赠送：更新 `gifts`（claimed），接收人入账 |
| `checkExpiredGifts` | 定时任务：过期 pending 礼物退回赠送人 |

### 战队冲榜（周榜）

| 函数 | 作用 |
|------|------|
| `createTeam` | 创建战队（校验当日次数，写入 `teams` / `team_members`） |
| `joinTeam` | 加入战队（公开 / 邀请两种，`inviteToken` 可选） |
| `leaveTeam` | 退出战队（队长不可直接退） |
| `inviteToTeam` | 生成邀请链接（`inviteToken`，单次有效） |
| `handleTeamInvite` | 接受 / 拒绝邀请 |
| `recordFullClear` | 完整 4 关通关计分（`isFullRun: true`） |
| `settleTeamRankRewards` | **周日 9:00** 检查**周榜前 5**，结算上一自然周并发放传奇气球 |
| `renameTeam` | 修改战队名称 |
| `disbandTeam` | 队长解散战队 |
| `clearExpiredInvite` | 定时：标记过期邀请 |

**周期**：自然周（周日 00:00 ~ 周六 23:59，UTC+8）；积分写入 `team_period_stats.periodKey`（如 `2026-W22`）。  
**发奖**：定时触发 `0 0 9 * * 0 *`（每周日 9:00）；手动测试可传 `{ periodKey: '2026-W21' }`。  
**共享代码**：战队函数目录内自带 `response.js`、`team-utils.js`（与 `sendBalloonGift/gift-utils.js` 相同模式，上传单函数即可部署）。`cloudfunctions/` 下勿再放无 `index.js` 的子目录。

## 集合与索引

### `balloon_inventory`
- 字段：`openid`, `balloonId`, `count`, `source`（`purchase` | `gift`）, `giftable`
- 唯一索引：`openid` + `balloonId`
- 仅 `source: purchase` 且 `giftable: true` 可赠送

### `gifts`
- 字段：`giftId`, `fromOpenid`, `toOpenid`, `balloonId`, `count`, `status`（`pending` | `claimed` | `expired`）, `createTime`, `expireTime`
- 领取成功额外写入：`claimTime`；过期处理写入：`expiredAt`
- 唯一索引：`giftId`
- 普通索引：`fromOpenid`+`status`、`toOpenid`+`status`、`expireTime`+`status`

### 战队（7 集合）
- `teams` / `team_members` / `team_invites` / `team_daily_actions` / `team_period_stats` / `team_rank_rewards` / `team_clear_logs`
- 权限：所有用户可读，仅创建者可读写（业务写入由云函数管理员 SDK 完成）
- 周榜积分字段：`teams.periodClears`、`team_period_stats.totalClears`（非日切清零）

### 赠送规则
- 有效期 24 小时；每日赠送/领取各 20 **次**（按礼物单计）
- 资产变动均在云函数事务内完成
- iOS 可赠送本人购买的气球（跨设备以云端库存为准）

## 部署前配置

1. **子商户号**（`createOrder` 必填）  
   云开发控制台 → 云函数 → `createOrder` → 配置 → 环境变量：  
   - `SUB_MCH_ID` = 你的子商户号  
   - `CLOUD_ENV_ID` = `cloud1-d2geerzff38fc214b`（可选，默认已写）

2. **上传部署**  
   每个函数目录右键：**上传并部署：云端安装依赖**（推荐）。  
   若云端装依赖超时，可先在本地 `cd cloudfunctions/createOrder && npm install`，再选 **上传并部署：所有文件**。

3. **小游戏工程内上传失败时**  
   根目录 `compileType: game`，部分开发者工具版本在云函数面板上传不稳定。  
   请改用 **`cloud-connect-mp/` 独立小程序工程** 导入并部署（其 `cloudfunctionRoot` 已指向 `../cloudfunctions/`）：
   - 工具 → 导入项目 → 选 `cloud-connect-mp`
   - 确认云环境 `cloud1-d2geerzff38fc214b`
   - 左侧云函数列表 → 右键 `createOrder` → 上传并部署：云端安装依赖
   - 支付链路还需同步部署 `payNotify`、`getOrder`

4. **数据库权限**  
   - `users` / `orders` / `balloon_inventory`：用户仅可读写自己的数据（或开发期按需放宽）  
   - `pay_callbacks`：建议仅云函数可写

## 小游戏调试（软著 / 商户号未就绪期间）

**默认即可模拟购买，不必配置 `SUB_MCH_ID`：**

| 环境 | 行为 |
|------|------|
| 开发者工具「开发版」 | 自动 `mock_pay`，不进微信收银台 |
| 体验版 `trial` | 同上 |
| 正式版 `release` | 需配商户号 + 真支付 |

可选启动参数：

- `mockPay=1`：强制模拟（编译模式里已内置「模拟支付」）
- `realPay=1`：商户号配好后，在开发版强制测真支付
- `cloudTest=1`：云库连通页

iOS：购买入口已隐藏/拦截（平台规则）。

## 开发阶段：定时函数手动测试

控制台暂无法配置定时触发器时，在**微信开发者工具**中：

1. 云开发 → 云函数 → 选中函数 → **云端测试**
2. `checkExpiredGifts`：入参 `{}`，检查 `gifts` 过期回收与库存退回
3. `settleTeamRankRewards`：入参 `{ "periodKey": "2026-W21" }`（换成有数据的周期），检查 `team_rank_rewards`、`balloon_inventory`
4. `clearExpiredInvite`：入参 `{}`，检查过期邀请标记

上线前再在控制台为 `checkExpiredGifts`、`settleTeamRankRewards`（`0 0 9 * * 0 *`）、`clearExpiredInvite` 配置定时触发器即可，**无需改代码**。

完整前端联调步骤见 [`docs/frontend-cloud-api.md`](../docs/frontend-cloud-api.md) §9。

## 支付链路

```
purchaseLegendBalloon → createOrder → wx.requestPayment
  → payNotify → orders + balloon_inventory
  → getOrder 轮询 → 本地 store.addBalloon
```
