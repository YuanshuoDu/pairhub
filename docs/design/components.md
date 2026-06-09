# Component Specs v1 — Pairhub

> Companion to [`system-v1.md`](./system-v1.md). Every value below resolves
> to a token defined in the system spec — no magic numbers.
>
> Each spec lists dimensions, spacing, and the required states (default /
> pressed / disabled / loading where applicable). Dark mode is omitted here
> because the Flutter M3 `ColorScheme.fromSeed` derives it from the brand
> seed automatically.

---

## 1. ActivityCard

Primary content card for the activities list feed.

### 1.1 Dimensions

| Property        | Flutter (dp)        | Mini-Program (rpx)        |
|-----------------|---------------------|---------------------------|
| Width           | `100% - 2×--space-lg` (16) | `100% - 2×--space-lg` (32) |
| Min height      | 120                 | 240                       |
| Padding         | `--space-lg` (16)   | `--space-lg` (32)         |
| Border radius   | `--radius-lg` (12)  | `--radius-md` (16)        |
| Border          | `1px solid --color-border` | `1rpx solid --color-border` |
| Shadow (rest)   | `DesignElevation.soft` | `--elevation-soft`     |
| Shadow (raised) | `DesignElevation.medium` | `--elevation-medium` |

### 1.2 Inner layout

```
[ type badge  status badge            3/8  ]   ← row 1 (badges + count)
[ Title (titleLarge, 2-line clamp)         ]   ← row 2
[ ⏱  MM-dd HH:mm ~ HH:mm                   ]   ← row 3
[ 📍 Location name (1-line ellipsis)        ]   ← row 4
```

Row gaps: `--space-xs` (4) between rows 1→2, `--space-2xs` (2) between
rows 2→3 and 3→4. Type and status badges sit on row 1 with `--space-sm`
(8) between them.

### 1.3 States

| State    | Background             | Border                | Shadow            | Notes                                       |
|----------|------------------------|-----------------------|-------------------|---------------------------------------------|
| default  | `--color-surface`      | `--color-border`      | `--elevation-soft`| —                                           |
| pressed  | `--color-surface-variant` | same              | `--elevation-soft`| 98% scale (`transform: scale(.98)`) for `--motion-duration-fast` |
| disabled | `--color-surface-variant` | `--color-divider`  | none              | opacity 0.5 (event-creation cards only)     |

### 1.4 Iconography

- Clock icon: lucide `clock-3` (size 14 dp / 28 rpx, color
  `--color-text-secondary`)
- Map pin: lucide `map-pin` (size 14 dp / 28 rpx, color
  `--color-text-secondary`)

---

## 2. StatusBadge

Pill-shaped indicator for the 5 activity states.

### 2.1 Dimensions

| Property        | Flutter          | Mini-Program         |
|-----------------|------------------|----------------------|
| Height          | 20               | 40                   |
| Horizontal pad  | 8                | 20                   |
| Radius          | `--radius-pill`  | `--radius-pill`      |
| Font            | `labelSmall` (11 / 600) | `--font-label-m` (24 / 500) |
| Line-height     | 1.4              | 1.4                  |

### 2.2 Fill & text colour

| Status      | Background                | Text colour                  | Pinned (full-saturation hero variant) |
|-------------|---------------------------|------------------------------|---------------------------------------|
| RECRUITING  | `--color-success-bg`      | `--color-success`            | `--color-success`                     |
| FULL        | `--color-warning-bg`      | `--color-warning`            | `--color-warning`                     |
| STARTED     | `--color-info`            | `--color-on-primary`         | `--color-info`                        |
| ENDED       | `--color-surface-variant` | `--color-on-surface-variant` | `--color-on-surface-variant`          |
| CANCELED    | `--color-error-bg`        | `--color-error`              | `--color-error`                       |

