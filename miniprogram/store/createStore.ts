/**
 * 极简 observable store
 *
 * - 不依赖任何第三方
 * - 一个 Store = 一份 state + 一组 action + 一组订阅者
 * - 通过 useStore hook 在 Page / Component 中订阅（见 store/hooks.ts）
 *
 * 用法：
 *   const counter = createStore({ count: 0 });
 *   counter.setState({ count: 1 });
 *   counter.subscribe((state) => console.log(state.count));
 *   counter.setState((prev) => ({ count: prev.count + 1 }));
 */

export type Updater<T> = (prev: T) => Partial<T>;
export type SetState<T> = (partial: Partial<T> | Updater<T>) => void;
export type Subscriber<T> = (state: T, prev: T) => void;
export type Unsubscribe = () => void;

export interface Store<T> {
  readonly state: T;
  setState: SetState<T>;
  subscribe: (sub: Subscriber<T>) => Unsubscribe;
  /** 深拷贝 state 返回，避免外部引用修改 */
  getState: () => T;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state: T = initial;
  const subscribers = new Set<Subscriber<T>>();

  const setState: SetState<T> = (partial) => {
    const update = typeof partial === 'function' ? (partial as Updater<T>)(state) : partial;
    if (Object.is(update, state) || !update) return;
    const prev = state;
    state = { ...state, ...update };
    subscribers.forEach((fn) => {
      try {
        fn(state, prev);
      } catch (e) {
        console.error('[store] subscriber error', e);
      }
    });
  };

  return {
    get state() {
      return state;
    },
    setState,
    subscribe(sub) {
      subscribers.add(sub);
      return () => subscribers.delete(sub);
    },
    getState: () => ({ ...state }),
  };
}
