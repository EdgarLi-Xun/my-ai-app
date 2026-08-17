# PLAN — myAi-app（Phase 2 of 第 17 次对话）

> Phase 2 实施计划：把 ADR 0006 设计的 uni-app x App 仓库落地。
> Phase 2 implementation plan for ADR 0006 uni-app x app.

## 修改日志

- `2026-08-14` — 创建本 PLAN.md；从 dcloudio/uni-preset-vue#vite-ts 模板初始化项目；定制 package.json + manifest.json + pages.json；启动 T9 → T10。
- T11/T12 待续。
- `2026-08-15` — 修正 SDK file: 路径大小写：`file:../myAi-sdk` → `file:../my-ai-sdk`（实际目录是 kebab-case），删除悬空 symlink 并 `npm install` 重建；`vue-tsc --noEmit` 通过。
- `2026-08-15` — 新增默认后端 URL 常量 `DEFAULT_BACKEND_URL = 'http://192.168.2.103:8031'`（`src/sdk/index.ts`），`bootSdk()` 在 storage 无值时 fallback；`config-backend.vue` 的 input placeholder 同步更新。
- `2026-08-15` — 修复 App 端登录 `TypeError: f is not a function`：`@myai/sdk` 的 `FetchHttpClient` 假设 `globalThis.fetch` 存在，但 uts 运行时未注入（仅 H5 / Node 20+ 有原生 fetch）。新增 `src/sdk/fetch-polyfill.ts`，在 `src/sdk/index.ts` 顶部安装一个 fetch 形状的 `uni.request` shim；H5 / Node 因原生 fetch 存在则跳过安装。`vue-tsc --noEmit` 通过。
- `2026-08-15` — 修复 conversation-detail 发送消息后 `[Vue warn]: Unhandled error during execution of native event handler`：polyfill Response 缺 `body`，SDK 流式在 `res.body.getReader()` 抛错，IIFE catch 后 `finishStream(err)` reject `donePromise`，因没人 `await` 形成 unhandled rejection → Vue 归到 native event handler。给 polyfill Response 加了一个立即关闭的 reader stub：`{ getReader() => { read: async () => ({done:true}) } }`。副作用：App 端 SSE 流式不会真的吐 token（uni.request 非流式）；真 SSE 需另起 `enableChunked` + `onChunkReceived` 任务。`vue-tsc --noEmit` 通过。
- `2026-08-15` — 修复 `ReferenceError: AbortController is not defined`（conversation-detail 触发）：uts 运行时和 fetch 一样未注入 `AbortController`，SDK 在 `streaming/index.ts:220` 直接 `new AbortController()` 炸。`fetch-polyfill.ts` 加最小 `AbortController`/`AbortSignal` shim（覆盖 `signal.aborted` / `signal.reason` / `signal.addEventListener('abort', _, {once:true})` / `abort(reason?)` / `onabort` getter/setter）；`src/sdk/index.ts` 多调一次 `ensureGlobalAbortController()`。`vue-tsc --noEmit` 通过。
- `2026-08-15` — conversation-detail 改为左右分栏布局：原本 `.message` 是 `inline-block` + `margin-left: auto`，但 `margin-left: auto` 只在父级是 flex/grid 时才推得动，App 端没真正右对齐。改造为 `.message` 是 flex row（`.msg-user → justify-content:flex-end`，`.msg-assistant → flex-start`），里面新增一层 `.bubble` 承载 max-width / 背景 / 边框；template 把两条 `<text>` 包进 `<view class="bubble">`；`@longpress` 从 `.message` 移到 `.bubble`（避免空白处误触）。`vue-tsc --noEmit` 通过。
- `2026-08-15` — 记住密码 + 密码框小眼睛：经 10 轮 grilling 形成 ADR 0007（`docs/ADR-0007-remember-password-and-password-input.md`，与 `.claude/` 内 PLAN/REQUIREMENTS 分离，单独放 `docs/`）。决定：多账号本地明文缓存（上限 3 + LRU 按登录成功时间），login/register 双 tab 加 `记住密码` 勾选框默认勾选，列表项点击 + 邮箱框失焦匹配预填，长按删除单项，4010/logout/反勾选登录成功 三重清凭据；新建 `<PasswordInput>` 公共组件，`uni-icons` 的 `eye-slash` / `eye` 切换，三处复用（login 密码 / register 密码 / keys 页 API Key）。代码改动未启动，本轮仅文档落地。
- `2026-08-15` — 升级 `@dcloudio/*` 8 个包从 `3.0.0-5020420260813001` → `3.0.0-5020420260813002`（vue3 通道 patch 升级），`npm install` 同步 lockfile，`type-check` 通过、`build:h5` 产物正常。**预期目的未达成**：Sass `legacy-js-api` deprecation 警告来自 Vite 5.2.8 ↔ sass 1.102.0 的已知上游问题，与 uni-app 包版本无关，等 Dart Sass 2.0 或 Vite 上游迁 modern API。按用户选择 A（接受警告），不回滚升级、不改 vite.config。
- `2026-08-17` — 修复登出后再登录报 `SdkNotBootedError`（T27）。根因：`settings.vue` 登出调 `destroySdk()` 置空 bundle，但没复位 `state.initialized`（`bootSdk()` 因此永远早退），且 `bootSdk()` 只在 `onLaunch` 冷启动执行 → 同一运行上下文内再进登录页 `getSdk()` 抛错（各端通用，此前未走过登出→再登录路径）。修复：`destroySdk()` 复位 `state.initialized = false`；`login.vue` onLoad 时 `if (!isSdkReady()) bootSdk()` 兜底重建。`vue-tsc --noEmit` 通过、`build:mp-weixin` 产物已验证。注：登出后 backendUrl 被清（既有设计），再登录走 `DEFAULT_BACKEND_URL` 兜底。
- `2026-08-17` — 修复微信小程序切换后端地址报「校验失败：URL格式无效」（T28）。根因：mp-weixin 沙箱没有全局 `URL` 构造器，SDK `validateBackendUrl` 里 `new URL()` 直接抛错 → 所有地址被误判格式无效；且 vendored bundle 内裸 `fetch` / `AbortController` 不解析到 globalThis 属性。修复：① SDK（my-ai-sdk T10）改用轻量正则解析器 `parseBackendUrl()`（scheme://authority → origin，兼容 IPv6 字面量与端口校验，拒绝 userinfo），fetch / AbortController 一律经 `globalThis` 显式读取（fetch 缺失返回明确错误；AbortController 缺失时 Promise.race 兜底超时），新增 3 条单测，vitest 111/111；② App `src/sdk/index.ts` 把 `validateBackendUrl` 纳入 `injectFetchImpl` 包装（扩展 `minArgs` 参数：调用方省略 options 对象时自动补 `{ fetchImpl: globalThis.fetch }`），不再从 `@myai/sdk` 直接 re-export。`vue-tsc --noEmit` 通过、`build:mp-weixin` 产物确认包装（minArgs=2）与新版校验器均已编入且无 `new URL(` 调用。**待用户在微信开发者工具重新编译后复验 设置→修改后端地址。**
- `2026-08-17` — 修复微信小程序登录报「服务异常」（T26）。根因：mp-weixin 运行时没有 `uni` 全局（编译产物中 `uni.*` 变成 `vendor.index.*` 模块内引用），`pickAdapter()` 落到 `LocalStorageAdapter`，小程序沙箱无 `localStorage` → `setToken`/`getToken` 静默失效 → 登录成功后 `GET /api/auth/me` 不带 Authorization → 后端匿名请求在 `AuthServiceImpl.getCurrentUser` 抛 `ClassCastException` → 兜底 5000「服务异常」。修复：SDK `UniStorageAdapter` 构造回退 `globalThis.uni ?? globalThis.wx`（wx.*StorageSync 同名同签名，新增 2 条单测）；App `pickAdapter()` 改为 uni / wx 任一存在即选 `UniStorageAdapter`。SDK 108/108 测试通过、双端 typecheck 通过、`build:mp-weixin` 产物已验证含回退逻辑。**待用户在微信开发者工具中实机复验登录。**

