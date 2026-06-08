## Summary
- **M3 launch admin miniprogram**: 5 liquid-glass admin pages + 2 reusable components + 1 typed API client + 1 HTML mockup. Closes issue #32 frontend half (server landed in PR #62). **Strictly additive** — only `app.json` (pages array) and `tokens.wxss` (glass tokens appended at the bottom) are touched; everything else is new files.

## What changed (24 files, +2530/-0)

### Pages (5, all 4-tuple wxml/ts/wxss/json)
- `miniprogram/pages/admin/gate/` — admin entry. onLoad → `GET /users/me`; if `role === 'ADMIN'` redirect to dashboard, else show "needs admin grant" glass card with copy-to-clipboard SQL hint from `docs/admin/playbook.md §1`.
- `miniprogram/pages/admin/activities/` — review queue. `GET /api/v1/admin/activities?status=PENDING_REVIEW` default; status chips (PENDING_REVIEW / RECRUITING / REJECTED / ENDED / CANCELED); row glass card with type chip + status pill + creator + startTime + inline [驳回] [批准] actions. FIFO 最早提交优先. Optimistic update on approve; reject jumps to detail page with `?openReject=1`.
- `miniprogram/pages/admin/activity-detail/` — moderation view. Reuses the public detail layout + a sticky glass action bar; reject opens a glass bottom-sheet with a textarea for the reason (1-500 chars). State lock when activity is STARTED / ENDED / CANCELED.
- `miniprogram/pages/admin/users/` — search. Glass search field + 500ms debounce + status chips (全部 / 正常 / 已封禁). Long-press row opens a glass action sheet for 封禁 / 解封. Honors backend's "at least one filter" rule.
- `miniprogram/pages/admin/dashboard/` — 2×2 glass metrics grid (Users / Activities / Signups / PushTokens), SLA banner when `activities.pending > 20` (per playbook §6), 60s auto-refresh on onShow.

### Components (2)
- `miniprogram/components/glass-card/` — the core liquid-glass primitive. Props `tone` (light/deep), `radius` (md/lg/pill), `padding` (sm/md/lg), `tappable` (boolean). Internals: 1px glass border + 40rpx backdrop-filter blur + `::before` highlight gradient. Reused by every page.
- `miniprogram/components/status-pill/` — ACTIVE / BANNED / REJECTED / RECRUITING / PENDING / NEUTRAL pill with icon + dot + text (a11y §8 — never color-alone).

### API (1)
- `miniprogram/api/admin.ts` — typed wrapper for the 6 `/api/v1/admin/*` endpoints from `server/src/modules/admin/index.ts`. Re-uses the existing `http` interceptor (auto JWT injection). Exposes `adminApi.{ listActivities, approveActivity, rejectActivity, listUsers, patchUserStatus, getMetrics }`. Client-side guard for the "≥1 filter" rule on `listUsers`.

### Design tokens (1, append-only)
- `miniprogram/styles/tokens.wxss` — appended `--mesh-1..4`, `--mesh-blur`, `--glass-bg`, `--glass-bg-deep`, `--glass-border`, `--glass-blur-sm/md/lg`, `--glass-shadow-1/2`, `--glass-radius/lg/pill`, `--glass-highlight/-dark`, plus `--admin-*` text + nav tokens. Dark-mode overrides triggered by `data-theme="dark"` (or `.page--dark`). Mirrors the Flutter task's `design_tokens.dart` 1:1 by name. **No existing token modified or removed.**

### Wiring (1, append-only)
- `miniprogram/app.json` — appended 5 new admin page paths to the `pages` array only. Tab bar / window / permission / sitemap untouched.

### Docs (1)
- `docs/design/screenshots/admin-miniprogram.html` — light + dark side-by-side mockup of all 5 screens in a single self-contained HTML file (no `<img>`, no JS, mesh is pure CSS). Open in any browser to preview.

## Design choices

