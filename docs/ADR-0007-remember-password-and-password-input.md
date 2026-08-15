# ADR 0007 — 记住密码 + 密码框小眼睛组件

> 状态 / Status: ✅ Accepted（2026-08-15 经 grilling 会话确认）
> 范围 / Scope: Phase 2 后增量（myAi-app + myAi-sdk 协同落地）

## §Context

Phase 2（ADR 0006）已把 uni-app x App 客户端骨架落地，登录页（`src/pages/login/login.vue`）只有邮箱 + 密码两个裸 `<input type="password">`，没有：

1. 任何形式的"记住密码 / 自动登录"能力 —— 用户每次重启 App 都得重新输入邮箱 + 密码。
2. 任何"显示 / 隐藏密码"的明文切换入口 —— 输错只能删了重打。
3. 密码字段抽出来的可复用组件 —— `src/pages/keys/keys.vue:234` 的 API Key 输入框（也是 `type="password"`）也在裸 `<input>` 状态。

App / H5 用户对此的预期是"国内主流 App 标配"：记住密码（显式勾选、可清除）、密码框右眼一键查看。

本次需求（用户在 2026-08-15 的 `/grill-with-docs` 会话中提出）：

> 添加记录密码功能，密码框添加小眼睛。

经 10 轮 grilling 后形成以下决策。

## §Decision

### D1 — 存储位置 / Storage location

`@myai/sdk` 的 `SdkStorage` 新增一对 facade 方法 `getRememberedCredentials / saveRememberedCredentials / clearRememberedCredentials`，键 `myai.rememberedCredentials`。
底层继续用 `LocalStorageAdapter`（H5）和 `UniStorageAdapter`（App / 小程序）；不做 Keychain / Keystore 升级。

- ✅ 接受：复用已有 `StorageAdapter` 抽象，零新增依赖，跨端落地零成本。
- ❌ 拒绝：H5 `localStorage` 本就是浏览器唯一通用存储；App 端用 Keychain 需要平台分支 + 异步初始化，复杂度与本期收益不匹配。

### D2 — 存储内容 / Stored payload

每条记录：`{ email: string; password: string; savedAt: number }`，多账号以**数组**形式存在同一个键下，按 `email` 去重。

- ✅ 接受：结构简单，方便 LRU 排序（按 `savedAt` 升序淘汰），email 去重保证多账号登录不会留下重复项。
- ❌ 拒绝：包成 `{ [email]: { password, savedAt } }` 的 map —— 上限 3 条下数组比 map 更直观，且序列化为 JSON 后体积差可忽略。

### D3 — 容量上限 + LRU 淘汰 / Capacity + LRU

上限 **3 条**；超限时按 `savedAt` **升序**挤掉最久未用。

- ✅ 接受：覆盖"私人 + 工作 + 偶尔帮家人登录"典型场景；再多的就是异常行为。
- ❌ 拒绝：无上限 —— 列表只增不减，用户多年后能看到一堆旧 email，体感差。
- ❌ 拒绝：上限 5 —— 多账号记住密码不是高频需求，3 已足够；5 会让列表 UI 变拥挤。

### D4 — LRU 时间基准 / LRU timestamp definition

`savedAt` 取**登录成功时间**（`auth.login` / `auth.register` 拿到 `AuthVo` 之后），不是表单回填时间。

- ✅ 接受：被动回填不应刷新 LRU —— 否则用户 A 长期预填但实际未登录，会挤掉用户 B 的真实凭据。
- ❌ 拒绝：取回填时间 —— 上述反向淘汰风险；且会带来隐私感（"我点了一下就被记下来了"）。

### D5 — 写入触发 / Write trigger

login / register 两个 tab 都加 `记住密码` 复选框，**默认勾选**；登录成功才写盘。

- ✅ 接受：默认勾选是国内主流 App 的迁移预期（QQ 桌面、微信桌面、各银行 App），同时把"显式 opt-in"的合规感保留下来（取消勾选即反同意）。
- ❌ 拒绝：默认未勾选 —— 第一次登录的用户感受不到功能，体感"坏了"。
- ❌ 拒绝：每次登录成功强制写入 —— 剥夺"借用他人手机试一下"用户的临时账号保护。

### D6 — 删除触发 / Clear triggers

四个触发点（C 组合）：

| 触发 | 行为 |
|---|---|
| ① 反勾选 + 登录成功 | 整条记录被移除（按当前表单的 email） |
| ② 主动 logout | 整个列表清空 |
| ③ 4010（token 失效） | 整个列表清空 |
| ④ 设置页"清除已记住的密码"按钮 | 整个列表清空 |