---

## 任务进度

| # | 任务 | 状态 |
| --- | --- | --- |
| T9 | 初始化 App 项目骨架 | ✅ 已完成（2026-08-14） |
| T10 | SDK 集成 + 全局单例 | ✅ 已完成（2026-08-14） |
| T11 | 7 个页面（index / config-backend / login / conversations / conversation-detail / keys / settings） | ✅ 已完成（2026-08-14） |
| T12 | 验证（dev:h5 200 + build:h5 出 dist/ + types） | ✅ 已完成（2026-08-14） |
| T13 | 记住密码 + PasswordInput 组件（ADR 0007 落地） | 🚧 进行中（2026-08-15 仅文档；代码待启动） |
| T14 | 调查"动画结束消息没有出来"(`conversation-detail` 思考动画 → 流式结束) | ✅ 已完成（2026-08-15） |
| T14b | App 端 `done→load` 窗口思考动画闪一下 | ✅ 已完成（2026-08-15） |
| T14c | App 消息不显示 + 默认滚动到底 | ✅ 已完成（2026-08-15） |
| T15 | 对接后端自动命名（race condition：跨页 emit/on） | ✅ 已完成（2026-08-15） |
| T16 | 对话详情顶部显示标题（自定义 topbar + 跨页 emit 重拉） | ✅ 已完成（2026-08-15） |
| T17 | 系统导航栏同步对话标题（解决"对话二字还在"） | ✅ 已完成（2026-08-15） |
| T18 | conversation-detail 走全自定义 navigation（隐藏系统栏） | ⛔ 已回退（2026-08-15） |
| T19 | 详情页回退到系统导航栏（撤销 T18） | ✅ 已完成（2026-08-15） |
| T20 | URL 带标题 + 删自定义 topbar（单 system bar） | ✅ 已完成（2026-08-15） |
| T21 | 新对话路径 system bar 改为 "新对话"（双钩子写）+ pages.json 兜底改字 | ✅ 已完成（2026-08-15） |
| T22 | 自动命名完成后 system bar 同步（4s 重试兜底） | ✅ 已完成（2026-08-15） |
| T23 | H5 DOM 直接驱动 system bar（绕开 setNavigationBarTitle 不生效） | ✅ 已完成（2026-08-16） |
| T24 | 已删除区支持长按永久删除 | ✅ 已完成（2026-08-16） |
| T25 | 发版本：图标 + 启动页 + H5 favicon（程序化占位） | ✅ 已完成（2026-08-16） |
| T26 | 修复微信小程序登录「服务异常」（token 存储静默失效） | ✅ 已完成（2026-08-17，待用户在开发者工具复验） |
| T27 | 修复登出后再登录 `SdkNotBootedError`（destroySdk 不复位 initialized） | ✅ 已完成（2026-08-17，待用户复验） |
| T28 | 修复小程序切换后端地址「URL格式无效」（SDK 去 `URL` 依赖 + App `validateBackendUrl` 注入 fetchImpl） | ✅ 已完成（2026-08-17，待用户在开发者工具复验） |

