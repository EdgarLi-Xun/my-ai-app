<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
import { bootSdk } from '@/sdk';

onLaunch(() => {
  // 启动 SDK（从 storage 读 backendUrl + token 重建实例）
  // Boot SDK (read backendUrl + token from storage, rebuild instances).
  bootSdk();
  console.log('App Launch');
});

onShow(() => {
  console.log('App Show');
});

onHide(() => {
  console.log('App Hide');
});
</script>

<style>
/* 全局样式 / Global styles */
page {
  background-color: #f8f8f8;
}
</style>