/**
 * 公共 hooks
 *
 * - useStore：在 Page / Component 中订阅 store
 * - onShow 钩子（在 store/hooks 中实现）
 */

import { userStore } from './user';
import { systemStore } from './system';
import { hydrateUserStore } from './user';
import { initSystemStore } from './system';
import { createStore, type Store, type Subscriber, type Unsubscribe } from './createStore';

export { createStore, userStore, systemStore, hydrateUserStore, initSystemStore };
export type { Store, Subscriber, Unsubscribe };

/** App.onLaunch 时调用，统一初始化 */
export function initStore(): void {
  hydrateUserStore();
  initSystemStore();
}
