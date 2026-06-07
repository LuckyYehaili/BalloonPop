# BalloonPop 前端云函数调用指南

环境 ID：`cloud1-d2geerzff38fc214b`

## 前置条件

```javascript
// game.js 入口（已配置）
wx.cloud.init({ env: 'cloud1-d2geerzff38fc214b', traceUser: true });
```

所有云函数通过 `wx.cloud.callFunction` 调用。OPENID 由云函数侧 `cloud.getWXContext().OPENID` 自动获取，**前端无需传 openid**。

项目内已封装客户端模块：

| 模块 | 路径 |
|------|------|
| 登录 | `js/cloud-login.js` |
| 支付 | `js/cloud-pay.js` |
| 赠送 | `js/cloud-gift.js` |
| 战队 | `js/cloud-team.js` |

---

## 返回格式约定（重要）

后端存在 **三套** 返回格式，前端判断字段时请对应使用：

| 模块 | 成功判断 | 错误信息字段 | 业务数据 |
|------|----------|--------------|----------|
| login | 有 `openid` | — | `userInfo` |
| createOrder | `success === true` | `errMsg` | `outTradeNo`, `payment` |
| getOrder | `ok === true` | `errMsg` | `order` |
| 赠送 gift | `ok === true` | `reason` | `giftId` 等 |
| 战队 team | `success === true` | `msg` | `data` |

---

## 1. 登录 login

### 调用方式

```javascript
const { cloudLogin, syncBalloonInventoryFromCloud } = require('./js/cloud-login');

cloudLogin().then((res) => {
  if (!res.ok) {
    console.warn(res.reason);
    return;
  }
  // res.openid — 当前用户
  // res.userInfo — users 集合记录
  // res.inventorySync — 气球库存已同步
  // res.teamSync — 战队数据已同步
});
```

### 原始 callFunction

```javascript
wx.cloud.callFunction({ name: 'login', data: {} })
  .then(res => {
    const { openid, userInfo } = res.result;
  });
```

### 入参

无（OPENID 云端自动注入）。

### 返回示例

```json
{
  "openid": "oXXXX",
  "userInfo": {
    "openid": "oXXXX",
    "nickName": "微信用户",
    "level": 1,
    "score": 0,
    "createTime": 1716804000000,
    "updatedAt": 1716804000000
  }
}
```

### 前端后续动作

`cloudLogin()` 会自动：写入 `store.updateUser` → 拉取 `balloon_inventory` → `syncTeamFromCloud()`。

---

## 2. 下单支付 createOrder + getOrder

### 完整购买流程（推荐用封装）

```javascript
const { purchaseLegendBalloon, canUseRealPay } = require('./js/cloud-pay');
const { syncBalloonInventoryFromCloud } = require('./js/cloud-login');

// 开发版默认 mockPay，不会调 createOrder
purchaseLegendBalloon('legend_bubble_aurora', {
  priceYuan: 1.99,
  body: '传奇·极光泡泡'
}).then((res) => {
  if (res.channel === 'mock_pay') {
    // 本地模拟入账逻辑
    return;
  }
  // res.channel === 'cloud_pay'
  // res.outTradeNo, res.order（deliverStatus === 'DELIVERED'）
  return syncBalloonInventoryFromCloud();
});
```

### createOrder 原始调用

```javascript
wx.cloud.callFunction({
  name: 'createOrder',
  data: {
    balloonId: 'legend_bubble_aurora',  // 必填，与 balloons 表 id 一致
    totalFee: 199,                       // 必填，单位：分（1.99 元 = 199）
    body: '传奇·极光泡泡'                 // 可选，商品描述
  }
}).then(res => {
  const r = res.result;
  if (!r.success) throw new Error(r.errMsg);
  const { outTradeNo, payment } = r;
  wx.requestPayment({ ...payment, success: () => {}, fail: () => {} });
});
```

### createOrder 入参

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| balloonId | string | 是 | 气球 ID，如 `legend_bubble_aurora` |
| totalFee | number | 是 | 金额（**分**），必须 > 0 |
| body | string | 否 | 商品描述，默认「气球充值」 |

### createOrder 返回示例

成功：

```json
{
  "success": true,
  "outTradeNo": "ORD1716804000123abc",
  "payment": {
    "timeStamp": "...",
    "nonceStr": "...",
    "package": "...",
    "signType": "MD5",
    "paySign": "..."
  }
}
```

失败：

```json
{
  "success": false,
  "errMsg": "请配置 SUB_MCH_ID（云函数环境变量或 createOrder/index.js）"
}
```

### getOrder 调用

