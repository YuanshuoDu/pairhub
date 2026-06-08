/**
 * status-pill 组件
 *
 * Apple-style 状态药丸（issue #32 前端 / docs/design/admin-glass.md §8）。
 *
 * Props:
 *   kind   'pending' | 'active' | 'banned' | 'rejected' | 'recruiting' | 'neutral'
 *   icon   string   短文本（1-2 字符 / 单 emoji / 单中文字），无障碍 + 视觉
 *   text   string   主文案（必填）
 *   size   'sm' | 'md'  字号档位
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
    rootClass: 'sp sp--neutral sp--md',
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
        rootClass: `sp sp--${k} sp--${size || 'md'}`,
        resolvedIcon,
      });
    },
  },
});
