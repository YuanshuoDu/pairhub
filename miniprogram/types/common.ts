/**
 * 全局通用类型
 */

/** 统一 API 响应 */
export interface ApiResponse<T = unknown> {
  code: number;
  data: T;
  message: string;
  /** 链路追踪 id，便于排查问题 */
  traceId?: string;
}

/** 统一分页 */
export interface Pagination<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** 分页请求参数 */
export interface PageQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

/** 性别 */
export type Gender = 'male' | 'female' | 'unknown';
