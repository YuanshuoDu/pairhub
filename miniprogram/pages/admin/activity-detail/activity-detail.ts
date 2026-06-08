/**
 * 审核详情页（issue #32 前端 / docs/design/admin-glass.md §6.3）
 *
 * 入口：?id=<activityId>，可选 ?openReject=1（从列表的"驳回"按钮跳来
 *      直接打开 reject 玻璃 sheet）
 *
 * 视觉：复刻消费端 detail 布局（cover / 标题卡 / 字段卡 / 介绍 / 组织者），
 * 底部多一个 sticky 玻璃 action bar：[[驳回（带原因）] [批准]]。
 *
 * 驳回流程：点 [驳回] 弹出玻璃 bottom-sheet，里面一个 textarea
 * 收集 reason（必填 1-500 字符），点击 sheet 里的 [确认驳回] 才真的
 * 调 POST /api/v1/admin/activities/:id/reject。
 *
 * 状态机：PENDING_REVIEW → RECRUITING（批准）或 REJECTED（驳回）。
 * STARTED / ENDED / CANCELED 不可操作（lock 整个 action bar）。
 */

import { adminApi } from '../../../api/admin';
import type { AdminActivity } from '../../../api/admin';
import { ApiError } from '../../../utils/error';
import { logger } from '../../../utils/logger';
import { activityTimeRange, formatDateTime } from '../../../utils/date';
import { ACTIVITY_TYPE_LABEL, ACTIVITY_STATUS_LABEL } from '../../../types/activity';
import { readString, readBool } from '../../../utils/query';

interface DetailData {
  id: string;
  theme: 'dark';
  reduceMotion: boolean;
  loading: boolean;
  submitting: boolean;
  activity: AdminActivity | null;
  typeLabel: string;
  statusLabel: string;
  timeRange: string;
  startText: string;
  endText: string;
  creatorName: string;
  creatorId: string;
  /** 驳回 sheet 状态 */
  rejectOpen: boolean;
  rejectReason: string;
  /** 是否锁定（活动已 STARTED / ENDED / CANCELED） */
  locked: boolean;
  /** 锁定原因（文案） */
  lockedReason: string;
}

interface DetailCustom {
  _load: () => Promise<void>;
  onOpenReject: () => void;
  onCloseReject: () => void;
  onReasonInput: (e: WechatMiniprogram.Input) => void;
  onApprove: () => Promise<void>;
  onConfirmReject: () => Promise<void>;
}

Page<DetailData, DetailCustom>({
  data: {
    id: '',
    theme: 'dark',
    reduceMotion: false,
    loading: true,
    submitting: false,
    activity: null,
    typeLabel: '',
    statusLabel: '',
    timeRange: '',
    startText: '',
    endText: '',
    creatorName: '',
    creatorId: '',
    rejectOpen: false,
    rejectReason: '',
    locked: false,
    lockedReason: '',
  },

  onLoad(options) {
    const id = readString(options, 'id', '');
    if (!id) {
      wx.showToast({ title: '缺少活动 id', icon: 'none' });
      this.setData({ loading: false });
      return;
    }
    this.setData({ id });
    if (readBool(options, 'openReject', false)) {
      // 延后到 _load 完成后弹出
      this._openRejectAfterLoad = true;
    }
    this._load();
  },

  _openRejectAfterLoad: false,

  async _load() {
    this.setData({ loading: true });
    try {
      // 详情直接复用 adminApi（暂时后端没有 /admin/activities/:id，但
      // list 接口返回的字段已经覆盖 detail 全部需要的信息；后续 issue
      // 跟进时再加单独的 GET 端点）
      const res = await adminApi.listActivities({ status: 'PENDING_REVIEW', pageSize: 100 });
      const found: AdminActivity | undefined = res.data.find((a) => a.id === this.data.id);
      if (!found) {
        // PENDING_REVIEW 找不到，再去 RECRUITING 找一遍
        const res2 = await adminApi.listActivities({ status: 'RECRUITING', pageSize: 100 });
        const f2 = res2.data.find((a) => a.id === this.data.id);
        if (!f2) {
          this.setData({ loading: false, activity: null });
          wx.showToast({ title: '活动不存在', icon: 'none' });
          return;
        }
        this._apply(f2);
      } else {
        this._apply(found);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : '加载失败';
      logger.warn('[admin/activity-detail] load failed', msg);
      wx.showToast({ title: msg, icon: 'none' });
      this.setData({ loading: false });
    }
  },

  _apply(a: AdminActivity) {
    const locked = a.status === 'STARTED' || a.status === 'ENDED' || a.status === 'CANCELED';
    const lockedReason = locked
      ? `活动状态为 ${ACTIVITY_STATUS_LABEL[a.status]}，不能审核`
      : '';
    this.setData({
      activity: a,
      typeLabel: ACTIVITY_TYPE_LABEL[a.type] ?? '其他',
      statusLabel: ACTIVITY_STATUS_LABEL[a.status] ?? '',
      timeRange: activityTimeRange(a.startTime, a.endTime),
      startText: formatDateTime(a.startTime),
      endText: formatDateTime(a.endTime),
      creatorName: a.creator?.nickname || '匿名',
      creatorId: a.creator?.id || '',
      loading: false,
      locked,
      lockedReason,
    });
    if (this._openRejectAfterLoad && !locked) {
      this._openRejectAfterLoad = false;
      this.setData({ rejectOpen: true });
    }
  },

  onOpenReject() {
    if (this.data.locked) return;
    this.setData({ rejectOpen: true, rejectReason: '' });
  },

  onCloseReject() {
    this.setData({ rejectOpen: false });
  },

  onReasonInput(e: WechatMiniprogram.Input) {
    this.setData({ rejectReason: e.detail.value.slice(0, 500) });
  },

  async onApprove() {
    if (!this.data.activity || this.data.submitting || this.data.locked) return;
    this.setData({ submitting: true });
    try {
      await adminApi.approveActivity(this.data.activity.id);
      wx.showToast({ title: '已批准', icon: 'success' });
      // 短暂展示状态变化再回退
      this.setData({
        activity: { ...this.data.activity, status: 'RECRUITING', moderationNote: null },
        submitting: false,
        locked: true,
        lockedReason: '已批准 — 活动现在招募中',
      });
      setTimeout(() => {
        wx.navigateBack({ delta: 1 });
      }, 800);
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : '批准失败';
      wx.showToast({ title: msg, icon: 'none' });
      this.setData({ submitting: false });
    }
  },

  async onConfirmReject() {
    if (!this.data.activity || this.data.submitting) return;
    const reason = this.data.rejectReason.trim();
    if (!reason) {
      wx.showToast({ title: '请填写驳回原因', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await adminApi.rejectActivity(this.data.activity.id, reason);
      wx.showToast({ title: '已驳回', icon: 'success' });
      this.setData({
        activity: { ...this.data.activity, status: 'REJECTED', moderationNote: reason },
        submitting: false,
        rejectOpen: false,
        locked: true,
        lockedReason: '已驳回 — 状态已锁定',
      });
      setTimeout(() => {
        wx.navigateBack({ delta: 1 });
      }, 800);
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : '驳回失败';
      wx.showToast({ title: msg, icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
