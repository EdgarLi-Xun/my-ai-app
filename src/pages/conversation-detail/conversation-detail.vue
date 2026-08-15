<script setup lang="ts">
/**
 * 对话详情页（聊天）/ Conversation detail (chat) page
 *
 * 消息列表 + 输入框 + SSE 流式回复 + 重新生成（ASSISTANT 消息右键/长按）。
 * Messages list + input box + SSE streaming reply + regenerate (long-press assistant message).
 */
import { ref, computed, nextTick } from 'vue';
import { onLoad, onReady, onShow, onUnload } from '@dcloudio/uni-app';
import type { MessageVo, StreamingResponse } from '@myai/sdk';
import { getSdk, sdkStorage, sdkState, streamConversationMessage, streamRegenerate } from '@/sdk';

const conversationId = ref<number>(0);
/** 同步到系统导航栏的当前标题（默认 "新对话"） / current title driving native nav bar */
const navTitle = ref<string>('新对话');
/** auto-title 兜底重试句柄：标题为空（后端 async 还没完）4 秒后再拉一次 / auto-title retry handle */
let autoTitleRetryTimer: ReturnType<typeof setTimeout> | null = null;
const messages = ref<MessageVo[]>([]);
const input = ref('');
const sending = ref(false);
const streaming = ref(false);
const errorMsg = ref('');
const streamingText = ref('');
/** scroll-into-view 哨兵 id；空串表示关闭 auto-scroll-to-bottom。/ scroll-into-view sentinel id; empty disables auto-scroll. */
const scrollAnchor = ref<string>('');
/** 流式 token 到来时的滚动去抖句柄 / debounce handle for streaming auto-scroll */
let scrollDebounce: ReturnType<typeof setTimeout> | null = null;
const messagesList = ref<StreamingResponse | null>(null);

/** 思考中动画：当前高亮的 dot 下标（0/1/2），循环切换 / active dot index in thinking animation */
const activeDot = ref(0);
let thinkingTimer: ReturnType<typeof setInterval> | null = null;

/** 启动"思考中"动画（350ms 切换 activeDot）/ start thinking animation */
function startThinkingAnimation(): void {
  stopThinkingAnimation();
  activeDot.value = 0;
  thinkingTimer = setInterval(() => {
    activeDot.value = (activeDot.value + 1) % 3;
  }, 350);
}

/** 停止"思考中"动画 / stop thinking animation */
function stopThinkingAnimation(): void {
  if (thinkingTimer !== null) {
    clearInterval(thinkingTimer);
    thinkingTimer = null;
  }
  activeDot.value = 0;
}

/** 应用最新标题到系统导航栏（多入口都调） / apply latest nav title to native bar.
 *
 * 三条路：
 * 1. uni.setNavigationBarTitle — App/iOS/Android/HarmonyOS 上原生生效
 * 2. H5 直接改 document.title — 浏览器 tab 标题
 * 3. H5 直接改 .uni-page-head-title 元素的 textContent — uni-app x 内嵌的顶部 bar
 * 三路并发，确保 H5 上无论 uni API 实现是否完整都能看见新标题。
 */
function applyNavTitle(): void {
  const title = navTitle.value || '新对话';
  uni.setNavigationBarTitle({ title });
  if (typeof document !== 'undefined') {
    try {
      document.title = title;
    } catch { /* ignore */ }
    try {
      // H5 fallback：直接写 uni-app x 内嵌导航栏的标题元素。
      // 实测 setNavigationBarTitle 在 H5 上偶尔不更新可见 bar；
      // 这种情况下手动改 textContent 兜底。
      const el = document.querySelector('.uni-page-head-title');
      if (el && el.textContent !== title) {
        el.textContent = title;
      }
    } catch { /* ignore */ }
  }
}

