/**
 * empty-state 组件
 *
 * Props:
 *   title: string
 *   desc?: string
 *   icon?: string  emoji
 *   actionText?: string
 *
 * Events:
 *   action - 点击操作按钮
 */

Component({
  properties: {
    title: { type: String, value: '暂无数据' },
    desc: { type: String, value: '' },
    icon: { type: String, value: '📭' },
    actionText: { type: String, value: '' },
  },
  methods: {
    onAction() {
      this.triggerEvent('action');
    },
  },
});
