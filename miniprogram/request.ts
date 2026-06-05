/**
 * 统一请求封装
 *
 * 核心能力：
 * 1. 超时控制（默认 15s）
 * 2. 失败重试（GET 幂等接口最多 1 次）
 * 3. JWT 注入（自动从 userStore 取）
 * 4. 统一错误处理：网络 / HTTP / 业务全部归一为 ApiError
 * 5. 请求/响应拦截器（前置注入 traceId）
 * 6. 业务码非 0 自动 reject
 * 7. token 失效自动清理（需配合 App._handleApiError）
 */

import { API_CONFIG, isMockMode } from './config';
import { ApiError, ErrorCode, httpCodeToErrorCode, normalizeError, SUCCESS_BIZ_CODE } from '../utils/error';
import { userStore } from '../store/user';
import type { ApiResponse } from '../types/common';
import { uuid } from '../utils/index';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';

export interface RequestOptions {
  url: string;
  method?: Method;
  data?: unknown;
  header?: Record<string, string>;
  /** 是否携带 JWT（默认 true） */
  withToken?: boolean;
  /** 业务码 0 视为成功 */
  successBizCode?: number;
  /** 静默：失败不弹 toast */
  silent?: boolean;
  /** 超时（ms），覆盖默认 */
  timeout?: number;
  /** 重试次数，覆盖默认 */
  retry?: number;
  /** 跳过业务码校验（直接返回 data） */
  raw?: boolean;
  /** 透传 query */
  query?: Record<string, string | number | boolean | undefined>;
}

export interface RequestInterceptor {
  (ctx: { url: string; header: Record<string, string>; data: unknown }): void | Promise<void>;
}
export interface ResponseInterceptor {
  (res: { data: ApiResponse; statusCode: number }): void | Promise<void>;
}

const requestInterceptors: RequestInterceptor[] = [];
const responseInterceptors: ResponseInterceptor[] = [];

export function addRequestInterceptor(fn: RequestInterceptor): () => void {
  requestInterceptors.push(fn);
  return () => {
    const i = requestInterceptors.indexOf(fn);
    if (i >= 0) requestInterceptors.splice(i, 1);
  };
}
export function addResponseInterceptor(fn: ResponseInterceptor): () => void {
  responseInterceptors.push(fn);
  return () => {
    const i = responseInterceptors.indexOf(fn);
    if (i >= 0) responseInterceptors.splice(i, 1);
  };
}

function buildUrl(url: string, query?: RequestOptions['query']): string {
  const base = isMockMode() ? API_CONFIG.mockUrl : API_CONFIG.baseUrl;
  const full = url.startsWith('http') ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  if (!query) return full;
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  if (!qs) return full;
  return full.includes('?') ? `${full}&${qs}` : `${full}?${qs}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 核心 request */
export function request<TResp = unknown>(opts: RequestOptions): Promise<TResp> {
  const method = opts.method ?? 'GET';
  const url = buildUrl(opts.url, opts.query);
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Trace-Id': uuid(),
    ...opts.header,
  };

  // 注入 JWT
  if (opts.withToken !== false) {
    const token = userStore.state.token;
    if (token) header['Authorization'] = `Bearer ${token}`;
  }

  // 前置拦截器
  const beforePromise = (async () => {
    for (const it of requestInterceptors) {
      await it({ url, header, data: opts.data });
    }
  })();

  return beforePromise.then(() => doRequest<TResp>(opts, url, method, header));
}

function doRequest<TResp>(
  opts: RequestOptions,
  url: string,
  method: Method,
  header: Record<string, string>,
): Promise<TResp> {
  const timeout = opts.timeout ?? API_CONFIG.timeout;
  const maxRetry = opts.retry ?? (method === 'GET' ? API_CONFIG.retryCount : 0);

  const attempt = (tryIndex: number): Promise<TResp> =>
    new Promise<TResp>((resolve, reject) => {
      wx.request({
        url,
        method,
        data: opts.data as any,
        header,
        timeout,
        success: async (res) => {
          // 响应拦截
          for (const it of responseInterceptors) {
            try {
              await it({ data: res.data as ApiResponse, statusCode: res.statusCode });
            } catch (e) {
              console.warn('[response interceptor] error', e);
            }
          }

          // HTTP 层
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const code = httpCodeToErrorCode(res.statusCode);
            const data = res.data as { code?: number; message?: string } | null;
            const err = new ApiError({
              code,
              httpStatus: res.statusCode,
              bizCode: data?.code,
              message: data?.message,
              payload: res.data,
            });
            reject(err);
            return;
          }

          // 业务层
          const body = (res.data ?? {}) as ApiResponse;
          const successCode = opts.successBizCode ?? SUCCESS_BIZ_CODE;

          if (opts.raw) {
            resolve(res.data as unknown as TResp);
            return;
          }

          if (body.code === successCode) {
            resolve(body.data as TResp);
            return;
          }

          // 业务错误
          const bizCode = body.code ?? 0;
          const errCode = bizCode === 40101 || bizCode === 40102 ? ErrorCode.TOKEN_INVALID : ErrorCode.BUSINESS;
          reject(
            new ApiError({
              code: errCode,
              message: body.message || '操作失败',
              bizCode,
              httpStatus: res.statusCode,
              traceId: body.traceId,
              payload: body,
            }),
          );
        },
        fail: (err) => {
          const e = normalizeError(err, 0, 0);
          // 网络 / 超时 重试
          if (tryIndex < maxRetry && (e.code === ErrorCode.NETWORK || e.code === ErrorCode.TIMEOUT)) {
            wait(API_CONFIG.retryDelay * (tryIndex + 1))
              .then(() => attempt(tryIndex + 1).then(resolve, reject))
              .catch(reject);
            return;
          }
          reject(e);
        },
        complete: () => {
          // noop
        },
      });
    });

  return attempt(0);
}

/** 便捷方法 */
export const http = {
  get: <T = unknown>(url: string, opts: Omit<RequestOptions, 'url' | 'method'> = {}) =>
    request<T>({ ...opts, url, method: 'GET' }),
  post: <T = unknown>(url: string, data?: unknown, opts: Omit<RequestOptions, 'url' | 'method' | 'data'> = {}) =>
    request<T>({ ...opts, url, method: 'POST', data }),
  put: <T = unknown>(url: string, data?: unknown, opts: Omit<RequestOptions, 'url' | 'method' | 'data'> = {}) =>
    request<T>({ ...opts, url, method: 'PUT', data }),
  delete: <T = unknown>(url: string, opts: Omit<RequestOptions, 'url' | 'method'> = {}) =>
    request<T>({ ...opts, url, method: 'DELETE' }),
};

export default request;
