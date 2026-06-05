import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('error', (err) => {
  // Logged by app; avoid throwing
  // eslint-disable-next-line no-console
  console.error('[redis] error:', err.message);
});

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
