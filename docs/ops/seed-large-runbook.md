# `prisma/seed-large.ts` — operator runbook (issue #28)

> The 50-user + 12-activity seed for **staging**, **preview / admin demo**,
> and **CI graph-tests** that need a realistic row count. This is
> **never** for production — it generates 50 fake accounts with stable
> IDs so the seed is idempotent across runs.

## TL;DR

```bash
# From server/
pnpm prisma:seed:large
# → "seeded 50 users, 12 activities, 38 signups, 14 reviews, 50 push tokens"
```

It uses the same `DATABASE_URL` as `prisma migrate`. Run it against
**staging only**. Re-running is safe (delete-first by default — see
`--mode` below).

## What it generates

| Table | Count | Notes |
| --- | --- | --- |
| `User` | 50 | 1 `ADMIN` (`seed-user-admin-01`) + 49 `USER`. 30 schools, 10 majors, 4 grades. `phone` + `openid` are deterministic. |
| `Activity` | 12 | 5 `RECRUITING` + 2 `FULL` + 2 `STARTED` + 1 `ENDED` + 1 `PENDING_REVIEW` + 1 extra `RECRUITING`. Spans 7 days, 4 activity types, lat/lng clustered around 4 university hubs. |
| `Signup` | 38 | 35 `APPROVED` + 3 `CANCELED`. Maps each signup to a real `Activity`, with the "re-signup" `CANCELED` row already there for tests that exercise that path. |
| `Review` | 14 | Only on the 2 `STARTED` + 1 `ENDED` activity. Rating distribution skews 4-5. |
| `PushToken` | 50 | 1 per user, mixed `APNS` / `FCM` / `TPNS` channels (33/33/34 split, weighted toward the user's phone region). |

Every row has a **stable** ID prefixed with `seed-` and a 12-char
SHA-1 hash of the source key — re-running with `--mode reset` (default)
deletes every `seed-*` row first, so the post-state is deterministic.

## CLI

```bash
pnpm prisma:seed:large                  # default = reset
pnpm prisma:seed:large -- --mode add   # add-only, no delete
pnpm prisma:seed:large -- --mode clean # delete every seed-* row, exit
pnpm prisma:seed:large -- --help
```

`--mode`:

- `reset` (default) — `deleteMany` all `seed-*` rows, then insert. Same
  state every time, regardless of what was in the DB before.
- `add` — keep the existing `seed-*` rows, insert another batch. Will
  fail if you re-run twice with the same source keys (unique
  constraint on `User.openid`).
- `clean` — only `deleteMany`, no insert. Useful for "I want a clean
  staging DB but the analytics dashboard keeps timing out so I'll seed
  later."

## Idempotency

`mode=reset` is the **default** and is idempotent by construction:

1. `prisma.user.deleteMany({ where: { id: { startsWith: 'seed-' } } })`
   (cascades to `Signup`, `Review`, `PushToken` via the foreign keys).
2. `prisma.activity.deleteMany({ where: { id: { startsWith: 'seed-' } } })`.
3. Insert the new batch.

You can run it 100 times and the row count stays at `50 / 12 / 38 /
14 / 50`.

## Required env

`DATABASE_URL` (read-write). That's it. The seed is intentionally
env-free beyond the Prisma client — no `JWT_SECRET`, no `REDIS_URL`,
no WeChat keys.

If you set `NODE_ENV=production`, the script **exits non-zero** before
touching the DB. Override with `ALLOW_SEED_IN_PROD=1` if you really
mean it (you don't).

## How to use it in tests

The CI graph-test workflow (see `.github/workflows/server.yml`) runs:

```bash
pnpm prisma migrate deploy
pnpm prisma:seed:large
pnpm test:integration
```

The integration tests assume:

- `seed-user-admin-01` exists, with `role: ADMIN`, `status: ACTIVE`.
- `seed-user-01` through `seed-user-50` exist, all `USER` + `ACTIVE`.
- `seed-act-01` through `seed-act-12` exist, with the status mix
  described above.
- The 14 review rows let you exercise the "give a review" path without
  having to first create activities + signups + drive them to `STARTED`
  → `ENDED`.

## Sample queries after seeding

```sql
-- 1) Top 5 activities by signup count
SELECT a.id, a.title, COUNT(s.id) AS signups
FROM "Activity" a
LEFT JOIN "Signup" s ON s."activityId" = a.id AND s.status = 'APPROVED'
WHERE a.id LIKE 'seed-%'
GROUP BY a.id
ORDER BY signups DESC
LIMIT 5;

-- 2) Daily activity creation (feeds the Grafana volume panel)
SELECT date_trunc('day', "createdAt")::date AS day, COUNT(*) AS total
FROM "Activity"
WHERE id LIKE 'seed-%'
GROUP BY day
ORDER BY day;

-- 3) The 1 PENDING_REVIEW row that should be in the admin queue
SELECT id, title, "moderationNote"
FROM "Activity"
WHERE id LIKE 'seed-%' AND status = 'PENDING_REVIEW';
```

## Resetting a polluted staging DB

```bash
# 1. delete every seed-* row
pnpm prisma:seed:large -- --mode clean

# 2. (optional) truncate the rest of the DB if you want a true reset
psql "$DATABASE_URL" -c 'TRUNCATE "User", "Activity", "Signup", "Review", "PushToken" RESTART IDENTITY CASCADE;'

# 3. re-seed
pnpm prisma:seed:large
```

## Why not just use `prisma/seed.ts`?

`prisma/seed.ts` is the **3-user demo seed** (alice / bob / carol).
It's intentionally tiny — fast to run, easy to follow in a tutorial.
`prisma/seed-large.ts` is the **stress + dashboard seed**: enough rows
that the funnel / retention numbers look real and the admin dashboard
has something to render.

| | `seed.ts` | `seed-large.ts` |
| --- | --- | --- |
| Users | 3 | 50 |
| Activities | 1 | 12 |
| Signups | 1 | 38 |
| Reviews | 0 | 14 |
| Push tokens | 0 | 50 |
| Idempotency | manual delete + re-run | `mode=reset` (default) is idempotent |
| Used by | onboarding tutorial, quick smoke test | staging demo, CI graph tests, admin dashboard preview |

## Troubleshooting

**`PrismaClientInitializationError: Can't reach database server`**
→ `DATABASE_URL` is unset or points to a DB that's not running.
Check `docker compose up -d postgres` (or the staging RDS endpoint).

**`Foreign key constraint violated on Activity delete`**
→ Stale seed rows from a previous version of this script may have
orphaned `Signup` rows. Run `mode=clean`, then `mode=reset` again.
If the problem persists, `psql ... -c 'TRUNCATE ... CASCADE'` and
re-seed.

**`Unique constraint failed on User.openid`**
→ You re-ran with `--mode add`. Use `--mode reset` (default) or
`--mode clean` first.

**`NODE_ENV=production` exit**
→ The script refuses to seed prod. If you really mean it (CI seed of
a production-like replica), set `ALLOW_SEED_IN_PROD=1`.
