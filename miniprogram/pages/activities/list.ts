/**
 * 活动列表页（issue #22）
 *
 * - 调用 GET /api/v1/activities，支持 type + status 服务端过滤
 * - 客户端只做分页拼接 + 过滤芯片切换
 * - 下拉刷新 / 上拉加载更多
 * - 点击卡片进入 detail（?id=...）
 * - 点击报名按钮也直接跳到详情页（由详情页判断是否已登录 / 是否本人）
 *
 * 设计取舍：
 * - 列表只展示 RECRUITING/FULL/STARTED 三种状态的可见活动（默认不过滤
 *   CANCELED / ENDED；用户主动选 ENDED 才展示）。后端默认就排除 CANCELED。
 * - 城市过滤 city 暂不提供 UI（plan 留到 issue #25 性能优化一起做）。
 */

import { activityApi } from '../../api/activity';
import { ApiError } from '../../utils/error';
import { logger } from '../../utils/logger';
import type {
  Activity,
  ActivityStatus,
  ActivityType,
} from '../../types/activity';
import {
  ACTIVITY_STATUS_FILTERS,
  ACTIVITY_TYPE_FILTERS,
} from '../../types/activity';

interface ListData {
  loading: boolean;
  loadingMore: boolean;
  list: Activity[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  total: number;
  typeFilters: typeof ACTIVITY_TYPE_FILTERS;
  statusFilters: typeof ACTIVITY_STATUS_FILTERS;
  activeType: ActivityType | '';
  activeStatus: ActivityStatus | '';
  /** 标记是否是首次加载（控制 skeleton vs loading more 状态） */
  isFirstLoad: boolean;
}

interface ListCustom {
  _fetchPage: (page: number, append: boolean) => Promise<void>;
  onTypeFilter: (e: WechatMiniprogram.TouchEvent) => void;
  onStatusFilter: (e: WechatMiniprogram.TouchEvent) => void;
  onCardTap: (e: WechatMiniprogram.CustomEvent) => void;
  onSignupTap: (e: WechatMiniprogram.CustomEvent) => void;
  onRetry: () => void;
}

const PAGE_SIZE = 20;

Page<ListData, ListCustom>({
  data: {
    loading: false,
    loadingMore: false,
    list: [],
    page: 1,
    pageSize: PAGE_SIZE,
    hasMore: true,
    total: 0,
    typeFilters: ACTIVITY_TYPE_FILTERS,
    statusFilters: ACTIVITY_STATUS_FILTERS,
    activeType: '',
    activeStatus: '',
    isFirstLoad: true,
  },

  onLoad() {
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

  onTypeFilter(e: WechatMiniprogram.TouchEvent) {
    const value = (e.currentTarget.dataset.value as ActivityType | '') ?? '';
    if (value === this.data.activeType) return;
    this.setData({ activeType: value, isFirstLoad: true });
    this._fetchPage(1, false);
  },

  onStatusFilter(e: WechatMiniprogram.TouchEvent) {
    const value = (e.currentTarget.dataset.value as ActivityStatus | '') ?? '';
    if (value === this.data.activeStatus) return;
    this.setData({ activeStatus: value, isFirstLoad: true });
    this._fetchPage(1, false);
  },

  onCardTap(e: WechatMiniprogram.CustomEvent) {
    const id = e.detail?.activity?.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/activities/detail?id=${id}` });
  },

  onSignupTap(e: WechatMiniprogram.CustomEvent) {
    const id = e.detail?.activity?.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/activities/detail?id=${id}` });
  },

  onRetry() {
    this._fetchPage(1, false);
  },

  async _fetchPage(page: number, append: boolean) {
    if (append) {
      this.setData({ loadingMore: true });
    } else if (this.data.isFirstLoad) {
      this.setData({ loading: true });
    } else {
      this.setData({ loading: true });
    }

    try {
      const query: { page: number; pageSize: number; type?: ActivityType; status?: ActivityStatus } = {
        page,
        pageSize: PAGE_SIZE,
      };
      if (this.data.activeType) query.type = this.data.activeType;
      if (this.data.activeStatus) query.status = this.data.activeStatus;

      const res = await activityApi.listActivities(query);
      const items = res.data || [];
      const total = res.total || 0;
      // issue #25: prefer the server's `hasMore` flag (avoids needing
      // total to derive the next page); fall back to local derivation
      // if the server is on the old contract.
      const nextHasMore =
        typeof res.hasMore === 'boolean'
          ? res.hasMore
          : page * PAGE_SIZE < total;
      const nextPage = page + 1;

      this.setData({
        list: append ? [...this.data.list, ...items] : items,
        page: nextPage,
        hasMore: nextHasMore,
        total,
        loading: false,
        loadingMore: false,
        isFirstLoad: false,
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : '加载失败';
      logger.warn('[activities/list] fetch failed', msg);
      this.setData({
        loading: false,
        loadingMore: false,
        isFirstLoad: false,
      });
      wx.showToast({ title: msg, icon: 'none' });
    }
  },
});
