/**
 * App 全局 SDK 启动器 / App global SDK bootstrap
 *
 * 单例：FetchHttpClient + AuthService + 5 个 API 类 + storage。
 * 后端 URL 变更或登出时通过 rebuildSdk() / destroySdk() 重建实例。
 * Singleton: FetchHttpClient + AuthService + 5 API classes + storage.
 * Rebuild via rebuildSdk() / destroySdk() when backend URL changes or on logout.
 */

import { reactive } from 'vue';
import {
  AuthService,
  ConversationApi,
  FetchHttpClient,
  LocalStorageAdapter,
  LogsApi,
  MessageApi,
  ProviderApi,
  UniStorageAdapter,
  UserApiKeyApi,
  createStorage,
  streamConversationMessage as sdkStreamConversationMessage,
  streamRegenerate as sdkStreamRegenerate,
  validateBackendUrl as sdkValidateBackendUrl,
  type AuthProvider,
  type SdkStorage,
  type StorageAdapter,
  type UserVo,
} from '@myai/sdk';
import { ensureGlobalAbortController, ensureGlobalFetch, ensureGlobalTextDecoder, ensureGlobalTextEncoder } from './fetch-polyfill';

// ============================================================
// App 端 Web API 兼容垫片 / App-side Web API polyfills
// ============================================================

// 在任何 HTTP 请求前安装：uni-app x App 没有原生 fetch / AbortController / TextDecoder，
// 落到 uni.request + 最小 AbortController / TextDecoder shim。
// Install before any HTTP request: uni-app x App has no native fetch / AbortController / TextDecoder;
// fall back to uni.request + minimal AbortController / TextDecoder shim.
// H5 / Node：原生 API 存在 → 三个调用都直接跳过。
// H5 / Node: native APIs present → all three calls short-circuit.
ensureGlobalFetch();
ensureGlobalAbortController();
ensureGlobalTextDecoder();
ensureGlobalTextEncoder();

// ============================================================
// fetchImpl 注入（绕过 mp-weixin bare `fetch` 解析问题）
// fetchImpl injection (workaround for mp-weixin's bare `fetch` resolution)
// ============================================================

/**
 * mp-weixin 运行时，bundle 内裸标识符 `fetch` 不解析到 `globalThis.fetch`（实测
 * `globalThis.fetch` getter 在 SDK 调 fetch 时不会被触发，SDK 内部 `r = this.opts.fetchImpl
 * ?? fetch` 得到 `undefined` → `await r(s,o)` 抛 `f2 is not a function`）。
 *
 * SDK 已经提供 `fetchImpl` 选项走显式注入路径。我们把所有 SDK HTTP 入口
 * （FetchHttpClient 构造 + streamConversationMessage + streamRegenerate
 * + validateBackendUrl）都包装一层，自动注入 `globalThis.fetch`，让 SDK 永远
 * 走 `fetchImpl` 路径。
 *
 * On mp-weixin the bare identifier `fetch` in the bundled SDK does not resolve to
 * `globalThis.fetch`. The SDK has a `fetchImpl` option that bypasses this — we wrap
 * every SDK HTTP entry point to inject it automatically.
 *
 * @param fn      被包装的 SDK 函数 / SDK function to wrap
 * @param minArgs 声明参数个数；调用方省略尾部 options 对象时据此补一个 `{ fetchImpl }`。
 *                0 表示 options 必传（如 stream 两个函数）。
 *                Declared arity; used to append `{ fetchImpl }` when the caller omits
 *                the trailing options object. 0 = options is required (stream functions).
 */
function injectFetchImpl<T extends (...args: never[]) => unknown>(fn: T, minArgs = 0): T {
  const wrapped = (...args: unknown[]) => {
    const last = args[args.length - 1];
    if (last !== null && typeof last === 'object') {
      if (!('fetchImpl' in (last as Record<string, unknown>))) {
        (last as Record<string, unknown>).fetchImpl = globalThis.fetch;
      }
    } else if (args.length < minArgs) {
      args.push({ fetchImpl: globalThis.fetch });
    }
    return fn(...(args as Parameters<T>));
  };
  return wrapped as unknown as T;
}