### T26 结果摘要（mp-weixin 登录存储修复）

- **现象**：小程序点登录报「服务异常」；`POST /api/auth/login` 成功，随后 `GET /api/auth/me` 5000。App / H5 正常。
- **根因**：mp-weixin 运行时无 `uni` 全局（编译产物里 `uni.reLaunch` → `vendor.index.reLaunch`），`pickAdapter()` 判 `globalThis.uni` 为 undefined → 选 `LocalStorageAdapter` → 小程序沙箱无 `localStorage` → token/backendUrl/记住凭据全部静默丢写。无 token 的 `/me` 被后端当匿名，`AuthServiceImpl.getCurrentUser` 强转 `AuthPrincipal` 抛 `ClassCastException` → `GlobalExceptionHandler` 兜底 5000「服务异常」。
- **修复**：
  1. `@myai/sdk` `src/storage/index.ts`：`UniStorageAdapter` 构造 `globalThis.uni ?? globalThis.wx`（`wx.*StorageSync` 同名同签名）；`index.test.ts` 增 2 用例（wx 回退 roundtrip、uni 优先于 wx），108/108 通过，`npm run build` 出 dist。
  2. `src/sdk/index.ts` `pickAdapter()`：`uni` / `wx` 任一存在即选 `UniStorageAdapter`。
- **验证**：SDK typecheck + vitest 108/108；App `vue-tsc --noEmit` 通过；`build:mp-weixin` 产物确认 `this.uni=e.uni??e.wx` 与新 pickAdapter 条件均已编入。
- **遗留**：后端 `/api/auth/me` 对匿名请求应返回 4010 而非 5000（`my-ai` 仓库另行处理）；`fetch-polyfill.ts` / `login.vue` 的诊断日志保留，复验后可清理。

### T25 结果摘要（图标 / 启动页）

- **背景**：发版本需要 iOS/Android/HarmonyOS/H5 全套图标 + 启动页；repo 无任何图片资源；环境无 PIL / ImageMagick；用户授权我自行设计占位。
- **设计**（统一一套，避免平台割裂）：
  - 紫渐变 `#667eea → #764ba2`（与 `index/index.vue` 已有 `.splash` 同色）
  - iOS superellipse 近似圆角蒙版（22.5% radius）
  - 主体：白色大写 "M"（代表 MyAi）
  - 右上三颗白色小圆点"星"，暗示 AI
- **改动**：
  - 新增 `tools/generate-assets.mjs`：jimp 程序化生成。
  - 产出文件：
    - `src/static/app-plus/icon.png` 1024×1024（HBuilderX 编译时自动拆 iOS + Android 多尺寸）
    - `src/static/app-plus/splash.png` 750×1334（iOS/Android 通用 splash）
    - `src/static/app-harmony/icon.png` 1024×1024（HarmonyOS 入口）
    - `src/static/app-harmony/splash.png` 750×1334
    - `public/favicon.png` 32×32（H5）
    - `public/apple-touch-icon.png` 180×180（H5 iOS 加书签）
  - `index.html`：补 `<link rel="icon">` + `<link rel="apple-touch-icon">` 与 `<title>MyAi</title>`。
- **不动**：`src/manifest.json` 的 `splashscreen` 配置（始终靠系统 + Vue `index/index.vue` 渐变页 + HBuilderX 在 App 端用 splash.png）。若要换 HBuilderX 自己的 native splash 控制，需在 GUI 端设置；本仓库不动。
- **验证**：
  - `npm run type-check` 通过。
  - `npm run build:h5` DONE Build complete。
  - 视觉未审（无 preview 工具）。建议你在 HBuilderX 自带的 icon preview 里看一眼再决定要不要换。
- **替换占位**：未来你有正式 logo，把 `src/static/app-plus/icon.png` + `src/static/app-harmony/icon.png` + `public/apple-touch-icon.png` 三处一并替换即可，无需重跑脚本；删 `src/static/app-plus/splash.png` + `src/static/app-harmony/splash.png` 也会让 HBuilderX 退到默认。

