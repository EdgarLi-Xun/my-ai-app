<script setup lang="ts">
/**
 * 对话详情页（聊天）/ Conversation detail (chat) page
 *
 * 消息列表 + 输入框 + SSE 流式回复 + 重新生成（ASSISTANT 消息右键/长按）。
 * Messages list + input box + SSE streaming reply + regenerate (long-press assistant message).
 */
import { ref, computed } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import type { MessageVo, StreamingResponse } from '@myai/sdk';
import { getSdk, sdkStorage, sdkState, streamConversationMessage, streamRegenerate } from '@/sdk';

const conversationId = ref<number>(0);
const messages = ref<MessageVo[]>([]);
const input = ref('');
const sending = ref(false);
const streaming = ref(false);
const errorMsg = ref('');
const streamingText = ref('');
const scrollTop = ref(0);
const messagesList = ref<StreamingResponse | null>(null);

onLoad((query) => {
  const id = Number((query as { id?: string })?.id ?? 0);
  if (!id) {
    uni.showToast({ title: '缺少对话 ID', icon: 'none' });
    uni.navigateBack();
    return;
  }
  conversationId.value = id;
  load();
});

onUnload(() => {
  // 取消正在进行的流 / cancel in-flight stream
  if (messagesList.value) {
    messagesList.value.abort();
    messagesList.value = null;
  }
});

async function load() {
  try {
    const { messageApi } = getSdk();
    messages.value = await messageApi.list(conversationId.value);
    scrollToBottom();
  } catch (err: unknown) {
    const e = err as { message?: string };
    errorMsg.value = e.message ?? '加载失败';
  }
}

function scrollToBottom() {
  // 简单滚动到底部（messages 变化后 100ms 滚）
  setTimeout(() => {
    scrollTop.value = Number.MAX_SAFE_INTEGER;
  }, 100);
}

async function onSend() {
  const text = input.value.trim();
  if (!text || streaming.value) return;
  sending.value = true;
  streaming.value = true;
  errorMsg.value = '';

  // 1. 立即把 USER 消息加到本地（乐观更新）
  const tempUserMsg: MessageVo = {
    id: -Date.now(),
    conversationId: conversationId.value,
    role: 'USER',
    content: text,
    isOrphaned: false,
    createdAt: new Date().toISOString(),
  };
  messages.value = [...messages.value, tempUserMsg];
  input.value = '';
  scrollToBottom();

  streamingText.value = '';

  // 2. 流式获取 AI 回复
  const backendUrl = sdkState.backendUrl;
  if (!backendUrl) {
    errorMsg.value = '后端 URL 未配置';
    streaming.value = false;
    sending.value = false;
    return;
  }

  const token = sdkStorage.getToken();
  messagesList.value = streamConversationMessage({
    baseUrl: backendUrl,
    conversationId: conversationId.value,
    content: text,
    getToken: () => token,
  });

  try {
    for await (const ev of messagesList.value.events()) {
      if (ev.type === 'token') {
        streamingText.value += ev.text;
      } else if (ev.type === 'done') {
        // 流结束：刷新消息列表拿到真实 ID
        await load();
        streamingText.value = '';
        break;
      } else if (ev.type === 'error') {
        errorMsg.value = `${ev.code}: ${ev.message}`;
        break;
      }
    }
  } catch (err: unknown) {
    const e = err as { message?: string };
    errorMsg.value = e.message ?? '流式失败';
  } finally {
    streaming.value = false;
    sending.value = false;
    messagesList.value = null;
  }
}

async function onLongPressMessage(msg: MessageVo) {
  if (msg.role !== 'ASSISTANT') return;
  const choice = await new Promise<'regenerate' | 'cancel'>((resolve) => {
    uni.showActionSheet({
      itemList: ['重新生成'],
      success: (res) => {
        if (res.tapIndex === 0) resolve('regenerate');
        else resolve('cancel');
      },
      fail: () => resolve('cancel'),
    });
  });
  if (choice === 'regenerate') {
    await regenerate(msg);
  }
}