const streamConversationMessage = injectFetchImpl(sdkStreamConversationMessage);
const streamRegenerate = injectFetchImpl(sdkStreamRegenerate);
// validateBackendUrl(url, options?)：options 可省略 → minArgs = 2
// validateBackendUrl(url, options?): options optional → minArgs = 2
const validateBackendUrl = injectFetchImpl(sdkValidateBackendUrl, 2);

// ============================================================
// 默认后端 URL / Default backend URL
// ============================================================

/**
 * 默认后端 URL：当 storage 中没有持久化的 backendUrl 时，bootSdk() 会用此值兜底。
 * Default backend URL — used as fallback when storage has no persisted backendUrl.
 *
 * 调整方法：直接改这个常量并重新构建。
 * To change: edit this constant and rebuild.
 */
export const DEFAULT_BACKEND_URL = 'http://192.168.2.144:8031';

// ============================================================
// 存储选择 / Storage selection
// ============================================================

/**
 * 选平台存储：App / mp-weixin 优先 UniStorageAdapter，H5 用 LocalStorageAdapter。
 * Platform-agnostic storage selection.
 *
 * mp-weixin 运行时没有 `uni` 全局（uni-app x 把 uni.* 编译为模块内引用），
 * 只有 `wx`；UniStorageAdapter 内部会回退 wx.*StorageSync，所以这里 uni / wx
 * 任一存在即选 UniStorageAdapter。此前只判 uni → 小程序落到 LocalStorageAdapter
 * → 沙箱无 localStorage → token 等静默丢失 → 登录后 /api/auth/me 匿名 → 5000。
 */
function pickAdapter(): StorageAdapter {
  const g = globalThis as { uni?: unknown; wx?: unknown };
  if (typeof g.uni !== 'undefined' || typeof g.wx !== 'undefined') {
    return new UniStorageAdapter();
  }
  return new LocalStorageAdapter();
}

// 单例 storage（H5 + App 都用同一个实例，HTTP 层重建时 storage 不动）
// Singleton storage — survives across HTTP rebuilds.
const adapter: StorageAdapter = pickAdapter();
const storage: SdkStorage = createStorage(adapter);

// ============================================================
// 响应式状态 / Reactive state
// ============================================================

interface SdkState {
  /** SDK 是否已 boot / whether SDK has been booted */
  initialized: boolean;
  /** 当前后端 URL / current backend URL */
  backendUrl: string | null;
  /** 当前登录用户 / current logged-in user */
  currentUser: UserVo | null;
}

const state = reactive<SdkState>({
  initialized: false,
  backendUrl: null,
  currentUser: null,
});

// ============================================================
// SDK 实例（mutable 单例）/ SDK instances (mutable singletons)
// ============================================================

export interface SdkBundle {
  http: FetchHttpClient;
  auth: AuthProvider;
  providerApi: ProviderApi;
  userApiKeyApi: UserApiKeyApi;
  conversationApi: ConversationApi;
  messageApi: MessageApi;
  logsApi: LogsApi;
}

let bundle: SdkBundle | null = null;

// ============================================================
// 4010 → AuthService + state 同步 / 4010 sync
// ============================================================

/** 4010 触发：清 token + 清登录态 / called on 4010 */
function handleUnauthorized(): void {
  state.currentUser = null;
  storage.clearToken();
  storage.clearActiveConversationId();
}

// ============================================================
// SDK 生命周期 / SDK lifecycle
// ============================================================

/**
 * 启动 SDK：从 storage 读取 backendUrl（如有）重建 HTTP/Auth/API 实例。
 * Boot SDK: read backendUrl from storage (if any) and rebuild HTTP/Auth/API instances.
 */
export function bootSdk(): void {
  if (state.initialized) return;
  const url = storage.getBackendUrl() ?? DEFAULT_BACKEND_URL;
  if (url) {
    rebuildSdk(url);
  }
  state.initialized = true;
}

/**
 * 重建 SDK：用户改了后端 URL 或首次配置后调用。
 * Rebuild SDK: called when user changes backend URL or after first-time setup.
 *
 * @param backendUrl 新的后端 URL / new backend URL
 */
