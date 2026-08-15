# REQUIREMENTS.md — MyAi App 需求与决策记录

> 内容汇总自仓库现状（`src/`、`package.json`、`src/manifest.json`、`src/pages.json`）+ `.claude/PLAN.md` + `@myai/sdk` 类型面。
> 范围限定为本期 Phase 2（uni-app x App 落地）；ADR 编号沿用 `myAi` 主仓库约定。

最后更新：2026-08-15

---

## 1. 功能需求（MVP / Phase 2 范围）

> ADR 0006：本仓库为 uni-app x App 客户端；后端零改动，能力来自 `@myai/sdk`。

| # | 需求 | 落地位置 | 状态 |
| --- | --- | --- | --- |
| 1.1 | 首次启动引导用户配置后端地址（含 URL 校验） | `pages/config-backend/config-backend.vue` | 已实现 |
| 1.2 | 邮箱 + 密码登录 / 注册 | `pages/login/login.vue` | 已实现 |
| 1.3 | 对话列表（侧栏式 + 软删折叠区） | `pages/conversations/conversations.vue` | 已实现 |
| 1.4 | 对话详情：消息列表 + 输入 + SSE 流式回复 | `pages/conversation-detail/conversation-detail.vue` | 已实现 |
| 1.5 | 重新生成（ASSISTANT 消息） | `pages/conversation-detail/conversation-detail.vue` | 已实现 |
| 1.6 | API Key CRUD + 设为默认 | `pages/keys/keys.vue` | 已实现 |
| 1.7 | 设置：用户信息 / 修改后端 URL / 登出 | `pages/settings/settings.vue` | 已实现 |
| 1.8 | 4010 自动跳登录页 | 4010 联动 + 各页面 `hasToken()` 兜底 | 已实现 |
| 1.9 | 多端编译目标（H5 / App / HarmonyOS NEXT / 微信小程序） | `package.json` scripts + `manifest.json` | 脚本就绪，运行时验证仅 H5 |
| 1.10 | 多账号记住密码（上限 3 + LRU + 显式勾选 + 三重清凭据 + 列表项长按删除） | `pages/login/login.vue` + `@myai/sdk` `SdkStorage` 扩展 | 设计完成（ADR 0007），代码待启动 |
| 1.11 | 密码框小眼睛（`<PasswordInput>` 公共组件，三处复用：login 密码 / register 密码 / keys 页 API Key） | `src/components/PasswordInput.vue`（新建）+ 三处接入 | 设计完成（ADR 0007），代码待启动 |

## 2. 非功能需求

| # | 项 | 要求 |
| --- | --- | --- |
| 2.1 | 后端兼容性 | 不修改后端；只消费现有 `/api/**`；v2 是否切到 `/api/app/**` 命名空间待定（ADR 0006 Q4） |
| 2.2 | 平台兼容 | H5 / iOS / Android / HarmonyOS NEXT / 微信小程序 |
| 2.3 | SDK 共享 | 所有业务能力复用 `@myai/sdk`；App 不直接写 fetch 调用 |
| 2.4 | 类型安全 | `vue-tsc --noEmit` 通过（`npm run type-check`） |
| 2.5 | 样式约定 | `rpx` 优先；变量来自 `src/uni.scss` |
| 2.6 | 路由声明 | 全部经 `pages.json.pages` 注册 |
| 2.7 | 包名 | `cn.edgarli.myai`（鸿蒙 mp-harmony 段已配） |

## 3. 显式不做（Phase 2 范围外）

- 微信扫码登录（ADR 0002；v2）
- 推送通知（v2；SDK `push` 模块占位）
- 图片上传 / 多模态（v2；SDK `media` 模块占位）
- uni-ui 组件库完整使用（先按需替换原生 `view / input`）
- Vue-i18n 接入
- 单元测试（无单测，测试在 `@myai/sdk`）
- App 上架应用商店（ADR 0006 Q11；推迟 v2）
- 编辑消息 UI（SDK `MessageApi.update` 已支持，页面入口未做）
- SSE 断线重连 / 续传（后端未实现续传；流中断需手动重发）
- 记住密码本地加密层（ADR 0007 §Open Questions v2 候选）
- Keychain / Keystore / `uni.setStorageSecure` 升级（ADR 0007 §Open Questions v2 候选）
- 多账号 UI 上限配置项（当前硬编码 3）
- 借用设备时临时账号的"自动遗忘"机制（当前依赖用户手动反勾选 + 设置页清除）

## 4. 关键决策

