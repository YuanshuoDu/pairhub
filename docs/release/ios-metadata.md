# iOS App Store Connect Metadata — StudyBuddy

> **Status**: Template — copy / paste into App Store Connect when the
> first TestFlight build is ready, then update placeholders.

This file is the single source of truth for the **text** portion of the
App Store Connect listing. Screenshots and the privacy URL are
delivered through App Store Connect directly (or referenced from
external storage once issue #34 monitoring lands).

---

## 1. App identity

| Field | Value |
|-------|-------|
| **App name** | StudyBuddy |
| **Subtitle** *(30 chars max)* | Find your study buddy abroad |
| **Primary category** | Education |
| **Secondary category** | Social Networking |
| **Age rating** | 4+ |
| **Content rights** | Contains no third-party content |
| **Privacy policy URL** | `https://studybuddy.example/privacy` *(placeholder — replace with the real URL once #34 monitoring lands and the prod hostname is known)* |
| **Support URL** | `https://studybuddy.example/support` *(placeholder — replace with the real URL; can be a GitHub Issues page for early TestFlight builds)* |
| **Marketing URL** *(optional)* | `https://studybuddy.example` |

---

## 2. App description

*(4000 chars max — current draft is 281 chars; can be expanded for App Store
submission vs. TestFlight.)*

> StudyBuddy helps overseas students find a study buddy in 30 seconds.
> Create or browse activities across five categories — studying,
> sports, board games, online gaming, and more — then sign up with a
> single tap. WeChat-style messaging, Apple/Google/WeChat sign-in, and
> Mapbox-powered "near me" filters make it easy to go from "want to
> play badminton Saturday?" to "see you at the courts at 2pm" without
> leaving the app. Built for international students, by international
> students.

**Full-length copy (1200 chars)** — for the App Store (not TestFlight)
submission, swap in this longer pitch:

> **Studying abroad is lonely. StudyBuddy fixes that.**
>
> Finding a study partner, a badminton opponent, or someone to play
> ranked LoL with shouldn't take three days of WeChat group messages.
> StudyBuddy lets you:
>
> • **Browse 5 types of activities** — studying, sports, board games,
>   online gaming, and "other" — filtered by location, time, and
>   language.
> • **Create an activity in 30 seconds** — title, type, time, place,
>   max participants, optional cover image. That's it.
> • **Sign up with one tap** — no back-and-forth DMs. You'll see who's
>   going and how many spots are left.
> • **Built for international students** — supports sign-in with Apple,
>   Google, and WeChat, so you don't have to create a new account.
> • **Privacy-first** — your real-name is only shared with people you've
>   signed up to meet. Phone numbers and emails stay private.
>
> Whether you're a freshman looking for a library buddy, a grad student
> who wants a Sunday morning run club, or someone who just wants a
> fifth for UNO tonight — StudyBuddy is for you.
>
> **Made with ❤️ in Dublin, Amsterdam, and Singapore.**

---

## 3. Keywords

*(100 chars max, comma-separated, no spaces after commas.)*

```
study buddy,留学生,study group,homeschool,university,留学生搭子,自习,搭子,学习搭子
```

Current length: **76 chars** (room to spare — can add 1–2 more terms like
`找搭子` or `桌游` once A/B test data shows what converts).

**Rules Apple enforces:**

- No competitor names (Apple, Google, WeChat, WhatsApp, etc.).
- No version numbers ("v2", "2024").
- No trademarked terms unless you own them.
- Lowercase, no spaces between comma-separated terms.
- Don't repeat words already in the app name ("StudyBuddy") or
  subtitle — they don't help ranking and waste chars.

---

## 4. What's New in this version

*(4000 chars max — start with this template, customize per release.)*

> **v0.1.0 — first TestFlight build**
>
> • Sign in with Apple, Google, and WeChat
> • Browse and search activities
> • Create activities with a cover image
> • One-tap signup
> • Built-in messaging (basic)
>
> Found a bug? Tap the gear icon → "Report a Problem" or email
> support@studybuddy.example.

---

## 5. TestFlight test information

These get filled in per build under the TestFlight tab in App Store
Connect. Keep them short and action-oriented.

| Field | Value |
|-------|-------|
| **What to test** | Sign in with Apple and Google, browse the activity list, filter by category, create a new activity with a cover image, sign up for an activity, and send a message. |
| **Test account** *(if needed)* | `tester@studybuddy.example` / `StudyBuddyTest2024!` (rotated per release) |
| **Feedback email** | `beta-feedback@studybuddy.example` |
| **Marketing opt-in** | No (until App Store launch) |

---

## 6. Privacy questions (App Store Connect)

Answered during the first submission. Keep the answers in
`docs/release/privacy-answers.md` so the next person doesn't have to
re-derive them.

| Question | Answer |
|----------|--------|
| Do you collect data from this app? | **Yes** |
| Health & Fitness | No |
| Financial Info | No |
| Location | **Yes — Precise Location** (used for "near me" filter, not background) |
| Sensitive Info | No |
| Contacts | No |
| User Content (photos) | **Yes — for cover images the user uploads** |
| Browsing History | No |
| Search History | **Yes — local search history for activity filtering** (not shared) |
| Identifiers (user id) | **Yes** |
| Usage Data | **Yes — anonymous analytics via Sentry** |
| Diagnostics | **Yes — crash reports via Sentry** |
| Purchases | No |
| Tracking | **No** (we do NOT use IDFA) |

If any of the **Yes** answers are wrong, update both this file and the
in-app privacy nutrition label before the next App Store submission.

---

## 7. Screenshots (placeholder)

App Store Connect requires:

- **6.7"** (iPhone 15 Pro Max, 1290 × 2796) — primary, 3–10 images
- **6.5"** (iPhone 11 Pro Max, 1242 × 2688) — required for older devices
- **5.5"** (iPhone 8 Plus, 1242 × 2208) — required for older devices
- **iPad 12.9"** (2048 × 2732) — required ONLY if the app runs on iPad
- **iPad 11"** (1668 × 2388) — required ONLY if the app runs on iPad

TestFlight does **not** require all sizes — only the 6.7" set is needed
for the first TestFlight upload. Plan to capture real device screenshots
on an iPhone 15 / 15 Pro before the App Store submission.

Suggested screenshot order:

1. **Onboarding** — "Find a study buddy in 30 seconds"
2. **Activity list** — with category filters
3. **Activity detail** — title / time / place / sign-up CTA
4. **Create activity** — flow with cover image
5. **Messages** — chat with a confirmed signup
6. **Profile** — past activities + reviews

---

## 8. Pre-submission checklist

Before pasting this metadata into App Store Connect:

- [ ] `Privacy policy URL` updated from placeholder to the real URL
- [ ] `Support URL` updated from placeholder to the real URL
- [ ] `Marketing URL` (if used) resolves
- [ ] Screenshot set captured on a real iPhone 15
- [ ] "What's New" copy matches the version in `pubspec.yaml`
- [ ] Privacy answers (section 6) reviewed and updated
- [ ] TestFlight "What to test" written for this build
- [ ] Test account (if used) is fresh and credentials work
- [ ] Compliance questions answered (encryption: usually "no" for HTTPS-only)
- [ ] Export compliance: "No" for HTTPS-only, no custom encryption
- [ ] `ACCESS_TOKEN` injected via `--dart-define` (see §9) and the
      map screen renders the Mapbox style (not the placeholder view)

Once the first App Store Connect submission is approved, **this file
becomes the changelog** — update it on every release.

---

## 9. Mapbox access token (Flutter + Android)

The Flutter `MapboxMap` widget (PR #59, issue #35) reads a public
Mapbox access token at **build time** via `--dart-define`. The same
mechanism is used on Android (issue #31 scaffold). This section is
the operator runbook for the iOS / Android releases.

### 9.1 Get a public token

1. Sign in to <https://account.mapbox.com/access-tokens/>
2. Click **Create a token**
3. Name it `studybuddy-<platform>-public` (e.g. `studybuddy-ios-public`)
4. **Public scopes only** (defaults: `styles:read`, `fonts:read`,
   `vision:read`, optionally `geocoding:read`). Do **NOT** enable any
   secret scopes on this token.
5. Copy the token (starts with `pk.…`)

### 9.2 Inject at build time

The Dart side reads the token via
`String.fromEnvironment('ACCESS_TOKEN', defaultValue: '')` (see
`app/lib/features/map/presentation/map_screen.dart`).

**Local dev**:

```bash
cd app
flutter run --dart-define ACCESS_TOKEN=pk.eyJ1Ijoi…
```

**iOS release build**:

```bash
cd app
flutter build ipa --release \
  --dart-define ACCESS_TOKEN=pk.eyJ1Ijoi…
```

For Xcode-driven builds (Xcode UI → Edit Scheme → Run → Arguments →
Arguments Passed On Launch), add:

```
--dart-define ACCESS_TOKEN=pk.eyJ1Ijoi…
```

**Android release build**:

```bash
cd app
flutter build apk --release \
  --dart-define ACCESS_TOKEN=pk.eyJ1Ijoi…
```

### 9.3 CI / CD

Inject the token from a GitHub repo secret:

```yaml
# .github/workflows/release.yml
- name: Build release
  env:
    ACCESS_TOKEN: ${{ secrets.MAPBOX_PUBLIC_TOKEN }}
  run: |
    flutter build apk --release --dart-define ACCESS_TOKEN=$ACCESS_TOKEN
    flutter build ipa --release --dart-define ACCESS_TOKEN=$ACCESS_TOKEN
```

For Android, the Mapbox **secret** token (`sk.…`, with the
`Downloads: Read` scope) is a separate, build-host-only secret
needed by Gradle to pull the native SDK from
`maven.mapbox.com/releases`. See
`docs/release/android-setup.md` §3 for the gradle wiring.

### 9.4 Production policy

- Rotate the **public** token every 90 days (revoke old + create new).
- Restrict the public token's allowed URL referrers to
  `studybuddy.app/*` in the Mapbox dashboard.
- The Mapbox **secret** token (Android downloads) should be rotated
  every 6 months; any compromise requires revoking immediately and
  invalidating the old token's `Downloads: Read` scope.
- **Never** commit either token to git, paste in a public channel,
  or ship a debug build that embeds the production public token.
- Empty / non-`pk.…` token → the map screen shows a friendly
  "configure your token" view (see
  `app/lib/features/map/presentation/map_screen.dart`); the
  app does not crash.
