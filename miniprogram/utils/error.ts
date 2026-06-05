/**
 * 统一错误处理
 *
 * 设计：
 * - 网络 / 业务错误全部归一为 ApiError
 * - 错误码语义化（TOKEN_INVALID / NETWORK / etc.）
 * - 兼容微信原生 request 失败（无 statusCode）
 * - 默认中文 message 便于直接 showToast
 */

export enum ErrorCode {
  // 网络层
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
  CANCEL = 'CANCEL',

  // HTTP 层
  HTTP_4XX = 'HTTP_4XX',
  HTTP_5XX = 'HTTP_5XX',

  // 业务层
  BUSINESS = 'BUSINESS',

  // 鉴权
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  UNAUTHORIZED = 'UNAUTHORIZED',

  // 未知
  UNKNOWN = 'UNKNOWN',
}

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.NETWORK]: '网络异常，请检查网络后重试',
  [ErrorCode.TIMEOUT]: '请求超时，请稍后重试',
  [ErrorCode.CANCEL]: '请求已取消',
  [ErrorCode.HTTP_4XX]: '请求参数有误',
  [ErrorCode.HTTP_5XX]: '服务器开了小差，请稍后再试',
  [ErrorCode.BUSINESS]: '操作失败，请稍后重试',
  [ErrorCode.TOKEN_INVALID]: '登录信息已失效，请重新登录',
  [ErrorCode.TOKEN_EXPIRED]: '登录已过期，请重新登录',
  [ErrorCode.UNAUTHORIZED]: '没有权限执行此操作',
  [ErrorCode.UNKNOWN]: '未知错误',
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly bizCode: number;
  readonly traceId?: string;
  /** 业务原始 payload（不向用户展示） */
  readonly payload: unknown;

  constructor(opts: {
    code: ErrorCode;
    message?: string;
    httpStatus?: number;
    bizCode?: number;
    traceId?: string;
    payload?: unknown;
    cause?: unknown;
  }) {
    super(opts.message || DEFAULT_MESSAGES[opts.code] || '未知错误');
    this.name = 'ApiError';
    this.code = opts.code;
    this.httpStatus = opts.httpStatus ?? 0;
    this.bizCode = opts.bizCode ?? 0;
    this.traceId = opts.traceId;
    this.payload = opts.payload;
    if (opts.cause) {
      // @ts-expect-error cause 兼容性
      this.cause = opts.cause;
    }
  }

  /** 适合直接 showToast 给用户看的文案 */
  get userMessage(): string {
    return this.message;
  }

  /** 是否需要重新登录 */
  get needReLogin(): boolean {
    return this.code === ErrorCode.TOKEN_INVALID || this.code === ErrorCode.TOKEN_EXPIRED;
  }
}

/** 把任意异常归一为 ApiError */
export function normalizeError(err: unknown, httpStatus = 0, bizCode = 0): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof Error) {
    // 微信 request fail 的常见 message
    if (err.message?.includes('request:fail')) {
      return new ApiError({ code: ErrorCode.NETWORK, message: DEFAULT_MESSAGES[ErrorCode.NETWORK], httpStatus, bizCode, cause: err });
    }
    if (err.message?.includes('timeout')) {
      return new ApiError({ code: ErrorCode.TIMEOUT, message: DEFAULT_MESSAGES[ErrorCode.TIMEOUT], httpStatus, bizCode, cause: err });
    }
    return new ApiError({ code: ErrorCode.UNKNOWN, message: err.message, httpStatus, bizCode, cause: err });
  }
  return new ApiError({ code: ErrorCode.UNKNOWN, message: String(err), httpStatus, bizCode });
}

/** 根据 HTTP 状态码映射 ErrorCode */
export function httpCodeToErrorCode(status: number): ErrorCode {
  if (status === 401) return ErrorCode.UNAUTHORIZED;
  if (status === 403) return ErrorCode.UNAUTHORIZED;
  if (status >= 400 && status < 500) return ErrorCode.HTTP_4XX;
  if (status >= 500) return ErrorCode.HTTP_5XX;
  return ErrorCode.UNKNOWN;
}

/** 默认业务成功码（0） */
export const SUCCESS_BIZ_CODE = 0;
