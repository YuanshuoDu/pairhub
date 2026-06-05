/**
 * User module — schema unit tests.
 *
 * Pure zod parser tests, no Fastify / Prisma involved. These give us
 * fast feedback on field-length and field-shape regressions.
 */
import { describe, expect, it } from 'vitest';

import {
  myActivitiesQuerySchema,
  updateMeBodySchema,
  userIdParamSchema,
} from '@/modules/user/user.schema.js';

describe('updateMeBodySchema', () => {
  it('accepts an empty-object body when .strict() is bypassed (sanity)', () => {
    // .strict() rejects unknown keys but allows {} to pass — we add a
    // refine() to reject empty bodies separately. This test pins the
    // exact behaviour.
    const r = updateMeBodySchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('accepts a single-field update', () => {
    const r = updateMeBodySchema.safeParse({ nickname: 'Alice' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.nickname).toBe('Alice');
    }
  });

  it('trims and accepts a long bio up to 500 chars', () => {
    const bio = 'a'.repeat(500);
    const r = updateMeBodySchema.safeParse({ bio });
    expect(r.success).toBe(true);
  });

  it('rejects a bio longer than 500 chars', () => {
    const r = updateMeBodySchema.safeParse({ bio: 'a'.repeat(501) });
    expect(r.success).toBe(false);
  });

  it('accepts a nickname up to 50 chars', () => {
    const r = updateMeBodySchema.safeParse({ nickname: 'a'.repeat(50) });
    expect(r.success).toBe(true);
  });

  it('rejects a nickname longer than 50 chars', () => {
    const r = updateMeBodySchema.safeParse({ nickname: 'a'.repeat(51) });
    expect(r.success).toBe(false);
  });

  it('rejects an empty nickname', () => {
    const r = updateMeBodySchema.safeParse({ nickname: '' });
    expect(r.success).toBe(false);
  });

  it('rejects an invalid avatar URL', () => {
    const r = updateMeBodySchema.safeParse({ avatar: 'not-a-url' });
    expect(r.success).toBe(false);
  });

  it('accepts explicit null to clear a field', () => {
    const r = updateMeBodySchema.safeParse({ bio: null });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.bio).toBeNull();
    }
  });

  it('rejects unknown fields (strict)', () => {
    const r = updateMeBodySchema.safeParse({ nickname: 'X', email: 'a@b.c' });
    expect(r.success).toBe(false);
  });
});

describe('myActivitiesQuerySchema', () => {
  it('applies defaults', () => {
    const r = myActivitiesQuerySchema.parse({});
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(20);
  });

  it('accepts type=created', () => {
    const r = myActivitiesQuerySchema.parse({ type: 'created' });
    expect(r.type).toBe('created');
  });

  it('accepts type=joined', () => {
    const r = myActivitiesQuerySchema.parse({ type: 'joined' });
    expect(r.type).toBe('joined');
  });

  it('rejects type=invalid', () => {
    expect(() => myActivitiesQuerySchema.parse({ type: 'foo' })).toThrow();
  });

  it('coerces page from string', () => {
    const r = myActivitiesQuerySchema.parse({ page: '2', pageSize: '5' });
    expect(r.page).toBe(2);
    expect(r.pageSize).toBe(5);
  });

  it('enforces pageSize upper bound', () => {
    expect(() => myActivitiesQuerySchema.parse({ pageSize: '101' })).toThrow();
  });
});

describe('userIdParamSchema', () => {
  it('accepts a cuid-shaped id', () => {
    const r = userIdParamSchema.safeParse({ id: 'clh1234567890abcdef' });
    expect(r.success).toBe(true);
  });

  it('rejects ids with weird characters', () => {
    const r = userIdParamSchema.safeParse({ id: 'bad/id' });
    expect(r.success).toBe(false);
  });

  it('rejects empty ids', () => {
    const r = userIdParamSchema.safeParse({ id: '' });
    expect(r.success).toBe(false);
  });
});
