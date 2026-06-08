/**
 * 审核队列页（issue #32 前端 / docs/design/admin-glass.md §6.2）
 *
 * - 调 GET /api/v1/admin/activities?status=PENDING_REVIEW
 * - 每行玻璃卡：title / type chip / creator / startTime / 状态药丸
 * - 行内 [批准] / [驳回] 快速操作；点击行进详情页
 * - 顶部状态芯片切换：PENDING_REVIEW（默认）/ RECRUITING / REJECTED / ENDED ...
 * - 下拉刷新 + 上拉加载更多（pageSize 20）
 * - 审核操作成功后从本地列表中移除该行（避免再点一次被 409 拍脸）
 *
 * 设计 token：brief §1-7 全部按 glass tokens；颜色不引入新 hex。
 *
 * 减动效：低电量机型 / 弱机下挂 .reduce-motion，关闭 mesh 漂移 + page-enter。
 */

import { adminApi } from '../../../api/admin';
import type { AdminActivity, AdminActivityStatus } from '../../../api/admin';
import { ApiError } from '../../../utils/error';
import { logger } from '../../../utils/logger';
import { relativeTime, activityTimeRange } from '../../../utils/date';
import { ACTIVITY_TYPE_LABEL } from '../../../types/activity';

interface RowDecorated {
  id: string;
  type: AdminActivity['type'];
  title: string;
  status: AdminActivityStatus;
  moderationNote: string | null;
  startTime: string;
  endTime: string;
  typeLabel: string;
  timeText: string;
  creatorName: string;
  creatorId: string;
  busy: boolean;
}

interface ActivitiesData {
  theme: 'dark';
  reduceMotion: boolean;
  loading: boolean;
  loadingMore: boolean;
  isFirstLoad: boolean;
  list: RowDecorated[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  total: number;
  activeStatus: AdminActivityStatus;
  statusFilters: { value: AdminActivityStatus; label: string }[];
  /** 当前正在做行内审核的 id（防止双击） */
  busyId: string;
  errorMsg: string;
}

interface ActivitiesCustom {
  _decorate: (items: AdminActivity[], busyId: string) => RowDecorated[];
  _fetchPage: (page: number, append: boolean) => Promise<void>;
  onStatusFilter: (e: WechatMiniprogram.TouchEvent) => void;
  onCardTap: (e: WechatMiniprogram.CustomEvent) => void;
  onApprove: (e: WechatMiniprogram.CustomEvent) => void;
  onReject: (e: WechatMiniprogram.CustomEvent) => void;
  onRefresh: () => void;
}

const PAGE_SIZE = 20;
const STATUS_FILTERS: { value: AdminActivityStatus; label: string }[] = [
  { value: 'PENDING_REVIEW', label: '待审核' },
  { value: 'RECRUITING', label: '招募中' },
  { value: 'REJECTED', label: '已驳回' },
  { value: 'ENDED', label: '已结束' },
  { value: 'CANCELED', label: '已取消' },
];

Page<ActivitiesData, ActivitiesCustom>({
  data: {
    theme: 'dark',
    reduceMotion: false,
    loading: false,
    loadingMore: false,
    isFirstLoad: true,
    list: [],
    page: 1,
    pageSize: PAGE_SIZE,
    hasMore: true,
    total: 0,
    activeStatus: 'PENDING_REVIEW',
    statusFilters: STATUS_FILTERS,
    busyId: '',
    errorMsg: '',
  },

  onLoad() {
    // 主题（dark 为默认） + 减动效
    let reduceMotion = false;
    try {
      const sys = wx.getSystemInfoSync();
      // @ts-expect-error 系统字段类型不全
      const lowPower = sys.batteryLevel !== undefined && sys.batteryLevel <= 0.2;
      reduceMotion = !!lowPower;
    } catch {
      reduceMotion = false;
    }
    this.setData({ reduceMotion });
    this._fetchPage(1, false);
  },

  onPullDownRefresh() {
    this._fetchPage(1, false).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading || this.data.loadingMore) return;
    if (!this.data.hasMore) return;
    this._fetchPage(this.data.page, true);
  },

  onStatusFilter(e: WechatMiniprogram.TouchEvent) {
    const value = e.currentTarget.dataset.value as AdminActivityStatus;
    if (value === this.data.activeStatus) return;
    this.setData({
      activeStatus: value,
      isFirstLoad: true,
      list: [],
      page: 1,
      hasMore: true,
      total: 0,
    });
    this._fetchPage(1, false);
  },

  onCardTap(e: WechatMiniprogram.CustomEvent) {
    const id = e.detail?.id || '';
    if (!id) return;
    wx.navigateTo({ url: `/pages/admin/activity-detail/activity-detail?id=${id}` });
  },

  async onApprove(e: WechatMiniprogram.CustomEvent) {
    const id: string = e.detail?.id || '';
    if (!id || this.data.busyId) return;
    this.setData({ busyId: id });
    try {
      await adminApi.approveActivity(id);
      wx.showToast({ title: '已批准', icon: 'success' });
      // 乐观更新：从 PENDING_REVIEW 视图移除
      if (this.data.activeStatus === 'PENDING_REVIEW') {
        this.setData({
          list: this.data.list.filter((a) => a.id !== id),
          total: Math.max(0, this.data.total - 1),
        });
      } else {
        // 其他视图里改 status
        this.setData({
          list: this.data.list.map((a) =>
            a.id === id ? { ...a, status: 'RECRUITING', busy: false } : a,
          ),
        });
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : '操作失败';
      wx.showToast({ title: msg, icon: 'none' });
    } finally {
      this.setData({ busyId: '' });
    }
  },

  onReject(e: WechatMiniprogram.CustomEvent) {
    const id: string = e.detail?.id || '';
    if (!id) return;
    // 跳详情页，详情页里通过 openReject=1 触发 reject sheet
    wx.navigateTo({ url: `/pages/admin/activity-detail/activity-detail?id=${id}&openReject=1` });
  },

  onRefresh() {
    this._fetchPage(1, false);
  },

  _decorate(items: AdminActivity[], busyId: string): RowDecorated[] {
    return items.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      status: a.status,
      moderationNote: a.moderationNote,
      startTime: a.startTime,
      endTime: a.endTime,
      typeLabel: ACTIVITY_TYPE_LABEL[a.type] || '其他',
      timeText: activityTimeRange(a.startTime, a.endTime) || relativeTime(a.startTime),
      creatorName: a.creator?.nickname || '匿名',
      creatorId: a.creator?.id || '',
      busy: busyId === a.id,
    }));
  },

  async _fetchPage(page: number, append: boolean) {
    this.setData({ loading: append ? false : true, loadingMore: append, errorMsg: '' });

    try {
      const res = await adminApi.listActivities({
        status: this.data.activeStatus,
        page,
        pageSize: PAGE_SIZE,
      });
      const items = res.data || [];
      const decorated = this._decorate(items, this.data.busyId);
      this.setData({
        list: append ? [...this.data.list, ...decorated] : decorated,
        page: page + 1,
        hasMore: res.page?.hasMore ?? false,
        total: res.page?.total ?? 0,
        loading: false,
        loadingMore: false,
        isFirstLoad: false,
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : '加载失败';
      logger.warn('[admin/activities] fetch failed', msg);
      this.setData({
        loading: false,
        loadingMore: false,
        isFirstLoad: false,
        errorMsg: msg,
      });
      wx.showToast({ title: msg, icon: 'none' });
    }
  },
});
