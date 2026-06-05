/**
 * 消息中心 - 3 个 tab：系统 / 活动 / 私聊
 */

import { relativeTime } from '../../utils/date';

type TabId = 'system' | 'activity' | 'chat';

interface Message {
  id: string;
  title: string;
  summary: string;
  timeText: string;
}

interface ChatPreview {
  id: string;
  nickname: string;
  lastMessage: string;
  timeText: string;
  unread: number;
}

interface MessagesData {
  tabs: { id: TabId; label: string; badge: number }[];
  activeTab: TabId;
  systemList: Message[];
  activityList: Message[];
  chatList: ChatPreview[];
}

Page<MessagesData, Record<string, any>>({
  data: {
    tabs: [
      { id: 'system', label: '系统', badge: 0 },
      { id: 'activity', label: '活动', badge: 2 },
      { id: 'chat', label: '私聊', badge: 0 },
    ],
    activeTab: 'system',
    systemList: [
      {
        id: 's1',
        title: '欢迎来到 Pairhub',
        summary: '在这里你可以找到志同道合的学习搭子，一起自习、运动、约饭～',
        timeText: relativeTime(new Date(Date.now() - 1000 * 60 * 60 * 2)),
      },
    ],
    activityList: [
      {
        id: 'a1',
        title: '你报名的活动有更新',
        summary: '"图书馆期末复习搭子" 已有新同学加入，请准时参加。',
        timeText: relativeTime(new Date(Date.now() - 1000 * 60 * 30)),
      },
      {
        id: 'a2',
        title: '活动即将开始',
        summary: '"晨跑搭子·周末" 将在 2 小时后开始，请提前准备。',
        timeText: relativeTime(new Date(Date.now() - 1000 * 60 * 60 * 5)),
      },
    ],
    chatList: [
      {
        id: 'c1',
        nickname: '学霸小李',
        lastMessage: '好的，明天图书馆见！',
        timeText: relativeTime(new Date(Date.now() - 1000 * 60 * 10)),
        unread: 0,
      },
      {
        id: 'c2',
        nickname: '跑跑跑',
        lastMessage: '我们 7 点操场见，别迟到哦',
        timeText: relativeTime(new Date(Date.now() - 1000 * 60 * 60 * 3)),
        unread: 2,
      },
    ],
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
  },

  onTabChange(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as TabId;
    if (id === this.data.activeTab) return;
    this.setData({ activeTab: id });
  },

  onChatTap(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id;
    wx.showToast({ title: `打开私聊 ${id}`, icon: 'none' });
  },
});