```javascript
wx.cloud.callFunction({
  name: 'getOrder',
  data: { outTradeNo: 'ORD1716804000123abc' }
}).then(res => {
  const { ok, order } = res.result;
  if (ok && order.deliverStatus === 'DELIVERED') {
    // 已发货
  }
});
```

### getOrder 入参

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| outTradeNo | string | 是 | createOrder 返回的订单号 |

### getOrder 返回示例

```json
{
  "ok": true,
  "order": {
    "outTradeNo": "ORD1716804000123abc",
    "openid": "oXXXX",
    "totalFee": 199,
    "balloonId": "legend_bubble_aurora",
    "status": "PAID",
    "deliverStatus": "DELIVERED",
    "balloonSent": true,
    "createTime": 1716804000000,
    "payTime": 1716804010000
  }
}
```

### 支付链路

```
createOrder → wx.requestPayment(payment)
  → payNotify（微信回调，前端不调用）
  → getOrder 轮询 deliverStatus === 'DELIVERED'
  → syncBalloonInventoryFromCloud()
```

---

## 3. 气球赠送 / 领取

### 赠送 sendBalloonGift

```javascript
const { sendBalloonGift } = require('./js/cloud-gift');

sendBalloonGift('legend_bubble_aurora', 1).then(result => {
  if (!result.ok) {
    showToast(result.reason);
    return;
  }
  // 分享深链，好友点击后领取
  wx.shareAppMessage({
    title: '送你一个传奇气球',
    query: 'giftId=' + encodeURIComponent(result.giftId)
  });
});
```

### sendBalloonGift 入参

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| balloonId | string | 是 | 气球 ID |
| count | number | 否 | 数量，默认 1，单次最多见云函数限制 |
| toOpenid | string | 否 | 指定接收人（当前实现可不传，链接领取） |

### sendBalloonGift 返回示例

```json
{
  "ok": true,
  "giftId": "gift_1716804000_abc123",
  "balloonId": "legend_bubble_aurora",
  "count": 1,
  "expireTime": 1716890400000
}
```

### 领取 claimBalloonGift

启动参数 `giftId` 已在 `game.js` 自动处理：

```javascript
const { claimBalloonGift } = require('./js/cloud-gift');
const { syncBalloonInventoryFromCloud } = require('./js/cloud-login');

claimBalloonGift('gift_1716804000_abc123').then(result => {
  if (result.ok) {
    syncBalloonInventoryFromCloud().then(() => showToast('领取成功'));
  } else {
    showToast(result.reason || '领取失败');
  }
});
```

### claimBalloonGift 入参

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| giftId | string | 是 | 赠送链接中的 giftId |

### claimBalloonGift 返回示例

```json
{
  "ok": true,
  "giftId": "gift_1716804000_abc123",
  "balloonId": "legend_bubble_aurora",
  "count": 1,
  "fromOpenid": "oSender"
}
```

---

## 4. 战队 createTeam / joinTeam / leaveTeam

### 封装调用（推荐）

```javascript
const cloudTeam = require('./js/cloud-team');

// 创建
cloudTeam.createTeam({
  name: '快乐气球队',
  description: '一起冲榜',
  joinType: 'open',           // 'open' | 'invite'
  iconKey: 'icon_balloon_01'
}).then(r => {
  if (r.success) console.log(r.data.teamId);
  else showToast(r.msg);
});

// 加入（公开战队）
cloudTeam.joinTeam('team_1716804000_abc').then(/* ... */);

// 加入（邀请制，需 token）
cloudTeam.joinTeam('team_1716804000_abc', 'invite_abc123').then(/* ... */);

// 退出
cloudTeam.leaveTeam().then(r => {
  if (r.success) showToast('已退出');
  else showToast(r.msg);
});
```

### createTeam 入参

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 2–16 字符，全局唯一 |
| description | string | 否 | 战队简介 |
| joinType | string | 否 | `open`（默认）或 `invite` |
| iconKey | string | 否 | 默认 `icon_balloon_01` |
| nickName | string | 否 | 队长昵称，默认「微信用户」 |
| avatar | string | 否 | 队长头像 URL |

### createTeam 返回

```json
{
  "success": true,
  "msg": "创建成功",
  "data": {
    "teamId": "team_1716804000_abc123",
    "name": "快乐气球队",
    "joinType": "open"
  }
}
```

### joinTeam 入参

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| teamId | string | 是 | 战队 ID |
| inviteToken | string | 条件 | `joinType === 'invite'` 时必填 |
| nickName | string | 否 | 成员昵称 |
| avatar | string | 否 | 成员头像 |

