# 云函数说明（BalloonPop）

环境 ID：`cloud1-d2geerzff38fc214b`

## 函数列表

| 函数 | 作用 |
|------|------|
| `login` | 按 OPENID 查询/创建 `users` |
| `createOrder` | 创建 `orders` + 统一下单 |
| `payNotify` | 支付回调：写 `pay_callbacks`、发货 `balloon_inventory` |
| `getOrder` | 客户端轮询订单发货状态 |

## 部署前配置

1. **子商户号**（`createOrder` 必填）  
   云开发控制台 → 云函数 → `createOrder` → 配置 → 环境变量：  
   - `SUB_MCH_ID` = 你的子商户号  
   - `CLOUD_ENV_ID` = `cloud1-d2geerzff38fc214b`（可选，默认已写）

2. **上传部署**  
   每个函数目录右键：安装依赖 → 上传并部署（云端安装依赖）

3. **数据库权限**  
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

## 支付链路

```
purchaseLegendBalloon → createOrder → wx.requestPayment
  → payNotify → orders + balloon_inventory
  → getOrder 轮询 → 本地 store.addBalloon
```
