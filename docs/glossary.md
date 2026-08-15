# Glossary — myAi-app 术语表

> 收录范围：与记住密码 / PasswordInput 组件相关的核心概念。
> 约定：先给中文术语 → 英文 → 一句话定义 → 关联条目 / 引用位置。
> 关联 ADR：0007。

---

## 记住密码 / Remember Password

登录页 `记住密码` 复选框 + 后台本地凭据缓存的组合功能。默认勾选；登录成功才落盘。
落地位置：`src/pages/login/login.vue` + `@myai/sdk` `SdkStorage`（键 `myai.rememberedCredentials`）。
关联：[[ADR 0007 D5]] / [[ADR 0007 D6]]。

## LRU 凭据 / LRU Credentials

按 `savedAt` 升序淘汰最久未用的本地凭据记录。本项目上限 3 条；时间基准取**登录成功时间**，不是表单回填时间。
关联：[[ADR 0007 D3]] / [[ADR 0007 D4]]。

## PasswordInput

公共密码输入组件，封装 `<input>` 的 `type` 切换（`password` ↔ `text`）+ 小眼睛按钮 + `v-model` 透传。
路径：`src/components/PasswordInput.vue`（计划）。
适用三处：login 密码 / register 密码 / keys 页 API Key 输入框。
关联：[[ADR 0007 D9]] / [[ADR 0007 D10]]。

## 4010 自动清凭据 / Auto-clear on 4010

`AuthService.notifyUnauthorized` 在收到后端业务码 4010 时同步清空 token + activeConversationId + **记住密码列表**。
触发：服务端作废 token（多伴随密码被重置），避免旧凭据陷入"自动重登又 4010"的循环。
关联：[[ADR 0007 D6 ③]]。

## fail-quiet

本项目的错误处理约定：当一个**非关键路径**（如预填凭据、清除本地缓存）失败时，**不抛错、不弹 toast**，静默忽略。
原因：本地缓存是 UX 增强，不是核心业务流；失败不应阻塞用户主路径。
对照：`fail-secure` —— 安全相关失败应主动清状态 / 缩短暴露窗口（见 [[4010 自动清凭据]]）。
关联：[[ADR 0007 D8]] / [[ADR 0007 §Security Notes]]。

---

## 待补充（v2 候选术语）

- 工作区 / Workspace（多账号隔离的 v2 形态）
- biometric 解锁（Keychain 集成的 v2 形态）
- `uni.setStorageSecure`（如 uni 后续提供，作为 Keychain 替代）

---

最后更新：2026-08-15