### T24 结果摘要（已删除区永久删除手势）

- **改动**（仅 `src/pages/conversations/conversations.vue`）：
  - 新增 `onLongPressDeleted(c)` 与 `confirmHardDelete(c)`（沿用项目里的 `confirmDelete` 模式：`uni.showModal` 红字确认 → `conversationApi.hardDelete(c.id)` → toast → `load()` 重拉）。
  - 已删除 item 加 `@longpress="onLongPressDeleted(c)"`，与现有 `@click="restoreConversation(c)"` 并存；uni-app 长按不会顺带触发 click。
  - 提示文案 `点击恢复 · 长按永久删除`，明确两种手势。
- **SDK**：零改动（`ConversationApi.hardDelete` 已经存在，对应 `DELETE /api/conversations/{id}/permanent`）。
- **验证**：
  - `npm run type-check` 通过。
  - `npm run build:h5` DONE Build complete。
  - 真机/浏览器未跑。

### T23 结果摘要（DOM 直接写 title）

- **背景**：T22 后用户再报"还是没有新的标题"。诊断：编译产物 `assets/index-*.js` 里 `uni.setNavigationBarTitle` 是注册式 API（H5 实现可能不完整、或不更新 visible bar），DOM 内嵌 bar 仍是 `.uni-page-head-title`。
- **改动**（仅 `src/pages/conversation-detail/conversation-detail.vue`）：`applyNavTitle()` 三路并发：
  1. `uni.setNavigationBarTitle({ title })`（App/iOS/Android/HarmonyOS 原生效）
  2. `document.title = title`（浏览器 tab）
  3. `document.querySelector('.uni-page-head-title').textContent = title`（H5 兜底）
- **效果**：H5 上无论 uni 的 setNavigationBarTitle 实现是否生效，document.title + 内嵌 `.uni-page-head-title` 都会同步刷。Retry（4s）拉到非空 title → 三路都写 → 用户看见真标题。
- **验证**：
  - `npm run type-check` 通过。
  - `npm run build:h5` DONE Build complete。
  - 真机未跑。

### T22 结果摘要（auto-title 重试兜底）

- **背景**：T21 验证 (b) 失败 —— 发完首条消息 1-3 秒后看 system bar，没有自动命名标题。诊断：后端 auto-title 用 `CompletableFuture.runAsync` 异步生成（典型 1-3 秒），前端 `'done'` 事件触发的 `loadConversationTitle` 几乎一定在 AI 完成之前 fetch，拿到空 title，没再重试 → 一直卡在"新对话"。
- **改动**（仅 `src/pages/conversation-detail/conversation-detail.vue`）：
  - 新增 `autoTitleRetryTimer` 句柄变量。
  - `loadConversationTitle`：拉到空 title 时排一个 4 秒后的 retry（`loadConversationTitleRetry`）。
  - 新增 `loadConversationTitleRetry`：只刷一次标题，不重排 retry，避免后端永久空返回值时死循环。
  - `onUnload`：清 `autoTitleRetryTimer`，防止切走页面后回调 fire 调 uni API。
- **效果**：用户视角流程——
  1. 进入新对话，system bar = "新对话"（pages.json 静态）
  2. 发首条消息 → 'done' → 首次 `loadConversationTitle` 立刻跑（拿到空 title）→ 排 4s 后 retry → UI 切到"新对话"无变化
  3. 4 秒后 retry → 后端 AI 已生成 → 拉到真实 title → `applyNavTitle` 把 system bar 改成 AI 标题
- **未做**：未做"持续 polling"或"eventStream 推送"，按最少必要修改只补一次 retry。AI 生成失败永久返回空 title 时 retry 只会跑一次，不打扰。
- **验证**：
  - `npm run type-check` 通过。
  - `npm run build:h5` DONE Build complete。
  - 真机未跑。

### T21 结果摘要（彻底告别 "对话"）

- **背景**：T19/T20 反复尝试，URL 参数 + setNavigationBarTitle 在 onLoad 都不靠，最终 system bar 仍卡在 `"对话"`。具体到"第一次对话"路径：URL `title=` 是空，pages.json 静态 `"对话"` 是唯一可见字，setNavigationBarTitle 在 H5 渲染前可能丢。
- **改动**：
  - `src/pages.json`：把 `conversation-detail` 的 `navigationBarTitleText` 直接改成 `"新对话"`，新对话路径下静态值已对，无需 API 兜底也至少显示"新对话"。
  - `src/pages/conversation-detail/conversation-detail.vue`：
    - 加 `navTitle: ref<string>('新对话')` + `applyNavTitle()` 工具（封装 setNavigationBarTitle）。
    - 三个生命周期钩子统一驱动：onLoad（来自 URL 的标题）→ onReady（页面渲染后再写一次，H5 上更稳）→ onShow（每次显示都兜底，含 navigateBack）。`loadConversationTitle` 自动命名后也通过 `applyNavTitle` 同步。
