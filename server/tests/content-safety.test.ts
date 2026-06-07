/**
 * Unit tests for the 微信内容安全 (msg_sec_check) helper.
 *
 * Covers:
 *   - empty string short-circuits to pass
 *   - disabled mode (no APPID/SECRET) short-circuits to pass + skipped=true
 *   - 0 errcode from WeChat -> pass
 *   - non-zero errcode -> fail with reason + wechatErrcode
 *   - 5xx + network error -> fail-open pass
 *   - 2500-byte chunking: a long text is sliced and any offending chunk fails
 *   - checkFields: first failing field wins
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// WECHAT creds are read at call time (not from the frozen env) so
// tests can flip them on and off via direct process.env mutation.
const APPID_KEY = 'WECHAT_MP_APPID'
const SECRET_KEY = 'WECHAT_MP_SECRET'

const originalAppid = process.env[APPID_KEY]
const originalSecret = process.env[SECRET_KEY]

function restoreEnv(key: string, original: string | undefined): void {
  if (original === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = original
  }
}

function setEnv(appid: string, secret: string): void {
  process.env[APPID_KEY] = appid
  process.env[SECRET_KEY] = secret
}

afterEach(() => {
  restoreEnv(APPID_KEY, originalAppid)
  restoreEnv(SECRET_KEY, originalSecret)
  vi.restoreAllMocks()
})

async function loadFresh() {
  vi.resetModules()
  return import('../src/lib/content-safety.js')
}

describe('content-safety: disabled mode', () => {
  it('returns skipped=true when APPID/SECRET are empty (default env)', async () => {
    setEnv('', '')
    const mod = await loadFresh()
    const r = await mod.checkText('hello world')
    expect(r.pass).toBe(true)
    expect(r.skipped).toBe(true)
  })

  it('returns pass=true for empty string without hitting the API', async () => {
    setEnv('', '')
    const mod = await loadFresh()
    const r = await mod.checkText('   \n\t  ')
    expect(r.pass).toBe(true)
    expect(r.skipped).toBe(false)
  })
})

describe('content-safety: enabled mode (mocked WeChat)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>
  let tokenFetchSpy: ReturnType<typeof vi.fn>
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    tokenFetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tk-1234', expires_in: 7200 }),
    } as Response)
    fetchSpy = vi.fn()
    globalThis.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      if (u.includes('cgi-bin/token')) return tokenFetchSpy(url, init)
      return fetchSpy(url, init)
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('passes when WeChat returns errcode=0', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ errcode: 0 }),
    } as Response)
    setEnv('wx-test-appid', 'wx-test-secret-32chars-padding-here')
    const mod = await loadFresh()
    const r = await mod.checkText('safe text')
    expect(r.pass).toBe(true)
    expect(r.skipped).toBe(false)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('fails with errcode + reason when WeChat returns non-zero', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ errcode: 87014, errmsg: 'risky content' }),
    } as Response)
    setEnv('wx-test-appid', 'wx-test-secret-32chars-padding-here')
    const mod = await loadFresh()
    const r = await mod.checkText('risky text')
    expect(r.pass).toBe(false)
    expect(r.wechatErrcode).toBe(87014)
    expect(r.reason).toBe('risky content')
  })

  it('fails open on network error', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'))
    setEnv('wx-test-appid', 'wx-test-secret-32chars-padding-here')
    const mod = await loadFresh()
    const r = await mod.checkText('text')
    expect(r.pass).toBe(true)
    expect(r.skipped).toBe(true)
    expect(r.reason).toBe('wechat_unavailable')
  })

  it('fails open on 5xx', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    } as Response)
    setEnv('wx-test-appid', 'wx-test-secret-32chars-padding-here')
    const mod = await loadFresh()
    const r = await mod.checkText('text')
    expect(r.pass).toBe(true)
    expect(r.skipped).toBe(true)
  })

  it('chunks long text at 2500 bytes', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ errcode: 0 }),
    } as Response)
    setEnv('wx-test-appid', 'wx-test-secret-32chars-padding-here')
    const mod = await loadFresh()
    const long = 'a'.repeat(6000)
    await mod.checkText(long)
    // 6000 chars at 2500 each = 3 chunks
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('returns first failing chunk as the result', async () => {
    let call = 0
    fetchSpy.mockImplementation(() => {
      call += 1
      if (call === 2) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ errcode: 87014, errmsg: 'chunk 2 bad' }),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ errcode: 0 }),
      } as Response)
    })
    setEnv('wx-test-appid', 'wx-test-secret-32chars-padding-here')
    const mod = await loadFresh()
    const long = 'a'.repeat(5500) // 3 chunks
    const r = await mod.checkText(long)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('chunk 2 bad')
    // Should NOT have called the 3rd chunk once the 2nd failed.
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

describe('content-safety: checkFields', () => {
  it('passes when all fields are empty', async () => {
    setEnv('', '')
    const mod = await loadFresh()
    const r = await mod.checkFields([
      ['title', ''],
      ['description', undefined],
    ])
    expect(r.pass).toBe(true)
  })

  it('returns the offending field name on failure', async () => {
    setEnv('wx-test', 'secret-32-chars-padding-pad')
    const origFetch = globalThis.fetch
    let firstCall = true
    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      if (u.includes('cgi-bin/token')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ access_token: 't', expires_in: 7200 }),
        } as Response)
      }
      if (firstCall) {
        firstCall = false
        return Promise.resolve({
          ok: true,
          json: async () => ({ errcode: 0 }),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ errcode: 87014, errmsg: 'risky' }),
      } as Response)
    }) as unknown as typeof fetch
    try {
      const mod = await loadFresh()
      const r = await mod.checkFields([
        ['title', 'safe title'],
        ['description', 'risky description'],
      ])
      expect(r.pass).toBe(false)
      if (!r.pass) {
        expect(r.field).toBe('description')
      }
    } finally {
      globalThis.fetch = origFetch
    }
  })
})