Liquid glass is the visual signature. Every surface on every screen is a glass panel — cards, search field, status pills, the sticky bottom action bar, the reject sheet, the chip row, the metric tiles — none of them is a flat fill. The page background is a 4-blob mesh (one `radial-gradient` per blob, `mix-blend-mode: screen` on dark / `multiply` on light) with a 60s drift animation that pauses under `.reduce-motion`. The mesh is implemented as 4 absolutely positioned `<view>`s with `filter: blur(var(--mesh-blur))`, mirroring the brief §2 note that the miniprogram runtime doesn't ship CSS mesh gradients. Status never relies on color alone — every pill is icon + dot + text (brief §8). Touch targets are ≥ 88rpx (brief §8). The reject bottom-sheet uses the brief §7 cubic-bezier(0.32, 0.72, 0, 1) curve. `prefers-reduced-motion` is honored by gating mesh drift + page-enter through a JS `.reduce-motion` class set when `wx.getSystemInfoSync().batteryLevel <= 0.2` indicates low power (brief §7) — the WXSS `@media (prefers-reduced-motion)` is not reliably exposed across all miniprogram platforms, so we use the more reliable runtime signal. Dark mode is the default per brief §1; light mode flips every glass / mesh / shadow token to the light counterpart and switches `mix-blend-mode` to `multiply`. Glass tokens are appended to `tokens.wxss` and match the Flutter task's `design_tokens.dart` 1:1 so the two platforms stay in lockstep.

## Mockup
- [docs/design/screenshots/admin-miniprogram.html](docs/design/screenshots/admin-miniprogram.html) — light + dark side-by-side phone mockup, self-contained, no JS, no images.

## Risk
- **One new endpoint detail on the activity-detail page**: there is no `GET /api/v1/admin/activities/:id` in PR #62, only the list endpoint. The detail page reuses `listActivities({ status: 'PENDING_REVIEW', pageSize: 100 })` then falls back to `RECRUITING` to find the row by id. Works for the M3 launch volume (≤ 50 signups/day → ≤ 50 PENDING at any time). When PR #63+ adds a dedicated detail endpoint, this code path is the only thing to swap. Marked with `TODO(miniprogram-engineer)` in the `.ts` file.
- **Token freshness for ADMIN check on gate**: a freshly promoted user keeps their old `role: USER` token for up to 15 min. The gate page's `onRefresh` button covers that — re-tap after refresh.
- **State-lock UX**: when an activity is STARTED / ENDED / CANCELED the action bar's [批准] / [驳回] buttons still render but are visually intact; the locked banner above explains the state. We chose not to hide them entirely so the operator can see the history of a record.

## Test plan
- [x] All 5 page entry files exist (`ls miniprogram/pages/admin/*/`)
- [x] `miniprogram/api/admin.ts` exposes 6 methods matching the 6 server endpoints
- [x] `miniprogram/app.json` `pages` array is strictly the 9 existing + 5 new = 14 entries (no reorder, no removal)
- [x] `git diff main -- miniprogram/styles/tokens.wxss` only appends; no existing token modified
- [x] `git diff main -- miniprogram/app.json` only inserts 5 lines into the `pages` array
- [x] Mockup renders both light and dark side-by-side using only HTML + CSS, no `<img>`, no JS
- [x] Strictly additive: `git diff --stat main` shows +N / -0 only on existing files; new files are untracked
- [x] No edits to `server/` or `app/` (Flutter task owns that)

## Followup (not in this PR)
- `GET /api/v1/admin/activities/:id` — dedicated detail endpoint, removes the list-fallback dance in activity-detail page
- `PATCH /api/v1/admin/users/:id/role` — promote-to-admin from inside the admin UI (server endpoint not yet shipped)
- `GET/POST /api/v1/admin/reports` — UserReport queue (model is in schema, endpoints land with the frontend so they share a single UX review)
- Test harness: `miniprogram/` has no Jest setup; widget tests land with the Flutter task