onLoad((query) => {
  const q = query as { id?: string; title?: string };
  const id = Number(q.id ?? 0);
  if (!id) {
    uni.showToast({ title: '缺少对话 ID', icon: 'none' });
    uni.navigateBack();
    return;
  }
  conversationId.value = id;
  // 立刻把 URL 里带来的标题写到 navTitle，避开 pages.json 的兜底字面。
  // (pages.json 已改为 "新对话"，所以新对话路径下也是匹配的。)
  // Immediately set navTitle from URL; avoids the static pages.json fallback.
  const fromUrl = decodeURIComponent(q.title ?? '').trim();
  navTitle.value = fromUrl || '新对话';
  applyNavTitle();
  // 监听跨页 emit：对话列表 + 当前对话的标题都需在自动命名后刷新。
  // Listen for cross-page emit: both the list and this page's title need refresh after auto-title.
  uni.$on('conversation-list-needs-refresh', onConversationListNeedsRefresh);
  load();
  void loadConversationTitle();
});

/** onReady 在页面渲染完成后触发，H5 上 setNavigationBarTitle 在这里更稳。
 * onReady fires after page renders; setNavigationBarTitle is more reliable here on H5. */
onReady(() => {
  applyNavTitle();
});

/** onShow 每次页面显示都跑（从其他页返回时），兜底再写一次。/
 * onShow fires every time the page shows (e.g., navigateBack); one more belt-and-suspenders sync. */
onShow(() => {
  applyNavTitle();
});

onUnload(() => {
  // 取消正在进行的流 / cancel in-flight stream
  if (messagesList.value) {
    messagesList.value.abort();
    messagesList.value = null;
  }
  stopThinkingAnimation();
  if (scrollDebounce !== null) {
    clearTimeout(scrollDebounce);
    scrollDebounce = null;
  }
  if (autoTitleRetryTimer !== null) {
    clearTimeout(autoTitleRetryTimer);
    autoTitleRetryTimer = null;
  }
  uni.$off('conversation-list-needs-refresh', onConversationListNeedsRefresh);
});

/** 跨页 emit 回调：重拉标题（消息列表已在 onSend 的 'done' 分支自己 load 过） */
function onConversationListNeedsRefresh(): void {
  void loadConversationTitle();
}

async function load() {
  try {
    const { messageApi } = getSdk();
    messages.value = await messageApi.list(conversationId.value);
    await scrollToBottom();
  } catch (err: unknown) {
    const e = err as { message?: string };
    errorMsg.value = e.message ?? '加载失败';
  }
}

/** 拉当前对话的标题（系统导航栏 + 页面内 topbar 同步显示）；失败保持旧值不报错 / fetch current conversation title */
/** 重新拉一次标题并同步到系统导航栏（自动命名完成后会用到）。如果第一次拿到空 title，4 秒后兜底重试一次。/
 * Refetch title and sync to native nav bar (used after backend auto-title completes);
 * if first fetch returns empty title, retry once at +4s to catch async auto-name. */
async function loadConversationTitle(): Promise<void> {
  try {
    const { conversationApi } = getSdk();
    const c = await conversationApi.get(conversationId.value);
    navTitle.value = c.title || '新对话';
    applyNavTitle();
    // 后端 auto-title 是 `CompletableFuture.runAsync`（典型 1-3 秒）；
    // 'done' event 触发的首次 fetch 几乎一定拿到空 title，排个 4s 重试兜底。
    // 单一重试（不分情况深度递归），避免后端永久返回空时循环。
    // Backend auto-title is async (typically 1-3s); the 'done'-triggered fetch
    // almost always sees empty title. Schedule ONE +4s retry to avoid recursion loops.
    if (!c.title && autoTitleRetryTimer === null) {
      autoTitleRetryTimer = setTimeout(() => {
        autoTitleRetryTimer = null;
        void loadConversationTitleRetry();
      }, 4000);
    }
  } catch {
    /* 拉标题失败不打断主流程；保留原标题 */
    /* title fetch failure doesn't break main flow */
  }
}

