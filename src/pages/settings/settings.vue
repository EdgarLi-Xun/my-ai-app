<script setup lang="ts">
/**
 * 设置页 / Settings page
 *
 * 显示用户信息 + 修改后端地址 + 登出。
 * Show user info + change backend URL + logout.
 */
import { ref, computed } from 'vue';
import { destroySdk, rebuildSdk, sdkState, sdkStorage, validateBackendUrl } from '@/sdk';

const newUrl = ref('');
const changingUrl = ref(false);
const urlError = ref('');
const urlSuccess = ref('');

const userInfo = computed(() => {
  const u = sdkState.currentUser;
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email ?? '',
    role: u.role,
  };
});

const currentUrl = computed(() => sdkState.backendUrl ?? '');

async function onChangeUrl() {
  urlError.value = '';
  urlSuccess.value = '';
  const trimmed = newUrl.value.trim().replace(/\/+$/, '');
  if (!trimmed) {
    urlError.value = '请输入新地址';
    return;
  }
  changingUrl.value = true;
  const result = await validateBackendUrl(trimmed, { timeoutMs: 5000 });
  if (!result.ok) {
    urlError.value = `校验失败：${result.error}`;
    changingUrl.value = false;
    return;
  }
  // 重建 SDK（新 URL） / rebuild SDK with new URL
  rebuildSdk(trimmed);
  urlSuccess.value = '已切换，正在跳转登录…';
  changingUrl.value = false;
  setTimeout(() => {
    uni.reLaunch({ url: '/pages/login/login' });
  }, 600);
}

async function onLogout() {
  const yes = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '登出确认',
      content: '确认登出？',
      success: (res) => resolve(res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!yes) return;
  destroySdk();
  uni.reLaunch({ url: '/pages/login/login' });
}
</script>

<template>
  <view class="page">
    <view class="section">
      <text class="section-title">当前用户</text>
      <view v-if="userInfo" class="info-card">
        <view class="info-row"><text class="info-label">ID</text><text class="info-value">{{ userInfo.id }}</text></view>
        <view class="info-row"><text class="info-label">用户名</text><text class="info-value">{{ userInfo.name }}</text></view>
        <view class="info-row"><text class="info-label">邮箱</text><text class="info-value">{{ userInfo.email || '—' }}</text></view>
        <view class="info-row"><text class="info-label">角色</text><text class="info-value">{{ userInfo.role }}</text></view>
      </view>
      <view v-else class="state">未登录</view>
    </view>

    <view class="section">
      <text class="section-title">后端地址</text>
      <view class="info-row">
        <text class="info-label">当前</text>
        <text class="info-value mono">{{ currentUrl || '未配置' }}</text>
      </view>
      <view class="form-item">
        <input v-model="newUrl" class="input" placeholder="新地址（http://...）" :disabled="changingUrl" />
      </view>
      <view v-if="urlError" class="error">{{ urlError }}</view>
      <view v-if="urlSuccess" class="success">{{ urlSuccess }}</view>
      <button class="btn-primary" :disabled="changingUrl || !newUrl" @click="onChangeUrl">
        {{ changingUrl ? '校验中…' : '切换并重新登录' }}
      </button>
    </view>

    <view class="section">
      <text class="section-title">会话</text>
      <button class="btn-danger" @click="onLogout">登出</button>
    </view>
  </view>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: #fafafa;
  padding: 24rpx 0;
}
.section {
  background: #fff;
  margin: 24rpx 32rpx;
  padding: 32rpx;
  border-radius: 12rpx;
}
.section-title {
  font-size: 28rpx;
  color: #888;
  display: block;
  margin-bottom: 24rpx;
}
.info-card {
  margin-bottom: 16rpx;
}
.info-row {
  display: flex;
  padding: 12rpx 0;
  font-size: 28rpx;
}
.info-label {
  color: #888;
  width: 144rpx;
}
.info-value {
  color: #333;
  flex: 1;
  word-break: break-all;
}
.mono {
  font-family: monospace;
  font-size: 24rpx;
}
.state {
  color: #888;
  font-size: 28rpx;
  text-align: center;
  padding: 32rpx 0;
}
.form-item {
  margin: 16rpx 0;
}
.input {
  width: 100%;
  height: 80rpx;
  padding: 0 24rpx;
  border: 2rpx solid #ddd;
  border-radius: 8rpx;
  font-size: 28rpx;
  background: #fff;
  box-sizing: border-box;
}
.error {
  color: #dd524d;
  font-size: 26rpx;
  margin: 8rpx 0;
}
.success {
  color: #4cd964;
  font-size: 26rpx;
  margin: 8rpx 0;
}
.btn-primary {
  width: 100%;
  height: 80rpx;
  line-height: 80rpx;
  background: #667eea;
  color: #fff;
  border-radius: 8rpx;
  font-size: 30rpx;
  margin-top: 16rpx;
}
.btn-primary:disabled {
  background: #b0b8e8;
}
.btn-danger {
  width: 100%;
  height: 80rpx;
  line-height: 80rpx;
  background: #dd524d;
  color: #fff;
  border-radius: 8rpx;
  font-size: 30rpx;
}
</style>