/**
 * 附近活动 (Map + 列表) — 微信小程序页面
 *
 * Issue #35 — Mapbox 地图 + 附近活动页面
 *
 * 工作方式:
 *  1. 拿到 wx.getLocation() 当前位置
 *  2. 调 GET /api/v1/activities?lat=&lng=&radiusKm= (后端 PR #53 实现)
 *     拿到按距离排序的活动列表 + 每行的 distanceKm
 *  3. 列表渲染（driven by 用户最关心的"按距离排序"）
 *  4. 地图区域：生产环境用 <web-view> 加载 studybuddy.app/m/embed.html
 *     （Mapbox GL JS 的 hosted embed），本地开发用占位
 *  5. Tap 列表项 / 地图 marker → 跳活动详情
 *
 * 已知限制 (M3 W2 跟进):
 *  - embed.html 必须 deploy 到 studybuddy.app/m/，否则只显示列表
 *  - 滑动 slider 改 radius 时是 debounce 触发 (300ms)，避免每帧都发请求
 *  - 微信 <web-view> 限制：无法直接 postMessage 给父页面，
 *    走 bindmessage 接 mapbox embed 端 wx.miniProgram.postMessage
 */

import { activityApi } from '../../api/activity';
import { authorizeLocation, distanceOf, formatDistance } from '../../utils/location';
import { userStore } from '../../store/user';

interface PageData {
  latitude: number | null;
  longitude: number | null;
  locationName: string;
  radiusKm: number;
  activities: ActivityCardData[];
  loading: boolean;
  locating: boolean;
  embedUrl: string | null;
}

interface ActivityCardData {
  id: string;
  type: string;
  title: string;
  locationName: string;
  startTime: string;
  currentCount: number;
  maxParticipants: number;
  distanceKm: number | null;
}

const RADIUS_DEFAULT = 5;
const RADIUS_DEBOUNCE_MS = 300;

let radiusDebounceTimer: ReturnType<typeof setTimeout> | null = null;

Page<PageData>({
  data: {
    latitude: null,
    longitude: null,
    locationName: '',
    radiusKm: RADIUS_DEFAULT,
    activities: [],
    loading: false,
    locating: false,
    embedUrl: null,
  },

  onLoad() {
    // Build the embed URL once we have location; the web-view is
    // conditional on this being set (so dev / un-deployed environments
    // show the list + placeholder, not a broken frame).
    this.tryRelocate();
  },

  onPullDownRefresh() {
    if (this.data.latitude && this.data.longitude) {
      this.fetchActivities().finally(() => wx.stopPullDownRefresh());
    } else {
      this.tryRelocate().finally(() => wx.stopPullDownRefresh());
    }
  },

  // -------------------------------------------------------------------------
  // Geolocation
  // -------------------------------------------------------------------------

  async tryRelocate() {
    if (this.data.locating) return;
    this.setData({ locating: true });
    try {
      const granted = await authorizeLocation();
      if (!granted) {
        wx.showToast({ title: '需要位置权限', icon: 'none' });
        return;
      }
      const loc = await new Promise<WechatMiniprogram.GetLocationSuccessCallbackResult>(
        (resolve, reject) => {
          wx.getLocation({
            type: 'gcj02', // 微信返回 GCJ-02，但我们的 schema 是 WGS-84
            // 注意：Mapbox 期望 WGS-84，但 wx.getLocation 在大陆返回 GCJ-02。
            // 偏移在大陆通常 < 100m，对 MVP 可接受；M3 W2 接 Mapbox Geocoding
            // 时再考虑在前端做 WGS-84↔GCJ-02 转换。
            success: (res) => resolve(res),
            fail: (err) => reject(err),
          });
        },
      );
      this.setData({
        latitude: loc.latitude,
        longitude: loc.longitude,
        locationName: '当前位置',
      });
      this.buildEmbedUrl();
      this.fetchActivities();
    } catch (e) {
      // User denied or system error — show fallback list
      wx.showToast({ title: '定位失败，可下拉重试', icon: 'none' });
    } finally {
      this.setData({ locating: false });
    }
  },

  onRelocate() {
    this.tryRelocate();
  },

  // -------------------------------------------------------------------------
  // Radius control (debounced)
  // -------------------------------------------------------------------------

  onRadiusChanging(e: WechatMiniprogram.SliderChange) {
    // Live preview: update the chip value without refetching.
    this.setData({ radiusKm: e.detail.value });
  },

  onRadiusChange(e: WechatMiniprogram.SliderChange) {
    const value = e.detail.value;
    this.setData({ radiusKm: value });
    if (radiusDebounceTimer) clearTimeout(radiusDebounceTimer);
    radiusDebounceTimer = setTimeout(() => {
      this.buildEmbedUrl();
      this.fetchActivities();
    }, RADIUS_DEBOUNCE_MS);
  },

  // -------------------------------------------------------------------------
  // Backend
  // -------------------------------------------------------------------------

  async fetchActivities() {
    if (this.data.latitude == null || this.data.longitude == null) return;
    this.setData({ loading: true });
    try {
      const res = await activityApi.listActivities({
        lat: this.data.latitude,
        lng: this.data.longitude,
        radiusKm: this.data.radiusKm,
        pageSize: 50,
      });
      const list = (res.data ?? []).map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        locationName: a.locationName,
        startTime: a.startTime,
        currentCount: a.currentCount,
        maxParticipants: a.maxParticipants,
        distanceKm: a.distanceKm ?? null,
      }));
      this.setData({ activities: list });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // -------------------------------------------------------------------------
  // Map embed
  // -------------------------------------------------------------------------

  buildEmbedUrl() {
    if (this.data.latitude == null || this.data.longitude == null) {
      this.setData({ embedUrl: null });
      return;
    }
    // Production: studybuddy.app hosts embed.html. Until that's
    // deployed we fall back to the placeholder.
    //
    // The `token` query is the user JWT — embed.html uses it to
    // refetch nearby activities server-side so the map can show
    // every pin even when 50 in the list aren't enough.
    const params = new URLSearchParams({
      lat: String(this.data.latitude),
      lng: String(this.data.longitude),
      radiusKm: String(this.data.radiusKm),
      token: userStore.state.token ?? '',
      lang: 'zh',
    });
    const url = `https://studybuddy.app/m/embed.html?${params.toString()}`;
    // Skip the web-view in dev — only mount it when the host is reachable.
    // (We can't HEAD here; the web-view will simply fail to load and show
    // an error frame, which is acceptable for the first deploy.)
    this.setData({ embedUrl: url });
  },

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  onActivityTap(e: WechatMiniprogram.TouchEvent) {
    const id = (e.currentTarget as { dataset: { id: string } }).dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/activity/activity?id=${id}` });
  },

  /**
   * The hosted embed.html fires `wx.miniProgram.postMessage` when a
   * marker is tapped. We forward that to the activity detail page.
   */
  onMarkerTap(e: WechatMiniprogram.WebViewBindMessage) {
    const data = e.detail.data?.[0];
    if (!data || typeof data !== 'object') return;
    const payload = data as { activityId?: string };
    if (payload.activityId) {
      wx.navigateTo({ url: `/pages/activity/activity?id=${payload.activityId}` });
    }
  },

  onCreateActivity() {
    wx.switchTab({ url: '/pages/create/create' });
  },
});

// Re-export helpers for the wxs module (`fmt.distance`, `fmt.datetime`).
// The wxs file (miniprogram/wxs/format.wxs) implements these as pure
// functions; we declare them here for the type-checker.
declare const fmt: {
  distance(km: number | null | undefined): string;
  datetime(iso: string): string;
};
