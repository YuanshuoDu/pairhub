# Admin v1 — Operator Runbook (issue #32)

This doc covers the M3 launch admin surface. The endpoints live at
`/api/v1/admin/*` and are gated by the `adminOnly` preHandler
(requires `userRole === 'ADMIN'` and `userStatus === 'ACTIVE'`).

The frontend (miniprogram + Flutter admin pages) lands in two
follow-up PRs. This PR ships the server + tests + this runbook so
operators can start moderating with `curl` / Postman / a hand-rolled
admin client in the meantime.

---

## 1. Grant admin to a user

Admin is stored in the `User.role` column. There is no admin endpoint
that can grant another admin (chicken-and-egg); the first admin is
granted via a SQL script, and subsequent admins can be promoted via
`PATCH /api/v1/admin/users/:id/role` once that endpoint lands in
M3-W11.

```sql
-- One-time, against the production DB. Replace the id with the
-- cuid of the operator's existing user row.
UPDATE users
SET role = 'ADMIN', updated_at = NOW()
WHERE id = 'usr_replace_with_real_id';
```

The operator's access token does **not** auto-upgrade: their token
still carries `role: 'USER'` until they log out and back in (or
until a refresh token is consumed, which re-embeds the current
`role` from the DB — see `auth/index.ts` `POST /refresh`).

---

## 2. Endpoints

| Method | Path                              | Purpose                       |
| ------ | --------------------------------- | ----------------------------- |
| GET    | `/api/v1/admin/activities`        | Review queue (default: pending) |
| POST   | `/api/v1/admin/activities/:id/approve` | Approve & publish         |
| POST   | `/api/v1/admin/activities/:id/reject`  | Reject with reason        |
| GET    | `/api/v1/admin/users`             | Search users (needs ≥1 filter) |
| PATCH  | `/api/v1/admin/users/:id/status`  | Ban / unban                   |
| GET    | `/api/v1/admin/dashboard/metrics` | At-a-glance counts            |

All endpoints require:

```
Authorization: Bearer <admin access token>
```

A non-admin or banned admin gets 403. A missing/invalid token gets
401. A non-admin calling the `self-ban` path gets 409.

---

## 3. Typical moderation flow

```bash
# 1. Find the operator's access token (issued by /api/v1/auth/social-login).
ADMIN_TOKEN="ey..."

# 2. See what's pending.
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     https://api.pairhub.app/api/v1/admin/activities

# 3. Approve one.
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
     https://api.pairhub.app/api/v1/admin/activities/ckact_xxxx/approve

# 4. Or reject with a reason.
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"reason":"活动包含违规链接"}' \
     https://api.pairhub.app/api/v1/admin/activities/ckact_xxxx/reject
```

---

## 4. Activity state machine (post-#32)

```
PENDING_REVIEW ─approve──▶ RECRUITING ─▶ FULL ─▶ STARTED ─▶ ENDED
       │                       │           │        │
       └─ reject ──▶ REJECTED  └───────────┴────────┴──▶ CANCELED
```

Pending and rejected rows are excluded from the public
`GET /api/v1/activities` list (default filter). The admin's
`GET /api/v1/admin/activities?status=PENDING_REVIEW` queue is the
only place they show up.

The default sort is FIFO: oldest pending first. If the queue
backs up, operators should escalate to dev for a sweep; the launch
volume (≤ 50 signups / day, per issue #28 plan) is far below the
threshold where this matters.

---

## 5. Banning a user

```bash
# Search first (phone or nickname).
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     "https://api.pairhub.app/api/v1/admin/users?search=+12345678901"

# Ban.
curl -X PATCH -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"status":"BANNED","note":"repeat spam"}' \
     https://api.pairhub.app/api/v1/admin/users/usr_target/status
```

The ban takes effect on the user's **next** request (≤ 15 min — the
access-token TTL). Their existing refresh token is still valid; on
`POST /api/v1/auth/refresh` the new access token is minted with
`status: 'BANNED'` and the next request to a gated route gets 403.

A banned user cannot create activities or sign up for new ones, but
their existing signups / messages are preserved so the audit trail
is intact.

---

## 6. Dashboard metrics

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     https://api.pairhub.app/api/v1/admin/dashboard/metrics
```

Sample response (counts grow with usage):

```json
{
  "data": {
    "users": { "total": 100, "banned": 3, "newToday": 7, "newThisWeek": 28 },
    "activities": { "total": 450, "pending": 12, "recruiting": 80 },
    "signups": { "total": 900, "today": 45 },
    "pushTokens": { "total": 200 },
    "generatedAt": "2026-06-09T12:00:00.000Z"
  }
}
```

The `pending` count is the operator's primary workload signal:
**if it grows past 20 the review SLA is slipping** (target: clear
the queue every 4 hours during business hours).

---

## 7. M3 followup (not in this PR)

- `PATCH /api/v1/admin/users/:id/role` — promote a moderator to admin
- `GET /api/v1/admin/reports` — UserReport queue (model is in
  schema, endpoints are M3-W11)
- Frontend miniprogram + Flutter pages (separate PRs)
- Auto-screen: text passes → auto-approve, fails → stay pending
  (M3-W12, depends on WeChat content-safety deep-fail mode)
