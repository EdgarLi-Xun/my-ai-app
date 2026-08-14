<script setup lang="ts">
/**
 * 启动页 / Launch page
 *
 * 决策路由 / Decision routing:
 * - 没有后端 URL → config-backend（首次配置）
 * - 有 URL 但未登录 → login
 * - 有 URL + 已登录 → conversations
 */
import { onLoad } from '@dcloudio/uni-app';
import { sdkState, hasToken } from '@/sdk';

onLoad(() => {
  // 短暂显示 splash 后跳转 / brief splash then redirect
  setTimeout(() => {
    if (!sdkState.backendUrl) {
      uni.reLaunch({ url: '/pages/config-backend/config-backend' });
      return;
    }
    if (!hasToken()) {
      uni.reLaunch({ url: '/pages/login/login' });
      return;
    }
    uni.reLaunch({ url: '/pages/conversations/conversations' });
  }, 300);
});
</script>

<template>
  <view class="splash">
    <text class="logo">MyAi</text>
    <text class="subtitle">Loading…</text>
  </view>
</template>

<style scoped>
.splash {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.logo {
  font-size: 96rpx;
  font-weight: bold;
  color: #fff;
  margin-bottom: 32rpx;
}
.subtitle {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.85);
}
</style>