/**
 * User module — service unit tests.
 *
 * We construct a fake `PrismaClient`-shaped object with vi.fn() stubs
 * for the few Prisma methods our service touches. This keeps the tests
 * fast and DB-free.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors.js';

import {
  getMe,
  getUserById,
  listMyActivities,
  softDeleteMe,
  updateMe,
} from '@/modules/user/user.service.js';
import type { UpdateMeBody } from '@/modules/user/user.schema.js';

// =====================================================================
// Test fixture builder
// =====================================================================

function makeUserRow(overrides: Partial<{
  id: string;
  nickname: string;
  avatar: string | null;
  school: string | null;
  major: string | null;
  bio: string | null;
  status: 'ACTIVE' | 'BANNED' | 'DELETED';
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  const now = new Date('2026-06-01T00:00:00.000Z');
  return {
    id: overrides.id ?? 'usr_alice',
    openid: 'openid_alice',
    unionid: null,
    nickname: overrides.nickname ?? 'Alice',
    avatar: overrides.avatar ?? null,
    school: overrides.school ?? 'MIT',
    major: overrides.major ?? 'CS',
    grade: null,
    wechatId: null,
    phone: null,
    bio: overrides.bio ?? null,
    status: overrides.status ?? 'ACTIVE',
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

function makeActivityRow(overrides: Partial<{
  id: string;
  creatorId: string;
  type: 'STUDY' | 'SPORTS' | 'BOARD_GAME' | 'ONLINE_GAME' | 'OTHER';
  title: string;
  status: 'RECRUITING' | 'FULL' | 'STARTED' | 'ENDED' | 'CANCELED';
  startTime: Date;
  endTime: Date;
  maxParticipants: number;
  currentCount: number;
  createdAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? 'act_1',
    creatorId: overrides.creatorId ?? 'usr_alice',
    type: overrides.type ?? 'SPORTS',
    title: overrides.title ?? '羽毛球 3v3',
    description: 'desc',
    coverUrl: null,
    locationName: 'loc',
    locationAddr: 'addr',
    locationLat: 39.9842,
    locationLng: 116.3074,
    startTime: overrides.startTime ?? new Date('2026-06-10T10:00:00.000Z'),
    endTime: overrides.endTime ?? new Date('2026-06-10T12:00:00.000Z'),
    maxParticipants: overrides.maxParticipants ?? 8,
    currentCount: overrides.currentCount ?? 2,
    tags: [],
    status: overrides.status ?? 'RECRUITING',
    contentCheck: 'PASS' as const,
    createdAt: overrides.createdAt ?? new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  };
}

type FakePrisma = ReturnType<typeof makePrisma>;

function makePrisma() {
  return {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    activity: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };
}

// =====================================================================
// getMe
// =====================================================================

describe('getMe', () => {
  let prisma: FakePrisma;

  beforeEach(() => {
    prisma = makePrisma();
  });

  it('returns a private DTO with all fields', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUserRow({ bio: 'hello' }));

    const dto = await getMe(prisma as never, 'usr_alice');

    expect(dto.id).toBe('usr_alice');
    expect(dto.nickname).toBe('Alice');
    expect(dto.bio).toBe('hello');
    expect(dto.lastActiveAt).toBe('2026-06-01T00:00:00.000Z');
    expect(dto.createdAt).toBe('2026-06-01T00:00:00.000Z');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'usr_alice' } });
  });

  it('throws NotFoundError when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(getMe(prisma as never, 'usr_ghost')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ForbiddenError when the user is banned', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUserRow({ status: 'BANNED' }));

    await expect(getMe(prisma as never, 'usr_banned')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError when the user is soft-deleted (defense-in-depth)', async () => {
    // We deliberately collapse "deleted" and "never existed" into the
    // same 404 USER_NOT_FOUND surface — see route test for the contract.
    prisma.user.findUnique.mockResolvedValue(makeUserRow({ status: 'DELETED' }));

    await expect(getMe(prisma as never, 'usr_alice')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// =====================================================================
// updateMe
// =====================================================================

describe('updateMe', () => {
  let prisma: FakePrisma;

  beforeEach(() => {
    prisma = makePrisma();
  });

  it('updates only the provided fields and returns the new DTO', async () => {
    prisma.user.update.mockResolvedValue(makeUserRow({ nickname: 'Alice2', bio: 'new' }));

    const body: UpdateMeBody = { nickname: 'Alice2', bio: 'new' };
    const dto = await updateMe(prisma as never, 'usr_alice', body);

    expect(dto.nickname).toBe('Alice2');
    expect(dto.bio).toBe('new');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'usr_alice' },
      data: { nickname: 'Alice2', bio: 'new' },
    });
  });

  it('passes null to clear a field', async () => {
    prisma.user.update.mockResolvedValue(makeUserRow({ bio: null }));

    await updateMe(prisma as never, 'usr_alice', { bio: null });

    const call = prisma.user.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(call.data['bio']).toBeNull();
  });

  it('throws NotFoundError when Prisma reports P2025', async () => {
    const err = Object.assign(new Error('not found'), { code: 'P2025' });
    prisma.user.update.mockRejectedValue(err);

    await expect(
      updateMe(prisma as never, 'usr_ghost', { nickname: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ValidationError on empty update', async () => {
    await expect(
      updateMe(prisma as never, 'usr_alice', {} as UpdateMeBody),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// =====================================================================
// getUserById
// =====================================================================

describe('getUserById', () => {
  let prisma: FakePrisma;

  beforeEach(() => {
    prisma = makePrisma();
  });

  it('returns public DTO when viewed by another user', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUserRow({ bio: 'secret' }));

    const dto = await getUserById(prisma as never, 'usr_bob', 'usr_alice');

    expect(dto.id).toBe('usr_alice');
    // The DTO type narrows to private when viewer is the owner, but the
    // public DTO explicitly does NOT include `bio`.
    expect('bio' in dto ? (dto as { bio: string | null }).bio : 'n/a').toBe('n/a');
  });

  it('returns private DTO when viewer is the owner', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUserRow({ bio: 'self' }));

    const dto = await getUserById(prisma as never, 'usr_alice', 'usr_alice');

    expect((dto as { bio: string | null }).bio).toBe('self');
    expect((dto as { lastActiveAt?: string }).lastActiveAt).toBeDefined();
  });

  it('returns public DTO when no viewer (anonymous)', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUserRow());

    const dto = await getUserById(prisma as never, null, 'usr_alice');
    expect('bio' in dto).toBe(false);
  });

  it('throws NotFoundError when user is missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      getUserById(prisma as never, 'usr_bob', 'usr_ghost'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError when user is banned and viewer is not self', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUserRow({ status: 'BANNED' }));

    await expect(
      getUserById(prisma as never, 'usr_bob', 'usr_alice'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns private DTO when banned user views their own profile', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUserRow({ status: 'BANNED' }));

    const dto = await getUserById(prisma as never, 'usr_alice', 'usr_alice');
    expect((dto as { bio: string | null }).bio).toBeNull();
  });

  it('throws NotFoundError when the target user is soft-deleted, even to themselves', async () => {
    // Soft-delete is "you no longer exist" — even the owner can't see
    // their own row after deletion. Restore requires manual ops.
    prisma.user.findUnique.mockResolvedValue(makeUserRow({ status: 'DELETED' }));

    await expect(
      getUserById(prisma as never, 'usr_alice', 'usr_alice'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// =====================================================================
// softDeleteMe
// =====================================================================

describe('softDeleteMe', () => {
  let prisma: FakePrisma;

  beforeEach(() => {
    prisma = makePrisma();
  });

  it('sets status=DELETED and deletedAt on a fresh ACTIVE user', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(
      makeUserRow({ status: 'ACTIVE', deletedAt: null }),
    );
    prisma.user.update.mockResolvedValueOnce(
      makeUserRow({ status: 'DELETED', deletedAt: new Date() }),
    );

    const result = await softDeleteMe(prisma as never, 'usr_alice');

    expect(result.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const updateArgs = prisma.user.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { status: string; deletedAt: Date };
    };
    expect(updateArgs.where.id).toBe('usr_alice');
    expect(updateArgs.data.status).toBe('DELETED');
    expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
  });

  it('is idempotent: second call returns original deletedAt and does not update', async () => {
    const original = new Date('2026-06-01T10:00:00.000Z');
    prisma.user.findUnique.mockResolvedValueOnce(
      makeUserRow({ status: 'DELETED', deletedAt: original }),
    );

    const result = await softDeleteMe(prisma as never, 'usr_alice');

    expect(result.deletedAt).toBe(original.toISOString());
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(softDeleteMe(prisma as never, 'usr_ghost')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

// =====================================================================
// listMyActivities
// =====================================================================

describe('listMyActivities', () => {
  let prisma: FakePrisma;

  beforeEach(() => {
    prisma = makePrisma();
    // listMyActivities now does an early findUnique on the requesting
    // user (soft-delete defense-in-depth). Default every test to "user
    // is ACTIVE"; individual tests can override with mockResolvedValueOnce.
    prisma.user.findUnique.mockResolvedValue({ id: 'usr_alice', status: 'ACTIVE' });
  });

  it('returns created activities when type=created', async () => {
    prisma.activity.findMany.mockResolvedValue([makeActivityRow()]);
    prisma.activity.count.mockResolvedValue(1);

    const r = await listMyActivities(prisma as never, 'usr_alice', {
      type: 'created',
      page: 1,
      pageSize: 20,
    });

    expect(r.data).toHaveLength(1);
    expect(r.data[0]?.relation).toBe('created');
    expect(r.total).toBe(1);
    expect(prisma.activity.count).toHaveBeenCalledWith({
      where: { creatorId: 'usr_alice' },
    });
  });

  it('returns joined (non-self-created) activities when type=joined', async () => {
    prisma.activity.findMany.mockResolvedValue([makeActivityRow({ creatorId: 'usr_bob' })]);
    prisma.activity.count.mockResolvedValue(1);

    const r = await listMyActivities(prisma as never, 'usr_alice', {
      type: 'joined',
      page: 1,
      pageSize: 20,
    });

    expect(r.data[0]?.relation).toBe('joined');
    const whereArg = prisma.activity.findMany.mock.calls[0]?.[0] as {
      where: { creatorId: { not: string } };
    };
    expect(whereArg.where.creatorId.not).toBe('usr_alice');
  });

  it('merges created + joined when no type filter is supplied', async () => {
    prisma.activity.findMany
      .mockResolvedValueOnce([makeActivityRow({ id: 'act_own', startTime: new Date('2026-06-12T10:00:00Z') })])
      .mockResolvedValueOnce([makeActivityRow({ id: 'act_joined', creatorId: 'usr_bob', startTime: new Date('2026-06-15T10:00:00Z') })]);

    const r = await listMyActivities(prisma as never, 'usr_alice', {
      page: 1,
      pageSize: 20,
    });

    expect(r.total).toBe(2);
    // Newest first across the merged list
    expect(r.data[0]?.id).toBe('act_joined');
    expect(r.data[1]?.id).toBe('act_own');
  });

  it('paginates merged results correctly', async () => {
    const a = (i: number) => makeActivityRow({
      id: `act_${i}`,
      startTime: new Date(`2026-06-${10 + i}T10:00:00Z`),
    });
    prisma.activity.findMany
      .mockResolvedValueOnce([a(1), a(2), a(3)])
      .mockResolvedValueOnce([]);

    const r = await listMyActivities(prisma as never, 'usr_alice', {
      page: 2,
      pageSize: 2,
    });

    expect(r.total).toBe(3);
    expect(r.data).toHaveLength(1);
    expect(r.data[0]?.id).toBe('act_1');
    expect(r.page).toBe(2);
    expect(r.pageSize).toBe(2);
  });

  it('throws NotFoundError when the requesting user is soft-deleted', async () => {
    // Defense-in-depth: even if a stale JWT still claims ACTIVE, the
    // service re-fetches the user and rejects DELETED.
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'usr_alice', status: 'DELETED' });

    await expect(
      listMyActivities(prisma as never, 'usr_alice', { page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(NotFoundError);
    // The activity tables must not be queried at all once the user is
    // rejected — that's the whole point of the early check.
    expect(prisma.activity.findMany).not.toHaveBeenCalled();
    expect(prisma.activity.count).not.toHaveBeenCalled();
  });
});
