/**
 * loading-skeleton 组件
 *
 * Props:
 *   count?: number   渲染多少行（默认 3）
 */

Component({
  properties: {
    count: { type: Number, value: 3 },
  },
  data: {
    rows: [] as { l1: number; l2: number; l3: number }[],
  },
  observers: {
    'count': function (count: number) {
      const rows = Array.from({ length: count }, () => ({
        l1: 60 + Math.floor(Math.random() * 30),
        l2: 70 + Math.floor(Math.random() * 25),
        l3: 40 + Math.floor(Math.random() * 30),
      }));
      this.setData({ rows });
    },
  },
  lifetimes: {
    attached() {
      const count = this.data.count;
      const rows = Array.from({ length: count }, () => ({
        l1: 60 + Math.floor(Math.random() * 30),
        l2: 70 + Math.floor(Math.random() * 25),
        l3: 40 + Math.floor(Math.random() * 30),
      }));
      this.setData({ rows });
    },
  },
});
