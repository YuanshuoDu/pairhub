/**
 * 设备 / 系统信息
 */

export interface SafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface SystemInfo extends Partial<WechatMiniprogram.SystemInfo> {
  /** 兼容字段 */
  statusBarHeight: number;
  navBarHeight: number;
  pixelRatio: number;
  safeArea: SafeArea;
}
