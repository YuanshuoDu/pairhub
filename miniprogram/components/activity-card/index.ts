/**
 * activity-card 组件
 *
 * Props:
 *   activity: Activity
 *
 * Events:
 *   tap       - 点击卡片
 *   signup    - 点击报名按钮
 */

import { activityTimeRange, relativeTime } from '../../utils/date';
import type { Activity, ActivityType } from '../../types/activity';

const TYPE_LABEL: Record<ActivityType, string> = {
  study: '自习',
  group_buy: '拼单',
  sport: '运动',
  meal: '约饭',
  project: '项目',
  other: '其他',
};

Component({
  properties: {
    activity: {
      type: Object,
      value: {} as Activity,
    },
  },

  data: {
    typeLabel: '',
    timeText: '',
    progress: 0,
  },

  observers: {
    'activity': function (activity: Activity) {
      if (!activity || !activity.id) return;
      this.setData({
        typeLabel: TYPE_LABEL[activity.type] || '其他',
        timeText: activityTimeRange(activity.startAt, activity.endAt) || relativeTime(activity.startAt),
        progress: activity.maxParticipants > 0
          ? Math.min(100, Math.round((activity.currentParticipants / activity.maxParticipants) * 100))
          : 0,
      });
    },
  },

  methods: {
    onTap() {
      this.triggerEvent('tap', { activity: this.data.activity });
    },
    onSignup() {
      this.triggerEvent('signup', { activity: this.data.activity });
    },
  },
});