- **效果**：
  - 新对话：pages.json 立即显示"新对话"；onLoad / onReady / onShow 后续再写"新对话"三次；自动命名完成后 system bar 自动切到 AI 生成标题。
  - 已存在对话：pages.json 短暂"新对话"；onLoad 立即覆盖为 URL 标题；onReady 再覆盖一次保稳；返回时 onShow 再覆盖。
  - 不再有"对话"两个字出现。
- **验证**：
  - `npm run type-check` 通过。
  - `npm run build:h5` DONE Build complete。
  - 真机未跑。

### T20 结果摘要（彻底只走系统栏）

- **背景**：T16-T19 反复来回，最终用户反馈"系统栏仍显示'对话'，要显示标题"。之前依赖 `setNavigationBarTitle` 在 onLoad 异步刷新，时序/平台问题（用户测试中没等到更新）。
- **改动**：
  - `src/pages/conversations/conversations.vue`：`openConversation` 与 `onNewConversation` 的 `uni.navigateTo` URL 增加 `&title=${encodeURIComponent(c.title ?? '')}` 参数。空 title 也传，便于 detail 端兜底。
  - `src/pages/conversation-detail/conversation-detail.vue`：
    - 删 `<view class="topbar">…</view>` 与对应的 `.topbar` / `.topbar-title` CSS（消"两行"问题）。
    - 删 `conversationTitle` ref（不再有展示处）。
    - `onLoad` 立即 `uni.setNavigationBarTitle({ title: q.title || '新对话' })`，从 query 同步拿标题，无须等待 API。
    - `loadConversationTitle` 仍保留：自动命名完成后 emit 触发重拉，再次 `setNavigationBarTitle`。
- **效果**：单 system bar（最外层 native），从列表点进瞬间就是 title；自动命名完成后 1-3 秒内 system bar 也会同步变化。
- **不动**：SDK、pages.json（仍保留 `navigationBarTitleText: "对话"` 作首帧兜底字面；setNavigationBarTitle 在 onLoad 同步执行后立即覆盖）。
- **验证**：
  - `npm run type-check` 通过。
  - `npm run build:h5` DONE Build complete。
  - 真机未复测。

### T19 结果摘要（撤销 T18）

- 用户选择"还是用系统的"，撤销 T18 的 `navigationStyle: "custom"` 改造。
- **改动**：
  - `src/pages.json`：把 `pages/conversation-detail/conversation-detail` 的 `"navigationStyle": "custom"` 删掉，回到原状（系统导航栏重新生效，`navigationBarTitleText: "对话"` 作兜底字面）。
  - `src/pages/conversation-detail/conversation-detail.vue`：恢复 T17 删除的 `uni.setNavigationBarTitle({ title: c.title || '新对话' })`，让系统导航栏与对话标题同步。
- **保留**：T16 加的页面内 `.topbar`（与系统栏显示相同标题；按最小必要修改原则不动）。两层 header 看起来略冗余，但功能正常、不再有硬编码"对话"。
- **验证**：
  - `npm run type-check` 通过。
  - `npm run build:h5` DONE Build complete。
  - 真机未复测。

### T18 结果摘要（B：单 header）

- **改动**：
  - `src/pages.json`：给 `pages/conversation-detail/conversation-detail` 的 `style` 块追加 `"navigationStyle": "custom"`（与 `pages/index/index` 一致）。原 `navigationBarTitleText: "对话"` 保留作兜底字面，但因系统栏已隐藏不再渲染。
  - `src/pages/conversation-detail/conversation-detail.vue`：删 T17 加的 `uni.setNavigationBarTitle({ ... })`（系统栏隐藏后变成 dead call）。`loadConversationTitle` 仅保留 `conversationTitle.value = c.title` 供页面内 `.topbar` 使用。
- **效果**：进入对话详情时只剩页面内 `.topbar` 一个 header；自动命名完成后通过 `uni.$emit('conversation-list-needs-refresh', ...)` → `loadConversationTitle` → ref 更新 → `.topbar` 重渲染，整条链路无系统栏参与。
- **未做**：未对 `pages/conversations/conversations` 应用同样改造（用户只点名详情页；列表页若也想单 header 可后续单独跟一张工单）。
- **验证**：
  - `npm run type-check` 通过。
  - `npm run build:h5` DONE Build complete。
  - 真机未复测。

### T17 结果摘要（系统导航栏 vs 自定义 topbar）

- **根因**：T16 修复后用户仍报"头还有对话二字"。`pages.json:31` 里 `conversation-detail` 的 `navigationBarTitleText` 写死 `"对话"`，uni-app 系统导航栏（最顶层）始终显示此字。我加的 `.topbar` 是页面内**第二层**顶栏（系统栏下方），看上去就是两个 header：系统层"对话"+ 自定义层标题。
- **改动**（仅 `src/pages/conversation-detail/conversation-detail.vue`）：`loadConversationTitle()` 拉到 SDK 标题后，追加 `uni.setNavigationBarTitle({ title: c.title || '新对话' })`，把系统导航栏同步成实际标题。
- **遗留**（保留未清理，按最小必要修改原则不动）：系统栏 + 自定义 topbar 会同时显示同一个标题，看起来略冗余。若想改成"单 header"（仅系统栏），可让 detail 跟 list 一样用自定义 topbar；或反过来把 detail 的 `navigationStyle` 改成 `"custom"` 走全自定义。要进一步清理告诉我即可。
- **不动**：SDK、pages.json 静态 `navigationBarTitleText` 兜底字面保留（首次加载 frame 之前的兜底值；setNavigationBarTitle 跑完后即被覆盖）。
- **验证**：
  - `npm run type-check` 通过。
  - `npm run build:h5` DONE Build complete。
  - 端到端真机未复测。

