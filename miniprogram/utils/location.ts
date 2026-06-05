/**
 * 位置工具：封装 wx.getFuzzyLocation / chooseLocation
 */

export interface LocationResult {
  name: string;
  address: string;
  longitude: number;
  latitude: number;
}

/** 计算两点直线距离（米），Haversine 公式 */
export function distanceOf(
  a: { longitude: number; latitude: number },
  b: { longitude: number; latitude: number },
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 距离格式化 */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** 打开地图选择位置（Promise 化） */
export function chooseLocation(): Promise<LocationResult> {
  return new Promise((resolve, reject) => {
    wx.chooseLocation({
      success(res) {
        resolve({
          name: res.name,
          address: res.address,
          longitude: res.longitude,
          latitude: res.latitude,
        });
      },
      fail: (err) => reject(err),
    });
  });
}

/** 调起用户授权位置（Promise 化） */
export function authorizeLocation(): Promise<boolean> {
  return new Promise((resolve) => {
    wx.getSetting({
      success(res) {
        if (res.authSetting['scope.userLocation']) {
          resolve(true);
          return;
        }
        wx.authorize({
          scope: 'scope.userLocation',
          success: () => resolve(true),
          fail: () => resolve(false),
        });
      },
      fail: () => resolve(false),
    });
  });
}
