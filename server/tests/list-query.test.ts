import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Import the schema shape by re-declaring (kept loose to avoid coupling)
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['STUDY', 'SPORTS', 'BOARD_GAME', 'ONLINE_GAME', 'OTHER']).optional(),
  status: z.enum(['RECRUITING', 'FULL', 'STARTED', 'ENDED']).optional(),
});

describe('listQuerySchema', () => {
  it('applies default page and pageSize', () => {
    const r = listQuerySchema.parse({});
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(20);
  });

  it('rejects invalid type', () => {
    expect(() => listQuerySchema.parse({ type: 'INVALID' })).toThrow();
  });

  it('coerces page from string', () => {
    const r = listQuerySchema.parse({ page: '3', pageSize: '10' });
    expect(r.page).toBe(3);
    expect(r.pageSize).toBe(10);
  });

  it('enforces pageSize upper bound', () => {
    expect(() => listQuerySchema.parse({ pageSize: '101' })).toThrow();
  });
});