### T15 结果摘要（自动命名 race）

- **根因**：`my-ai/MessageCommandServiceImpl.streamReply` 的 `done` 回调里 `CompletableFuture.runAsync(maybeAutoTitle(...))` 异步触发 AI 生成标题（典型 1-3 秒）。App 端 `conversations.vue` 只有 `onShow(load)` 同步刷一次，用户在 `'done'` 后立刻 `navigateBack` → onShow 同步 load 拿到的还是空 title → 列表继续显示"新对话"。
- **改动**（仅 App，C 方案：跨页 emit/on）：
  - `src/pages/conversation-detail/conversation-detail.vue`：`onSend` 与 `regenerate` 两条 `'done'` 分支在 `await load()` 之后 `uni.$emit('conversation-list-needs-refresh', { conversationId })`。
  - `src/pages/conversations/conversations.vue`：补 `onLoad`/`onUnload` 生命周期；`onLoad` 注册 `uni.$on(...)` → `load()`，`onUnload` 解绑；保留原有 `onShow(load)` 作为兜底（页面前后台切换 / emit 失联场景）。
- **不动**：SDK（服务端接口不变）、后端、conv.vue 的 list 渲染逻辑。
- **验证**：
  - `npm run type-check` 通过。
  - `npm run build:h5` 通过（Sass legacy-js-api 警告已知）。
  - H5 真机联调 / App 真机端到端均未跑（需 HBuilderX GUI）。可重现：发首条消息 → 等待 AI 流结束 → 立刻 navigateBack → 应在 1-3 秒内看到标题从"新对话"变为 AI 生成内容。

### T14c 结果摘要

- **App 消息不显示根因**：`src/sdk/fetch-polyfill.ts` 的 `makeStreamingBody` 用 `new TextEncoder().encode(text)` 把整段 SSE body 编码成 Uint8Array。App uts 运行时没有原生 `TextEncoder`，原 `try/catch` 兜底成空 `Uint8Array(0)` → SDK reader 喂出空 chunk → 解析不出任何 SSE 帧 → 没有 `token`/`done` 事件 → 流式气泡一直空、消息不显示。
- **改动**：
  - `src/sdk/fetch-polyfill.ts`：
    - 新增 `utf8Encode(input)` 工具函数（处理 1/2/3/4 字节 UTF-8 序列与孤立代理 → U+FFFD）。
    - 新增 `TextEncoderShim` 类（实现 `encode` + 占位 `encodeInto`）。
    - 新增 `ensureGlobalTextEncoder()`。
    - `AppRuntimeGlobals` 接口补 `TextEncoder` 字段。
    - 文件头注释补 `-TextEncoder` 段说明兜底原因。
  - `src/sdk/index.ts`：多 import + 多调一次 `ensureGlobalTextEncoder()`。
  - `src/pages/conversation-detail/conversation-detail.vue`：
    - 删 `scrollTop` ref 与 `Number.MAX_SAFE_INTEGER` hack。
    - 新增 `scrollAnchor: ref<string>('')` 与 `scrollDebounce` 句柄。
    - `scrollToBottom()` 改为 "先空 → nextTick → 回填 `msg-bottom-anchor`" 的 toggle，强制 `:scroll-into-view` 重触发。
    - `scrollToBottomDebounced()` 50ms 去抖；`onUnload` 顺手清掉定时器。
    - scroll-view 改 `:scroll-into-view="scrollAnchor"`；滚动哨兵 `<view id="msg-bottom-anchor" class="anchor">` 放在 `errorMsg` 之后。
    - 调用点：`load()` 内、`onSend` 乐观更新后、`'token'` 分支（去抖）、`'done'` 内 `await load()` 后会自动再滚（load 内已调）。
    - `.anchor` 样式：宽 100% / 高 1rpx，给 scroll-into-view 一个落脚点。
- **验证**：
  - `npm run type-check` 通过，零报错。
  - `npm run build:h5` 通过；Sass legacy-js-api deprecation 是已知上游警告（PLAN 已记）。
  - App 真机/模拟器端到端未验证（需 HBuilderX GUI）。
- **未做**：未跑真实后端联调；App 端 typewriter 仍是整段到位（uni.request 非流式）—— 那条仍在 PLAN「代码层剩余事项」§12b。

### T14 结果摘要

