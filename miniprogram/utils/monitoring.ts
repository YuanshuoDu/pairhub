/**
 * 小程序前端可观测性（issue #10 — miniprogram error boundary）
 *
 * 目标：
 * - 把 App.onError / wx.onUnhandledRejection / App.onPageNotFound 的错误
 *   喂到微信原生的 `wx.reportMonitor`（运营后台可在 mp.weixin.qq.com 的
 *   「运维中心 → 监控告警 → 性能监控」里看到），同时打到 console（开发者
 *   工具 / vConsole 可见）。
 * - 结构化字段：`{ kind, message, stack, source, envVersion }`，便于未来
 *   直接换装 Sentry / 自家 server endpoint 时复用同一个 shape。
 * - 不在 production 弹 toast（用户体验优先）；只 console + reportMonitor。
 *
 * 非目标（本任务范围内不做）：
 * - 服务端接入：等 server 暴露 `/api/v1/admin/monitoring/wxapp-error`
 *   后，由 `request({ url: '/api/v1/admin/monitoring/wxapp-error', ... })`
 *   追加一帧发送，保持本函数签名不变。
 */

/** 单条错误事件的标准化 shape */
export interface AppErrorEvent {
  kind: 'script_error' | 'unhandled_rejection' | 'page_not_found';
  message: string;
  stack?: string;
  source?: string;
  envVersion?: 'develop' | 'trial' | 'release';
  /** 自由扩展字段，例如 component、page route */
  context?: Record<string, unknown>;
}

const MAX_STACK_CHARS = 4_000; // 微信 reportMonitor 单次 metric 上限 ~5KB

/** 截断栈，避免超长 stack 把 reportMonitor payload 撑爆 */
function truncate(text: string, max = MAX_STACK_CHARS): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…(truncated)` : text;
}

/**
 * 把任意 unknown 解析成 { message, stack }。WeChat 的 App.onError 给的是
 * 一整段字符串（已经带 stack）；wx.onUnhandledRejection 给的是结构化对象。
 */
function normalize(err: unknown): { message: string; stack?: string } {
  if (err == null) return { message: String(err) };
  if (typeof err === 'string') return { message: err };
  if (err instanceof Error) {
    return { message: err.message || err.name || 'Error', stack: err.stack };
  }
  if (typeof err === 'object') {
    const e = err as { message?: unknown; errMsg?: unknown; stack?: unknown };
    return {
      message:
        typeof e.message === 'string'
          ? e.message
          : typeof e.errMsg === 'string'
            ? e.errMsg
            : JSON.stringify(err),
      stack: typeof e.stack === 'string' ? e.stack : undefined,
    };
  }
  return { message: String(err) };
}

/** 探测当前运行环境；未拿到 accountInfo 时降级为 'develop' */
function detectEnv(): AppErrorEvent['envVersion'] {
  try {
    // globalData 未就绪时直接拿 wx API
    const info = wx.getAccountInfoSync();
    const v = info?.miniProgram?.envVersion;
    if (v === 'develop' || v === 'trial' || v === 'release') return v;
  } catch {
    /* fallthrough */
  }
  return 'develop';
}

/**
 * 把结构化事件喂给 console，并在 dev/trial 环境额外写 storage 方便
 * vConsole / 体验版回查。注意：wx.reportMonitor 由调用方（app.ts）显式
 * 触发并按 kind 区分 metric id，避免重复上报。
 */
function dispatch(event: AppErrorEvent): void {
  const payload = {
    ...event,
    envVersion: event.envVersion ?? detectEnv(),
    stack: truncate(event.stack ?? ''),
    ts: Date.now(),
  };

  // 1) 结构化详情塞到 storage（运营后台拿不到，但 vConsole / 体验版可查）
  try {
    wx.setStorageSync({
      key: `__last_app_error__`,
      data: payload,
    });
  } catch {
    /* storage 满 / 不可用时 swallow */
  }

  // 2) 开发者可见 — dev/trial 必须打，release 打 console.error 但不弹 toast
  const tag = `[monitoring][${event.kind}]`;
  const line = `${tag} ${event.message}`;
  if (event.stack) {
    console.error(line, '\n', event.stack, '\ncontext:', event.context ?? {});
  } else {
    console.error(line, { context: event.context ?? {} });
  }
}

/** App.onError / 兜底 throw 走这里 */
export function reportAppError(error: unknown, context?: { source?: string; context?: Record<string, unknown> }): void {
  const { message, stack } = normalize(error);
  dispatch({
    kind: 'script_error',
    message,
    stack,
    source: context?.source,
    context: context?.context,
  });
}

/** wx.onUnhandledRejection 走这里 */
export function reportUnhandledRejection(
  reason: unknown,
  context?: { source?: string; context?: Record<string, unknown> },
): void {
  const { message, stack } = normalize(reason);
  dispatch({
    kind: 'unhandled_rejection',
    message,
    stack,
    source: context?.source,
    context: context?.context,
  });
}

/** App.onPageNotFound 走这里（独立 kind 便于后台聚合"深链失效"指标） */
export function reportPageNotFound(path: string, context?: Record<string, unknown>): void {
  dispatch({
    kind: 'page_not_found',
    message: `Page not found: ${path}`,
    source: 'App.onPageNotFound',
    context: { ...(context ?? {}), path },
  });
}