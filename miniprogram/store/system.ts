/**
 * 系统信息 store：device、statusBar、safeArea、networkType
 *
 * 一次性 init，订阅 network 变化
 */

import { createStore } from './createStore';
import type { SystemInfo } from '../types/system';

export interface SystemState {
  systemInfo: SystemInfo | null;
  networkType: 'wifi' | '2g' | '3g' | '4g' | '5g' | 'unknown' | 'none';
  isOnline: boolean;
}

const initial: SystemState = {
  systemInfo: null,
  networkType: 'unknown',
  isOnline: true,
};

export const systemStore = createStore<SystemState>(initial);

/** App.onLaunch 时调用一次 */
export function initSystemStore(): void {
  try {
    const sys = wx.getSystemInfoSync();
    const safeArea = sys.safeArea ?? { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    const systemInfo: SystemInfo = {
      ...sys,
      safeArea,
      statusBarHeight: sys.statusBarHeight ?? 20,
      navBarHeight: sys.platform === 'ios' ? 44 : 48,
      pixelRatio: sys.pixelRatio ?? 2,
    };
    systemStore.setState({ systemInfo });

    wx.getNetworkType({
      success: (res) => {
        const networkType = (res.networkType as SystemState['networkType']) ?? 'unknown';
        systemStore.setState({ networkType, isOnline: networkType !== 'none' });
      },
    });

    wx.onNetworkStatusChange((res) => {
      systemStore.setState({ isOnline: res.isConnected, networkType: (res.networkType as SystemState['networkType']) ?? 'unknown' });
    });
  } catch (e) {
    console.warn('[systemStore] init failed', e);
  }
}
