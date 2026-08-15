/**
 * uni-app x App 端 Web API 兼容垫片 / Web API polyfills for uni-app x App
 *
 * 背景 / Background:
 * `@myai/sdk` 假设几个 Web API 全局存在：fetch、AbortController、TextDecoder、ReadableStream。
 * 实测 uts 运行时（iOS / Android / HarmonyOS NEXT）均不注入这些，
 * H5 浏览器和 Node 20+ 才原生支持。
 *
 * 在 App 端按需安装：
 * - `fetch` shim → 落到 `uni.request`；只覆盖 SDK 用到的 Response 字段
 *   （`ok` / `status` / `statusText` / `json()` / `body.getReader()`）。
 *   - 非流式：body 用立即关闭的 reader 占位（SDK 不读 body）。
 *   - 流式端点（POST + 路径以 /messages 或 /regenerate 结尾）：
 *     dataType:'text' 拿整段 SSE 文本，body 用一次性 reader 把整段文本作为单 chunk
 *     喂给 SDK parser —— SDK 解析所有 SSE 帧、emit 所有 token/done 事件，
 *     AI 回复能正常进入消息列表。代价：App 端没有 typewriter 效果（一次性到位）。
 *     真 App 逐字流需换 XMLHttpRequest.onprogress 或 uni-app x 原生流式 API。
 * - `AbortController` shim → 最小实现，覆盖 SDK 实际访问的字段
 *   （`signal.aborted` / `signal.reason` / `signal.addEventListener('abort')` /
 *   `abort(reason?)`）。
 * - `TextDecoder` shim → 仅支持 utf-8，覆盖 SDK 流式分支的用法
 *   （`new TextDecoder('utf-8').decode(uint8, { stream: true })`）。
 *   跨 chunk 的不完整多字节序列在 `stream:true` 之间保留；`stream:false`
 *   时把残余字节替换为 U+FFFD（与原生非 fatal 模式一致）。
 * - `TextEncoder` shim → `fetch-polyfill` 的 `makeStreamingBody` 用
 *   `new TextEncoder().encode(text)` 把整段 SSE 文本编码成 Uint8Array 喂给
 *   SDK reader。App uts 运行时若没有原生 TextEncoder，原 try/catch 兜底成
 *   空数组，导致 SDK 解析不到任何 SSE 帧、流式无事件 → 消息不显示。
 *   shim 仅实现 `encode(string) → Uint8Array`（utf-8）、`encodeInto` 返回
 *   `{read:0, written:0}`（无增量需求）。
 *
 * H5 / Node：原生 API 已存在 → 全部跳过安装。
 * App：缺哪个装哪个，互不影响。
 */

interface UniRequestOptions {
  url: string;
  method?: string;
  data?: string | object;
  header?: Record<string, string>;
  sslVerify?: boolean;
  dataType?: 'json' | 'text';
  success?: (res: UniRequestSuccess) => void;
  fail?: (err: UniRequestFail) => void;
}

interface UniRequestSuccess {
  data: unknown;
  statusCode: number;
  header: Record<string, string>;
}

interface UniRequestFail {
  errMsg: string;
}

interface UniGlobal {
  request?: (opts: UniRequestOptions) => unknown;
}

/** SDK 用到的最小 Response 形状 / minimal Response shape used by SDK */
interface FetchResponseShim {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  /**
   * body 形状：覆盖 SDK 流式 IIFE 的全部用法。
   * Shape covers all uses by the SDK streaming IIFE.
   * - 非流式：reader 立即 done（避免 donePromise 拒）。
   * - 流式：reader 先返回 SSE body 的 Uint8Array，再 done。
   * - Non-streaming: reader returns done immediately (avoids donePromise rejection).
   * - Streaming: reader returns the SSE body as Uint8Array, then done.
   */
  body: {
    getReader(): {
      read(): Promise<
        | { value: Uint8Array; done: false }
        | { value: undefined; done: true }
      >;
      releaseLock(): void;
    };
  };
}

/** 构造一个立即结束的 reader / build an immediately-finished reader */
function makeClosedReaderStub(): FetchResponseShim['body'] {
  return {
    getReader() {
      return {
        read: async () => ({ done: true, value: undefined }),
        releaseLock: () => {},
      };
    },
  };
}