async function regenerate(target: MessageVo) {
  if (streaming.value) return;
  streaming.value = true;
  streamingText.value = '';
  errorMsg.value = '';

  const backendUrl = sdkState.backendUrl;
  if (!backendUrl) {
    errorMsg.value = '后端 URL 未配置';
    streaming.value = false;
    return;
  }
  const token = sdkStorage.getToken();
  messagesList.value = streamRegenerateFn(backendUrl, target.id, token);

  try {
    for await (const ev of messagesList.value.events()) {
      if (ev.type === 'token') streamingText.value += ev.text;
      else if (ev.type === 'done') {
        await load();
        streamingText.value = '';
        break;
      } else if (ev.type === 'error') {
        errorMsg.value = `${ev.code}: ${ev.message}`;
        break;
      }
    }
  } catch (err: unknown) {
    const e = err as { message?: string };
    errorMsg.value = e.message ?? '重新生成失败';
  } finally {
    streaming.value = false;
    messagesList.value = null;
  }
}

function streamRegenerateFn(baseUrl: string, messageId: number, token: string | null): StreamingResponse {
  return streamRegenerate({ baseUrl, messageId, getToken: () => token });
}

const canSend = computed(() => !streaming.value && input.value.trim().length > 0);

function onInputChange(e: unknown) {
  const v = (e as { detail?: { value?: unknown } } | undefined)?.detail?.value;
  input.value = typeof v === 'string' ? v : '';
}
</script>

<template>
  <view class="page">
    <scroll-view class="messages" scroll-y :scroll-top="scrollTop">
      <view
        v-for="m in messages"
        :key="m.id"
        :class="['message', m.role === 'USER' ? 'msg-user' : 'msg-assistant']"
        @longpress="onLongPressMessage(m)"
      >
        <text class="msg-content">{{ m.content }}</text>
        <text class="msg-meta">{{ m.role }} · {{ new Date(m.createdAt).toLocaleTimeString('zh-CN') }}</text>
      </view>

      <view v-if="streamingText" class="message msg-assistant msg-streaming">
        <text class="msg-content">{{ streamingText }}</text>
        <text class="msg-meta">▍</text>
      </view>

      <view v-if="errorMsg" class="error">{{ errorMsg }}</view>
    </scroll-view>

    <view class="composer">
      <textarea
        v-model="input"
        class="textarea"
        placeholder="说点什么…"
        :disabled="streaming"
        auto-height
        :show-confirm-bar="false"
        @input="onInputChange"
      />
      <button class="btn-send" :disabled="!canSend" @click="onSend">
        {{ streaming ? '发送中…' : '发送' }}
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
.messages {
  flex: 1;
  padding: 16rpx;
}
.message {
  display: inline-block;
  max-width: 80%;
  padding: 20rpx 24rpx;
  margin: 8rpx 16rpx;
  border-radius: 16rpx;
  font-size: 30rpx;
  line-height: 1.5;
}
.msg-user {
  background: #667eea;
  color: #fff;
  align-self: flex-end;
  margin-left: auto;
}
.msg-user .msg-meta {
  color: rgba(255, 255, 255, 0.7);
}
.msg-assistant {
  background: #fff;
  color: #333;
  border: 2rpx solid #eee;
}
.msg-streaming {
  border-color: #667eea;
}
.msg-content {
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-meta {
  display: block;
  margin-top: 8rpx;
  font-size: 20rpx;
  color: rgba(0, 0, 0, 0.4);
}
.error {
  padding: 16rpx;
  color: #dd524d;
  font-size: 26rpx;
  text-align: center;
}
.composer {
  display: flex;
  align-items: flex-end;
  padding: 16rpx 24rpx;
  background: #fff;
  border-top: 2rpx solid #eee;
  gap: 16rpx;
}
.textarea {
  flex: 1;
  min-height: 64rpx;
  max-height: 240rpx;
  padding: 16rpx;
  border: 2rpx solid #ddd;
  border-radius: 8rpx;
  font-size: 28rpx;
  background: #fff;
}
.btn-send {
  width: 144rpx;
  height: 72rpx;
  line-height: 72rpx;
  background: #667eea;
  color: #fff;
  border-radius: 8rpx;
  font-size: 28rpx;
  margin: 0;
}
.btn-send:disabled {
  background: #b0b8e8;
}
</style>