export function rebuildSdk(backendUrl: string): void {
  const http = new FetchHttpClient({
    baseUrl: backendUrl,
    getToken: () => storage.getToken(),
    onUnauthorized: () => {
      // 触发 AuthService 自身的清理 + 触发上层 handler
      // AuthService.notifyUnauthorized handles its own cleanup; we sync state.
      const a = bundle?.auth as unknown as { notifyUnauthorized?: () => void } | undefined;
      if (a?.notifyUnauthorized) {
        a.notifyUnauthorized();
      } else {
        handleUnauthorized();
      }
    },
    // ★ 显式注入 fetchImpl —— 绕过 mp-weixin runtime 下 bare `fetch` 不解析到 globalThis.fetch 的问题。
    // Explicitly inject fetchImpl to bypass the mp-weixin bare `fetch` resolution issue.
    fetchImpl: globalThis.fetch,
  });
  const auth = new AuthService({ http, storage });
  bundle = {
    http,
    auth,
    providerApi: new ProviderApi(http),
    userApiKeyApi: new UserApiKeyApi(http),
    conversationApi: new ConversationApi(http),
    messageApi: new MessageApi(http),
    logsApi: new LogsApi(http),
  };
  state.backendUrl = backendUrl;
  storage.setBackendUrl(backendUrl);
}

/**
 * 销毁 SDK（清后端 URL + 所有实例，保留 storage 以备下次配置）。
 * Destroy SDK: clear backend URL + instances, keep storage for re-config.
 */
export function destroySdk(): void {
  bundle = null;
  state.initialized = false; // 复位，否则 bootSdk() 会因 initialized=true 永远早退，登出后无法再登录
  state.backendUrl = null;
  state.currentUser = null;
  storage.clearBackendUrl();
  storage.clearToken();
  storage.clearActiveConversationId();
}

// ============================================================
// 取 SDK / Get SDK
// ============================================================

export class SdkNotBootedError extends Error {
  constructor() {
    super('SDK not booted — call bootSdk() first or rebuildSdk(backendUrl)');
    this.name = 'SdkNotBootedError';
  }
}

/**
 * 取当前 SDK bundle（throw if not booted or no backendUrl）
 * Get current SDK bundle. Throws if not booted.
 */
export function getSdk(): SdkBundle {
  if (!bundle) throw new SdkNotBootedError();
  return bundle;
}

/**
 * 检查 SDK 是否就绪（booted + backendUrl set）/ Check if SDK is ready
 */
export function isSdkReady(): boolean {
  return bundle !== null && state.backendUrl !== null;
}

// ============================================================
// Auth state helpers
// ============================================================

/**
 * 标记登录态（页面调用：登录成功后 fetchCurrentUser → 写入）
 * Mark authenticated (call after login: fetchCurrentUser → set)
 */
export function setCurrentUser(user: UserVo | null): void {
  state.currentUser = user;
}

/**
 * 检查 token 是否存在（直接读 storage）/ check whether token exists (direct storage read)
 */
export function hasToken(): boolean {
  return storage.getToken() !== null;
}

// ============================================================
// Reactive accessors（页面用）/ Reactive accessors (for pages)
// ============================================================

export const sdkState = state;
export { storage as sdkStorage };

// 常用 SDK 工具的 re-export / re-export common SDK utilities for pages
// 注意：streamConversationMessage / streamRegenerate / validateBackendUrl 是本地包装版本
// （自动注入 fetchImpl），不要从 '@myai/sdk' 直接 re-export 这三个名字。
// Note: streamConversationMessage / streamRegenerate / validateBackendUrl are locally wrapped
// (auto-inject fetchImpl); do not re-export these names directly from '@myai/sdk'.
export { type StreamingEvent, type StreamRequestOptions } from '@myai/sdk';
// 本地包装版（自动注入 fetchImpl）覆盖 @myai/sdk 原版
// Locally-wrapped versions (auto-inject fetchImpl) shadow the originals
export { streamConversationMessage, streamRegenerate, validateBackendUrl };
