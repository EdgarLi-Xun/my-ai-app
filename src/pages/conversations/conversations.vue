<script setup lang="ts">
/**
 * 对话列表页 / Conversations list page
 *
 * 侧栏式列表 + 新建对话按钮 + 跳转到对话详情；含已删除对话折叠区。
 * Sidebar-style list + new conversation button + navigate to detail; with soft-deleted section.
 */
import { ref } from 'vue';
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import type { ConversationVo } from '@myai/sdk';
import { getSdk, sdkStorage, setCurrentUser } from '@/sdk';

const conversations = ref<ConversationVo[]>([]);
const deletedConversations = ref<ConversationVo[]>([]);
const loading = ref(false);
const errorMsg = ref('');
const showDeleted = ref(false);

/** uni-swipe-action 实例引用（用于删除后关闭展开项）/ swipe-action ref */
const swipeAction = ref<{ closeAll?: () => void } | null>(null);

/** 滑动操作按钮（仅"删除"，与"已删除"区恢复路径一致）/ swipe action options */
const swipeOptions = [
  { text: '删除', style: { backgroundColor: '#dd524d', color: '#fff' } },
];

async function load() {
  const token = sdkStorage.getToken();
  if (!token) {
    uni.reLaunch({ url: '/pages/login/login' });
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  try {
    const { conversationApi, auth } = getSdk();
    const list = await conversationApi.list({ includeDeleted: false });
    conversations.value = list;
    const deletedList = await conversationApi.list({ includeDeleted: true });
    deletedConversations.value = deletedList.filter((c) => c.deletedAt !== null);
    // 刷新当前用户（4010 防御）
    try {
      const user = await auth.getCurrentUser();
      setCurrentUser(user);
    } catch {
      // ignore — 列表已经加载成功
    }
  } catch (err: unknown) {
    const e = err as { message?: string };
    errorMsg.value = e.message ?? '加载失败';
  } finally {
    loading.value = false;
  }
}

/** 跨页通知：detail 页发送消息后 emit；这里 onLoad 注册监听并触发刷新。 */
function onConversationListNeedsRefresh(): void {
  load();
}

onLoad(() => {
  uni.$on('conversation-list-needs-refresh', onConversationListNeedsRefresh);
});

onUnload(() => {
  uni.$off('conversation-list-needs-refresh', onConversationListNeedsRefresh);
});

onShow(load);

async function onNewConversation() {
  loading.value = true;
  try {
    const { conversationApi } = getSdk();
    const c = await conversationApi.create();
    sdkStorage.setActiveConversationId(c.id);
    uni.navigateTo({
      url: `/pages/conversation-detail/conversation-detail?id=${c.id}&title=${encodeURIComponent(c.title ?? '')}`,
    });
  } catch (err: unknown) {
    const e = err as { message?: string };
    uni.showToast({ title: e.message ?? '新建失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function openConversation(c: ConversationVo) {
  sdkStorage.setActiveConversationId(c.id);
  uni.navigateTo({
    url: `/pages/conversation-detail/conversation-detail?id=${c.id}&title=${encodeURIComponent(c.title ?? '')}`,
  });
}

async function restoreConversation(c: ConversationVo) {
  try {
    const { conversationApi } = getSdk();
    await conversationApi.restore(c.id);
    uni.showToast({ title: '已恢复', icon: 'success' });
    await load();
  } catch (err: unknown) {
    const e = err as { message?: string };
    uni.showToast({ title: e.message ?? '恢复失败', icon: 'none' });
  }
}

/**
 * 长按已删除项 → 二次确认后强制（永久）删除。
 * Long-press a deleted item → confirm dialog → hard delete (irreversible).
 */
function onLongPressDeleted(c: ConversationVo): void {
  void confirmHardDelete(c);
}

/**
 * 强制删除对话（不可恢复）。带二次确认 + 刷新列表。
 * Hard delete with confirm modal + reload list.
 */
function confirmHardDelete(c: ConversationVo): Promise<void> {
  return new Promise<void>((resolve) => {
    uni.showModal({
      title: '永久删除对话',
      // 用「新对话」兜底：UI 已经会兜底显示新对话；提示里用同一口径。
      content: `确认永久删除「${c.title || '新对话'}」？该对话及其全部消息将被彻底清除，无法恢复。`,
      confirmText: '永久删除',
      confirmColor: '#dd524d',
      cancelText: '取消',
      success: async (r) => {
        if (!r.confirm) {
          resolve();
          return;
        }
        try {
          const { conversationApi } = getSdk();
          await conversationApi.hardDelete(c.id);
          uni.showToast({ title: '已永久删除', icon: 'success' });
          await load();
        } catch (err: unknown) {
          const e = err as { message?: string };
          uni.showToast({ title: e.message ?? '永久删除失败', icon: 'none' });
        } finally {
          resolve();
        }
      },
      fail: () => resolve(),
    });
  });
}

/**
 * 滑动操作按钮点击 / swipe action button click.
 * 当前只有 1 个按钮（index 0 = 删除），后续若加恢复等可按 index 派发。
 */
async function onSwipeClick(
  e: { index: number; content: { text: string } },
  c: ConversationVo,
): Promise<void> {
  if (e.index === 0) {
    await confirmDelete(c);
  }
}

/**
 * 软删对话（带二次确认 + 收尾 swipe + 刷新列表）。
 * Soft-delete with confirm modal + close swipe + reload list.
 */
function confirmDelete(c: ConversationVo): Promise<void> {
  return new Promise<void>((resolve) => {
    uni.showModal({
      title: '删除对话',
      content: `确认删除「${c.title || '新对话'}」？可在「已删除」中恢复。`,
      confirmText: '删除',
      confirmColor: '#dd524d',
      cancelText: '取消',
      success: async (r) => {
        if (!r.confirm) {
          resolve();
          return;
        }
        try {
          const { conversationApi } = getSdk();
          await conversationApi.softDelete(c.id);
          swipeAction.value?.closeAll?.();
          uni.showToast({ title: '已移到已删除', icon: 'success' });
          await load();
        } catch (err: unknown) {
          const e = err as { message?: string };
          uni.showToast({ title: e.message ?? '删除失败', icon: 'none' });
        } finally {
          resolve();
        }
      },
      fail: () => resolve(),
    });
  });
}

function openSettings() {
  uni.navigateTo({ url: '/pages/settings/settings' });
}

function openKeys() {
  uni.navigateTo({ url: '/pages/keys/keys' });
}
</script>

<template>
  <view class="page">
    <view class="topbar">
      <text class="topbar-title">对话</text>
      <view class="topbar-actions">
        <text class="icon-btn" @click="openKeys">🔑</text>
        <text class="icon-btn" @click="openSettings">⚙️</text>
      </view>
    </view>

    <scroll-view class="scroll" scroll-y>
      <view v-if="loading && conversations.length === 0" class="state">加载中…</view>
      <view v-else-if="errorMsg" class="state error">{{ errorMsg }}</view>
      <view v-else-if="conversations.length === 0" class="state empty">
        <text>暂无对话</text>
        <text class="empty-hint">点击下方按钮创建第一个对话</text>
      </view>

      <uni-swipe-action ref="swipeAction">
        <uni-swipe-action-item
          v-for="c in conversations"
          :key="c.id"
          :right-options="swipeOptions"
          @click="onSwipeClick($event, c)"
        >
          <view class="item" @click="openConversation(c)">
            <text class="item-title">{{ c.title || '新对话' }}</text>
            <text class="item-time">{{ new Date(c.updatedAt).toLocaleString('zh-CN') }}</text>
          </view>
        </uni-swipe-action-item>
      </uni-swipe-action>

      <view v-if="deletedConversations.length > 0" class="deleted-section">
        <view class="deleted-header" @click="showDeleted = !showDeleted">
          <text class="deleted-title">已删除 ({{ deletedConversations.length }})</text>
          <text class="deleted-toggle">{{ showDeleted ? '收起' : '展开' }}</text>
        </view>
        <view v-if="showDeleted">
          <view
            v-for="c in deletedConversations"
            :key="c.id"
            class="item deleted"
            @click="restoreConversation(c)"
            @longpress="onLongPressDeleted(c)"
          >
            <text class="item-title">{{ c.title || '新对话' }}</text>
            <text class="item-time">点击恢复 · 长按永久删除</text>
          </view>
        </view>
      </view>
    </scroll-view>

    <view class="fab-row">
      <button class="btn-new" :disabled="loading" @click="onNewConversation">
        + 新对话
      </button>
    </view>
  </view>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #fafafa;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 32rpx;
  background: #fff;
  border-bottom: 2rpx solid #eee;
}
.topbar-title {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
}
.topbar-actions {
  display: flex;
  gap: 16rpx;
}
.icon-btn {
  font-size: 40rpx;
  padding: 8rpx 16rpx;
}
.scroll {
  flex: 1;
  padding: 16rpx 0;
}
.state {
  padding: 64rpx 32rpx;
  text-align: center;
  color: #888;
}
.state.error {
  color: #dd524d;
}
.state.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}
.empty-hint {
  font-size: 24rpx;
  color: #aaa;
}
.item {
  display: flex;
  flex-direction: column;
  padding: 24rpx 32rpx;
  margin: 8rpx 16rpx;
  background: #fff;
  border-radius: 12rpx;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.04);
}
.item.deleted {
  opacity: 0.6;
}
.item-title {
  font-size: 30rpx;
  color: #333;
  font-weight: 500;
  margin-bottom: 8rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-time {
  font-size: 22rpx;
  color: #aaa;
}
.deleted-section {
  margin-top: 32rpx;
  border-top: 2rpx solid #eee;
}
.deleted-header {
  display: flex;
  justify-content: space-between;
  padding: 16rpx 32rpx;
  background: #f5f5f5;
}
.deleted-title {
  font-size: 26rpx;
  color: #888;
}
.deleted-toggle {
  font-size: 26rpx;
  color: #667eea;
}
.fab-row {
  padding: 24rpx;
  background: #fff;
  border-top: 2rpx solid #eee;
}
.btn-new {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background: #667eea;
  color: #fff;
  border-radius: 8rpx;
  font-size: 32rpx;
}
.btn-new:disabled {
  background: #b0b8e8;
}
</style>