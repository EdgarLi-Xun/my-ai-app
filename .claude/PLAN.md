# PLAN — myAi-app（Phase 2 of 第 17 次对话）

> Phase 2 实施计划：把 ADR 0006 设计的 uni-app x App 仓库落地。
> Phase 2 implementation plan for ADR 0006 uni-app x app.

## 修改日志

- `2026-08-14` — 创建本 PLAN.md；从 dcloudio/uni-preset-vue#vite-ts 模板初始化项目；定制 package.json + manifest.json + pages.json；启动 T9 → T10。
- T11/T12 待续。

---

## 任务进度

| # | 任务 | 状态 |
| --- | --- | --- |
| T9 | 初始化 App 项目骨架 | ✅ 已完成（2026-08-14） |
| T10 | SDK 集成 + 全局单例 | ✅ 已完成（2026-08-14） |
| T11 | 7 个页面（index / config-backend / login / conversations / conversation-detail / keys / settings） | ✅ 已完成（2026-08-14） |
| T12 | 验证（dev:h5 200 + build:h5 出 dist/ + types） | ✅ 已完成（2026-08-14） |

## 关键决策

- 框架：uni-app x + Vue 3 + Vite + TS（`@dcloudio/uni-app: 3.0.0-5020420260813001`，`@dcloudio/vite-plugin-uni: 3.0.0-5020420260813001`）
- SDK：本地 `file:../myAi-sdk`（已 Phase 1 落地）
- UI：uni-ui（`@dcloudio/uni-ui ^1.5.7`）+ easycom 自动注册
- 存储：App 端用 UniStorageAdapter，H5 用 LocalStorageAdapter（SDK 内部按 `globalThis.uni` 自动选）
- 后端 URL：可配置（首启弹 config-backend 页），存在 `myai.backendUrl` 键
- 4010 处理：FetchHttpClient.onUnauthorized → AuthService.notifyUnauthorized → 清 token + activeConversationId + currentUser
- 包名：cn.edgarli.myai（鸿蒙 mp-harmony 段已配）
- 验证范围：仅 H5（npm run dev:h5 / build:h5）；iOS/Android/HarmonyOS 编译需 HBuilderX GUI

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
| 13 | i18n 接入 | 低 | 项目 CLAUDE.md §2 提到；先用 zh-CN；en-US 留 v2 |

### 文档层

| # | 项 | 优先级 | 备注 |
| --- | --- | --- | --- |
| 14 | `myAi-app/README.md` | 中 | 当前仓库无 README；用户跑项目时无上手指南 |
| 15 | 截图 / 录屏（App 跑通的视觉证据） | 低 | 端到端验证期产出 |

## 留给用户（运行时）

- SDK 仓库 `D:/MyWork/myAi-sdk/` 已 `git init` 但**未提交任何 commit**（per CLAUDE.md 仓库安全）
- App 仓库 `D:/MyWork/myAi-app/` 同上，未提交
- myAi 主仓库当前分支 `docs/adr-0006-uni-app-app-architecture` 领先 `origin/master` 1 个 commit（cf6e976 未推）
- HBuilderX 真机/模拟器调试 / HarmonyOS NEXT 编译插件安装 — 用户在外部平台执行
- iOS / HarmonyOS 开发者账号申请决策 — 取决于用户何时要真机调试或上架