/**
 * 杂项工具
 */

/** 防抖（leading = false，trailing = true） */
export function debounce<T extends (...args: any[]) => any>(fn: T, wait: number): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  }) as T & { cancel: () => void };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

/** 节流（固定时间窗内只触发一次） */
export function throttle<T extends (...args: any[]) => any>(fn: T, wait: number): T {
  let last = 0;
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    }
  }) as T;
}

/** 安全 JSON 解析 */
export function safeJsonParse<T = unknown>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

/** 深拷贝（结构化克隆，微信环境无 structuredClone，使用 JSON 兜底） */
export function deepClone<T>(input: T): T {
  if (input === null || typeof input !== 'object') return input;
  try {
    return JSON.parse(JSON.stringify(input));
  } catch {
    return input;
  }
}

/** 生成简易 uuid v4（不依赖 crypto） */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 空函数占位 */
export const noop = (): void => {};
