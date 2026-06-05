/**
 * 自定义 TabBar
 *
 * 用法（app.json 中需开启 "custom": true）：
 *   "tabBar": { "custom": true, "list": [...] }
 *
 * 每个 Tab 页面 onShow 时调用：
 *   this.getTabBar().setData({ selected: <index> })
 *
 * 支持：
 * - 图标 + 选中态
 * - 数字角标 / 红点
 * - 安全区适配
 */

import { systemStore } from '../store/system';

interface TabItem {
  pagePath: string;
  text: string;
  iconPath: string;
  selectedIconPath: string;
  badge?: number;
  dot?: boolean;
}

Component({
  data: {
    selected: 0,
    list: [
      { pagePath: 'pages/index/index', text: '首页', iconPath: 'images/tabbar/home.png', selectedIconPath: 'images/tabbar/home_active.png' },
      { pagePath: 'pages/activity/activity', text: '活动', iconPath: 'images/tabbar/activity.png', selectedIconPath: 'images/tabbar/activity_active.png' },
      { pagePath: 'pages/create/create', text: '创建', iconPath: 'images/tabbar/create.png', selectedIconPath: 'images/tabbar/create_active.png' },
      { pagePath: 'pages/messages/messages', text: '消息', iconPath: 'images/tabbar/messages.png', selectedIconPath: 'images/tabbar/messages_active.png' },
      { pagePath: 'pages/profile/profile', text: '我的', iconPath: 'images/tabbar/profile.png', selectedIconPath: 'images/tabbar/profile.png' },
    ] as TabItem[],
    safeBottom: 0,
  },

  lifetimes: {
    attached() {
      const sys = systemStore.state.systemInfo;
      if (sys) {
        const screenHeight = sys.screenHeight ?? 0;
        const safeBottom = sys.safeArea?.bottom ? Math.max(0, screenHeight - sys.safeArea.bottom) : 0;
        this.setData({ safeBottom });
      }
    },
  },

  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const index = Number(e.currentTarget.dataset.index);
      const path = e.currentTarget.dataset.path as string;
      if (index === this.data.selected) return;
      wx.switchTab({ url: `/${path}` });
    },
  },
});