/** 兜底重试：只刷一次标题（不再排新 timer）/ retry once without re-scheduling */
async function loadConversationTitleRetry(): Promise<void> {
  try {
    const { conversationApi } = getSdk();
    const c = await conversationApi.get(conversationId.value);
    if (c.title) {
      navTitle.value = c.title;
      applyNavTitle();
    }
  } catch {
    /* swallow; system bar stays at last value */
  }
}

/**
 * 强制滚到底部 / force scroll to bottom.
 *
 * uni-app x scroll-view 的 `:scroll-into-view` 只在绑定值变化时触发，
 * 给同一个 id 不会重复触发。用"先空再回填"的 toggle 强制 re-trigger，
 * 然后用 nextTick 等 DOM 更新完再设回 id，避免 DOM 还没渲染就被改成空。
 */
async function scrollToBottom(): Promise<void> {
  scrollAnchor.value = '';
  await nextTick();
  scrollAnchor.value = 'msg-bottom-anchor';
}

/** 流式 token 期间的滚动去抖（50ms）/ debounced scroll during token stream (50ms) */
function scrollToBottomDebounced(): void {
  if (scrollDebounce !== null) return;
  scrollDebounce = setTimeout(() => {
    scrollDebounce = null;
    void scrollToBottom();
  }, 50);
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
  void scrollToBottom();

  streamingText.value = '';
  startThinkingAnimation();

  // 2. 流式获取 AI 回复
  const backendUrl = sdkState.backendUrl;
  if (!backendUrl) {
    errorMsg.value = '后端 URL 未配置';
    streaming.value = false;
    sending.value = false;
    stopThinkingAnimation();
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
        // 首个 token 到达 → 停止思考动画，露出真实流式文本 / first token: stop thinking, show real text
        if (!streamingText.value) stopThinkingAnimation();
        streamingText.value += ev.text;
        scrollToBottomDebounced();
      } else if (ev.type === 'done') {
        // 流结束：刷新消息列表拿到真实 ID
        streamingText.value = '';
        streaming.value = false;
        await load();
        // 通知 conversations 列表页刷新：后端首条 USER 消息时 async 触发 AI 自动命名，
        // 列表页 onShow 的同步 load 容易赶上空的 title，这里跨页通知保证它尽早再拉一次。
        // Notify conversations list to refresh: backend kicks off async AI title
        // generation on the first USER message; the list page's onShow sync load
        // may race with the async title — emit so the list refreshes as soon as
        // we're back (or while still in background, the data is already updated).
        uni.$emit('conversation-list-needs-refresh', { conversationId: conversationId.value });
        break;
      } else if (ev.type === 'error') {
        errorMsg.value = `${ev.code}: ${ev.message}`;
        streamingText.value = '';
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
    stopThinkingAnimation();
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
  startThinkingAnimation();

  const backendUrl = sdkState.backendUrl;
  if (!backendUrl) {
    errorMsg.value = '后端 URL 未配置';
    streaming.value = false;
    stopThinkingAnimation();
    return;
  }
  const token = sdkStorage.getToken();
  messagesList.value = streamRegenerateFn(backendUrl, target.id, token);

  try {
    for await (const ev of messagesList.value.events()) {
      if (ev.type === 'token') {
        if (!streamingText.value) stopThinkingAnimation();
        streamingText.value += ev.text;
        scrollToBottomDebounced();
      } else if (ev.type === 'done') {
        streamingText.value = '';
        streaming.value = false;
        await load();
        // 通知 conversations 列表页刷新（与 onSend 共用同一条 emit）
        // Notify conversations list (regenerate also touches updated_at)
        uni.$emit('conversation-list-needs-refresh', { conversationId: conversationId.value });
        break;
      } else if (ev.type === 'error') {
        errorMsg.value = `${ev.code}: ${ev.message}`;
        streamingText.value = '';
        break;
      }
    }
  } catch (err: unknown) {
    const e = err as { message?: string };
    errorMsg.value = e.message ?? '重新生成失败';
  } finally {
    streaming.value = false;
    messagesList.value = null;
    stopThinkingAnimation();
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
    <scroll-view class="messages" scroll-y :scroll-into-view="scrollAnchor">
      <view
        v-for="m in messages"
        :key="m.id"
        :class="['message', m.role === 'USER' ? 'msg-user' : 'msg-assistant']"
      >
        <view class="bubble" @longpress="onLongPressMessage(m)">
          <text class="msg-content">{{ m.content }}</text>
          <text class="msg-meta">{{ m.role }} · {{ new Date(m.createdAt).toLocaleTimeString('zh-CN') }}</text>
        </view>
      </view>

      <!-- 等待首个 token：显示"思考中"动画 / waiting for first token: show thinking dots -->
      <view v-if="streaming && !streamingText" class="message msg-assistant msg-thinking">
        <view class="bubble thinking-bubble">
          <view
            v-for="i in 3"
            :key="i"
            class="dot"
            :class="{ 'dot-active': activeDot === i - 1 }"
          />
        </view>
      </view>

      <view v-if="streamingText" class="message msg-assistant msg-streaming">
        <view class="bubble">
          <text class="msg-content">{{ streamingText }}</text>
          <text class="msg-meta">▍</text>
        </view>
      </view>

      <view v-if="errorMsg" class="error">{{ errorMsg }}</view>

      <!-- 滚动哨兵：scroll-into-view 锚点 / scroll sentinel for scroll-into-view -->
      <view id="msg-bottom-anchor" class="anchor" />
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
  /* 阻止整页滚动 —— composer 必须钉在底部，自身滚动由内层 scroll-view 承担。 */
  /* Block page-level scroll — composer must stay pinned; inner scroll-view handles its own scroll. */
  overflow: hidden;
  background: #fafafa;
}
.messages {
  flex: 1;
  /* flex: 1 默认 min-height: auto，scroll-view 内容会把它撑破 100vh。
     min-height: 0 让 flex 真正约束 scroll-view 高度。 */
  /* flex: 1 implies min-height: auto, which lets scroll-view's content overflow the page.
     min-height: 0 lets flex actually constrain the scroll-view height. */
  min-height: 0;
  padding: 16rpx;
}
/* 行：水平 flex，决定 bubble 推到左/右 / row: horizontal flex, decides bubble side */
.message {
  display: flex;
  margin: 8rpx 16rpx;
}
.msg-user {
  justify-content: flex-end;
}
.msg-assistant {
  justify-content: flex-start;
}
/* 气泡：实际承载内容、背景、边框 / bubble: carries content + visual */
.bubble {
  max-width: 80%;
  padding: 20rpx 24rpx;
  border-radius: 16rpx;
  font-size: 30rpx;
  line-height: 1.5;
}
.msg-user .bubble {
  background: #667eea;
  color: #fff;
}
.msg-assistant .bubble {
  background: #fff;
  color: #333;
  border: 2rpx solid #eee;
}
.msg-streaming .bubble {
  border-color: #667eea;
}
/* 思考中气泡：三圆点逐个高亮（Vue 驱动 activeDot，350ms 切换）。
   只用 opacity（+ transition 软化），跨平台都生效；不依赖 CSS @keyframes。 */
.thinking-bubble {
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-height: 60rpx;
}
.dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #999;
  opacity: 0.3;
  /* H5 上让 dot 切换更顺滑；App 端 transition 支持较弱但不影响可读性。 */
  transition: opacity 200ms ease-in-out;
}
.dot-active {
  opacity: 1;
}
.msg-user .msg-meta {
  color: rgba(255, 255, 255, 0.7);
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
/* 滚动哨兵：占 1rpx 让 scroll-into-view 有锚点可定位 / 1rpx tall sentinel for scroll-into-view */
.anchor {
  width: 100%;
  height: 1rpx;
}
.composer {
  display: flex;
  align-items: flex-end;
  padding: 16rpx 24rpx;
  background: #fff;
  border-top: 2rpx solid #eee;
  gap: 16rpx;
  /* 输入区始终保持自身高度，不被 messages 挤压。 */
  /* Composer keeps its own height; never squeezed by messages. */
  flex-shrink: 0;
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