- ✅ 接受：4010 主动清是为 fail-secure —— 服务端作废 token 多半伴随密码重置，留旧凭据会陷入"自动重登又 4010"的循环。
- ❌ 拒绝：4010 不清 —— 上述失败循环。
- ❌ 拒绝：仅反勾选立即清（不需登录成功） —— 误触会丢数据；"反勾选 + 成功登录"是双重确认。

### D7 — 单项删除入口 / Single-record delete

登录页列表项 **长按** 弹确认对话框删除。

- ✅ 接受：登录页是高频入口，过多控件会乱；长按是隐藏操作但一教就会。
- ❌ 拒绝：登录页右侧 × 按钮 —— 表单已拥挤，再加一行图标视觉过载。
- ❌ 拒绝：只放在设置页 —— 用户发现"我想删这个账号"时往往已经在登录页，输入完才发现不是想要的，路径太长。

### D8 — 预填触发 / Pre-fill trigger

两个入口：

1. 用户**点击列表项** → 立即把 email + password 预填到表单。
2. 用户在 email 框**失焦时**输入了**完整 email**（含 `@xxx.tld`） → 若命中已存列表，自动填 password；不命中则清空已预填的 password（fail-quiet）。

- ✅ 接受：覆盖"我点列表"和"我直接打字"两类用户；完整 email + 失焦的双重判断避免半截匹配和输入过程中的闪烁。
- ❌ 拒绝：仅点击列表 —— 直接打字的常用路径被忽视。
- ❌ 拒绝：input 事件实时匹配 —— 用户改邮箱过程中被旧凭据覆盖，体感差。

### D9 — PasswordInput 公共组件 / PasswordInput component

新建 `src/components/PasswordInput.vue`，封装：

- `<input>` 的 `type` 在 `password` / `text` 之间切换
- 右侧小眼睛按钮（`uni-icons` 的 `eye-slash` / `eye`）
- `v-model` 透传（与原生 `<input>` 接口一致）
- 透传 `placeholder` / `disabled` / `label`

适用范围：**三处** —— `pages/login/login.vue` 的登录密码 + 注册密码，以及 `pages/keys/keys.vue:234` 的 API Key 输入框。

- ✅ 接受：三处都是"敏感字符串输入框"，统一抽象减少重复；uni-icons 已在依赖，零新增成本。
- ❌ 拒绝：仅登录页内 inline 两份 —— DRY 原则，未来 settings 加"修改密码"会复制粘贴。
- ❌ 拒绝：组件加 `showable` prop（默认 true，API Key 处关掉） —— 假想未来需求（项目 CLAUDE.md §3），且 API Key 用户同样需要"粘完查看"。

### D10 — 图标样式 / Icon style

- 图标：`uni-icons` 的 `eye-slash`（默认 / 隐藏态）→ `eye`（切换后 / 显示态）
- 尺寸：`40rpx`
- 颜色：`#888`
- 反馈：点按透明度变化（hover-class）

- ✅ 接受：斜杠 = "当前遮罩"是 iOS / Apple Keychain 沿用多年的视觉对应，用户认知成本最低。
- ❌ 拒绝：`eye`（空心）→ `eye-filled`（实心） —— 不直观，需要教学。
- ❌ 拒绝：单一图标 + tooltip —— 增加额外状态，零收益。

## §Consequences

### 正面 / Positive

- 用户体验显著提升：登录页可"开盖即用"，API Key 可一键查看。
- 多账号场景有清晰语义（私人 / 工作 / 临时）。
- LRU + 删除入口 + 4010 清 三重保险防止凭据堆积。
- `PasswordInput` 组件是后续任何敏感输入场景的现成积木。

### 负面 / Negative

- **本地明文存储密码**：H5 在浏览器 localStorage，App 在 uni 同步存储（iOS 实为 NSUserDefaults / plist，Android 为 SharedPreferences，鸿蒙为应用沙盒，微信小程序为本地缓存）。设备越狱 / 共享 / 取证工具可见。
- 跨端存储位置不统一，"加密"语义无法做到端到端一致。
- 多账号预填可能让"我以为我登出后没人能登"的认知被打破（实际上设备未登出时凭据仍在）。

### 后续影响 / Follow-ups

- `SdkStorage` 接口扩展是 SDK breaking change 的候选（添加方法不算 break，但 SDK 仓库需要同步 commit）。
- `AuthService.notifyUnauthorized` 的副作用面扩大 —— 现有 4010 路径只清 token + activeConversationId，本次要加清 remember 凭据。
- v2 候选：升级 Keychain（iOS）/ Keystore（Android）/ `uni.setStorageSecure`（如 uni 后续提供）/ 多账号 UI 上限配置项。

