/**
 * 活动相关类型
 */

/** 活动类型 */
export type ActivityType =
  | 'study' // 自习
  | 'group_buy' // 拼单
  | 'sport' // 运动
  | 'meal' // 约饭
  | 'project' // 项目合作
  | 'other';

/** 活动状态 */
export type ActivityStatus = 'recruiting' | 'full' | 'cancelled' | 'finished' | 'in_progress';

export interface ActivityLocation {
  /** 显示名称 */
  name: string;
  /** 详细地址 */
  address: string;
  /** 经纬度 */
  longitude: number;
  latitude: number;
  /** 距离（米，可选） */
  distance?: number;
}

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  cover?: string;
  location: ActivityLocation;
  /** 开始时间 ISO */
  startAt: string;
  /** 结束时间 ISO */
  endAt: string;
  /** 报名截止时间 ISO */
  signupDeadline: string;
  /** 人数限制 */
  maxParticipants: number;
  /** 已报名人数 */
  currentParticipants: number;
  /** 费用（分） */
  fee: number;
  /** 标签 */
  tags: string[];
  status: ActivityStatus;
  /** 组织者 */
  organizer: {
    id: string;
    nickname: string;
    avatar: string;
  };
  /** 当前用户是否已报名 */
  signedUp: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 创建活动入参 */
export interface CreateActivityPayload {
  type: ActivityType;
  title: string;
  description: string;
  cover?: string;
  location: ActivityLocation;
  startAt: string;
  endAt: string;
  signupDeadline: string;
  maxParticipants: number;
  fee: number;
  tags: string[];
}

/** 活动列表查询 */
export interface ActivityListQuery {
  page?: number;
  pageSize?: number;
  type?: ActivityType;
  keyword?: string;
  status?: ActivityStatus;
  /** 按距离排序时需要传用户位置 */
  nearBy?: { longitude: number; latitude: number };
}
