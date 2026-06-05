/**
 * 活动 API
 */

import { http } from './request';
import type { Activity, ActivityListQuery, CreateActivityPayload } from '../types/activity';
import type { Pagination } from '../types/common';
import type { Signup } from '../types/signup';

export const activityApi = {
  /** 活动列表 */
  list(query: ActivityListQuery = {}): Promise<Pagination<Activity>> {
    return http.get<Pagination<Activity>>('/api/v1/activities', { query: query as any });
  },

  /** 活动详情 */
  detail(id: string): Promise<Activity> {
    return http.get<Activity>(`/api/v1/activities/${id}`);
  },

  /** 创建活动 */
  create(payload: CreateActivityPayload): Promise<Activity> {
    return http.post<Activity>('/api/v1/activities', payload);
  },

  /** 取消活动（仅组织者） */
  cancel(id: string): Promise<Activity> {
    return http.post<Activity>(`/api/v1/activities/${id}/cancel`);
  },

  /** 报名 */
  signup(id: string, remark?: string): Promise<Signup> {
    return http.post<Signup>(`/api/v1/activities/${id}/signup`, { remark });
  },

  /** 取消报名 */
  cancelSignup(id: string): Promise<Signup> {
    return http.delete<Signup>(`/api/v1/activities/${id}/signup`);
  },

  /** 活动的报名列表 */
  signups(id: string): Promise<Signup[]> {
    return http.get<Signup[]>(`/api/v1/activities/${id}/signups`);
  },
};