The hero variant (used on the activity detail page's first badge) uses
the full-saturation colour as the background with `--color-on-primary`
text. The list card uses the soft variant (background = token,
text = full-saturation token).

### 2.3 States

`StatusBadge` is a non-interactive label; no pressed/disabled states.
Always rendered with `aria-label="Status: <label>"` for screen readers.

---

## 3. FilterChip

Horizontal scroll filter chip used in the activity list.

### 3.1 Dimensions

| Property       | Default (type chips) | Dense (status chips) |
|----------------|----------------------|----------------------|
| Height         | 40 dp                | 32 dp                |
| Horizontal pad | 12                   | 10                   |
| Radius         | `--radius-pill`      | `--radius-pill`      |
| Font           | `labelLarge` (14 / 600) | `labelSmall` (11 / 600) |

### 3.2 States

| State    | Background                    | Text colour                  | Border                          |
|----------|-------------------------------|------------------------------|---------------------------------|
| default  | `--color-surface`             | `--color-on-surface-variant` | `1px solid --color-border`      |
| pressed  | `--color-primary-container`   | `--color-on-primary-container` | `1px solid --color-primary`   |
| selected | `--color-primary`             | `--color-on-primary`         | `1px solid --color-primary`     |
| disabled | `--color-surface-variant`     | `--color-text-placeholder`   | `1px solid --color-divider`     |

The "selected" state uses the *type* colour when the type filter is on a
coloured activity (e.g. selecting the SPORTS filter paints it
`--color-activity-sport`).

### 3.3 Behaviour

- Tap toggles: tap-when-not-selected → select; tap-when-selected →
  deselect (state machine: `default ⇄ selected`).
- Hit target: full 40×40 dp area, not just the visible pill.

---

## 4. SignupButton

Primary CTA at the bottom of the activity detail page.

### 4.1 Dimensions

| Property       | Flutter          | Mini-Program         |
|----------------|------------------|----------------------|
| Height         | 48               | 88                   |
| Width (footer) | flex 2 (twice secondary) | flex 2            |
| Radius         | `--radius-pill`  | `--radius-pill`      |
| Font           | `titleMedium` (16 / 600) | `--font-body-m` (28 / 500) |

### 4.2 States

| State    | Background                  | Text colour                  | Notes                                |
|----------|-----------------------------|------------------------------|--------------------------------------|
| default  | `--color-primary`            | `--color-on-primary`         | "立即报名"                            |
| pressed  | `--color-primary-active`    | `--color-on-primary`         | scale 0.98, `--motion-duration-fast` |
| loading  | `--color-primary`            | `--color-on-primary`         | trailing 16 dp circular progress; button disabled |
| disabled | `--color-surface-variant`    | `--color-on-surface-variant` | when activity is FULL / ENDED / CANCELED, or user is creator |
| joined   | `--color-primary-container`  | `--color-primary`            | "已报名", label changes; tap → cancel |
| danger   | `--color-error`              | `--color-on-primary`         | secondary action "取消活动" (creator-only) |

### 4.3 Behaviour

- Disabled state: no shadow, no scale, `cursor: not-allowed` (web).
- A "Joined" badge appears as a 16 dp leading icon (lucide `check`) when
  the user has signed up.

---

## 5. EmptyState

Used when a list returns zero results.

### 5.1 Dimensions

- Container: full-bleed horizontally, padding `--space-3xl` (48) top/bottom.
- Icon size: 64 dp (lucide `inbox` or `calendar-x`, colour
  `--color-on-surface-variant`, opacity 0.6).
- Title: `titleLarge` (18 / 600), 1 line, centred.
- Message: `bodyMedium` (14 / 400), max 2 lines, centred, colour
  `--color-on-surface-variant`.
- CTA (optional): 40 dp tall `OutlinedButton`, `--radius-pill`, padding
  `--space-md` horizontal.

### 5.2 Spacing

- Icon → title: `--space-lg` (16).
- Title → message: `--space-xs` (4).
- Message → CTA: `--space-xl` (24).

### 5.3 States

EmptyState is a static composition; no interactive state. The CTA inside
has the standard `OutlinedButton` states.

---

## 6. ErrorState

Used for HTTP / network / 5xx failures.

### 6.1 Dimensions

- Container: same dimensions as EmptyState.
- Icon: lucide `alert-triangle`, 64 dp, colour `--color-error`.
- Title: "加载失败" / "Network error" / i18n string.
- Message: API `userMessage` from `ApiException`, max 3 lines.
- CTA: "重试" / "Retry" — 40 dp `FilledButton`
  (`--color-primary`), with `Icon.refresh_cw` 16 dp leading.

### 6.2 Spacing

Identical to EmptyState (icon → title → message → CTA).

### 6.3 States

Static, with one interactive CTA. CTA uses `FilledButton` default /
pressed / disabled states.

---

## 7. LoadingSkeleton

Used on the detail page before the activity payload resolves, and on the
list during the first fetch.

### 7.1 Dimensions

- Cover skeleton: 420 rpx / 240 dp tall, full-bleed, `--radius-md` top
  corners.
- Title skeleton: full width, 36 rpx / 24 dp tall, `--radius-sm` (8 / 4).
- Subtitle skeleton: 60% width, 24 rpx / 16 dp tall, `--radius-sm`.
- Badge skeleton: 80 rpx / 40 dp wide × 24 rpx / 12 dp tall,
  `--radius-pill`.

### 7.2 Animation

- Linear gradient shimmer: `--color-surface-variant` ↔ `--color-divider`
  ↔ `--color-surface-variant`.
- Duration 1.2 s, `linear` timing, infinite loop.
- Respects `prefers-reduced-motion`: stop the animation and render a
  static mid-grey rectangle. (Flutter: `MediaQuery.disableAnimations`.)

### 7.3 States

Static content swap from skeleton → real card on first frame after the
data arrives. No pressed/disabled states.

---

## Appendix A — Token cross-reference

For each component above, the values used map 1:1 to the system spec
tokens:

| Token group            | Spec section         |
|------------------------|----------------------|
| Color                  | system-v1.md §3      |
| Typography             | system-v1.md §4      |
| Spacing                | system-v1.md §5      |
| Radius                 | system-v1.md §6      |
| Elevation              | system-v1.md §7      |
| Iconography            | system-v1.md §8      |
| Motion                 | system-v1.md §9      |

If you need a new component, add it here AND extend the system spec in
the same PR.
