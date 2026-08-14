# api.md — MyAi App 接口契约

> 范围：本仓库 (`myAi-app`) 的对外 / 对内接口面。
> App 不直接调用后端 HTTP，全部通过 `@myai/sdk`（本地 file 依赖）消费后端能力。
> 本文档内容来自 `@myai/sdk/dist` 类型定义 + `src/sdk/index.ts` + `src/pages/**` 的真实调用方式。
> 内容若与代码冲突，以代码为准（见 `CLAUDE.md §1`）。

最后更新：2026-08-14（项目骨架 + 7 页面落地后）

---

## 1. 与后端的边界

- 唯一入口：`@myai/sdk`。`src/sdk/index.ts` 维护一个可变单例（`http + auth + 5 个 API + storage`），由页面在 `bootSdk()` / `rebuildSdk(url)` 后通过 `getSdk()` 取用。
- 后端基址：用户在 `pages/config-backend` 输入 → `validateBackendUrl` 校验 → 写入 `myai.backendUrl` → `rebuildSdk(url)`。运行时可在 `pages/settings` 改地址（同样流程）。
- 4010（未登录）联动：`FetchHttpClient.onUnauthorized` 触发 `AuthService.notifyUnauthorized`（清 token + activeConversationId）并回到 `handleUnauthorized()`（清 `sdkState.currentUser` 与 storage）；上层 UI 看到 `hasToken() === false` 时跳登录页。

## 2. SDK 模块清单（来源：`@myai/sdk/dist/index.d.ts`）

| 模块 | 主要导出 | 用途 |
| --- | --- | --- |
| `api` | `FetchHttpClient`、`HttpClient`、`HttpRequestOptions`、`HttpMethod`、endpoint 类（见 §3） | 传输层 + 按域端点封装 |
| `auth` | `AuthProvider`、`AuthService`、`AuthServiceDeps` | 登录 / 注册 / 当前用户 / 4010 通知 |
| `errors` | `BizCode` 常量对象、`BizException`（推断） | 后端 `cn.edgarli.common.BizException` 业务码镜像 |
| `storage` | `StorageAdapter`、`LocalStorageAdapter`、`UniStorageAdapter`、`InMemoryAdapter`（推断）、`SdkStorage`、`createStorage` | 平台无关存储 |
| `streaming` | `StreamingResponse`、`StreamingEvent`（`token` / `done` / `error`）、`SseParser`、`frameToEvent`、`createStreamingResponse`、`streamConversationMessage`、`streamRegenerate` | SSE 流式响应 |
| `media` | （占位，v2） | 图片上传 / 多模态，MVP 不在范围 |
| `push` | （占位，v2） | APNs / FCM / HarmonyOS Push，MVP 不在范围 |
| `types` | `Result<T>`、`Role`、`MessageRole`、`ProviderProtocol`、`AiCallStatus`、`UserVo`、`AuthVo`、`LoginDto`、`RegisterDto`、`UserApiKeyVo`、`UserApiKeyDto`、`ConversationVo`、`UpdateConversationDto`、`MessageVo`、`UpdateMessageDto`、`ChatMessage`、`AiCallLogVo`、`AuditLogVo`、`ProviderVo` | 后端 DTO/VO 镜像 |
| `utils` | `validateBackendUrl`、`sleep`、`retry`、`shortTraceId`、`toQueryString` | 通用工具 |

## 3. 端点类（来源：`@myai/sdk/dist/api/endpoints.d.ts`）

每个类对应后端一个 controller，方法名即 HTTP 路径语义。HTTP 方法默认 GET，命令型方法使用 POST/PATCH/DELETE（详见 `HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'`）。

### ProviderApi
- `list()` — `GET /api/providers`（公开端点；`validateBackendUrl` 内部 ping 同一个端点）

### UserApiKeyApi（路径里的 userId 必须等于 JWT 主体，否则后端返 4030）
- `list(userId)` — `GET /api/users/{userId}/api-keys`
- `get(userId, keyId)` — `GET /api/users/{userId}/api-keys/{keyId}`
- `create(userId, dto)` — `POST /api/users/{userId}/api-keys`（首个 enabled 自动设为默认）
- `update(userId, keyId, dto)` — `PUT /api/users/{userId}/api-keys/{keyId}`（`apiKey: ''` 表示保留原值）
- `delete(userId, keyId)` — `DELETE /api/users/{userId}/api-keys/{keyId}`
- `setDefault(userId, keyId)` — `POST /api/users/{userId}/api-keys/{keyId}/default`（不满足条件抛 4035）

### ConversationApi（ADR 0003；身份取自 JWT，不在路径里）
- `list({ includeDeleted? })` — `GET /api/conversations`
- `get(id)` — `GET /api/conversations/{id}`
- `create()` — `POST /api/conversations`
- `update(id, dto)` — `PATCH /api/conversations/{id}`（同时把 `titleManuallySet` 置 true）
- `softDelete(id)` — `DELETE /api/conversations/{id}`（可恢复）
- `restore(id)` — `POST /api/conversations/{id}/restore`
- `hardDelete(id)` — `DELETE /api/conversations/{id}/hard`（不可恢复）