/**
 * 流式端点 URL 检测：POST + 路径以 /messages 或 /regenerate 结尾。
 * 对应 SDK 的 streamConversationMessage (POST /api/conversations/{id}/messages)
 * 与 streamRegenerate (POST /api/messages/{id}/regenerate)。
 *
 * Detect streaming endpoints by URL pattern. Matches the SDK's two SSE paths.
 */
function isStreamingRequest(method: string, url: string): boolean {
  if (method !== 'POST') return false;
  const path = url.split('?')[0];
  return path.endsWith('/messages') || path.endsWith('/regenerate');
}

/**
 * 把整段 SSE body 一次性塞给 SDK reader / full SSE body → single-chunk reader.
 *
 * App 端 `uni.request` 不是真流式（拿到的是完整响应文本，不是分片流）。
 * 这里把整段文本编码成一个 Uint8Array chunk，让 SDK 的流式 IIFE 一次性 parse、
 * emit 所有事件 —— AI 回复就能出现在消息列表里。
 *
 * 取舍：没有 typewriter 效果（文本一次性到位）。H5 走原生 fetch 不经过这里。
 * 真 App 端逐字流需要换成 XMLHttpRequest.onprogress 或 uni-app x 原生流式 API。
 *
 * Trade-off: no typewriter effect on App (text appears in one batch).
 * H5 is unaffected (uses native fetch). Real per-token streaming on App needs
 * XMLHttpRequest.onprogress or uni-app x native streaming — out of scope here.
 */
function makeStreamingBody(text: string): FetchResponseShim['body'] {
  let encoded: Uint8Array;
  try {
    encoded = new TextEncoder().encode(text);
  } catch {
    encoded = new Uint8Array(0);
  }
  let i = 0;
  return {
    getReader() {
      let released = false;
      return {
        read: async () => {
          if (released) throw new Error('reader released');
          if (i === 0) {
            i = 1;
            return { value: encoded, done: false };
          }
          return { value: undefined, done: true };
        },
        releaseLock: () => {
          released = true;
        },
      };
    },
  };
}

/** shim 返回值到 Response 的结构兼容转换 / structural cast shim → Response */
function toResponseShim(s: FetchResponseShim): Response {
  // SDK 读 .ok / .status / .statusText / .json() / .body.getReader()，结构上等价于 Response。
  // SDK reads .ok / .status / .statusText / .json() / .body.getReader(); structurally compatible.
  return s as unknown as Response;
}

/** App 全局（运行时存在）/ App globals (provided at runtime) */
interface AppRuntimeGlobals {
  fetch?: typeof fetch;
  uni?: UniGlobal;
  AbortController?: typeof AbortController;
  TextDecoder?: typeof TextDecoder;
  TextEncoder?: typeof TextEncoder;
}

