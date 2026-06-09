# Analytics module — operator spec (issue #28)

> 4 read-only, admin-scoped endpoints that surface the M3 launch funnel,
> retention curve, and the "first screen the operator opens" KPI snapshot.
> All numbers are computed from the existing tables (`User`, `Activity`,
> `Signup`, `Review`) — no event log, no ETL, no batch job.

## Endpoints

All under `/api/v1/admin/analytics`, all `adminOnly` (requires JWT
`role: ADMIN` and `status: ACTIVE`).

| Method | Path | Query | What it returns |
| --- | --- | --- | --- |
| `GET` | `/funnel` | `window=24h\|7d\|30d\|90d` (default `7d`) | 5-stage funnel (new_users → view → create → signup → review) with `rate_from_previous` + `rate_from_view` |
| `GET` | `/retention` | `cohort=YYYY-MM` (default = current month) | D1 / D7 / D30 retention for the monthly cohort, plus `cohortSize` and `activeUsers` |
| `GET` | `/activity-volume` | `window=24h\|7d\|30d\|90d` (default `7d`) | Daily `total` + `byType` + `byStatus` over the window (feeds the Grafana "Activity volume over time" panel) |
| `GET` | `/kpis` | — | 4-KPI snapshot (users / activities / signups / reviews), used by the operator dashboard's first screen |

All endpoints return `{ data: ... }` and a `200 OK`. Empty cohort for
`/retention` returns `{ data: { cohortSize: 0, retention: { d1:0, d7:0,
d30:0 }, note: "Empty cohort." } }` — never a 404.

## The 4 KPIs (`/kpis`)

```json
{
  "users":     { "total": 1234, "new_today": 12, "new_this_week": 87, "active_7d": 215 },
  "activities":{ "total": 56, "active": 32, "pending": 7 },
  "signups":   { "total": 412, "today": 9 },
  "reviews":   { "total": 88 },
  "generated_at": "2026-06-09T12:00:00.000Z"
}
```

Field meanings:

- `users.total` — every row in `User`, ever. Includes banned + pending.
- `users.new_today` — `createdAt >= now - 24h`.
- `users.new_this_week` — `createdAt >= now - 7d`.
- `users.active_7d` — distinct `Signup.userId` where `signedAt >= now - 7d`.
  This is the "weekly active" number; doesn't include viewers (see funnel
  caveat below).
- `activities.total` — every `Activity` row where `status != CANCELED`.
  Includes `PENDING_REVIEW` (not yet moderated) and `REJECTED`.
- `activities.active` — `RECRUITING | FULL | STARTED` (the 3 states a
  user can still join).
- `activities.pending` — `PENDING_REVIEW` (sitting in the admin queue).
- `signups.total` — count of `Signup` rows where `status = APPROVED`.
  `CANCELED` rows are excluded so cancellations don't double-count.
- `signups.today` — `signedAt >= now - 24h AND status = APPROVED`.
- `reviews.total` — every `Review` row, no window. Reviews are
  post-activity by design so there's no "today" split.

## Funnel (`/funnel`)

```json
{
  "window": "7d",
  "generatedAt": "2026-06-09T12:00:00.000Z",
  "stages": [
    { "stage": "new_users", "count": 50,  "rate_from_previous": null, "rate_from_view": 1.667 },
    { "stage": "view",      "count": 30,  "rate_from_previous": 0.6, "rate_from_view": 1     },
    { "stage": "create",    "count": 8,   "rate_from_previous": 0.267, "rate_from_view": 0.267 },
    { "stage": "signup",    "count": 5,   "rate_from_previous": 0.625, "rate_from_view": 0.167 },
    { "stage": "review",    "count": 2,   "rate_from_previous": 0.4,   "rate_from_view": 0.067 }
  ],
  "notes": {
    "view_approximation": "View count is approximated as distinct (userId, activityId) tuples from the signup table (i.e. users who at least opened a signup sheet). The real view-event log ships in v1.1.",
    "signup_uses": "APPROVED only; CANCELED rows excluded."
  },
  "raw": { "signupsAll": 5 }
}
```

Rate semantics:

- `rate_from_previous` of `view` = `views / new_users` (how many of the
  new users viewed at least 1 activity).
- `rate_from_previous` of `create` = `creates / views` (the "viewed →
  created" rate — the single most important funnel ratio for the
  product).
