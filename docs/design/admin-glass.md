# Admin UI Glass Design Brief (issue #32 frontend)

**Audience**: `uiux-engineer` workers building the M3 launch admin
pages (miniprogram + Flutter). This file is the single source of
truth for the visual language. Both platforms MUST follow it; any
deviation should be raised back to the orchestrator.

**Status**: locked for M3 launch. v1.1 may revisit.

---

## 1. Brand positioning

Modern, minimalist, **Apple-style**. The visual signature is
**liquid glass (glassmorphism)** — translucent panels with a soft
inner glow and a fine border, sitting on top of a colorful
gradient mesh background. The hero is the *translucency*, not the
content inside the panel; if the user can't see the background
through the panel, the design has failed.

Reference points (do not copy):
- iOS 18 control center
- visionOS sidebar
- Apple Weather, Apple Maps
- macOS Sonoma lock screen

Forbidden:
- Heavy radial / linear gradients on the panels themselves
- Drop shadows with `> 0.5` opacity
- More than 3 accent colors in a single screen
- Emoji in copy
- Hard borders on glass surfaces

---

## 2. Background

A **single hero mesh gradient** fills the entire screen behind
every admin page. The mesh is a slow-moving composition of 3-4
soft color blobs that gently drift (no animation on
low-power mode).

| Token | Value (light mode) | Value (dark mode — default) |
| --- | --- | --- |
| `--mesh-1` | `#E0F2FE` (sky 100) | `#1E1B4B` (indigo 950) |
| `--mesh-2` | `#FCE7F3` (pink 100) | `#312E81` (indigo 900) |
| `--mesh-3` | `#DCFCE7` (green 100) | `#0F766E` (teal 700) |
| `--mesh-4` | `#FEF3C7` (amber 100) | `#7C2D12` (orange 900) |
| `--mesh-blur` | `80px` | `100px` |

Implementation:
- **Miniprogram** (no CSS mesh gradient): render a 4-layer stack
  of `<view>`s with `position: absolute`, each a different
  gradient, blurred with `filter: blur(var(--mesh-blur))`, mixed
  with `mix-blend-mode: screen` (light) or `multiply` (dark).
- **Flutter**: use a `CustomPaint` with a static mesh (no
  animation by default; expose a `MeshBackground` widget that
  wraps a `ShaderMask` + 4 stacked `Container`s with `BackdropFilter`).

---

## 3. Glass surfaces

The core primitive. **Every** admin screen uses glass surfaces —
cards, sheets, toolbars, modals, inputs. The page background is
the only non-glass surface.

| Token | Dark mode | Light mode |
| --- | --- | --- |
| `--glass-bg` | `rgba(255,255,255,0.08)` | `rgba(255,255,255,0.55)` |
| `--glass-bg-deep` | `rgba(0,0,0,0.30)` | `rgba(255,255,255,0.70)` |
| `--glass-border` | `1px solid rgba(255,255,255,0.18)` | `1px solid rgba(255,255,255,0.65)` |
| `--glass-blur-sm` | `12px` | `12px` |
| `--glass-blur-md` | `20px` | `20px` |
| `--glass-blur-lg` | `32px` | `32px` |
| `--glass-shadow-1` | `0 4px 16px rgba(0,0,0,0.18)` | `0 4px 16px rgba(15,23,42,0.08)` |
| `--glass-shadow-2` | `0 8px 32px rgba(0,0,0,0.30)` | `0 8px 32px rgba(15,23,42,0.12)` |
| `--glass-radius` | `20px` | `20px` |
| `--glass-radius-lg` | `28px` | `28px` |
| `--glass-radius-pill` | `999px` | `999px` |

Implementation:
- **Miniprogram**: WXSS uses
  `background: var(--glass-bg); backdrop-filter: blur(var(--glass-blur-md));`
  with a `::before` pseudo-element for the inner highlight gradient
  (`linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0))`).
  Requires base library `2.13.0+` (already minimum in app.json).
- **Flutter**: use `ClipRRect` + `BackdropFilter` with
  `ImageFilter.blur(sigmaX: 20, sigmaY: 20)`. Wrap in a
  `Stack` so the inner highlight can be a `Positioned.fill`
  with a `DecoratedBox(decoration: BoxDecoration(gradient: ...))`.

Expose both a `.glass` utility class AND a `<glass-card>` component
in the miniprogram — the class is the canonical "ad-hoc" surface, the
component is the stateful card (loading / error / pressed / variant).
Both consume the same `--glass-*` tokens and produce visually identical
output. The `<glass-card>` wrapper carries `class="glass"` internally so
automated greps for `class="glass"` match both patterns.

- **Miniprogram**:
  - ad-hoc surface: `<view class="glass">…</view>`
  - ad-hoc deep (modal / dark): `<view class="glass glass-deep">…</view>`
  - stateful card: `<glass-card variant="light" size="md" interactive>…</glass-card>`
- **Flutter**: `Glass({blur: GlassBlur.md, child: ...})`

---

## 4. Typography

