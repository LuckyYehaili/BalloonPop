# 云数据库连通测试（小程序页面版）

本目录是**独立微信小程序工程**，用于测试云环境 `cloud1-d2geerzff38fc214b` 与 `users` 集合。

## 如何运行

1. 打开微信开发者工具
2. **导入项目** → 选择本目录 `cloud-connect-mp`（不要选仓库根目录）
3. 确认云开发环境为 `cloud1-d2geerzff38fc214b`
4. 在 `users` 集合添加测试数据（openid: `test_user_001`）
5. 编译运行，首页即显示连通结果

## 与主游戏的关系

仓库根目录 `BalloonPop` 的 `compileType` 为 **小游戏**（`game.js`），不会加载 `app.js` / `pages/`。  
小游戏内可用启动参数 `cloudTest=1` 打开 Canvas 版测试页，或继续使用本小程序工程做 WXML 页面测试。

## 云函数部署（推荐入口）

小游戏工程内上传云函数若失败或卡住，**请在本目录部署**（共用同一份 `../cloudfunctions/`）：

1. 微信开发者工具 → **导入项目** → 选择 `cloud-connect-mp`
2. 云开发面板 → 环境选 `cloud1-d2geerzff38fc214b`
3. 云函数列表找到 `createOrder`（及 `payNotify`、`login` 等）→ 右键 **上传并部署：云端安装依赖**
4. 若云端安装超时：在终端执行 `cd ../cloudfunctions/createOrder && npm install`，再选 **上传并部署：所有文件**

`createOrder` 已固定 `wx-server-sdk@~2.6.3` 并包含 `config.json`，避免 `latest` 在云端装依赖失败。
