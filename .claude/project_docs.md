# project_docs.md — MyAi App 项目结构

> 内容来自仓库实际文件（`src/`、`package.json`、`tsconfig.json`、`vite.config.ts`、`src/pages.json`、`src/manifest.json`）与 `@myai/sdk` 依赖关系；与代码冲突时按 `CLAUDE.md §1` 处置。

最后更新：2026-08-14

---

## 1. 总览

- **类型**：uni-app x 多端客户端。同一份 Vue 3 SFC 通过 uni CLI 编译到 H5 / iOS / Android / HarmonyOS NEXT / 微信小程序。
- **后端集成**：完全通过本地 file 依赖 `@myai/sdk`（`file:../myAi-sdk`）；不直接 `fetch` 后端 HTTP，不引入 SDK 之外的 HTTP 客户端。
- **能力边界**：本期实现 auth + conversations + keys + 流式 chat + 后端 URL 配置 + 设置；`media` / `push` 推迟到 v2（见 `REQUIREMENTS.md`）。

## 2. 关键目录与文件

```
myAi-app/
├── package.json                 # uni 脚本 + 依赖（SDK 用 file: 指向 ../myAi-sdk）
├── tsconfig.json                # extends @vue/tsconfig；@/* → ./src/*；types 含 @dcloudio/types
├── vite.config.ts               # @dcloudio/vite-plugin-uni
├── shims-uni.d.ts               # 让 Vue 组件 options 继承 App/Page 生命周期 hooks 类型
├── index.html                   # uni-app H5 模板入口；挂载 /src/main.ts
├── .gitignore                   # node_modules / unpackage* / .idea / logs 等
└── src/
    ├── App.vue                  # 应用入口；onLaunch/onShow/onHide
    ├── main.ts                  # createSSRApp 工厂（uni 规范入口）
    ├── env.d.ts                 # *.vue 模块声明（vite/client）
    ├── shime-uni.d.ts           # App/Page hooks 重复声明（与 shims-uni.d.ts 略有差异）
    ├── uni.scss                 # uni-app 内置 SCSS 变量（颜色 / 尺寸 / 间距）
    ├── pages.json               # 路由 + globalStyle + easycom
    ├── manifest.json            # appid / 版本 / 权限（Android 已配一组）
    ├── pages/
    │   ├── index/index.vue                       # 首页（placeholder；启动页）
    │   ├── config-backend/config-backend.vue     # 后端地址输入 + ping + rebuildSdk
    │   ├── login/login.vue                       # 登录 / 注册（tab 切换）
    │   ├── conversations/conversations.vue       # 对话列表（含软删折叠区）
    │   ├── conversation-detail/conversation-detail.vue  # 聊天详情 + SSE
    │   ├── keys/keys.vue                         # API Key CRUD + 设为默认
    │   └── settings/settings.vue                 # 用户信息 + 改后端 + 登出
    ├── sdk/index.ts             # SDK 单例（bootSdk / rebuildSdk / destroySdk / getSdk）
    └── static/
        └── logo.png
```

## 3. 启动序列

1. `index.html` 加载 `/src/main.ts` → `createSSRApp(App)`。
2. `App.vue` `onLaunch` → 计划中应 `import { bootSdk } from '@/sdk'; bootSdk();`（见 `REQUIREMENTS.md §5 已知缺口`）。
3. `bootSdk()` 读 `storage.getBackendUrl()`：
   - 为空 → 启动页进入 `pages/index/index`，由其路由决策（首启可走 `pages/config-backend`）。
   - 不为空 → `rebuildSdk(url)`，SDK 可用。
4. 页面通过 `getSdk()` 调业务；登录页用 `auth.login / register` + `auth.getCurrentUser` 写 `sdkState.currentUser`。

## 4. SDK 集成（`src/sdk/index.ts`）

- 平台存储探测（`pickAdapter`）：`globalThis.uni` 或 `globalThis.wx` 任一存在 → `UniStorageAdapter`；否则 → `LocalStorageAdapter`（`window.localStorage`）。
  - App 端走 `uni.*StorageSync` 同步 API；mp-weixin 运行时没有 `uni` 全局（uni-app x 把 `uni.*` 编译为模块内引用），`UniStorageAdapter` 内部回退 `wx.*StorageSync`（同名同签名）。