## §Alternatives Considered（关键被拒方案汇总）

| 备选 | 拒绝原因 |
|---|---|
| 后端 remember-device（refresh token / 长期 cookie） | 项目硬约束"后端零改动"（ADR 0006 / REQUIREMENTS §2.1） |
| 只记 email 不记 password | 用户原话是"记录密码"，对应国内主流 App 行为 |
| 强制自动保存（无开关） | 与 D5 默认勾选相比，剥夺用户选择；不符合显式同意原则 |
| 单账号（latest wins） | 用户已选多账号方案（B）；单账号切换会被"覆盖前账号失败"卡住 |
| 自定义 SVG 图标 | 零收益；uni-icons 已含 4 个 eye 变体，跨端已适配 |
| 组件加 `showable` prop | 假想未来需求（项目 CLAUDE.md §3） |
| 加密层（AES / PBKDF2） | 在 H5 localStorage 上无解；在 App 上是假安全（密钥也在沙盒里），徒增复杂度 |
| Keychain 集成 | 跨端落地复杂，依赖平台分支 + 异步初始化，与本期收益不匹配 |

## §Security Notes

### 风险面 / Risk surface

1. **明文密码落盘**：所有平台都不加密落盘。设备本地物理 / 文件级访问可见密码明文。
2. **跨端存储位置差异**：

| 平台 | 实际存储 |
|---|---|
| H5 | 浏览器 `localStorage`（域名沙盒内） |
| iOS App | `uni.setStorageSync` → NSUserDefaults / plist（应用沙盒内，非 Keychain） |
| Android App | `uni.setStorageSync` → SharedPreferences XML（应用沙盒内） |
| HarmonyOS NEXT | uni 同步存储 → 应用沙盒文件 |
| 微信小程序 | `uni.setStorageSync` → 微信小程序本地缓存（用户可主动清理） |

3. **token + 密码共存**：现有 `myai.token` 与新增 `myai.rememberedCredentials` 同处一个 storage。token 是短期 JWT（数小时），密码是用户长期口令；4010 时两者同时清，缩短暴露窗口。

### 缓解措施 / Mitigations

- ✅ 4010 主动清凭据（D6 ③） —— 服务端作废时立刻缩短暴露。
- ✅ logout 主动清凭据（D6 ②） —— 用户主动撤销时立刻清除。
- ✅ 反勾选 + 登录成功清（D6 ①） —— 用户表达"不要记住"时尊重其意愿。
- ✅ 设置页手动清（D6 ④） —— 应对换设备 / 共享设备场景。
- ❌ 当前不做：Keychain 集成 / 加密层 / biometric 解锁。

### 推荐用户行为 / Recommended user behavior

- 借用设备登录时**取消勾选**"记住密码"，并在离开前点设置页"清除已记住的密码"。
- 怀疑设备被他人接触时同样点上述按钮。

## §Open Questions / v2 Candidates

1. **Keychain / Keystore 升级**：v2 是否按平台分支引入安全存储？需要评估 uni 是否提供官方 API（`uni.setStorageSecure`？）。
2. **加密层**：是否在 SDK 内置一层轻加密（device-derived key + AES），提高对静态文件取证的成本？
3. **多账号 UI 上限配置项**：是否提供"最多记 N 个"的用户可调项？当前硬编码 3。
4. **单台设备多用户 / 工作账户切换**：v2 是否引入"工作区"概念，覆盖整套凭据 + 后端 URL + 当前对话？
5. **API Key 的小眼睛默认值**：当前 D9 决策是三处一致；v2 是否要按字段类型区分？
6. **国际化**：checkbox 文案与图标 tooltip 的 i18n —— 接入 `vue-i18n` 后再统一处理。

---

## 元数据 / Metadata

- 创建：2026-08-15（grilling 会话落地）
- 作者：grill-with-docs 会话产物
- 关联 ADR：ADR 0003（存储约定）/ ADR 0006（uni-app x App 架构）
- 物理路径：`docs/ADR-0007-remember-password-and-password-input.md`
- 关联文件（计划）：
  - 新增：`src/components/PasswordInput.vue`
  - 新增：`@myai/sdk` 内 `SdkStorage` 扩展 + `AuthService.notifyUnauthorized` 副作用扩展
  - 修改：`src/pages/login/login.vue` / `src/pages/keys/keys.vue` / `src/pages/settings/settings.vue`