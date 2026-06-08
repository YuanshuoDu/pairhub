/**
 * Admin API 客户端（issue #32 前端）
 *
 * 后端契约见 server/src/modules/admin/index.ts（PR #62, commit 09c6341）。
 * 全部端点位于 /api/v1/admin/*，由后端 `adminOnly` 预处理器守卫，
 * 401 = token 缺失 / 无效，403 = 非 ADMIN 或已 BANNED，409 = 业务冲突
 * （如自禁、状态机锁定）。
 *
 * 鉴权：受保护接口由 api/request.ts 拦截器从 userStore 自动注入
 *       `Authorization: Bearer <token>`，本文件不显式处理 token。
 *
 * 字段命名：与后端契约一致 — 状态枚举大写（USER / ADMIN / ACTIVE / BANNED /
 *           PENDING_REVIEW / RECRUITING / FULL / STARTED / ENDED / CANCELED /
 *           REJECTED），时间一律 ISO 字符串。
 *
 * TODO(miniprogram-engineer): 这一层仅做 HTTP 透传 + 类型适配。
 *   真正的 use-case 编排（optimistic update、错误重试、列表缓存清理）
 *   由 store 层负责 — 详见 admin_pages 各自 .ts。
 */

import { http } from './request';

// ---------------------------------------------------------------------------
// 枚举（与后端 Prisma UserRole / UserStatus / ActivityStatus 一一对应）
// ---------------------------------------------------------------------------

export type AdminUserRole = 'USER' | 'ADMIN';
export type AdminUserStatus = 'ACTIVE' | 'BANNED';
export type AdminActivityStatus =
  | 'PENDING_REVIEW'
  | 'RECRUITING'
  | 'FULL'
  | 'STARTED'
  | 'ENDED'
  | 'CANCELED'
  | 'REJECTED';

// ---------------------------------------------------------------------------
// 审核队列（GET /api/v1/admin/activities）
// ---------------------------------------------------------------------------

export interface AdminListActivitiesQuery {
  status?: AdminActivityStatus;
  type?: 'STUDY' | 'SPORTS' | 'BOARD_GAME' | 'ONLINE_GAME' | 'OTHER';
  page?: number;
  pageSize?: number;
}

export interface AdminActivityCreator {
  id: string;
  nickname: string;
  avatar: string | null;
  school: string | null;
}

export interface AdminActivity {
  id: string;
  type: 'STUDY' | 'SPORTS' | 'BOARD_GAME' | 'ONLINE_GAME' | 'OTHER';
  title: string;
  description: string;
  coverUrl: string | null;
  location: {
    name: string;
    addr: string;
    lat: number;
    lng: number;
  };
  /** ISO */
  startTime: string;
  /** ISO */
  endTime: string;
  maxParticipants: number;
  currentCount: number;
  tags: string[];
  status: AdminActivityStatus;
  moderationNote: string | null;
  creator: AdminActivityCreator;
  /** ISO */
  createdAt: string;
}

