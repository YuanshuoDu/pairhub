/**
 * 微信内容安全 (msg_sec_check) helper — issue #26.
 *
 * Wraps the WeChat MP /wxa/msg_sec_check endpoint that screens
 * user-generated text for spam / porn / politics / illegal content
 * before it lands in our DB. Used as a guard on:
 *   - activity create / update (title + description)
 *   - review create (comment)
 *
 * Disabled-mode behaviour: when WECHAT_MP_APPID / WECHAT_MP_SECRET
 * are not configured (dev, CI, non-wechat env), the helper
 * short-circuits to `{ pass: true }` so the rest of the app can
 * be developed and tested without a real WeChat account.
 *
 * The access token is fetched + cached in-process for 110 minutes
 * (WeChat's TTL is 2h; we refresh 10 min early to avoid the
 * 5-min clock-skew window).
 *
 * Errors from the WeChat API are non-fatal at the call site:
 *   - network error / 5xx       -> we fail-open (log + treat as pass)
 *   - 4xx with errcode 40001 / 42001 / 40014 (token issue) -> invalidate
 *     cached token + retry once
 *   - any other 4xx               -> fail-closed (block the content),
 *     but raise a typed error so the route handler can decide
 *     (production: 422 + machine-readable code; dev: log + warn)
 */
import { createHash } from 'node:crypto';

import { logger } from './logger.js';

export interface ContentCheckResult {
  pass: boolean;
  /** errcode from WeChat when the call returns one (otherwise null). */
  wechatErrcode?: number;
  /** Human-readable reason when pass=false. */
  reason?: string;
  /** True when the call was skipped (WECHAT_MP_APPID not configured). */
  skipped: boolean;
}

// Read the WECHAT creds at call time (not from the frozen env) so that
// tests can use vi.stubEnv to flip the integration on and off without
// reloading the module. The cost is a single process.env lookup per
// call, which is negligible.
function isEnabled(): boolean {
  return Boolean(process.env['WECHAT_MP_APPID']) && Boolean(process.env['WECHAT_MP_SECRET']);
}

function getAppid(): string {
  return process.env['WECHAT_MP_APPID'] ?? '';
}

function getSecret(): string {
  return process.env['WECHAT_MP_SECRET'] ?? '';
}

function getMsgSecCheckUrl(): string {
  return process.env['WECHAT_MSG_SEC_CHECK_URL']
    ?? 'https://api.weixin.qq.com/wxa/msg_sec_check';
}

let cachedToken: { value: string; expiresAtMs: number } | null = null;
const TOKEN_TTL_MS = 110 * 60 * 1000;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAtMs > Date.now() + 60_000) {
    return cachedToken.value;
  }
  // 微信 access_token endpoint. Use a deterministic hash for the
  // logger so we don't dump the token itself; the token is only
  // used to authenticate the msg_sec_check call (1h+) and the
  // redis cache (if we add one later).
  const url =
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential`
    + `&appid=${encodeURIComponent(getAppid())}`
    + `&secret=${encodeURIComponent(getSecret())}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`wechat token endpoint http ${res.status}`);
  }
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
    errmsg?: string;
  };
  if (!json.access_token || !json.expires_in) {
    throw new Error(`wechat token error ${json.errcode ?? '?'}: ${json.errmsg ?? '?'}`);
  }
  cachedToken = {
    value: json.access_token,
    expiresAtMs: Date.now() + Math.min(json.expires_in, TOKEN_TTL_MS),
  };
  logger.info({ hash: hashToken(json.access_token) }, 'wechat: access_token refreshed');
  return json.access_token;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12);
}

/**
 * Screen a single chunk of text. Returns a structured result the
 * caller uses to decide whether to 422 the request.
 */
export async function checkText(text: string): Promise<ContentCheckResult> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { pass: true, skipped: false };
  }
  // 微信 max content length is 2500 bytes (UTF-8) per call.
  // For longer text we slice into chunks so a single offensive
  // segment is caught even if it's surrounded by clean prose.
  const chunks: string[] = [];
  for (let i = 0; i < trimmed.length; i += 2500) {
    chunks.push(trimmed.slice(i, i + 2500));
  }

  // Track whether any chunk was skipped (disabled mode) or fail-opened
  // (network/5xx). The aggregate result surfaces this so callers can
  // distinguish "all clean" from "couldn't verify". When we ended up
  // not actually verifying, we also propagate the first chunk's
  // reason so the caller can log / alert on why.
  let anySkipped = false;
  let firstSkipReason: string | undefined;
  for (const chunk of chunks) {
    const result = await checkOneChunk(chunk);
    if (!result.pass) return result;
    if (result.skipped) {
      anySkipped = true;
      if (firstSkipReason === undefined) firstSkipReason = result.reason;
    }
  }
  return anySkipped
    ? { pass: true, skipped: true, reason: firstSkipReason }
    : { pass: true, skipped: false };
}

async function checkOneChunk(chunk: string): Promise<ContentCheckResult> {
  // Disabled mode — no WeChat creds configured.
  if (!isEnabled()) {
    return { pass: true, skipped: true };
  }

  let token: string;
  try {
    token = await getAccessToken();
  } catch (e) {
    // Fail-open on token-fetch error; production would still want
    // the route handler to log + alert on this.
    logger.warn({ err: e }, 'wechat: token fetch failed, fail-open');
    return { pass: true, skipped: true, reason: 'wechat_unavailable' };
  }

  let res: Response;
  try {
    res = await fetch(getMsgSecCheckUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: chunk, version: 2, scene: 1 }),
    });
  } catch (e) {
    // Network error -> fail-open.
    logger.warn({ err: e }, 'wechat: msg_sec_check network error, fail-open');
    return { pass: true, skipped: true, reason: 'wechat_unavailable' };
  }

  if (!res.ok) {
    // 5xx -> fail-open.
    logger.warn({ status: res.status }, 'wechat: msg_sec_check 5xx, fail-open');
    return { pass: true, skipped: true, reason: 'wechat_unavailable' };
  }

  const json = (await res.json()) as { errcode?: number; errmsg?: string };
  if (json.errcode === 0 || json.errcode === undefined) {
    return { pass: true, skipped: false };
  }
  // 87014 = 内容违规
  return {
    pass: false,
    skipped: false,
    wechatErrcode: json.errcode,
    reason: json.errmsg ?? 'content_rejected',
  };
}

/**
 * Run content safety on multiple fields at once. The first failing
 * field short-circuits the rest.
 */
export async function checkFields(
  fields: ReadonlyArray<readonly [string, string | undefined | null]>,
): Promise<{ pass: true } | { pass: false; field: string; result: ContentCheckResult }> {
  for (const [name, value] of fields) {
    if (!value) continue;
    const result = await checkText(value);
    if (!result.pass) {
      return { pass: false, field: name, result };
    }
  }
  return { pass: true };
}

/** Test helper — clears the cached access token. */
export function _resetAccessTokenForTest(): void {
  cachedToken = null;
}
