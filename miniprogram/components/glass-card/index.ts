/**
 * glass-card 组件
 *
 * Liquid-glass 卡片（issue #32 前端 / docs/design/admin-glass.md §3）。
 *
 * Props:
 *   tone     'light' | 'deep'     浅色 vs 更不透的强调玻璃（默认 'light'）
 *   radius   'md' | 'lg' | 'pill' 圆角档位（默认 'md' = 20px）
 *   padding  'sm' | 'md' | 'lg'   内边距档位（默认 'md'）
 *   tappable boolean              是否可点击（点击触发 0.98 scale 动效）
 *   hover    boolean              等价 tappable（语义化别名，hover 态是 Apple 范式）
 *
 * Events:
 *   tap  — 仅在 tappable=true 时触发（外层 catchtap 也可）
 *
 * 视觉构成（参考 brief §3）：
 *   1. 玻璃底色 var(--glass-bg) + 32px backdrop-filter blur
 *   2. ::before 伪元素叠加顶部高光渐变（var(--glass-highlight)）
 *   3. 1px 玻璃边框（var(--glass-border)）
 *   4. 阴影 var(--glass-shadow-1)
 *   5. 圆角由 --glass-radius / --glass-radius-lg 控制
 *
 * WXSS 注：miniprogram 2.13.0+ 支持 backdrop-filter，无需 polyfill。
 */

Component({
  options: {
    /** 让外部传入的 class 合并进来（保持 BEM 命名） */
    multipleSlots: true,
  },

  properties: {
    tone: {
      type: String,
      value: 'light',
    },
    radius: {
      type: String,
      value: 'md',
    },
    padding: {
      type: String,
      value: 'md',
    },
    tappable: {
      type: Boolean,
      value: false,
    },
    hover: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    /** 拼装后的 class — observers 维护 */
    rootClass: 'gc gc--light gc--radius-md gc--padding-md',
    isInteractive: false,
  },

  observers: {
    'tone, radius, padding, tappable, hover': function (
      tone: string,
      radius: string,
      padding: string,
      tappable: boolean,
      hover: boolean,
    ) {
      const interactive = !!(tappable || hover);
      this.setData({
        rootClass: [
          'gc',
          `gc--${tone}`,
          `gc--radius-${radius}`,
          `gc--padding-${padding}`,
          interactive ? 'gc--interactive' : '',
        ]
          .filter(Boolean)
          .join(' '),
        isInteractive: interactive,
      });
    },
  },

  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      if (!this.data.isInteractive) return;
      this.triggerEvent('tap', e.detail, {});
    },
  },
});