### joinTeam 返回

```json
{
  "success": true,
  "msg": "加入成功",
  "data": { "teamId": "team_...", "name": "快乐气球队" }
}
```

### leaveTeam 入参

无（OPENID 云端注入）。队长不可直接退出。

### leaveTeam 返回

```json
{
  "success": true,
  "msg": "已退出战队",
  "data": { "teamId": "team_..." }
}
```

封装函数在成功后会自动调用 `syncTeamFromCloud()` 刷新本地缓存。

---

## 5. 邀请链接 inviteToTeam / handleTeamInvite

### 生成邀请并分享

```javascript
const cloudTeam = require('./js/cloud-team');

cloudTeam.inviteToTeam('team_1716804000_abc123').then(r => {
  if (!r.success) return showToast(r.msg);
  const { teamId, inviteToken } = r.data;
  wx.shareAppMessage({
    title: '一起来「不准爆！」战队',
    query: 'teamId=' + encodeURIComponent(teamId)
         + '&inviteToken=' + encodeURIComponent(inviteToken)
  });
});
```

### inviteToTeam 入参

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| teamId | string | 是 | 须为当前用户所在战队 |

### inviteToTeam 返回

```json
{
  "success": true,
  "msg": "邀请已生成",
  "data": {
    "inviteId": "inv_...",
    "inviteToken": "invite_abc123",
    "teamId": "team_...",
    "expireTime": 1716890400000
  }
}
```

### 好友一键入队（深链）

启动参数已在 `game.js` + `js/scenes/team.js` 处理：

| 启动 query | 行为 |
|------------|------|
| `teamId` + `inviteToken` | 调 `handleTeamInvite(token, 'accept')` |
| 仅 `teamId` | 调 `joinTeam(teamId)`（公开战队） |

手动调用：

```javascript
cloudTeam.handleTeamInvite('invite_abc123', 'accept').then(r => {
  if (r.success) showToast('加入成功');
  else showToast(r.msg);
});

// 拒绝（不入队，不消耗邀请）
cloudTeam.handleTeamInvite('invite_abc123', 'reject');
```

### handleTeamInvite 入参

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| inviteToken | string | 是 | 邀请 token |
| action | string | 否 | `accept`（默认）或 `reject` |
| nickName | string | 否 | 入队昵称 |
| avatar | string | 否 | 入队头像 |

---

## 6. 通关计分 recordFullClear

在 **完整 4 关通关** 时调用（`battle.js` 第 4 关完成处已接入）：

```javascript
const cloudTeam = require('./js/cloud-team');

cloudTeam.recordFullClear('level_04').then(r => {
  if (r.success) {
    // r.data.teamId, r.data.periodKey 如 "2026-W22"
  } else {
    // 未入队、10 分钟内重复计分等
    console.warn(r.msg);
  }
});
```

### 入参

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| level | string | 否 | 默认 `level_04` |
| isFullRun | boolean | 是 | 必须为 `true`，否则不计分 |

### 返回示例

```json
{
  "success": true,
  "msg": "计分成功",
  "data": {
    "teamId": "team_...",
    "periodKey": "2026-W22"
  }
}
```

失败示例：

```json
{
  "success": false,
  "msg": "未加入战队，不计入战队积分",
  "data": {}
}
```

---

## 7. 战队数据同步（只读，非云函数）

```javascript
const cloudTeam = require('./js/cloud-team');
const store = require('./js/store');

cloudTeam.syncTeamFromCloud().then(() => {
  const team = store.getTeam();           // 我的战队（含 periodClears 周榜积分）
  const ranked = store.getRankedTeams();  // 本周周榜
});
```

直接读库时需索引：`team_members` 复合索引 `openid + leaveTime`。

---

## 8. 前后端字段对齐检查结果

| 接口 | 状态 | 说明 |
|------|------|------|
| login | ✅ | 前端读 `openid` / `userInfo`；与后端一致 |
| createOrder | ✅ | `balloonId`, `totalFee`(分), `body` 对齐 |
| getOrder | ✅ | `outTradeNo` 入参；`deliverStatus` / `balloonSent` 轮询对齐 |
| sendBalloonGift | ✅ | `balloonId`, `count`；返回 `giftId` 用于分享 query |
| claimBalloonGift | ✅ | `giftId` 入参与启动参数一致 |
| createTeam | ✅ | `name`, `description`, `joinType`, `iconKey`, `nickName`, `avatar` |
| joinTeam | ✅ | `teamId`, `inviteToken`, `nickName`, `avatar` |
| leaveTeam | ✅ | 无入参；返回 `data.teamId` |
| inviteToTeam | ✅ | `teamId`；返回 `data.inviteToken` |
| handleTeamInvite | ✅ 已部署 | `inviteToken`, `action`, `nickName`, `avatar` |
| recordFullClear | ✅ | `level`, `isFullRun: true` 必填 |

