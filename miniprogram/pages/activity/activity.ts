/**
 * 活动详情页
 */

import { activityTimeRange, formatDateTime } from '../../utils/date';
import { ApiError } from '../../utils/error';
import type { Activity, ActivityType } from '../../types/activity';

const TYPE_LABEL: Record<ActivityType, string> = {
  study: '自习',
  group_buy: '拼单',
  sport: '运动',
  meal: '约饭',
  project: '项目',
  other: '其他',
};

interface ActivityData {
  id: string | null;
  loading: boolean;
  submitting: boolean;
  activity: Activity | null;
  timeRange: string;
  deadlineText: string;
  typeLabel: string;
}

interface ActivityCustom {
  _load: (id: string) => Promise<void>;
  _mockDetail: (id: string) => Promise<Activity>;
  onSignup: () => Promise<void>;
}

Page<ActivityData, ActivityCustom>({
  data: {
    id: null,
    loading: true,
    submitting: false,
    activity: null,
    timeRange: '',
    deadlineText: '',
    typeLabel: '',
  },

  onLoad(options) {
    const id = options?.id || null;
    this.setData({ id });
    if (id) this._load(id);
  },

  async _load(id: string) {
    this.setData({ loading: true });
    try {
      // 真实场景：const activity = await activityApi.detail(id);
      // mock：复用首页数据
      const activity = await this._mockDetail(id);
    this.setData({
      activity,
      timeRange: activityTimeRange(activity.startAt, activity.endAt),
      deadlineText: formatDateTime(activity.signupDeadline),
      typeLabel: TYPE_LABEL[activity.type] ?? '其他',
      loading: false,
    });
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : '加载失败';
      wx.showToast({ title: msg, icon: 'none' });
      this.setData({ loading: false });
    }
  },

  async _mockDetail(id: string): Promise<Activity> {
    await new Promise((r) => setTimeout(r, 200));
    return {
      id,
      type: 'study',
      title: '图书馆期末复习搭子',
      description: '本周三、周五下午图书馆二楼，想找 2-3 个同学一起复习高数，重点刷课后习题。\n\n我们打算：\n1. 13:30 准时到，找好位置\n2. 14:00-15:30 刷题 90 分钟\n3. 15:30-16:00 休息讨论\n4. 16:00-17:30 继续刷题\n5. 17:30 复盘，错题分享',
      location: { name: '图书馆二楼自习区', address: '校园主楼北侧', longitude: 0, latitude: 0 },
      startAt: '2026-06-10T13:30:00.000Z',
      endAt: '2026-06-10T17:30:00.000Z',
      signupDeadline: '2026-06-10T12:00:00.000Z',
      maxParticipants: 4,
      currentParticipants: 2,
      fee: 0,
      tags: ['高数', '复习', '安静', '坐得住'],
      status: 'recruiting',
      organizer: { id: 'u-101', nickname: '学霸小李', avatar: '' },
      signedUp: false,
      createdAt: '2026-06-05T08:00:00.000Z',
      updatedAt: '2026-06-05T08:00:00.000Z',
    };
  },

  async onSignup() {
    if (!this.data.activity) return;
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      // await activityApi.signup(this.data.activity.id);
      await new Promise((r) => setTimeout(r, 400));
      this.setData({
        'activity.signedUp': true,
        'activity.currentParticipants': this.data.activity.currentParticipants + 1,
      });
      wx.showToast({ title: '报名成功', icon: 'success' });
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : '报名失败';
      wx.showToast({ title: msg, icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
