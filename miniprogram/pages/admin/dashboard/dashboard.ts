/**
 * 数据看板页（issue #32 前端 / docs/design/admin-glass.md §6.5）
 *
 * 入口：gate 页 ADMIN 验证通过后 redirectTo 进来
 *
 * 内容（4 张 2×2 玻璃卡 + 2 张横排卡）：
 *   - Users: total / banned / newToday / newThisWeek
 *   - Activities: total / pending / recruiting
 *   - Signups: total / today
 *   - PushTokens: total
 *
 * 行为：
 *   - onLoad 拉一次 metrics
 *   - 下拉刷新再拉一次
 *   - onShow 时若距离上次刷新 > 60s 自动刷新一次
 *   - 点卡跳到对应搜索页（users / activities）
 *
 * 文案：playbook §6 — pending > 20 时 SLA 预警（红色提示条）
 */

import { adminApi } from '../../../api/admin';
import type { AdminMetrics } from '../../../api/admin';
import { ApiError } from '../../../utils/error';
import { logger } from '../../../utils/logger';
import { formatDateTime } from '../../../utils/date';

interface DashboardData {
  theme: 'dark';
  reduceMotion: boolean;
  loading: boolean;
  metrics: AdminMetrics | null;
  /** generatedAt 友好显示 */
  generatedText: string;
  /** pending > 20 触发 SLA 警告（playbook §6） */
  slaWarning: boolean;
  /** 上次刷新时间（ms） */
  lastFetchAt: number;
  errorMsg: string;
}

interface DashboardCustom {
  _load: (force?: boolean) => Promise<void>;
  onRefresh: () => void;
  onCardUsers: () => void;
  onCardActivities: () => void;
  onCardSignups: () => void;
  onCardPushTokens: () => void;
  onOpenActivitiesQueue: () => void;
}

const REFRESH_INTERVAL_MS = 60_000;

Page<DashboardData, DashboardCustom>({
  data: {
    theme: 'dark',
    reduceMotion: false,
    loading: true,
    metrics: null,
    generatedText: '',
    slaWarning: false,
    lastFetchAt: 0,
    errorMsg: '',
  },

  onLoad() {
    let reduceMotion = false;
    try {
      const sys = wx.getSystemInfoSync();
      // @ts-expect-error 系统字段类型不全
      reduceMotion = sys.batteryLevel !== undefined && sys.batteryLevel <= 0.2;
    } catch {
      reduceMotion = false;
    }
    this.setData({ reduceMotion });
    this._load();
  },

  onShow() {
    // 自动刷新：上次 > 60s
    if (this.data.lastFetchAt && Date.now() - this.data.lastFetchAt > REFRESH_INTERVAL_MS) {
      this._load();
    }
  },

  onPullDownRefresh() {
    this._load(true).finally(() => wx.stopPullDownRefresh());
  },

  async _load(force = false) {
    if (!force && this.data.loading) return;
    this.setData({ loading: true, errorMsg: '' });
    try {
      const res = await adminApi.getMetrics();
      const m = res.data;
      const sla = m.activities.pending > 20;
      this.setData({
        metrics: m,
        generatedText: formatDateTime(m.generatedAt),
        slaWarning: sla,
        lastFetchAt: Date.now(),
        loading: false,
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : '加载失败';
      logger.warn('[admin/dashboard] load failed', msg);
      this.setData({ loading: false, errorMsg: msg });
      wx.showToast({ title: msg, icon: 'none' });
    }
  },

  onRefresh() {
    this._load(true);
  },

  onCardUsers() {
    wx.navigateTo({ url: '/pages/admin/users/users' });
  },

  onCardActivities() {
    wx.navigateTo({ url: '/pages/admin/activities/activities' });
  },

  onCardSignups() {
    // 报名暂无独立页面 — 跳到 activities 列表（最近活动有 signup 计数）
    wx.navigateTo({ url: '/pages/admin/activities/activities' });
  },

  onCardPushTokens() {
    // pushTokens 暂无独立页面（M3 W12 跟进）
    wx.showToast({ title: '详情页在 M3 W12 接入', icon: 'none' });
  },

  onOpenActivitiesQueue() {
    wx.navigateTo({ url: '/pages/admin/activities/activities' });
  },
});
