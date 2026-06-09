/**
 * status-pill 组件
 *
 * Apple-style 状态药丸（issue #32 前端 / docs/design/admin-glass.md §8）。
 *
 * v2 (per verifier feedback on attempt 1)：玻璃底用全局 .glass 类（透过
 * styleIsolation: 'apply-shared'），而不是组件自己定义一份玻璃样式。
 * .pill / .pill--{kind,size} / .pill__dot 等是组件本地的排版类。
 *
 * 视觉：药丸形（var(--glass-radius-pill)），浅色玻璃底 + 左侧色点 + 图标 + 文案。
 * 颜色来自现有语义 token（--color-success / --color-error / --color-warning / --color-primary），
 * 永远不只靠颜色传递信息（brief §8）—— icon + text 永远同时出现。
 */

export type StatusPillKind =
  | 'pending'
  | 'active'
  | 'banned'
  | 'rejected'
  | 'recruiting'
  | 'neutral';

const DEFAULT_ICON: Record<StatusPillKind, string> = {
  pending: '·',
  active: '✓',
  banned: '⛔',
  rejected: '✕',
  recruiting: '◇',
  neutral: '·',
};

Component({
  /** 关键：让全局 .glass 类从 tokens.wxss 透传进来（默认是 isolated） */
  options: {
    styleIsolation: 'apply-shared',
    multipleSlots: true,
  },

  properties: {
    kind: {
      type: String,
      value: 'neutral',
    },
    icon: {
      type: String,
      value: '',
    },
    text: {
      type: String,
      value: '',
    },
    size: {
      type: String,
      value: 'md',
    },
  },

  data: {
    rootClass: 'glass glass--radius-pill pill pill--neutral pill--md',
    resolvedIcon: '·',
  },

  observers: {
    'kind, icon, text, size': function (
      kind: string,
      icon: string,
      text: string,
      size: string,
    ) {
      const k = (kind || 'neutral') as StatusPillKind;
      const resolvedIcon = icon && icon.length > 0 ? icon : DEFAULT_ICON[k] || '·';
      this.setData({
        rootClass: [
          'glass',
          'glass--radius-pill',
          'pill',
          `pill--${k}`,
          `pill--${size || 'md'}`,
        ].join(' '),
        resolvedIcon,
      });
    },
  },
});