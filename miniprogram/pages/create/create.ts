/**
 * 创建活动 - 4 步表单
 *
 * Step 0: 类型
 * Step 1: 标题 / 描述 / 人数
 * Step 2: 时间 / 地点
 * Step 3: 确认提交
 */

import { chooseLocation } from '../../utils/location';
import { formatDateTime } from '../../utils/date';
import { ApiError } from '../../utils/error';
import type { ActivityType } from '../../types/activity';

const TYPE_LABEL: Record<ActivityType, string> = {
  study: '自习',
  group_buy: '拼单',
  sport: '运动',
  meal: '约饭',
  project: '项目',
  other: '其他',
};

interface Form {
  type: ActivityType | '';
  title: string;
  description: string;
  maxParticipants: number;
  startAt: string;
  startAtText: string;
  endAt: string;
  endAtText: string;
  location: { name: string; address: string; longitude: number; latitude: number };
}

interface CreateData {
  steps: { id: number; label: string }[];
  currentStep: number;
  typeOptions: { id: ActivityType; label: string; icon: string }[];
  form: Form;
  typeLabel: string;
  canNext: boolean;
  submitting: boolean;
}

interface CreateCustom {
  onTypeSelect: (e: WechatMiniprogram.TouchEvent) => void;
  onTitleInput: (e: WechatMiniprogram.Input) => void;
  onDescInput: (e: WechatMiniprogram.Input) => void;
  onMaxInput: (e: WechatMiniprogram.Input) => void;
  onStartAtTap: () => void;
  onEndAtTap: () => void;
  onLocationTap: () => Promise<void>;
  onPrev: () => void;
  onNext: () => void;
  _pickDateTime: (cb: (d: Date) => void) => void;
  _refreshCanNext: () => void;
  _submit: () => Promise<void>;
}

Page<CreateData, CreateCustom>({
  data: {
    steps: [
      { id: 0, label: '类型' },
      { id: 1, label: '信息' },
      { id: 2, label: '时间地点' },
      { id: 3, label: '确认' },
    ],
    currentStep: 0,
    typeOptions: [
      { id: 'study', label: '自习', icon: '📚' },
      { id: 'group_buy', label: '拼单', icon: '🛒' },
      { id: 'sport', label: '运动', icon: '🏃' },
      { id: 'meal', label: '约饭', icon: '🍜' },
      { id: 'project', label: '项目', icon: '💻' },
      { id: 'other', label: '其他', icon: '✨' },
    ],
    form: {
      type: '',
      title: '',
      description: '',
      maxParticipants: 4,
      startAt: '',
      startAtText: '',
      endAt: '',
      endAtText: '',
      location: { name: '', address: '', longitude: 0, latitude: 0 },
    },
    typeLabel: '',
    canNext: false,
    submitting: false,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  onTypeSelect(e: WechatMiniprogram.TouchEvent) {
    const type = e.currentTarget.dataset.id as ActivityType;
    this.setData({ 'form.type': type, typeLabel: TYPE_LABEL[type] ?? '其他', canNext: true });
  },

  onTitleInput(e: WechatMiniprogram.Input) {
    this.setData({ 'form.title': e.detail.value });
    this._refreshCanNext();
  },

  onDescInput(e: WechatMiniprogram.Input) {
    this.setData({ 'form.description': e.detail.value });
  },

  onMaxInput(e: WechatMiniprogram.Input) {
    const v = Math.max(2, Math.min(99, Number(e.detail.value) || 2));
    this.setData({ 'form.maxParticipants': v });
  },

  onStartAtTap() {
    this._pickDateTime((d) => {
      this.setData({
        'form.startAt': d.toISOString(),
        'form.startAtText': formatDateTime(d, false),
      });
      this._refreshCanNext();
    });
  },

  onEndAtTap() {
    this._pickDateTime((d) => {
      this.setData({
        'form.endAt': d.toISOString(),
        'form.endAtText': formatDateTime(d, false),
      });
      this._refreshCanNext();
    });
  },

  _pickDateTime(cb: (d: Date) => void) {
    // 简化：先选日期，再选时间（实际项目可换第三方 picker）
    wx.showActionSheet({
      itemList: ['今天 14:00', '今天 19:00', '明天 10:00', '明天 19:00', '本周六 14:00'],
      success: (res) => {
        const map: Record<number, [number, number]> = {
          0: [14, 0],
          1: [19, 0],
          2: [10, 0],
          3: [19, 0],
          4: [14, 0],
        };
        const item = map[res.tapIndex] ?? [14, 0];
        const h = item[0];
        const m = item[1];
        const d = new Date();
        d.setDate(d.getDate() + (res.tapIndex >= 2 ? 1 : 0));
        d.setHours(h, m, 0, 0);
        cb(d);
      },
    });
  },

  async onLocationTap() {
    try {
      const loc = await chooseLocation();
      this.setData({ 'form.location': loc });
      this._refreshCanNext();
    } catch {
      // 用户取消
    }
  },

  onPrev() {
    if (this.data.currentStep > 0) {
      this.setData({ currentStep: this.data.currentStep - 1 });
    }
  },

  onNext() {
    if (!this.data.canNext) return;
    if (this.data.currentStep < this.data.steps.length - 1) {
      this.setData({ currentStep: this.data.currentStep + 1, canNext: false });
      this._refreshCanNext();
    } else {
      this._submit();
    }
  },

  _refreshCanNext() {
    const { currentStep, form } = this.data;
    let can = false;
    if (currentStep === 0) can = !!form.type;
    else if (currentStep === 1) can = !!form.title && !!form.description && form.maxParticipants >= 2;
    else if (currentStep === 2) can = !!form.startAt && !!form.endAt && !!form.location.name;
    else if (currentStep === 3) can = true;
    this.setData({ canNext: can });
  },

  async _submit() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      // await activityApi.create({...});
      await new Promise((r) => setTimeout(r, 500));
      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' });
      }, 600);
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : '发布失败';
      wx.showToast({ title: msg, icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
