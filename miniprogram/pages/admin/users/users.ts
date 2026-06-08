/**
 * 用户搜索页（issue #32 前端 / docs/design/admin-glass.md §6.4）
 *
 * 入口：?status=ACTIVE|BANNED（从 dashboard 卡片点击时带入）
 *       ?search=xx（从其它地方预填）
 *
 * 后端契约：GET /api/v1/admin/users?search=&status=&role= ——
 *           **至少需要一个 filter**（search/status/role），返回
 *           { data: AdminUser[], page: { page, pageSize, total, hasMore } }。
 *
 * 行为：
 *   - 顶部玻璃搜索框（受控）+ status 芯片（全部 / ACTIVE / BANNED）
 *   - 输入框 500ms debounce 后自动查询
 *   - 列表行：玻璃卡 / 头像首字 / 昵称 / id 后 6 位 / 状态药丸 / role 药丸
 *   - 长按行弹 action sheet：封禁 / 解封 / 取消
 *   - PATCH 成功后乐观更新本地 status
 *
 * 错误：搜索为空时会直接展示"输入至少一个过滤条件"玻璃空态，不发请求。
 */

import { adminApi } from '../../../api/admin';
import type { AdminUser, AdminUserStatus, AdminUserRole } from '../../../api/admin';
import { ApiError } from '../../../utils/error';
import { logger } from '../../../utils/logger';
import { relativeTime } from '../../../utils/date';
import { readString } from '../../../utils/query';

interface RowDecorated {
  id: string;
  nickname: string;
  avatar: string | null;
  school: string | null;
  phone: string | null;
  status: AdminUserStatus;
  role: AdminUserRole;
  createdAt: string;
  shortId: string;
  initial: string;
  createdText: string;
}

interface UsersData {
  theme: 'dark';
  reduceMotion: boolean;
  /** 搜索框受控值 */
  search: string;
  /** status 过滤（'ALL' = 不带） */
  statusFilter: 'ALL' | AdminUserStatus;
  /** 列表 */
  list: RowDecorated[];
  loading: boolean;
  loadingMore: boolean;
  isFirstLoad: boolean;
  page: number;
  pageSize: number;
  hasMore: boolean;
  total: number;
  /** 长按触发的 action sheet */
  actionTarget: RowDecorated | null;
  /** action sheet busy（防止双击） */
  busy: boolean;
  errorMsg: string;
}

interface UsersCustom {
  _decorate: (items: AdminUser[]) => RowDecorated[];
  _fetchPage: (page: number, append: boolean) => Promise<void>;
  _debounceTimer?: number;
  onSearchInput: (e: WechatMiniprogram.Input) => void;
  onClearSearch: () => void;
  onStatusFilter: (e: WechatMiniprogram.TouchEvent) => void;
  onSubmitSearch: () => void;
  onUserLongPress: (e: WechatMiniprogram.CustomEvent) => void;
  onCloseAction: () => void;
  onToggleBan: () => Promise<void>;
  onRefresh: () => void;
}

const PAGE_SIZE = 20;

