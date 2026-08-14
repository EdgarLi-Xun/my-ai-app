<script setup lang="ts">
/**
 * 后端 URL 配置页 / Backend URL configuration page
 *
 * 首次启动或从 settings 改 URL 时使用。输入 URL + ping 校验 + 落 storage + 重建 SDK。
 * Used on first launch or when changing URL from settings. Input + ping + save + rebuild SDK.
 */
import { ref } from 'vue';
import { rebuildSdk, validateBackendUrl } from '@/sdk';

const url = ref('');
const checking = ref(false);
const errorMsg = ref('');
const successMsg = ref('');

async function onSave() {
  errorMsg.value = '';
  successMsg.value = '';

  const trimmed = url.value.trim().replace(/\/+$/, '');
  if (!trimmed) {
    errorMsg.value = '请输入后端地址';
    return;
  }

  checking.value = true;
  const result = await validateBackendUrl(trimmed, { timeoutMs: 5000 });
  checking.value = false;

  if (!result.ok) {
    errorMsg.value = `校验失败：${result.error}`;
    return;
  }

  rebuildSdk(trimmed);
  successMsg.value = '配置成功，正在跳转…';
  setTimeout(() => {
    uni.reLaunch({ url: '/pages/login/login' });
  }, 600);
}

function onSkip() {
  // 不常用：跳过配置直接进入（之后还能改）/ skip config for now (can change later)
  uni.reLaunch({ url: '/pages/login/login' });
}
</script>

<template>
  <view class="container">
    <view class="header">
      <text class="title">配置后端地址</text>
      <text class="subtitle">首次使用请填写 MyAi 后端的可访问 URL</text>
    </view>

    <view class="form">
      <view class="form-item">
        <text class="label">后端 URL</text>
        <input
          v-model="url"
          class="input"
          type="text"
          placeholder="http://192.168.1.100:8031"
          :disabled="checking"
        />
      </view>

      <view v-if="errorMsg" class="error">{{ errorMsg }}</view>
      <view v-if="successMsg" class="success">{{ successMsg }}</view>

      <button class="btn-primary" :disabled="checking" @click="onSave">
        {{ checking ? '校验中…' : '保存并校验' }}
      </button>
      <button class="btn-secondary" :disabled="checking" @click="onSkip">跳过（稍后配置）</button>
    </view>

    <view class="hint">
      <text class="hint-text">
        示例：自部署用 http://localhost:8031；远程用 https://your-domain.com
      </text>
    </view>
  </view>
</template>

<style scoped>
.container {
  padding: 48rpx 32rpx;
}
.header {
  margin-bottom: 64rpx;
}
.title {
  font-size: 48rpx;
  font-weight: bold;
  color: #333;
  display: block;
  margin-bottom: 16rpx;
}
.subtitle {
  font-size: 28rpx;
  color: #888;
  display: block;
}
.form-item {
  margin-bottom: 32rpx;
}
.label {
  font-size: 28rpx;
  color: #555;
  display: block;
  margin-bottom: 12rpx;
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
  margin-bottom: 24rpx;
}
.success {
  color: #4cd964;
  font-size: 26rpx;
  margin-bottom: 24rpx;
}
.btn-primary {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background: #667eea;
  color: #fff;
  border-radius: 8rpx;
  font-size: 32rpx;
  margin-bottom: 24rpx;
}
.btn-primary:disabled {
  background: #b0b8e8;
}
.btn-secondary {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background: #f5f5f5;
  color: #555;
  border-radius: 8rpx;
  font-size: 30rpx;
}
.hint {
  margin-top: 64rpx;
  padding: 24rpx;
  background: #fff8e1;
  border-radius: 8rpx;
}
.hint-text {
  font-size: 24rpx;
  color: #b08900;
  line-height: 1.5;
}
</style>