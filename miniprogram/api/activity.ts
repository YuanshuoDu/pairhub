/**
 * 活动 API 客户端
 *
 * 端点（与后端 M2 模块保持一致，全部位于 /api/v1/activities 下）：
 *   - GET    /            活动列表（支持 type / status / city / page / pageSize 过滤）
 *   - GET    /:id         活动详情（含 isJoined 标识当前用户是否已报名）
 *   - POST   /            创建活动（auth）
 *   - PATCH  /:id         编辑活动（auth，creator only）
 *   - DELETE /:id         取消活动 / 软删（auth，creator only）
 *   - POST   /:id/signup  报名（auth）
 *   - DELETE /:id/signup  取消报名（auth）
 *   - GET    /:id/participants  报名人员列表
 *
 * 鉴权：受保护接口由 http 拦截器自动从 userStore 注入
 *       `Authorization: Bearer <token>`（见 api/request.ts），本文件不显式
 *       处理 token，避免与现有 auth 流程双写。
 *
 * 字段命名：与后端契约保持一致（type / status 为 UPPERCASE 枚举，位置信息
 *           为扁平字段 locationName / locationAddr / locationLat /
 *           locationLng，人数为 currentCount）。
 */

import { http } from './request';
import type {
  Activity,
  ActivityListQuery,
  ActivityListResponse,
  CancelActivitySuccess,
  CancelSignupSuccess,
  CreateActivityPayload,
  ParticipantsResponse,
  SignupSuccess,
  UpdateActivityPayload,
} from '../types/activity';

export const activityApi = {
  /** 活动列表（GET /api/v1/activities） */
  listActivities(query: ActivityListQuery = {}): Promise<ActivityListResponse> {
    return http.get<ActivityListResponse>('/api/v1/activities', {
      query: {
        type: query.type,
        status: query.status,
        city: query.city,
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  },

  /** 活动详情（GET /api/v1/activities/:id） */
  getActivity(id: string): Promise<Activity> {
    return http.get<Activity>(`/api/v1/activities/${id}`);
  },

  /** 创建活动（POST /api/v1/activities，auth） */
  createActivity(payload: CreateActivityPayload): Promise<Activity> {
    return http.post<Activity>('/api/v1/activities', payload);
  },

  /** 编辑活动（PATCH /api/v1/activities/:id，auth，creator only） */
  updateActivity(id: string, payload: UpdateActivityPayload): Promise<Activity> {
    return http.patch<Activity>(`/api/v1/activities/${id}`, payload);
  },

  /** 取消活动（DELETE /api/v1/activities/:id，auth，creator only） */
  cancelActivity(id: string): Promise<CancelActivitySuccess> {
    return http.delete<CancelActivitySuccess>(`/api/v1/activities/${id}`);
  },

  /** 报名（POST /api/v1/activities/:id/signup，auth） */
  signup(id: string): Promise<SignupSuccess> {
    return http.post<SignupSuccess>(`/api/v1/activities/${id}/signup`);
  },

  /** 取消报名（DELETE /api/v1/activities/:id/signup，auth） */
  cancelSignup(id: string): Promise<CancelSignupSuccess> {
    return http.delete<CancelSignupSuccess>(`/api/v1/activities/${id}/signup`);
  },

  /** 报名人员列表（GET /api/v1/activities/:id/participants） */
  getSignups(id: string, page = 1, pageSize = 50): Promise<ParticipantsResponse> {
    return http.get<ParticipantsResponse>(`/api/v1/activities/${id}/participants`, {
      query: { page, pageSize },
    });
  },
};

export default activityApi;