Page<UsersData, UsersCustom>({
  data: {
    theme: 'dark',
    reduceMotion: false,
    search: '',
    statusFilter: 'ALL',
    list: [],
    loading: false,
    loadingMore: false,
    isFirstLoad: true,
    page: 1,
    pageSize: PAGE_SIZE,
    hasMore: true,
    total: 0,
    actionTarget: null,
    busy: false,
    errorMsg: '',
  },

  onLoad(options) {
    // 减动效
    let reduceMotion = false;
    try {
      const sys = wx.getSystemInfoSync();
      // @ts-expect-error 系统字段类型不全
      reduceMotion = sys.batteryLevel !== undefined && sys.batteryLevel <= 0.2;
    } catch {
      reduceMotion = false;
    }

    // 预填：来自 dashboard 卡片或别处的 deep link
    const presetStatus = readString(options, 'status', '');
    const presetSearch = readString(options, 'search', '');
    const sf: 'ALL' | AdminUserStatus =
      presetStatus === 'ACTIVE' || presetStatus === 'BANNED' ? presetStatus : 'ALL';

    this.setData({
      reduceMotion,
      search: presetSearch,
      statusFilter: sf,
    });

    // 直接拉一次（如果 search 不空、或者 status 预设非 ALL）
    if (presetSearch || sf !== 'ALL') {
      this._fetchPage(1, false);
    }
  },

  onPullDownRefresh() {
    this._fetchPage(1, false).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading || this.data.loadingMore) return;
    if (!this.data.hasMore) return;
    this._fetchPage(this.data.page, true);
  },

  onUnload() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
  },

  onSearchInput(e: WechatMiniprogram.Input) {
    const v = e.detail.value;
    this.setData({ search: v });
    // 500ms debounce
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this.setData({ isFirstLoad: true, list: [], page: 1, hasMore: true, total: 0 });
      this._fetchPage(1, false);
    }, 500) as unknown as number;
  },

  onClearSearch() {
    this.setData({ search: '', isFirstLoad: true, list: [], page: 1, hasMore: true, total: 0 });
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._fetchPage(1, false);
  },

  onStatusFilter(e: WechatMiniprogram.TouchEvent) {
    const v = e.currentTarget.dataset.value as 'ALL' | AdminUserStatus;
    if (v === this.data.statusFilter) return;
    this.setData({
      statusFilter: v,
      isFirstLoad: true,
      list: [],
      page: 1,
      hasMore: true,
      total: 0,
    });
    this._fetchPage(1, false);
  },

  onSubmitSearch() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this.setData({ isFirstLoad: true, list: [], page: 1, hasMore: true, total: 0 });
    this._fetchPage(1, false);
  },

  onUserLongPress(e: WechatMiniprogram.CustomEvent) {
    const target = e.detail?.user as RowDecorated;
    if (!target) return;
    this.setData({ actionTarget: target });
  },

  onCloseAction() {
    this.setData({ actionTarget: null });
  },

  async onToggleBan() {
    const target = this.data.actionTarget;
    if (!target || this.data.busy) return;
    const nextStatus: AdminUserStatus = target.status === 'BANNED' ? 'ACTIVE' : 'BANNED';
    this.setData({ busy: true });
    try {
      await adminApi.patchUserStatus(target.id, { status: nextStatus });
      wx.showToast({
        title: nextStatus === 'BANNED' ? '已封禁' : '已解封',
        icon: 'success',
      });
      this.setData({
        busy: false,
        actionTarget: null,
        list: this.data.list.map((u) =>
          u.id === target.id ? { ...u, status: nextStatus } : u,
        ),
        total: this.data.total,
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : '操作失败';
      wx.showToast({ title: msg, icon: 'none' });
      this.setData({ busy: false });
    }
  },

  onRefresh() {
    this._fetchPage(1, false);
  },

  _decorate(items: AdminUser[]): RowDecorated[] {
    return items.map((u) => ({
      id: u.id,
      nickname: u.nickname || '匿名',
      avatar: u.avatar,
      school: u.school,
      phone: u.phone,
      status: u.status,
      role: u.role,
      createdAt: u.createdAt,
      shortId: u.id.length > 8 ? `…${u.id.slice(-6)}` : u.id,
      initial: (u.nickname || '?').slice(0, 1).toUpperCase(),
      createdText: relativeTime(u.createdAt),
    }));
  },

  async _fetchPage(page: number, append: boolean) {
    const search = this.data.search.trim();
    const status = this.data.statusFilter;
    if (!search && status === 'ALL') {
      // 后端强制要求至少一个 filter — 不发请求
      this.setData({
        list: [],
        loading: false,
        loadingMore: false,
        isFirstLoad: false,
        page: 1,
        hasMore: false,
        total: 0,
        errorMsg: '',
      });
      return;
    }

    this.setData({
      loading: append ? false : true,
      loadingMore: append,
      errorMsg: '',
    });

    try {
      const res = await adminApi.listUsers({
        ...(search ? { search } : {}),
        ...(status !== 'ALL' ? { status } : {}),
        page,
        pageSize: PAGE_SIZE,
      });
      const items = res.data || [];
      const decorated = this._decorate(items);
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
      logger.warn('[admin/users] fetch failed', msg);
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