/** 标准化 RequestInit.headers → Record<string,string> / normalize headers */
function normalizeHeaders(h: RequestInit['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (typeof Headers !== 'undefined' && h instanceof Headers) {
    h.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  if (Array.isArray(h)) {
    for (const [k, v] of h) out[k] = v;
    return out;
  }
  return { ...(h as Record<string, string>) };
}

/**
 * 若 globalThis.fetch 不存在，且 uni.request 可用，则挂上一个 fetch 形状的实现。
 * If globalThis.fetch is missing and uni.request exists, install a fetch-shaped shim.
 *
 * 幂等：已安装过（标记在 globalThis 上）则跳过 / idempotent — re-entry no-op.
 */
export function ensureGlobalFetch(): void {
  const g = globalThis as AppRuntimeGlobals;

  // H5 / Node：原生 fetch 已存在，跳过。
  // H5 / Node: native fetch exists; skip.
  if (typeof g.fetch === 'function') return;

  // 非 uni-app x App 端（或 uts 注入失败）：无法兜底，跳过。
  // Not uni-app x App (or uni injection failed): no fallback possible.
  if (typeof g.uni?.request !== 'function') return;

  const uniRequest = g.uni.request.bind(g.uni);

  const fetchPolyfill: typeof fetch = function fetchPolyfill(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    const header = normalizeHeaders(init?.headers);

    let data: string | undefined;
    if (init?.body != null) {
      data = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
    }

    return new Promise<Response>((resolve, reject) => {
      try {
        // 流式端点：dataType:'text' 让 uni.request 把 SSE body 当字符串返回（不尝试 JSON parse）
        // Streaming endpoints: 'text' so uni.request returns raw SSE body (no JSON parse).
        const streaming = isStreamingRequest(method, url);
        uniRequest({
          url,
          method,
          data,
          header,
          ...(streaming ? { dataType: 'text' as const } : {}),
          success: (res) => {
            const status = res.statusCode ?? 0;
            resolve(
              toResponseShim({
                ok: status >= 200 && status < 300,
                status,
                statusText: String(status),
                json: async () => {
                  const d = res.data;
                  if (typeof d === 'string') {
                    try {
                      return JSON.parse(d);
                    } catch {
                      return d;
                    }
                  }
                  return d;
                },
                // 流式 → 把整段 SSE body 一次性塞给 reader；非流式 → 仍用立即关闭的 stub。
                // Streaming → feed full SSE body as one chunk; non-streaming → closed stub.
                body: streaming
                  ? makeStreamingBody(typeof res.data === 'string' ? res.data : (res.data == null ? '' : String(res.data)))
                  : makeClosedReaderStub(),
              }),
            );
          },
          fail: (err) => {
            reject(new Error(err?.errMsg ?? 'uni.request failed'));
          },
        });
      } catch (err) {
        // uni.request 同步抛错（极少见，如参数非法）
        // Defensive: uni.request can throw synchronously in rare cases.
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  };

  g.fetch = fetchPolyfill;
}

// ============================================================
// AbortController 垫片 / AbortController polyfill
// ============================================================

/**
 * AbortSignal 最小实现 / minimal AbortSignal shim.
 * 覆盖 SDK 实际访问的字段与方法。
 * Covers only the fields/methods the SDK actually accesses.
 */
class AbortSignalShim implements AbortSignal {
  aborted = false;
  reason: unknown = undefined;

  /** listener → once? / listener → whether to auto-remove after fire */
  private listeners = new Set<{ cb: (ev: Event) => void; once: boolean }>();
  private readonly controller: AbortControllerShim;

  /** onabort property backing / backing field for onabort getter/setter */
  private _onabort: ((this: AbortSignal, ev: Event) => unknown) | null = null;

  constructor(controller: AbortControllerShim) {
    this.controller = controller;
  }

  /** onabort：DOM 事件处理器 property（getter/setter 桥接到 listener 列表）/ onabort getter/setter bridge */
  get onabort(): ((this: AbortSignal, ev: Event) => unknown) | null {
    return this._onabort;
  }
  set onabort(handler: ((this: AbortSignal, ev: Event) => unknown) | null) {
    if (this._onabort) this.removeEventListener('abort', this._onabort);
    this._onabort = handler;
    if (handler) this.addEventListener('abort', handler, { once: false });
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (type !== 'abort' || !listener) return;
    const cb = typeof listener === 'function' ? listener : listener.handleEvent.bind(listener);
    const once = typeof options === 'object' ? options.once === true : options === true;
    if (this.aborted) {
      // 已 abort → once 立即触发；非 once 不触发（与原生 AbortSignal 一致）
      // Already aborted: fire once listeners immediately; non-once are no-ops (matches native).
      if (once) {
        try {
          cb({ type: 'abort', target: this } as unknown as Event);
        } catch {
          /* swallow listener errors — matching DOM behavior */
        }
      }
      return;
    }
    this.listeners.add({ cb, once });
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (type !== 'abort' || !listener) return;
    const cb = typeof listener === 'function' ? listener : listener.handleEvent.bind(listener);
    for (const entry of this.listeners) {
      if (entry.cb === cb) {
        this.listeners.delete(entry);
        return;
      }
    }
  }

  dispatchEvent(event: Event): boolean {
    if (event.type !== 'abort') return true;
    // 快照避免监听器互相注销导致漏触发
    // Snapshot to avoid listeners removing each other mid-iteration.
    const snapshot = Array.from(this.listeners);
    for (const { cb, once } of snapshot) {
      if (!this.listeners.has({ cb, once })) continue; // 已被移除
      try {
        cb(event);
      } catch {
        /* swallow listener errors */
      }
      if (once) this.listeners.delete({ cb, once });
    }
    return !('defaultPrevented' in event && event.defaultPrevented);
  }

  throwIfAborted(): void {
    if (this.aborted) {
      throw this.reason instanceof Error
        ? this.reason
        : new Error(typeof this.reason === 'string' ? this.reason : 'aborted');
    }
  }
}

/** AbortController 最小实现 / minimal AbortController shim */
class AbortControllerShim implements AbortController {
  readonly signal: AbortSignalShim;

  constructor() {
    this.signal = new AbortSignalShim(this);
  }

  abort(reason?: unknown): void {
    if (this.signal.aborted) return;
    this.signal.aborted = true;
    this.signal.reason = reason;
    this.signal.dispatchEvent({ type: 'abort' } as unknown as Event);
  }
}

/**
 * 若 globalThis.AbortController 不存在则安装最小实现。
 * Install minimal AbortController if globalThis.AbortController is missing.
 *
 * 幂等 / idempotent.
 */
export function ensureGlobalAbortController(): void {
  const g = globalThis as AppRuntimeGlobals;
  if (typeof g.AbortController === 'function') return;

  g.AbortController = AbortControllerShim as unknown as typeof AbortController;
}

// ============================================================
// TextDecoder 垫片 / TextDecoder polyfill
// ============================================================

/** UTF-8 lead byte → 该序列总字节数（1=ASCII; 2/3/4=多字节; 0=非法 lead） */
const UTF8_SEQ_LEN = ((): Uint8Array => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 0x80; i++) t[i] = 1;
  for (let i = 0xc0; i < 0xe0; i++) t[i] = 2;
  for (let i = 0xe0; i < 0xf0; i++) t[i] = 3;
  for (let i = 0xf0; i < 0xf8; i++) t[i] = 4;
  return t;
})();

/** 跨 decode 调用保留的未完成多字节序列 / in-progress multi-byte sequence */
interface Utf8Pending {
  /** 序列总字节数（lead + 续字节） */
  total: number;
  /** 已收集的续字节数（不含 lead） */
  bits: number;
  /** 已累积的码点位数（每次收一个续字节左移 6 位并或上 6 位新数据） */
  cp: number;
}

/**
 * 标准化输入 → Uint8Array / coerce input to Uint8Array.
 * 容忍 ArrayBuffer / TypedArray / DataView；其它返回空。
 */
function toBytes(input: ArrayBufferView | ArrayBuffer | null | undefined): Uint8Array {
  if (input == null) return new Uint8Array(0);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  // TypedArray / DataView 都有 buffer / byteOffset / byteLength
  if (
    typeof input === 'object' &&
    input !== null &&
    'buffer' in input &&
    'byteOffset' in input &&
    'byteLength' in input
  ) {
    const v = input as { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  }
  return new Uint8Array(0);
}

/**
 * TextDecoder 最小实现 / minimal TextDecoder shim.
 * 仅支持 utf-8；只实现 SDK 流式分支实际用到的方法：`decode(input?, { stream? })`。
 * 非法 / 截断字节一律替换为 U+FFFD（与原生非 fatal 模式一致）。
 *
 * 跨 decode 调用（stream:true → stream:true）保留未完成序列；
 * stream:false（或默认）时把残余字节替换为单个 U+FFFD。
 *
 * 注：SDK 在流式 reader 结束前不会再调一次 decode 来 flush。
 * SSE 协议下最后一帧应被 `\n\n` 完整结束，所以通常不会有残余；
 * 即便有，下一轮迭代器收尾时也会被忽略。
 */
class TextDecoderShim implements TextDecoder {
  readonly encoding = 'utf-8';
  readonly fatal = false;
  readonly ignoreBOM = false;

  private pending: Utf8Pending | null = null;

  constructor(label: string = 'utf-8') {
    if (label && label.toLowerCase() !== 'utf-8') {
      throw new RangeError(`TextDecoderShim: only "utf-8" is supported, got "${label}"`);
    }
  }

  decode(
    input?: ArrayBufferView | ArrayBuffer | null,
    options?: { stream?: boolean },
  ): string {
    const stream = options?.stream === true;
    const bytes = toBytes(input);
    let out = '';
    let i = 0;

    // 1) 续接上一 chunk 留下的未完成序列
    while (this.pending && i < bytes.length) {
      const p = this.pending;
      const b = bytes[i];
      if ((b & 0xc0) !== 0x80) {
        // 期待续字节却拿到非续字节 → 视上一序列非法，发 U+FFFD，重置 pending。
        // 不消耗 i：让当前字节重新走主循环。
        out += '�';
        this.pending = null;
        break;
      }
      p.cp = (p.cp << 6) | (b & 0x3f);
      p.bits++;
      i++;
      if (p.bits === p.total - 1) {
        // 序列收齐
        if (p.cp > 0x10ffff || (p.cp >= 0xd800 && p.cp <= 0xdfff)) {
          out += '�';
        } else {
          out += String.fromCodePoint(p.cp);
        }
        this.pending = null;
        break;
      }
    }

    // 2) 主循环：按 lead byte 长度分派
    while (i < bytes.length) {
      const b = bytes[i];
      const len = UTF8_SEQ_LEN[b];
      if (len === 1) {
        out += String.fromCharCode(b);
        i++;
      } else if (len === 0) {
        // 孤立的续字节 / 非法 lead
        out += '�';
        i++;
      } else if (i + len > bytes.length) {
        // 序列不完整
        if (stream) {
          // 把已读到的字节编入 cp，留给下一个 chunk 续接
          let cp = 0;
          const available = bytes.length - i;
          if (len === 2) {
            cp = (b & 0x1f);
            if (available >= 2) cp = (cp << 6) | (bytes[i + 1] & 0x3f);
          } else if (len === 3) {
            cp = (b & 0x0f);
            if (available >= 2) cp = (cp << 6) | (bytes[i + 1] & 0x3f);
            if (available >= 3) cp = (cp << 6) | (bytes[i + 2] & 0x3f);
          } else {
            cp = (b & 0x07);
            if (available >= 2) cp = (cp << 6) | (bytes[i + 1] & 0x3f);
            if (available >= 3) cp = (cp << 6) | (bytes[i + 2] & 0x3f);
          }
          this.pending = { total: len, bits: available - 1, cp };
          i = bytes.length;
        } else {
          // 非流式：把"最大不完整子序列"（lead + 后续所有续字节）整体替换为 1 个 U+FFFD。
          // 与原生 TextDecoder 对 ill-formed 序列的容错一致。
          out += '�';
          i++;
          while (i < bytes.length && (bytes[i] & 0xc0) === 0x80) {
            i++;
          }
        }
      } else {
        // 完整序列：先验证续字节
        let valid = true;
        for (let k = 1; k < len; k++) {
          if ((bytes[i + k] & 0xc0) !== 0x80) {
            valid = false;
            break;
          }
        }
        if (!valid) {
          out += '�';
          i++;
        } else {
          let cp = 0;
          if (len === 2) {
            cp = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
          } else if (len === 3) {
            cp = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
          } else {
            cp =
              ((b & 0x07) << 18) |
              ((bytes[i + 1] & 0x3f) << 12) |
              ((bytes[i + 2] & 0x3f) << 6) |
              (bytes[i + 3] & 0x3f);
          }
          if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
            out += '�';
          } else {
            out += String.fromCodePoint(cp);
          }
          i += len;
        }
      }
    }

    // 3) 非流式：把残余未完成序列替换为 U+FFFD
    if (!stream && this.pending) {
      out += '�';
      this.pending = null;
    }

    return out;
  }
}

/**
 * 若 globalThis.TextDecoder 不存在则安装最小实现。
 * Install minimal TextDecoder if globalThis.TextDecoder is missing.
 *
 * 幂等 / idempotent.
 */
export function ensureGlobalTextDecoder(): void {
  const g = globalThis as AppRuntimeGlobals;
  if (typeof g.TextDecoder === 'function') return;

  g.TextDecoder = TextDecoderShim as unknown as typeof TextDecoder;
}

// ============================================================
// TextEncoder 垫片 / TextEncoder polyfill
// ============================================================

/**
 * UTF-8 字符串 → 字节。Code Point 编码规则与 TextDecoder 反向。
 * UTF-8 string → bytes. Mirror of TextDecoder.
 *
 * - U+0000..U+007F: 1 byte
 * - U+0080..U+07FF: 2 bytes
 * - U+0800..U+FFFF: 3 bytes
 * - U+10000..U+10FFFF: 4 bytes（UTF-16 代理对 → 单 code point）
 *
 * 孤立代理（high surrogate without low, or vice versa）替换为 U+FFFD
 * 后再按其 UTF-8 编码发出（3 字节），与 Chromium 的非 fatal 一致。
 */
function utf8Encode(input: string): Uint8Array {
  const len = input.length;
  let byteLen = 0;
  for (let i = 0; i < len; i++) {
    const cp = input.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < len) {
      const lo = input.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        const full = ((cp - 0xd800) << 10) | (lo - 0xdc00) + 0x10000;
        byteLen += full <= 0x10ffff ? 4 : 3;
        i++;
        continue;
      }
    } else if (cp >= 0xd800 && cp <= 0xdbff) {
      byteLen += 3;
      continue;
    } else if (cp >= 0xdc00 && cp <= 0xdfff) {
      byteLen += 3;
      continue;
    }
    byteLen += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : 3;
  }
  const out = new Uint8Array(byteLen);
  let w = 0;
  for (let i = 0; i < len; i++) {
    const cp = input.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < len) {
      const lo = input.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        const full = ((cp - 0xd800) << 10) | (lo - 0xdc00) + 0x10000;
        if (full <= 0x10ffff) {
          out[w++] = 0xf0 | (full >> 18);
          out[w++] = 0x80 | ((full >> 12) & 0x3f);
          out[w++] = 0x80 | ((full >> 6) & 0x3f);
          out[w++] = 0x80 | (full & 0x3f);
        } else {
          out[w++] = 0xef;
          out[w++] = 0xbf;
          out[w++] = 0xbd;
        }
        i++;
        continue;
      }
    } else if (cp >= 0xd800 && cp <= 0xdbff || cp >= 0xdc00 && cp <= 0xdfff) {
      out[w++] = 0xef;
      out[w++] = 0xbf;
      out[w++] = 0xbd;
      continue;
    }
    if (cp <= 0x7f) {
      out[w++] = cp;
    } else if (cp <= 0x7ff) {
      out[w++] = 0xc0 | (cp >> 6);
      out[w++] = 0x80 | (cp & 0x3f);
    } else {
      out[w++] = 0xe0 | (cp >> 12);
      out[w++] = 0x80 | ((cp >> 6) & 0x3f);
      out[w++] = 0x80 | (cp & 0x3f);
    }
  }
  return out;
}

