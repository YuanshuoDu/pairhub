/**
 * 首页 - 活动列表
 *
 * - mock 3 条数据（脚手架阶段不调真实后端）
 * - 支持下拉刷新、分类切换、搜索入口、点击进入详情
 */

import { userStore } from '../../store/user';
import type { Activity, ActivityType } from '../../types/activity';

interface Filter {
  id: ActivityType | 'all';
  label: string;
}

interface IndexData {
  loading: boolean;
  list: Activity[];
  page: number;
  hasMore: boolean;
  activeFilter: Filter['id'];
  filters: Filter[];
  nickname: string;
}

Page<IndexData, Record<string, any>>({
  data: {
    loading: false,
    list: [],
    page: 1,
    hasMore: true,
    activeFilter: 'all',
    filters: [
      { id: 'all', label: '全部' },
      { id: 'study', label: '自习' },
      { id: 'group_buy', label: '拼单' },
      { id: 'sport', label: '运动' },
      { id: 'meal', label: '约饭' },
      { id: 'project', label: '项目' },
      { id: 'other', label: '其他' },
    ],
    nickname: '',
  },

  onLoad() {
    this.setData({ nickname: userStore.state.user?.nickname || '' });
  },

  onShow() {
    // tabbar selected 同步
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    this._loadList(true);
  },

  onPullDownRefresh() {
    this._loadList(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this._loadList(false);
    }
  },

  onFilterChange(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as Filter['id'];
    if (id === this.data.activeFilter) return;
    this.setData({ activeFilter: id });
    this._loadList(true);
  },

  onSearchTap() {
    wx.showToast({ title: '搜索功能开发中', icon: 'none' });
  },

  onCardTap(e: any) {
    const id = e.detail?.activity?.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/activity/activity?id=${id}` });
  },

  onSignupTap(e: any) {
    const id = e.detail?.activity?.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/activity/activity?id=${id}` });
  },

  /** mock 列表数据 */
  async _loadList(reset: boolean) {
    if (this.data.loading) return;
    this.setData({ loading: true });

    // 模拟网络延迟
    await new Promise((r) => setTimeout(r, 300));

    const mock: Activity[] = [
      {
        id: 'a-001',
        type: 'study',
        title: '图书馆期末复习搭子',
        description: '本周三、周五下午图书馆二楼，想找 2-3 个同学一起复习高数，重点刷课后习题。',
        location: { name: '图书馆二楼自习区', address: '校园主楼北侧', longitude: 0, latitude: 0 },
        startAt: '2026-06-10T13:30:00.000Z',
        endAt: '2026-06-10T17:30:00.000Z',
        signupDeadline: '2026-06-10T12:00:00.000Z',
        maxParticipants: 4,
        currentParticipants: 2,
        fee: 0,
        tags: ['高数', '复习', '安静'],
        status: 'recruiting',
        organizer: { id: 'u-101', nickname: '学霸小李', avatar: '' },
        signedUp: false,
        createdAt: '2026-06-05T08:00:00.000Z',
        updatedAt: '2026-06-05T08:00:00.000Z',
      },
      {
        id: 'a-002',
        type: 'sport',
        title: '晨跑搭子·周末',
        description: '周六早上 7 点操场集合，5km 慢跑配速 6\'30"。我跑步新手，目标是半马。',
        location: { name: '学校田径场', address: '体育馆旁', longitude: 0, latitude: 0 },
        startAt: '2026-06-08T07:00:00.000Z',
        endAt: '2026-06-08T08:30:00.000Z',
        signupDeadline: '2026-06-08T06:00:00.000Z',
        maxParticipants: 6,
        currentParticipants: 4,
        fee: 0,
        tags: ['晨跑', '5km', '新手友好'],
        status: 'recruiting',
        organizer: { id: 'u-102', nickname: '跑跑跑', avatar: '' },
        signedUp: false,
        createdAt: '2026-06-04T20:00:00.000Z',
        updatedAt: '2026-06-04T20:00:00.000Z',
      },
      {
        id: 'a-003',
        type: 'meal',
        title: '海底捞拼单·88 折',
        description: '周五晚 6 点海底捞（大学城店），已有 3 人，再拼 1-2 人凑齐 88 折套餐。',
        location: { name: '海底捞大学城店', address: '大学城商业街 2 楼', longitude: 0, latitude: 0 },
        startAt: '2026-06-07T18:00:00.000Z',
        endAt: '2026-06-07T20:00:00.000Z',
        signupDeadline: '2026-06-07T15:00:00.000Z',
        maxParticipants: 6,
        currentParticipants: 5,
        fee: 0,
        tags: ['拼单', '88 折', 'AA'],
        status: 'recruiting',
        organizer: { id: 'u-103', nickname: '小火锅', avatar: '' },
        signedUp: false,
        createdAt: '2026-06-04T12:00:00.000Z',
        updatedAt: '2026-06-05T09:00:00.000Z',
      },
    ];

    // filter
    const filterId = this.data.activeFilter;
    const list = filterId === 'all' ? mock : mock.filter((m) => m.type === filterId);

    this.setData({
      list: reset ? list : [...this.data.list, ...list],
      page: this.data.page + 1,
      hasMore: false,
      loading: false,
    });
  },
});
