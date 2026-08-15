<script setup lang="ts">
/**
 * 登录 / 注册页 / Login / Register page
 *
 * tab 切换：login / register；调用 SDK AuthService.login / register；
 * 成功后 fetchCurrentUser → setCurrentUser → 跳 conversations。
 *
 * 记住密码（ADR 0007）：双 tab 加 `记住密码` 复选框（默认勾选）；
 * 多账号顶部列表，点击预填、长按删除；邮箱框失焦匹配完整 email 自动预填密码。
 */
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getSdk, setCurrentUser, hasToken, sdkStorage } from '@/sdk';
import PasswordInput from '@/components/PasswordInput.vue';

onLoad(() => {
  // 进入页面时拉取已记住的账号列表（ADR 0007 D7/D8）
  refreshAccountList();
  if (hasToken()) {
    uni.reLaunch({ url: '/pages/conversations/conversations' });
  }
});

type Tab = 'login' | 'register';
const tab = ref<Tab>('login');
const submitting = ref(false);
const errorMsg = ref('');

// login fields
const loginEmail = ref('');
const loginPassword = ref('');

// register fields
const regName = ref('');
const regEmail = ref('');
const regPassword = ref('');

// 记住密码勾选（ADR 0007 D5：login / register 双 tab 共享同一个勾选状态，默认 true）
const rememberMe = ref(true);

// 已记住的账号列表（UI 形态：横向胶囊 / tabs）
interface AccountSummary {
  email: string;
  savedAt: number;
}
const accountList = ref<AccountSummary[]>([]);