/**
 * TextEncoder 最小实现 / minimal TextEncoder shim.
 * 仅支持 utf-8；只实现 fetch-polyfill / SDK 用到的 `encode(input: string): Uint8Array`。
 */
class TextEncoderShim implements TextEncoder {
  readonly encoding = 'utf-8';

  encode(input?: string): Uint8Array {
    return utf8Encode(input ?? '');
  }

  /** 浏览器 / 草案规范要求的部分属性；保持类型完整（返回 0，因为我们不维护内部 buffer）。 */
  encodeInto(
    _src: string,
    _dest: Uint8Array,
  ): { read: number; written: number } {
    // 不做流式增量编码（fetch-polyfill 也不调它）。
    return { read: 0, written: 0 };
  }
}

/**
 * 若 globalThis.TextEncoder 不存在则安装最小实现。
 * Install minimal TextEncoder if globalThis.TextEncoder is missing.
 *
 * 幂等 / idempotent.
 *
 * 关键场景：App 端 `makeStreamingBody` 用 `new TextEncoder().encode(text)` 把整段
 * SSE body 编码成 Uint8Array。若全局 TextEncoder 缺失，原 try/catch 会兜底成
 * 空 Uint8Array，导致 SDK reader 读出空 chunk、解析不出任何 SSE 帧 → 流式无事件
 * → 消息不显示。
 */
export function ensureGlobalTextEncoder(): void {
  const g = globalThis as AppRuntimeGlobals;
  if (typeof g.TextEncoder === 'function') return;

  // 扩展运行时已知全局（接口未原生声明）.
  (g as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder =
    TextEncoderShim as unknown as typeof TextEncoder;
}