### periodClears 字段（全量巡检）

- 全仓库已无 `dailyTotalClears` / `dailyClears` / `teamDailyClears`。
- 页面取值：`home.js`、`team.js` 均读 `team.periodClears` / `member.periodClears`。
- 数据层：`cloud-team.js` `_mapTeamDoc` / `_mapRankRow` 输出字段为 `periodClears`（周榜来自 `team_period_stats.totalClears`）。

### 四套返回格式 · 前端判断对照

| 模块 | 封装 | 成功 | 失败 | 主要调用点 |
|------|------|------|------|------------|
| login | `cloud-login.js` | `r.ok` | `r.reason` | `home.js` |
| 支付下单 | `cloud-pay.js` | `result.success` | `result.errMsg` | 封装内 reject |
| 支付查询 | `cloud-pay.js` | `r.ok` + `order` | 返回 `null` | `pollOrderDelivered` |
| 赠送 | `cloud-gift.js` | `result.ok` | `result.reason` | `collection.js`, `game.js` |
| 战队 | `cloud-team.js` | `r.success` | `r.msg` | `team.js`, `home.js` |

各调用点均已使用对应字段，未发现混用（如对 gift 用 `success`、对 team 用 `ok` 等）。

### 已知差异（非 bug）

1. **返回格式四套并存**（见上表），封装层已隔离，页面勿跨模块复用判断字段。
2. **login 首登不写 avatar**；战队 `nickName`/`avatar` 来自 `store.getUser()`。
3. **mockPay=1** 时不走 `createOrder`；真支付成功后应 `syncBalloonInventoryFromCloud()`（`collection.js` / `battle.js` 已对齐）。
4. **store 本地 legacy API**（`createTeam` 等）页面已不再调用，仅作离线兜底。

---

## 9. 开发阶段联调清单

> 定时触发器上线前再在控制台配置；现阶段用**微信开发者工具 → 云开发 → 云函数 → 云端测试**手动验证。

### 9.1 定时云函数（手动云端测试）

| 函数 | 测试入参 | 预期结果 |
|------|----------|----------|
| `checkExpiredGifts` | `{}` 或 `{ "limit": 50 }` | `{ ok: true, processed, expired, errors }`；`gifts.status` → `expired`，赠送人库存退回 |
| `settleTeamRankRewards` | `{ "periodKey": "2026-W21" }` | `{ success: true, data: { periodKey, settledTeams, grantedUsers, results } }`；`team_period_stats.settled=true`；成员 `balloon_inventory` 入账 |
| `clearExpiredInvite` | `{}` | 过期 `team_invites` → `expired`（可选） |

**settleTeamRankRewards 前置**：目标 `periodKey` 下需有 `team_period_stats`（`settled: false`、`totalClears > 0`）及在队成员。

### 9.2 前端业务流程

| 流程 | 路径 | 成功判据 | 返回格式 |
|------|------|----------|----------|
| 登录 | 首页授权 / 启动 `cloudLogin` | `r.ok`；库存+战队同步 | `ok` / `reason` |
| 支付 mock | 图鉴/战斗购买（开发版） | `channel: mock_pay` | — |
| 支付真 | `realPay=1` + `SUB_MCH_ID` | `success` → 收银台 → `deliverStatus=DELIVERED` → 同步库存 | `success/errMsg` + `ok` |
| 赠送 | 图鉴 → 分享 `giftId=` | `result.ok` | `ok` / `reason` |
| 领取 | 深链 `giftId` | `result.ok` → 同步库存 | `ok` / `reason` |
| 战队 CRUD | 战队页 / 深链 | `r.success` | `success` / `msg` / `data` |
| 通关计分 | 4 关完整通关 | `r.success` → `syncTeamFromCloud`；`periodClears` +1 | `success` / `msg` |

### 9.3 巡检结论（2026-05）

- 全仓库无 `dailyTotalClears` 别名；页面统一 `periodClears`。
- 四套返回格式在各调用点判断正确，无混用。
- 深链 `teamId` / `giftId`：`game.js` 先 `cloudLogin` 再执行业务，避免 OPENID 竞态。
- 真支付：`collection.js` / `battle.js` 仅 `syncBalloonInventoryFromCloud`，不重复本地入账。
- `handleTeamInvite` 已部署；定时触发器开发阶段跳过，上线前再配。