/** 从 sdkStorage 拉取账号列表，按 savedAt 降序（最新在前） */
function refreshAccountList(): void {
  const all = sdkStorage.getRememberedCredentials();
  accountList.value = all
    .map((r) => ({ email: r.email, savedAt: r.savedAt }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

/** 简单判断 email 是否"完整"（含 @ 与至少一个 .）/ quick full-email check */
function isFullEmail(s: string): boolean {
  const t = s.trim();
  const at = t.indexOf('@');
  return at > 0 && t.indexOf('.', at) > at + 1 && t.indexOf('.', at) < t.length - 1;
}

async function onSubmit() {
  errorMsg.value = '';
  submitting.value = true;
  try {
    const { auth } = getSdk();
    if (tab.value === 'login') {
      await auth.login({
        email: loginEmail.value.trim(),
        password: loginPassword.value,
      });
    } else {
      await auth.register({
        name: regName.value.trim(),
        email: regEmail.value.trim(),
        password: regPassword.value,
      });
    }
    // 记住凭据（ADR 0007 D5/D6 ①）：
    //   勾选 → 保存；未勾选 → 按 email 移除（fail-quiet）
    const email = (tab.value === 'login' ? loginEmail.value : regEmail.value).trim();
    const password = tab.value === 'login' ? loginPassword.value : regPassword.value;
    if (email) {
      if (rememberMe.value) {
        sdkStorage.saveRememberedCredentials({
          email,
          password,
          savedAt: Date.now(),
        });
      } else {
        sdkStorage.removeRememberedCredentials(email);
      }
      refreshAccountList();
    }
    // 拉取当前用户 / fetch current user
    const user = await auth.getCurrentUser();
    setCurrentUser(user);
    uni.reLaunch({ url: '/pages/conversations/conversations' });
  } catch (err: unknown) {
    const e = err as { message?: string };
    errorMsg.value = e.message ?? '登录失败';
  } finally {
    submitting.value = false;
  }
}

function switchTab(t: Tab) {
  tab.value = t;
  errorMsg.value = '';
}

function onBackToConfig() {
  uni.reLaunch({ url: '/pages/config-backend/config-backend' });
}

// ==================== 多账号列表行为（ADR 0007 D7/D8） ====================

/** 点击列表项 → 切到 login tab + 预填（ADR 0007 D8 ①） */
function onPickAccount(acc: AccountSummary): void {
  tab.value = 'login';
  loginEmail.value = acc.email;
  const full = sdkStorage.getRememberedCredentials().find((r) => r.email === acc.email);
  loginPassword.value = full?.password ?? '';
  errorMsg.value = '';
}

/** 长按列表项 → 确认删除（ADR 0007 D7） */
function onLongPressAccount(acc: AccountSummary): void {
  uni.showActionSheet({
    itemList: ['删除此记住的账号'],
    success: (res) => {
      if (res.tapIndex === 0) {
        sdkStorage.removeRememberedCredentials(acc.email);
        refreshAccountList();
        uni.showToast({ title: '已删除', icon: 'none' });
      }
    },
  });
}

/**
 * 邮箱框失焦：完整 email 命中已存列表 → 自动预填密码；不命中 → 清空已预填密码（ADR 0007 D8 ②）
 */
function onEmailBlur(): void {
  if (tab.value !== 'login') return; // 只对 login tab 自动预填有意义
  const email = loginEmail.value.trim();
  if (!isFullEmail(email)) {
    // 半截 email：保守起见清空密码，避免错配
    loginPassword.value = '';
    return;
  }
  const match = sdkStorage.getRememberedCredentials().find((r) => r.email === email);
  if (match) {
    loginPassword.value = match.password;
  } else {
    loginPassword.value = '';
  }
}
</script>

<template>
  <view class="container">
    <view class="header">
      <text class="title">MyAi</text>
      <text class="subtitle">登录以继续</text>
    </view>

    <view class="tabs">
      <view
        :class="['tab', tab === 'login' ? 'tab-active' : '']"
        @click="switchTab('login')"
      >
        登录
      </view>
      <view
        :class="['tab', tab === 'register' ? 'tab-active' : '']"
        @click="switchTab('register')"
      >
        注册
      </view>
    </view>

    <!-- 已记住的账号列表（仅在 login tab + 有记录时显示） -->
    <view v-if="tab === 'login' && accountList.length > 0" class="account-list">
      <text class="account-list-label">已记住</text>
      <scroll-view class="account-list-scroll" scroll-x>
        <view
          v-for="acc in accountList"
          :key="acc.email"
          class="account-pill"
          @click="onPickAccount(acc)"
          @longpress="onLongPressAccount(acc)"
        >
          <text class="account-pill-text">{{ acc.email }}</text>
        </view>
      </scroll-view>
    </view>

    <view v-if="tab === 'login'" class="form">
      <view class="form-item">
        <text class="label">邮箱</text>
        <input
          v-model="loginEmail"
          class="input"
          type="text"
          placeholder="you@example.com"
          :disabled="submitting"
          @blur="onEmailBlur"
        />
      </view>
      <view class="form-item">
        <text class="label">密码</text>
        <PasswordInput
          v-model="loginPassword"
          placeholder="••••••"
          :disabled="submitting"
        />
      </view>
      <view class="form-item remember-row" @click="rememberMe = !rememberMe">
        <view class="checkbox" :class="{ 'checkbox-checked': rememberMe }">
          <text v-if="rememberMe" class="checkbox-mark">✓</text>
        </view>
        <text class="remember-text">记住密码</text>
      </view>
    </view>

    <view v-else class="form">
      <view class="form-item">
        <text class="label">用户名</text>
        <input
          v-model="regName"
          class="input"
          type="text"
          placeholder="alice"
          :disabled="submitting"
        />
      </view>
      <view class="form-item">
        <text class="label">邮箱</text>
        <input
          v-model="regEmail"
          class="input"
          type="text"
          placeholder="you@example.com"
          :disabled="submitting"
        />
      </view>
      <view class="form-item">
        <text class="label">密码</text>
        <PasswordInput
          v-model="regPassword"
          placeholder="至少 6 位"
          :disabled="submitting"
        />
      </view>
      <view class="form-item remember-row" @click="rememberMe = !rememberMe">
        <view class="checkbox" :class="{ 'checkbox-checked': rememberMe }">
          <text v-if="rememberMe" class="checkbox-mark">✓</text>
        </view>
        <text class="remember-text">记住密码</text>
      </view>
    </view>

    <view v-if="errorMsg" class="error">{{ errorMsg }}</view>

    <button class="btn-primary" :disabled="submitting" @click="onSubmit">
      {{ submitting ? '提交中…' : tab === 'login' ? '登录' : '注册' }}
    </button>

    <view class="back" @click="onBackToConfig">
      <text class="back-text">修改后端地址</text>
    </view>
  </view>
</template>

<style scoped>
.container {
  padding: 48rpx 32rpx;
}
.header {
  margin-bottom: 48rpx;
  text-align: center;
}
.title {
  font-size: 80rpx;
  font-weight: bold;
  color: #667eea;
  display: block;
  margin-bottom: 16rpx;
}
.subtitle {
  font-size: 28rpx;
  color: #888;
}
.tabs {
  display: flex;
  margin-bottom: 32rpx;
  border-bottom: 2rpx solid #eee;
}
.tab {
  flex: 1;
  text-align: center;
  padding: 24rpx 0;
  font-size: 30rpx;
  color: #888;
}
.tab-active {
  color: #667eea;
  border-bottom: 4rpx solid #667eea;
}

/* 已记住的账号列表（横向滚动胶囊）/ remembered account pills */
.account-list {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
  gap: 12rpx;
}
.account-list-label {
  font-size: 24rpx;
  color: #888;
  flex-shrink: 0;
}
.account-list-scroll {
  flex: 1;
  white-space: nowrap;
}
.account-pill {
  display: inline-block;
  padding: 8rpx 20rpx;
  margin-right: 12rpx;
  background: #f0f3ff;
  border: 2rpx solid #c5cae9;
  border-radius: 32rpx;
  font-size: 24rpx;
  color: #667eea;
}
.account-pill-text {
  color: #667eea;
}

.form-item {
  margin-bottom: 24rpx;
}
.label {
  font-size: 26rpx;
  color: #555;
  display: block;
  margin-bottom: 8rpx;
}
.input {
  width: 100%;
  height: 88rpx;
  padding: 0 24rpx;
  border: 2rpx solid #ddd;
  border-radius: 8rpx;
  font-size: 30rpx;
  background: #fff;
  box-sizing: border-box;
}

/* 记住密码复选行 / remember-me row */
.remember-row {
  display: flex;
  align-items: center;
  margin-top: 8rpx;
}
.checkbox {
  width: 36rpx;
  height: 36rpx;
  border: 2rpx solid #ccc;
  border-radius: 6rpx;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12rpx;
}
.checkbox-checked {
  background: #667eea;
  border-color: #667eea;
}
.checkbox-mark {
  color: #fff;
  font-size: 26rpx;
  line-height: 1;
}
.remember-text {
  font-size: 28rpx;
  color: #555;
}

.error {
  color: #dd524d;
  font-size: 26rpx;
  margin: 16rpx 0;
}
.btn-primary {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background: #667eea;
  color: #fff;
  border-radius: 8rpx;
  font-size: 32rpx;
  margin-top: 24rpx;
}
.btn-primary:disabled {
  background: #b0b8e8;
}
.back {
  text-align: center;
  margin-top: 32rpx;
}
.back-text {
  color: #667eea;
  font-size: 26rpx;
}
</style>