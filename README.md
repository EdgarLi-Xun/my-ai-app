# MyAi App

MyAi 移动客户端 —— 基于 uni-app x（Vue 3 + Vite + TypeScript），一份代码编译到 H5 / iOS / Android / HarmonyOS NEXT / 微信小程序。

后端零改动：全部业务能力（认证、对话、消息、API Key、SSE 流式）通过本地共享 SDK `@myai/sdk` 消费，与 Web 前端共用同一套 SDK。

## 环境要求

- Node ≥ 18
- 同级目录存在 SDK 仓库 `../my-ai-sdk`（`package.json` 以 `file:../my-ai-sdk` 引用），且已构建：

```bash
cd ../my-ai-sdk
npm install
npm run build   # 产出 dist/，App 通过 .d.ts + dist/index.js 消费
```

## 快速开始

```bash
npm install

# 本地运行
npm run dev:h5              # H5（默认）
npm run dev:app             # iOS / Android（需 HBuilderX 打开运行）
npm run dev:app-harmony     # HarmonyOS NEXT App
npm run dev:mp-weixin       # 微信小程序
npm run dev:mp-harmony      # 鸿蒙小程序

# 生产构建（与上一一对应）
npm run build:h5
npm run build:app
npm run build:app-harmony
npm run build:mp-weixin
npm run build:mp-harmony

# 类型检查
npm run type-check          # vue-tsc --noEmit
```

各端运行方式：

- **H5**：`dev:h5` 直接起本地服务。
- **App（iOS / Android / HarmonyOS NEXT）**：`dev:app` / `dev:app-harmony` 产出后需 HBuilderX GUI 连接真机 / 模拟器运行。
- **微信小程序**：`build:mp-weixin`（或 `dev:mp-weixin`）产出 `dist/build/mp-weixin`（开发模式为 `dist/dev/mp-weixin`），用微信开发者工具导入该目录；修改代码后需重新编译。

## 后端地址

- 首次启动无已存地址时使用 `DEFAULT_BACKEND_URL`（定义在 `src/sdk/index.ts`）。
- 用户可在设置页修改后端地址；保存前经 `validateBackendUrl` 校验（ping `GET /api/providers`）。
- 地址持久化在存储键 `myai.backendUrl`。
- 微信小程序正式环境要求 HTTPS 合法域名（开发者工具可临时关闭域名校验调试）。

## 目录结构

```
src/
├── App.vue                    # 应用入口（onLaunch / onShow / onHide）
├── main.ts                    # createSSRApp 工厂
├── pages.json                 # 路由与全局样式（第一项为启动页）
├── manifest.json              # appid / 平台权限 / 模块配置
├── uni.scss                   # uni-app 主题变量
├── pages/                     # 页面（每页一个目录）
│   ├── index/                 # 启动页（路由决策）
│   ├── config-backend/        # 后端地址配置
│   ├── login/                 # 登录 / 注册
│   ├── conversations/         # 对话列表（含软删折叠区）
│   ├── conversation-detail/   # 聊天详情 + SSE 流式
│   ├── keys/                  # API Key 管理
│   └── settings/              # 设置（用户信息 / 改后端 / 登出）
├── sdk/
│   ├── index.ts               # SDK 单例启动器（bootSdk / rebuildSdk / destroySdk / getSdk）
│   └── fetch-polyfill.ts      # App 端 fetch / AbortController / TextEncoder 垫片
├── components/                # 公共组件
└── static/                    # 静态资源（/static/... 引用）
```

## 测试

本仓库不含单元测试；单元测试与覆盖率在 `@myai/sdk`（`../my-ai-sdk`，vitest）：

```bash
cd ../my-ai-sdk
npm test
```

## 文档

- `.claude/PLAN.md` — 任务计划与修改日志
- `.claude/api.md` — 接口契约（SDK 模块 / 端点 / 业务码）
- `.claude/project_docs.md` — 项目结构与启动序列
- `.claude/REQUIREMENTS.md` — 需求与决策记录
- `docs/` — ADR（架构决策记录）

## License

私有项目，暂不对外。