export interface AdminPage<T> {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface AdminListActivitiesResponse {
  data: AdminActivity[];
  page: AdminPage<AdminActivity>;
}

// ---------------------------------------------------------------------------
// Approve / Reject
// ---------------------------------------------------------------------------

export interface AdminModerateResult {
  id: string;
  status: AdminActivityStatus;
  moderationNote: string | null;
}

export interface AdminModerateResponse {
  data: AdminModerateResult;
}

// ---------------------------------------------------------------------------
// 用户搜索（GET /api/v1/admin/users）
// ---------------------------------------------------------------------------

export interface AdminListUsersQuery {
  search?: string;
  status?: AdminUserStatus;
  role?: AdminUserRole;
  page?: number;
  pageSize?: number;
}

export interface AdminUser {
  id: string;
  nickname: string;
  avatar: string | null;
  school: string | null;
  phone: string | null;
  status: AdminUserStatus;
  role: AdminUserRole;
  /** ISO */
  createdAt: string;
  /** ISO */
  updatedAt: string;
}

export interface AdminListUsersResponse {
  data: AdminUser[];
  page: AdminPage<AdminUser>;
}

// ---------------------------------------------------------------------------
// 封禁 / 解封（PATCH /api/v1/admin/users/:id/status）
// ---------------------------------------------------------------------------

export interface AdminUserStatusPatch {
  status: AdminUserStatus;
  /** 可选审计说明（≤500 字） */
  note?: string;
}

export interface AdminUserStatusResult {
  id: string;
  status: AdminUserStatus;
  role: AdminUserRole;
}

export interface AdminUserStatusResponse {
  data: AdminUserStatusResult;
  meta?: { note?: string };
}

// ---------------------------------------------------------------------------
// 数据看板（GET /api/v1/admin/dashboard/metrics）
// ---------------------------------------------------------------------------

export interface AdminMetrics {
  users: {
    total: number;
    banned: number;
    newToday: number;
    newThisWeek: number;
  };
  activities: {
    total: number;
    pending: number;
    recruiting: number;
  };
  signups: {
    total: number;
    today: number;
  };
  pushTokens: {
    total: number;
  };
  /** ISO */
  generatedAt: string;
}

export interface AdminMetricsResponse {
  data: AdminMetrics;
}

// ---------------------------------------------------------------------------
// adminApi — 6 个端点的薄封装
// ---------------------------------------------------------------------------

export const adminApi = {
  /**
   * 审核队列（默认 PENDING_REVIEW，FIFO 最早提交优先）。
   * 后端按 createdAt asc 排序，跳过 (page-1)*pageSize。
   */
  listActivities(query: AdminListActivitiesQuery = {}): Promise<AdminListActivitiesResponse> {
    return http.get<AdminListActivitiesResponse>('/api/v1/admin/activities', {
      query: {
        status: query.status,
        type: query.type,
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  },

  /** 批准活动：PENDING_REVIEW → RECRUITING（已 RECRUITING 时幂等返回） */
  approveActivity(id: string): Promise<AdminModerateResponse> {
    return http.post<AdminModerateResponse>(
      `/api/v1/admin/activities/${encodeURIComponent(id)}/approve`,
    );
  },

  /**
   * 驳回活动：PENDING_REVIEW → REJECTED。
   * reason 必填（1-500 字符），写入 Activity.moderationNote。
   */
  rejectActivity(id: string, reason: string): Promise<AdminModerateResponse> {
    return http.post<AdminModerateResponse>(
      `/api/v1/admin/activities/${encodeURIComponent(id)}/reject`,
      { reason },
    );
  },

  /**
   * 用户搜索。**至少需要一个过滤器**（search / status / role），
   * 后端 400 兜底 — 调用方负责校验。
   */
  listUsers(query: AdminListUsersQuery): Promise<AdminListUsersResponse> {
    if (!query.search && !query.status && !query.role) {
      return Promise.reject(
        new Error('[adminApi.listUsers] search / status / role 至少需要提供一个'),
      );
    }
    return http.get<AdminListUsersResponse>('/api/v1/admin/users', {
      query: {
        search: query.search,
        status: query.status,
        role: query.role,
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  },

  /**
   * 封禁 / 解封用户。试图封禁自己时后端返回 409 ConflictError('SELF_BAN')。
   * 生效延迟：≤ 15 min（access-token TTL），期间该用户旧 token 仍可访问
   * 非 admin 路由 — 见 docs/admin/playbook.md §5。
   */
  patchUserStatus(id: string, payload: AdminUserStatusPatch): Promise<AdminUserStatusResponse> {
    return http.patch<AdminUserStatusResponse>(
      `/api/v1/admin/users/${encodeURIComponent(id)}/status`,
      payload,
    );
  },

  /**
   * 数据看板：users / activities / signups / pushTokens 四组计数。
   * 拉一次就够，页面 onShow 时刷新；不做趋势（M3 W12 Grafana 跟进）。
   */
  getMetrics(): Promise<AdminMetricsResponse> {
    return http.get<AdminMetricsResponse>('/api/v1/admin/dashboard/metrics');
  },
};

export default adminApi;