| 主题 | 决策 | 来源 |
| --- | --- | --- |
| 框架 | uni-app x + Vue 3 + Vite + TS（`@dcloudio/uni-app: 3.0.0-5020420260813001`） | PLAN §24 |
| SDK | 本地 `file:../myAi-sdk` | PLAN §25 |
| UI | uni-ui + easycom 自动注册 | PLAN §26 |
| 存储 | App → `UniStorageAdapter`，H5 → `LocalStorageAdapter`（SDK 内部按 `globalThis.uni` 选） | PLAN §27 |
| 后端 URL | 可配置；首启弹 `config-backend`；键 `myai.backendUrl` | PLAN §28 |
| 4010 处理 | `FetchHttpClient.onUnauthorized → AuthService.notifyUnauthorized → 清 token + activeConversationId + currentUser` | PLAN §29 |
| 包名 | `cn.edgarli.myai`（鸿蒙 mp-harmony 段已配） | PLAN §30 |
| 验证范围 | 仅 H5（`dev:h5` / `build:h5`）；App 编译需 HBuilderX GUI | PLAN §31 |
| 记住密码存储 | `@myai/sdk` `SdkStorage` 扩展 `get/save/clearRememberedCredentials`，键 `myai.rememberedCredentials`；多账号上限 3 + LRU（按登录成功时间） | ADR 0007 D1-D4 |
| 记住密码写入 | login / register 双 tab 加 `记住密码` 复选框，默认勾选；登录成功才写盘；4010/logout/反勾选登录成功 三重清凭据 | ADR 0007 D5-D6 |
| 记住密码 UI | 登录页顶部多账号列表（点击预填 + 长按删除）；邮箱框失焦匹配完整 email 自动预填密码；不命中则清空已预填密码 | ADR 0007 D7-D8 |
| 密码框组件 | `<PasswordInput>` 公共组件封装 `type` 切换 + 小眼睛 + `v-model` 透传；三处复用 | ADR 0007 D9 |
| 小眼睛图标 | `uni-icons` 的 `eye-slash`（默认）→ `eye`（切换）；尺寸 `40rpx`；颜色 `#888` | ADR 0007 D10 |

## 5. 已知缺口

| # | 项 | 类型 | 阻塞 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | `App.vue.onLaunch` 未调用 `bootSdk()` | 代码层 | 否 | 当前仅 console.log；首启 SDK 启动接线待补 |
| 2 | `src/manifest.json` 的 `appid` 为空 | 平台配置 | 多端真机构建前 | H5 不受影响 |
| 3 | uni-ui 组件实际替换原生 `view / input` | UI | 否 | 当前 easycom 已注册；按需引入 |
| 4 | 编辑消息（PATCH `/api/messages/{id}`）UI | 功能 | 否 | SDK 支持；页面无入口 |
| 5 | 消息列表分页 / 滚动虚拟化 | 性能 | 否 | 当前 `MessageApi.list` 一次拉全 |
| 6 | SSE 断线重连 / 续传 | 可靠性 | v2 | 后端未实现续传；流中断需手动重发 |
| 7 | i18n 接入 | i18n | 否 | `vue-i18n` 已声明但未挂载 |
| 8 | 微信扫码登录 | 功能 | v2 | ADR 0002 |
| 9 | 推送通知 | 功能 | v2 | SDK `push` 占位 |
| 10 | 图片上传 / 多模态 | 功能 | v2 | SDK `media` 占位 |
| 11 | iOS / Android / HarmonyOS NEXT 真机编译 | 验证 | 需 HBuilderX GUI | 本期未验证 |
| 12 | 端到端流式（真机 / 模拟器） | 验证 | 需 App 编译产物 | H5 dev/build 已过；真实后端联调未跑 |
| 13 | 上架应用商店 | 上架 | v2 | ADR 0006 Q11 |
| 14 | `README.md` | 文档 | 否 | 仓库无 README |
| 15 | `shims-uni.d.ts` 与 `src/shime-uni.d.ts` 命名不一致 | 工程 | 否 | 历史模板残留；本期不修 |
| 16 | `SdkStorage` 扩展方法（`get/save/clearRememberedCredentials`）尚未在 SDK 落地 | SDK | 否 | 设计完成（ADR 0007）；代码待启动 |
| 17 | `<PasswordInput>` 公共组件尚未创建 | UI | 否 | 设计完成（ADR 0007 D9）；代码待启动 |
| 18 | 登录页多账号列表 UI 形态未定 | UI | 否 | 仅定下"顶部紧凑胶囊 / 横向 tabs"方向；具体视觉留到实现期 |
| 19 | 记住密码的明文存储安全提示未在 UI 上提示用户 | UX | 否 | 当前依赖 checkbox 文本与设置页按钮；可后续加一次性的安全提示弹窗 |

## 6. 与 `myAi` 主仓库 / `myAi-sdk` 的契约

- 后端：`/api/**`（auth、users、api-keys、conversations、messages、providers、logs）；路径与 SDK 端点类一一对应（见 `api.md §3`）。
- 共享类型：DTO/VO 命名沿用后端 `web/dto/*` / `web/vo/*`；时间字段 ISO 8601。
- 业务码：见 `api.md §4`，SDK 端 `BizCode` 镜像后端 `cn.edgarli.common.BizException`。
- SDK 测试：在 `myAi-sdk`（`../myAi-sdk`）使用 `vitest`；本仓库无测试任务。

## 7. 变更摘要

- `2026-08-14` — 首版生成：覆盖项目骨架（`src/` 7 页面 + SDK 启动器）+ 决策记录 + Phase 2 范围；与 `.claude/PLAN.md §修改日志` 对齐。
- `2026-08-15` — 新增功能需求 1.10（多账号记住密码）与 1.11（`<PasswordInput>` 组件三处复用）；新增 §3 显式不做（密码加密 / Keychain / 多账号上限配置 / 临时账号自动遗忘）；§4 关键决策补 6 条；§5 已知缺口补 16-19。设计全部在 `docs/ADR-0007-remember-password-and-password-input.md`，本轮仅文档落地，代码未启动。