- `rate_from_previous` of `signup` = `signups / creates` (how many
  creators attracted at least 1 signup).
- `rate_from_previous` of `review` = `reviews / signups`.
- `rate_from_view` of every stage except `view` = `count / views`; the
  `view` stage always has `rate_from_view = 1` (it's the denominator).

### View-approximation caveat (intentional, v1.0)

The v1.0 funnel **does not** persist per-view events. The "view" stage
is approximated as `distinct (Signup.userId, Signup.activityId) where
signedAt >= window` — i.e. people who at least opened a signup sheet.
That under-counts casual browsers who never sign up, but it over-counts
people who sign up for the same activity twice (the `distinct` covers
that).

The real view-event log is on the v1.1 roadmap
(see `docs/v1.1-roadmap.md` — "Activity view-event log"). When it ships
this endpoint's contract is unchanged: the `notes.view_approximation`
string flips to "View count is from the view-event log; signup table
no longer used as a proxy."

## Retention (`/retention`)

```json
{
  "cohort": "2026-06",
  "cohortSize": 50,
  "retention": { "d1": 0.62, "d7": 0.40, "d30": 0.28 },
  "activeUsers": 47
}
```

- **Cohort** = all `User` rows with `createdAt` in the calendar month
  (UTC, inclusive of the first day, exclusive of the first day of the
  following month). `cohortSize` is the cohort row count.
- **Active** = the user has at least 1 `Signup` row. The first signup
  timestamp is the "first active" timestamp.
- `d1` = fraction of the cohort whose first-active timestamp is within
  1 day (≤ 24h) of their `User.createdAt`.
- `d7` = within 7 days. `d30` = within 30 days.
- `activeUsers` = the count of distinct cohort users with ≥ 1 signup.
  This is the **upper bound** for `d1` / `d7` / `d30`.

Notes:

- The cohort is always a **whole calendar month** (UTC). You can't ask
  for "last 7 days as a cohort" — use `/kpis` for that.
- The window check is `firstActive - createdAt <= dayN * 24h`. So
  someone who signs up exactly 24h after creating the account counts
  toward `d1`; someone at 24h 1ms does not. That's the intended
  semantics for "true day-1 retention".
- `BANNED` users are not excluded — they were real humans, their
  retention counts.

## Activity volume (`/activity-volume`)

```json
{
  "window": "7d",
  "days": [
    { "day": "2026-06-08", "total": 3, "byType": { "STUDY": 1, "SPORTS": 2 }, "byStatus": { "PENDING_REVIEW": 1, "RECRUITING": 2 } },
    { "day": "2026-06-09", "total": 1, "byType": { "BOARD_GAME": 1 },        "byStatus": { "RECRUITING": 1 } }
  ],
  "total": 4
}
```

- `byType` keys: `STUDY` | `SPORTS` | `BOARD_GAME` | `FOOD` | `TRAVEL` |
  `OTHER` (the v1.0 `ActivityType` enum, see `prisma/schema.prisma`).
- `byStatus` keys: any value in the `ActivityStatus` enum, including
  `PENDING_REVIEW` and `REJECTED`. Days with no activities are omitted
  from the array.
- The `total` field at the top of the response is the grand total
  (sum of `days[*].total`).

## Caching

`/kpis` is cached server-side for **30 seconds** in Redis. The cache key
is `analytics:kpis`. The cache is invalidated on:

- any `POST /api/v1/admin/activities/:id/{approve,reject}` (so the
  pending count reflects the moderation action immediately)
- any new `Signup` row (the "today" count shifts)

The other 3 endpoints are not cached — they're cheap (single Prisma
query each) and the dataset is small.

## Auth

Every endpoint requires:

1. `Authorization: Bearer <jwt>` (a valid access token, not expired).
2. `role: ADMIN` in the JWT payload.
3. `status: ACTIVE` in the JWT payload.

The 401 / 403 contract is identical to the rest of the admin module
(see `docs/admin/playbook.md`).

## Testing notes

8 unit tests live in `tests/modules/analytics/analytics.routes.test.ts`.
They mock the prisma client and Redis; no live DB. The
`mockResolvedValueOnce` queue is the easy footgun — `vi.clearAllMocks()`
does **not** clear the once-implementation queue. Always use
`vi.resetAllMocks()` (or `mockReset()` per mock) in `beforeEach` if
later tests depend on the order of mocked prisma calls.
