<script setup lang="ts">
/**
 * 登录 / 注册页 / Login / Register page
 *
 * tab 切换：login / register；调用 SDK AuthService.login / register；
 * 成功后 fetchCurrentUser → setCurrentUser → 跳 conversations。
 */
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getSdk, setCurrentUser, hasToken } from '@/sdk';

onLoad(() => {
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

    <view v-if="tab === 'login'" class="form">
      <view class="form-item">
        <text class="label">邮箱</text>
        <input
          v-model="loginEmail"
          class="input"
          type="text"
          placeholder="you@example.com"
          :disabled="submitting"
        />
      </view>
      <view class="form-item">
        <text class="label">密码</text>
        <input
          v-model="loginPassword"
          class="input"
          type="password"
          placeholder="••••••"
          :disabled="submitting"
        />
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
        <input
          v-model="regPassword"
          class="input"
          type="password"
          placeholder="至少 6 位"
          :disabled="submitting"
        />
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