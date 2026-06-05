/**
 * 在 Page / Component 中订阅 store
 *
 * 用法：
 *   import { useStore } from '@/store/hooks';
 *   useStore(userStore, (state) => ({ nickname: state.user?.nickname }), this);
 *
 * 第一个参数：store
 * 第二个参数：从 state 选出当前页面需要的字段（避免不必要 re-render）
 * 第三个参数：Page / Component 的 this（用于 setData）
 */

import type { Store } from './createStore';

type PageLike = Record<string, any>;

export function useStore<T, S extends object>(
  store: Store<S>,
  selector: (state: S) => T,
  pageInstance: PageLike,
): () => void {
  const apply = (state: S) => {
    const selected = selector(state);
    if (pageInstance && typeof pageInstance.setData === 'function') {
      pageInstance.setData({ __store__: selected } as any);
    }
  };
  // 首次
  apply(store.state);
  // 订阅
  return store.subscribe(apply);
}

/** 自动在 onUnload 解绑 */
export function autoBindUnload(store: Store<any>, selector: (state: any) => any, pageInstance: PageLike): void {
  let unsubscribe: (() => void) | null = null;
  const origOnLoad = pageInstance.onLoad;
  const origOnUnload = pageInstance.onUnload;

  pageInstance.onLoad = function (this: PageLike, ...args: any[]) {
    unsubscribe = useStore(store, selector, this);
    if (typeof origOnLoad === 'function') {
      return origOnLoad.apply(this, args);
    }
  };
  pageInstance.onUnload = function (this: PageLike, ...args: any[]) {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (typeof origOnUnload === 'function') {
      return origOnUnload.apply(this, args);
    }
  };
}