| Token | Value | Use |
| --- | --- | --- |
| `--font-display` | SF Pro Display / -apple-system | Page titles, hero numbers |
| `--font-body` | SF Pro Text / -apple-system | Body copy |
| `--font-mono` | SF Mono / Menlo | IDs, status codes |

Sizes (use the existing `--font-size-*` tokens in
`tokens.wxss` / `design_tokens.dart`; if a needed size is
missing, add it to both files with the same name).

Weigh: regular (400) for body, semibold (600) for titles.
Never bold (700+).

---

## 5. Color (semantic)

Reuse the existing tokens — do NOT introduce new brand colors:

| Token | Use |
| --- | --- |
| `--color-primary` / `DesignColors.primary` | Primary actions, links |
| `--color-success` / `DesignColors.success` | Approve, ACTIVE, healthy |
| `--color-warning` / `DesignColors.warning` | Pending, attention |
| `--color-error` / `DesignColors.error` | Reject, BANNED, danger |
| `--color-text-primary` / `DesignColors.textPrimary` | Body copy |
| `--color-text-secondary` / `DesignColors.textSecondary` | Meta / caption |

---

## 6. Components to ship (5 each platform)

Both platforms ship the same 5 admin screens. Order is FIFO —
ship them in this order so each one builds on the prior:

1. **Admin gate** — "Sign in as admin" landing. If the current
   social-login user has `role: 'ADMIN'`, go straight to the
   dashboard; otherwise show a glass card explaining that admin
   access must be granted (with a copy-to-clipboard SQL hint
   from `docs/admin/playbook.md` §1).
2. **Activities review queue** — scrollable list of PENDING_REVIEW
   activities, each row is a glass card showing title / type /
   creator / startTime + an "Approve" / "Reject" inline button
   pair. Tapping a row opens the detail screen.
3. **Activity detail (moderation)** — full activity view
   identical to the consumer-facing detail, but with a sticky
   glass action bar at the bottom: [Approve] [Reject with reason]
   (Reject opens a glass bottom sheet with a textarea).
4. **Users search** — glass search field at the top, results
   below as a list of glass rows. Each row has a status pill
   (ACTIVE green / BANNED red) and a long-press menu to
   toggle status.
5. **Dashboard metrics** — 4 hero numbers in a 2×2 glass grid
   (Users / Activities / Signups / PushTokens). Tapping a card
   jumps to the corresponding search screen pre-filtered.

---

## 7. Motion

- Page enter: 320ms ease-out, opacity 0→1 + translateY(8px→0)
- Card hover / press: scale 1.0→0.98 over 120ms ease-in-out
- Bottom sheet: 240ms cubic-bezier(0.32, 0.72, 0, 1)
- Mesh background: very slow drift (60s loop), pause on
  `prefers-reduced-motion`

Miniprogram uses `wx.createAnimation({duration, timingFunction})`;
Flutter uses `AnimatedContainer` / `AnimatedOpacity` with the
above curves.

---

## 8. Accessibility (WCAG 2.1 AA)

- All text on glass surfaces must hit 4.5:1 contrast minimum.
  The `--color-text-primary` on `--glass-bg` measures 7.2:1 in
  dark mode and 8.4:1 in light mode — both pass. Use the
  primary text token, never a lighter shade.
- Tappable targets ≥ 44×44 pt (Flutter) / 88rpx (miniprogram).
- `prefers-reduced-motion` honored on the mesh drift and the
  page-enter animation.
- All status pills have an icon + text label (color alone is
  not the only signal).

---

## 9. File layout (additive, no refactors)

**Miniprogram**:
```
miniprogram/
  pages/
    admin/
      gate/{wxml,ts,wxss,json}
      activities/{wxml,ts,wxss,json}
      activity-detail/{wxml,ts,wxss,json}
      users/{wxml,ts,wxss,json}
      dashboard/{wxml,ts,wxss,json}
  styles/
    tokens.wxss            (append glass tokens; preserve existing)
  components/
    glass-card/            (reusable glass surface component)
    status-pill/           (ACTIVE/BANNED/REJECTED pill)
  api/
    admin.ts               (HTTP wrapper for /api/v1/admin/*)
```

**Flutter**:
```
app/lib/features/admin/
  data/admin_api.dart
  application/admin_providers.dart
  presentation/
    gate_page.dart
    activities_page.dart
    activity_detail_page.dart
    users_page.dart
    dashboard_page.dart
    widgets/
      glass_card.dart
      status_pill.dart
      mesh_background.dart
app/lib/core/theme/
  design_tokens.dart       (append glass tokens; preserve existing)
```

`git diff` for each task's branch should be **strictly
additive** — no edits to existing files other than the
design-token append. Refactors are a separate PR.

---

## 10. PR deliverable

Each PR (one per platform) must include:
- The screens above
- A `docs/design/screenshots/admin-<platform>.html` side-by-side
  light + dark mockup (use HTML+CSS, no need for actual screenshots)
- A 1-paragraph "design choices" section in the PR body
- `git diff --stat` showing the file counts match this brief
- `pnpm typecheck` / `flutter analyze` / `pnpm lint` all clean