- 代码改动：`src/pages/conversation-detail/conversation-detail.vue` 两个 `for await` 块（同构改 1 次 `replace_all`，共 2 处）。
  - `'done'` 分支：把 `streamingText.value = ''` 挪到 `await load()` 之前，保证 `load()` 抛错也清空流式文本。
  - `'error'` 分支：补 `streamingText.value = ''`，避免 `v-if="streamingText"` 的流式气泡残留旧的累积内容。
- 验证：`npm run type-check`（`vue-tsc --noEmit`）通过，零报错。

### T14b 结果摘要（App 收紧）

- 背景：App 端 `uni.request` 整段 SSE body 当作单 chunk 喂给 SDK，所以 `for await` 在 microtask 集中跑完 `token / done`，'done' 之后的 `await load()` 是一段 `uni.request` 网络往返（明显比 H5 慢）。若 `streaming.value = true && streamingText = ''` 出现在该窗口，思考动画条件成立 → 会闪一下。
- 改动：'done' 分支在 `streamingText.value = ''` 之后再加一行 `streaming.value = false`，把 `finally` 里的状态收敛提前到 `await load()` 之前。'error' 分支因为走 catch → finally，不必同步改。
- 验证：`npm run type-check` 通过。
- 未做：未在 App 真机/模拟器跑端到端复核（需 HBuilderX GUI）。

### T14 调查结果

- **现象**：发送消息后，三圆点思考动画（`.dot` × 3 + `activeDot` 350ms 切换）结束后，AI 的回复消息没有显示出来。
- **代码路径**：`src/pages/conversation-detail/conversation-detail.vue`
  - `onSend()`: `startThinkingAnimation()` → `for await (const ev of messagesList.value.events()) {...}`
  - `for await` 内三类事件分支：`token` / `done` / `error`
- **已识别疑点（疑似根因，未实测复现）**：
  1. `'done'` 分支顺序：`await load()` → `streamingText.value = ''` → `break`。先 `load()` 再清空 streamingText。若 `load()` 抛错，catch 会走，但 streamingText 还残留上一次内容。
  2. `'error'` 分支：只设 `errorMsg`、不清理 streamingText；`break` 后进 finally，但 finally 只清 timer、不清 streamingText。导致流式气泡 `v-if="streamingText"` 仍可见，错误码同时显示。
  3. 同样的残留问题在 `regenerate(target)` 的同一分支结构。
  4. `'done'` 到 finally 之间存在短暂窗口 `streaming === true && streamingText === ''` → 三圆点可能闪一下。
- **真正根因待用户复核**：上述都属于"防御性清理不彻底"，但用户实际看到的"动画结束后无消息"也可能源自后端响应或 `load()` 返回异常。建议先在 H5 上跑一次真实后端联调复现，再决定是改清理顺序还是其他。
- **候选最小修复**（未应用，待确认）：
  - 把 `streamingText.value = ''` 统一挪到每个分支结束时执行（不依赖 load 完成顺序），保证状态收敛一致。
  - 同时在 `'error'` 分支末尾加 `streamingText.value = ''`。
  - 不动模板条件；不改 SDK、不改 fetch-polyfill。
- **验证方式**：H5 dev 后跑一次真实流式发送；预期看到"三圆点 → 流式逐字 → 完整回复入消息列表 → 流式气泡清空"；App 上需 HBuilderX 真机/模拟器（不在本轮范围）。



## 关键决策

- 框架：uni-app x + Vue 3 + Vite + TS（`@dcloudio/uni-app: 3.0.0-5020420260813001`，`@dcloudio/vite-plugin-uni: 3.0.0-5020420260813001`）
- SDK：本地 `file:../myAi-sdk`（已 Phase 1 落地）
- UI：uni-ui（`@dcloudio/uni-ui ^1.5.7`）+ easycom 自动注册
- 存储：App 端用 UniStorageAdapter，H5 用 LocalStorageAdapter（SDK 内部按 `globalThis.uni` 自动选）
- 后端 URL：默认 `http://192.168.2.103:8031`（`DEFAULT_BACKEND_URL` 常量）；`bootSdk()` 在 storage 无值时 fallback 到默认；存在 `myai.backendUrl` 键；首启 storage 空时跳过 config-backend 直接进 login，config-backend 仅作为首次未配置场景的兜底入口
- 4010 处理：FetchHttpClient.onUnauthorized → AuthService.notifyUnauthorized → 清 token + activeConversationId + currentUser
- 包名：cn.edgarli.myai（鸿蒙 mp-harmony 段已配）
- 验证范围：仅 H5（npm run dev:h5 / build:h5）；iOS/Android/HarmonyOS 编译需 HBuilderX GUI
- 记住密码存储：`@myai/sdk` 的 `SdkStorage` 新增 `get/save/clearRememberedCredentials`，键 `myai.rememberedCredentials`；多账号上限 3 + LRU（按登录成功时间）；4010/logout/反勾选登录成功 三重清凭据（详见 ADR 0007）
- 密码框复用：新建 `src/components/PasswordInput.vue`，封装 `type` 切换 + 小眼睛 + v-model 透传；三处复用（login 密码、register 密码、keys 页 API Key）；图标 `uni-icons` 的 `eye-slash` ↔ `eye`，尺寸 `40rpx`、颜色 `#888`

