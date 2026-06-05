/**
 * 报名相关类型
 */
import type { Activity } from './activity';

export type SignupStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'finished';

export interface Signup {
  id: string;
  activityId: string;
  userId: string;
  status: SignupStatus;
  /** 报名时间 */
  createdAt: string;
  /** 备注 / 留言 */
  remark?: string;
}

/** 报名 + 活动详情（用于 "我的报名" 列表） */
export interface SignupWithActivity extends Signup {
  activity: Activity;
}