### MessageApi
- `list(conversationId, { includeOrphaned? })` — `GET /api/conversations/{conversationId}/messages`
- `get(messageId)` — `GET /api/messages/{messageId}`
- `update(messageId, dto)` — `PATCH /api/messages/{messageId}`（仅 USER；旧消息标 `isOrphaned=true`）
- `delete(messageId)` — `DELETE /api/messages/{messageId}`（软删）

### 流式端点（由 streaming 模块封装，不在 endpoint 类里）
- `POST /api/conversations/{conversationId}/messages` — `streamConversationMessage({ baseUrl, conversationId, content, getToken, signal, fetchImpl })`
- `POST /api/messages/{messageId}/regenerate` — `streamRegenerate({ baseUrl, messageId, getToken, signal, fetchImpl })`

### LogsApi（仅 admin；响应不走 `Result` 外壳，调用 `requestRaw`）
- `listAiCalls({ from?, to?, page?, size? })`
- `getAiCall(id)`
- `listAuditLogs({ from?, to?, page?, size? })`
- `getAuditLog(id)`

## 4. 业务码（来源：`@myai/sdk/dist/errors/index.d.ts` 的 `BizCode`）

> HTTP 状态码始终为 200；业务语义由 `Result.code` 表达。

| 码 | 含义 | 前端典型处理 |
| --- | --- | --- |
| `0` | 成功 | 继续 |
| `4000` | 请求参数错误 | 表单校验提示 |
| `4010` | 未登录 | 跳登录页（`hasToken()` 为 falsy 后由页面触发 `uni.reLaunch`） |
| `4030` | 无权访问（跨用户操作） | 提示并回退 |
| `4031` | 对话不存在 / 已删 | 刷新列表 |
| `4032` | 消息不存在 / 不属于当前用户 | 同上 |
| `4033` | 编辑消息时该消息不是 USER 角色 | 不允许操作 |
| `4034` | 重新生成时该消息不是 ASSISTANT 角色 | 不允许操作 |
| `4035` | 默认 Key 不可用（NULL / disabled / 配置无效） | 提示去 keys 页启用 |
| `4040` | 资源不存在 | 404 兜底 |
| `4090` | 业务冲突 | 业务提示 |
| `5000` | 内部错误（兜底） | 重试或上报 |
| `5020` | 上游错误（预留） | 等待 / 重试 |

## 5. App 层 SDK 启动器（来源：`src/sdk/index.ts`）

- 模块单例：`adapter`（`UniStorageAdapter` 或 `LocalStorageAdapter`，按 `globalThis.uni` 自动选）→ `storage = createStorage(adapter)` → 与 SDK 实例生命周期解耦。
- `bootSdk()` — 应用启动时调用；如 `storage.getBackendUrl()` 已存在则 `rebuildSdk(url)`；幂等。
- `rebuildSdk(backendUrl)` — 新建 `FetchHttpClient` + `AuthService` + 5 个 endpoint 实例；4010 回调先尝试 `bundle.auth.notifyUnauthorized()`，回退到本地 `handleUnauthorized()`；同时把 URL 写入 storage。
- `destroySdk()` — 清空 `bundle` / `state` / `storage`（除 adapter 本身）；保留 storage 以便下次配置。
- `getSdk()` — 取出当前 bundle；未启动抛 `SdkNotBootedError`。
- `isSdkReady()` — bundle 与 `backendUrl` 都已就绪。
- `setCurrentUser(user)` / `hasToken()` — 页面在 `auth.getCurrentUser()` 后写入 `sdkState.currentUser`；UI 用 `hasToken()` 决定是否跳登录。
- `sdkState`（reactive）— `initialized / backendUrl / currentUser`。
- `sdkStorage` — `storage` 别名；页面可读 `getToken / getActiveConversationId / getBackendUrl` 等。
- Re-export（页面直接 `import`）：`streamConversationMessage`、`streamRegenerate`、`validateBackendUrl` 及对应类型。

## 6. SDK 调用契约（页面侧）

- 所有页面顶部 `import { getSdk, ... } from '@/sdk'`（`@/*` → `./src/*`）。
- `getSdk()` 调用前确认已经 `bootSdk()`（由 `App.vue` 在 `onLaunch` 触发）。
- 4010 路径：依赖 `sdkStorage.getToken()` 兜底检查 + `hasToken()` 失败时 `uni.reLaunch({ url: '/pages/login/login' })`。
- SSE：`conversation-detail.vue` 用 `streamConversationMessage` 发送、`streamRegenerate` 重新生成；`onUnload` 调用 `messagesList.value?.abort()` 防泄漏。

## 7. 已知缺口

- `media` / `push` 模块在 SDK 端是占位（v2）；本期 App 不引入。
- `cn.edgarli.myai` 是计划值（见 `REQUIREMENTS.md §3`）；`src/manifest.json` 的 `appid` 仍为空字符串，需补齐。
- 后端实际 HTTP 路径前缀以 Spring 控制器为准；本文档路径基于 SDK 端 endpoint 类的语义推断。
- `BizException` / `InMemoryAdapter` 的完整 d.ts 已在 SDK dist 中可见但未单独抽取至本文档，需要时直接读 `@myai/sdk/dist/errors/index.d.ts` 与 `@myai/sdk/dist/storage/index.d.ts`。