## 显式不做（Phase 2 范围）

- 微信扫码登录（ADR 0002，推迟到 v2）
- 推送通知（v2）
- 图片上传（v2）
- uni-ui 组件库完整使用（先按需引入 uni-list / uni-forms / uni-icons；其他留到 Phase 3 / v2）
- Vue-i18n 接入（项目 CLAUDE.md §2 提到未接入，本期不动）
- 单元测试（无单测，测试在 `@myai-sdk`）

## 留给用户

- App 编译（iOS/Android/HarmonyOS）需 HBuilderX GUI 打开 → Phase 2 不验证 App 编译产物
- HBuilderX Alpha 才支持 HarmonyOS NEXT；当前 4.0 正式版可能只跑 H5/iOS/Android
- 上架应用商店推迟到 v2（ADR 0006 Q11）

---

## 剩余事项

### 上游依赖（需 myAi 主仓库配合）

| # | 项 | 类型 | 阻塞 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | Phase 3：myAi/frontend/ 改 import SDK | 可选非阻塞 | 需用户决定 | 移除 `lib/sse.js` / `lib/markdown.js`，改 `import { ... } from '@myai/sdk'`；与 App 共用 SDK 路径 |
| 2 | Phase 4：myAi 主仓库文档收尾 | 非阻塞 | 需用户决定 | myAi/CLAUDE.md §2/§4/§6 + myAi/.claude/api.md §6 SDK 调用契约 + myAi/.claude/REQUIREMENTS.md 1.10 |
| 3 | 后端 `/api/app/**` 命名空间预留 | 可选 | ADR 0006 Q4 | 当前后端**零改动**，SDK 消费现有 `/api/**`；v2 是否切到 `/api/app/**` 命名空间待定 |

### 运行时验证（需 HBuilderX GUI）

| # | 项 | 阻塞 | 备注 |
| --- | --- | --- | --- |
| 4 | H5 dev server 端到端（真实后端联调） | 需 myAi 后端运行 | 已验证 dev:h5 启服务 + build:h5 出 dist；未对接真实后端跑 register/login/listKeys/stream |
| 5 | iOS App 编译（`dev:app` / `build:app`） | 需 HBuilderX GUI 打开 | HBuilderX 4.0 正式版可跑 iOS / Android；本机未验证 |
| 6 | Android App 编译 | 同上 | 同上 |
| 7 | HarmonyOS NEXT App 编译 | 需 HBuilderX Alpha + HarmonyOS 插件 | 当前正式版可能不支持；SDK 端 fetch+ReadableStream 兼容性需 Phase 2 验证期复测 |
| 8 | 真机/模拟器端到端流式 | 需 App 编译产物 | 按 myAi-app/.claude/CLAUDE.md §4 约定不声称"全部通过" |

### 代码层（v2 / 后续）

| # | 项 | 优先级 | 备注 |
| --- | --- | --- | --- |
| 9 | uni-ui 组件实际使用（替换原生 view/input） | 低 | 当前 easycom 已注册但页面仍用原生组件；引入 uni-list / uni-forms / uni-icons 可美化 UI |
| 10 | 消息列表分页 / 滚动优化 | 中 | 当前 `MessageApi.list` 一次拉全；对话 > 100 条消息时需要滚动虚拟化 |
| 11 | 编辑消息（PATCH `/api/messages/{id}`）UI | 中 | SDK 支持，但页面未实现入口；ADR 0003 Q4 = A（编辑+重新生成） |
| 12 | SSE 断线重连 / 续传 | v2 | 当前流中断需手动重发；后端未实现续传（Phase 12 PLAN §15 不实现） |
| 12b | App 端 SSE 真流式 | 中 | `enableChunked` + `onChunkReceived` 接入 `src/sdk/fetch-polyfill.ts` 的 body；当前 stub 让 donePromise 不 reject，但 token 收不到 |
| 13 | i18n 接入 | 低 | 项目 CLAUDE.md §2 提到；先用 zh-CN；en-US 留 v2 |

### 文档层

| # | 项 | 优先级 | 备注 |
| --- | --- | --- | --- |
| 14 | `myAi-app/README.md` | ✅ 已补齐（2026-08-17） | 覆盖环境要求 / 多端命令 / 后端地址配置 / 目录结构 / 文档索引 |
| 15 | 截图 / 录屏（App 跑通的视觉证据） | 低 | 端到端验证期产出 |

## 留给用户（运行时）

- SDK 仓库 `D:/MyWork/myAi-sdk/` 已 `git init` 但**未提交任何 commit**（per CLAUDE.md 仓库安全）
- App 仓库 `D:/MyWork/myAi-app/` 同上，未提交
- myAi 主仓库当前分支 `docs/adr-0006-uni-app-app-architecture` 领先 `origin/master` 1 个 commit（cf6e976 未推）
- HBuilderX 真机/模拟器调试 / HarmonyOS NEXT 编译插件安装 — 用户在外部平台执行
- iOS / HarmonyOS 开发者账号申请决策 — 取决于用户何时要真机调试或上架