/**
 * 日期工具
 */

/** 格式化：YYYY-MM-DD HH:mm */
export function formatDateTime(input: string | number | Date, withSec = false): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withSec ? `${ymd} ${hm}:${pad(d.getSeconds())}` : `${ymd} ${hm}`;
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / 昨天 / N 天前 / yyyy-mm-dd */
export function relativeTime(input: string | number | Date): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (diff < 60_000) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  // 是否昨天
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate()) {
    return '昨天';
  }
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} 天前`;
  return formatDateTime(d).slice(0, 10);
}

/** 计算两个时间之间的可读描述（用于活动卡片） */
export function activityTimeRange(startAt: string, endAt: string): string {
  const s = new Date(startAt);
  const e = new Date(endAt);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
  const sameDay = s.toDateString() === e.toDateString();
  if (sameDay) {
    return `${formatDateTime(s).slice(5)} - ${formatDateTime(e).slice(11)}`;
  }
  return `${formatDateTime(s).slice(5)} - ${formatDateTime(e).slice(5)}`;
}

/** 是否在未来 */
export function isFuture(input: string | number | Date): boolean {
  const t = new Date(input).getTime();
  return t > Date.now();
}

/** 加 N 分钟，返回 ISO */
export function addMinutes(input: string | number | Date, minutes: number): string {
  return new Date(new Date(input).getTime() + minutes * 60_000).toISOString();
}