- `FetchHttpClient` 4010 回调同时调 `AuthService.notifyUnauthorized`（SDK 内部清 token + activeConversationId）与本仓库的 `handleUnauthorized`（清 `sdkState.currentUser` + `sdkStorage.clearToken / clearActiveConversationId`）。
- 4010 后由具体页面在 `catch` 或主动 `hasToken()` 检查时跳登录页（`uni.reLaunch({ url: '/pages/login/login' })`）。
- 切换后端 URL（settings 页）：`validateBackendUrl` → `rebuildSdk`。
- 登出（settings 页）：`auth.logout()`（SDK 清自身状态）+ `destroySdk()`（清 storage）。

## 5. 多端条件编译：使用 `#ifdef MP-WEIXIN` / `#ifdef APP-PLUS` 等。

- 当前代码没有平台分支（所有功能走 SDK），新增页面如需平台差异再补。
- `easycom` 已开启（`pages.json`）：`^uni-(.*)` → `@dcloudio/uni-ui/lib/uni-$1/uni-$1.vue`，引入 `uni-list / uni-forms / uni-icons` 等无需手动注册（按需替换原生 `view / input` 见 `REQUIREMENTS.md §5 #9`）。

## 6. 路由与样式

- 路由：纯声明式，`pages.json.pages` 第一项为启动页（`pages/index/index`，`navigationStyle: custom`）。
- 全局样式（`globalStyle`）：nav 文字黑色、背景 `#FFFFFF`，页面背景 `#F8F8F8`。
- 尺寸：响应式像素 `rpx`；变量优先用 `src/uni.scss` 既有变量名。
- 静态资源：`/static/...` 绝对路径引用。

## 7. 类型扩展注意事项

- `src/env.d.ts` 声明 `*.vue` 默认导出为 `DefineComponent`（配合 vite）。
- `shims-uni.d.ts`（根）与 `src/shime-uni.d.ts`（注意文件名 `shime` ≠ `shims`）都把 `App.AppInstance & Page.PageInstance` 挂到 Vue 的 `ComponentCustomOptions`。两者并存属历史模板残留；如非必要修改，保留原状（见 `CLAUDE.md §3 不顺手重构`）。
- `tsconfig.json` 用 `@vue/tsconfig` 基础 + 自己的 `baseUrl` / `paths`。

## 8. 构建与运行（脚本来自 `package.json`）

```bash
# 依赖
npm install

# H5（默认）
npm run dev:h5
npm run build:h5
npm run build:h5:ssr

# App（iOS / Android；HarmonyOS NEXT 走 app-harmony）
npm run dev:app
npm run dev:app-harmony
npm run build:app
npm run build:app-harmony

# 小程序
npm run dev:mp-weixin
npm run dev:mp-harmony
npm run build:mp-weixin
npm run build:mp-harmony

# 类型检查
npm run type-check
```

本期仅在 H5 上验证 `dev:h5` / `build:h5`；App / 小程序 / HarmonyOS NEXT 的运行时编译需 HBuilderX GUI（见 `REQUIREMENTS.md §5 #5-#7`）。

## 9. 依赖关系

| 依赖 | 用途 |
| --- | --- |
| `@dcloudio/uni-app`、`@dcloudio/uni-h5`、`@dcloudio/uni-app-plus`、`@dcloudio/uni-app-harmony`、各 `uni-mp-*` | uni-app x 各端运行时 |
| `@dcloudio/uni-components` / `@dcloudio/uni-ui` | easycom 组件库 |
| `@dcloudio/vite-plugin-uni`、`@dcloudio/uni-cli-shared` | 构建 |
| `vue` / `vue-i18n` | Vue 3 + i18n（**未挂载**） |
| `@myai/sdk` | 业务 SDK（核心依赖，本地 file 路径） |
| `@vue/tsconfig` / `vue-tsc` / `typescript` | 类型与检查 |

> 本期未引入 HTTP 客户端 / 状态管理库 / UI 库（除 uni-ui）；保持依赖最小化。

## 10. 已知缺口

- `App.vue` 当前只有 `console.log` 占位；尚未 `bootSdk()`。首启的 SDK bootstrap 接线待补（见 `REQUIREMENTS.md §5 #1`）。
- `vue-i18n` 已声明但 `main.ts` 未挂载；多语言推迟 v2。
- `src/manifest.json` 的 `appid` 为空；多端真机构建前需补齐。
- `easycom` 注册了 uni-ui，但当前 7 个页面仍使用原生 `view / input`（按 `REQUIREMENTS.md §5 #9` 留作低优先级替换项）。
- `shims-uni.d.ts` 与 `src/shime-uni.d.ts` 命名不一致，疑似历史模板残留；本期不修。