/**
 * Auth module — JWT helper pure-unit tests.
 *
 * No HTTP, no prisma, no redis. signAccessToken / signRefreshToken /
 * verifyRefreshToken are exported (small refactor from the previous
 * inline implementation) so we can drive them directly with `process.env`
 * set up in beforeEach.
 *
 * We deliberately do NOT pull in `jsonwebtoken` as a dependency: the
 * verifier is a 30-line HS256 routine and the signer is similar,
 * so verifying them against each other (sign then verify) catches
 * every regression we care about. The HS256 round-trip in
 * `.raw-token-with-different-secret` is also implemented directly
 * with `crypto.createHmac`.
 *
 * What we verify:
 *   - signAccessToken issues a 3-part dot-separated JWT
 *   - signAccessToken encodes sub / role / status / type=access + 15-min exp
 *   - signAccessToken honors DELETED status (the soft-delete path uses this)
 *   - signRefreshToken embeds sub + jti + 30-day exp
 *   - two calls with the same jti are deterministic within the same second
 *   - verifyRefreshToken decodes a valid token, rejects:
 *       * access_token passed as refresh
 *       * tampered signature
 *       * wrong segment count
 *       * signed with a different secret
 */
import { beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '@/modules/auth/index.js';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const ALICE = 'alice';

/** Mirror of the production jwtSignHs256 — used to forge tokens with
 *  a different secret for the negative test below. */
function rawHs256(payload: object, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const b64u = (o: object) =>
    Buffer.from(JSON.stringify(o))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  const signingInput = `${b64u(header)}.${b64u(payload)}`;
  const sig = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${signingInput}.${sig}`;
}

/** Decode a JWT payload segment without verifying the signature. The
 *  verifier is what we're testing — we cannot use it to introspect. */
function decodePayload<T = Record<string, unknown>>(token: string): T {
  const [, p] = token.split('.');
  return JSON.parse(Buffer.from(p!, 'base64url').toString('utf8')) as T;
}

describe('auth module — JWT helpers (pure unit)', () => {
  beforeEach(() => {
    process.env['NODE_ENV'] = 'test';
    process.env['JWT_SECRET'] = SECRET;
  });

  describe('signAccessToken', () => {
    it('issues a 3-part dot-separated JWT', () => {
      const token = signAccessToken(ALICE, 'USER', 'ACTIVE');
      expect(token.split('.')).toHaveLength(3);
    });

    it('encodes sub / role / status / type=access and a 15-min exp', () => {
      const token = signAccessToken(ALICE, 'ADMIN', 'BANNED');
      const decoded = decodePayload<{
        sub: string;
        role: string;
        status: string;
        type: string;
        iat: number;
        exp: number;
      }>(token);
      expect(decoded.sub).toBe(ALICE);
      expect(decoded.role).toBe('ADMIN');
      expect(decoded.status).toBe('BANNED');
      expect(decoded.type).toBe('access');
      // 15 minutes = 900 seconds
      expect(decoded.exp - decoded.iat).toBe(15 * 60);
    });

    it('honors the DELETED status (used by the soft-delete login block)', () => {
      const token = signAccessToken(ALICE, 'USER', 'DELETED');
      const decoded = decodePayload<{ status: string }>(token);
      expect(decoded.status).toBe('DELETED');
    });
  });

  describe('signRefreshToken', () => {
    it('embeds sub + jti + type=refresh + 30-day exp', () => {
      const jti = '11111111-1111-1111-1111-111111111111';
      const token = signRefreshToken(ALICE, jti);
      const decoded = decodePayload<{
        sub: string;
        jti: string;
        type: string;
        iat: number;
        exp: number;
      }>(token);
      expect(decoded.sub).toBe(ALICE);
      expect(decoded.jti).toBe(jti);
      expect(decoded.type).toBe('refresh');
      expect(decoded.exp - decoded.iat).toBe(30 * 24 * 60 * 60);
    });

    it('two calls with the same jti produce tokens with the same iat (within the same second)', () => {
      const a = signRefreshToken(ALICE, 'jti-1');
      const b = signRefreshToken(ALICE, 'jti-1');
      const da = decodePayload<{ iat: number }>(a);
      const db = decodePayload<{ iat: number }>(b);
      expect(da.iat).toBe(db.iat);
    });
  });

  describe('verifyRefreshToken', () => {
    it('decodes a refresh_token signed by signRefreshToken', () => {
      const token = signRefreshToken(ALICE, 'jti-fresh');
      const decoded = verifyRefreshToken(token);
      expect(decoded.sub).toBe(ALICE);
      expect(decoded.jti).toBe('jti-fresh');
      expect(decoded.type).toBe('refresh');
    });

    it('rejects an access_token passed as a refresh_token', () => {
      const access = signAccessToken(ALICE, 'USER', 'ACTIVE');
      expect(() => verifyRefreshToken(access)).toThrow(/不是 refresh_token/);
    });

    it('rejects a tampered signature', () => {
      const real = signRefreshToken(ALICE, 'jti-1');
      // Flip the last char of the signature segment so the signature no
      // longer matches the SHA-256 of header.payload.
      const [h, p, s] = real.split('.');
      const flippedLast = s.slice(-1) === 'A' ? 'B' : 'A';
      const tampered = `${h}.${p}.${s.slice(0, -1)}${flippedLast}`;
      expect(() => verifyRefreshToken(tampered)).toThrow();
    });

    it('rejects a token with the wrong number of segments', () => {
      expect(() => verifyRefreshToken('only.two')).toThrow(/格式不合法/);
      expect(() => verifyRefreshToken('one.two.three.four')).toThrow(/格式不合法/);
    });

    it('rejects a token signed with a different secret', () => {
      const other = rawHs256(
        { sub: ALICE, jti: 'jti-1', type: 'refresh', iat: 0, exp: 9_999_999_999 },
        'different-secret-that-is-also-at-least-32-characters-long',
      );
      expect(() => verifyRefreshToken(other)).toThrow();
    });
  });
});
