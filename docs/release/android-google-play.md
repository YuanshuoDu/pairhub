# Google Play release runbook (issue #31)

> Step-by-step for the operator doing the **Google Play Store** launch of
> Pairhub. Covers: Console registration, content rating, signing
> config, internal-test track, and the production cutover. Companion
> to `ios-metadata.md` (iOS) and `android-cn-apk.md` (国内 APK direct).

## TL;DR

```bash
# 1. one-time: create the signing keystore (NEVER commit it)
keytool -genkey -v -keystore app/android/pairhub-release.jks \
  -keyalg RSA -keysize 2048 -validity 25000 \
  -alias pairhub-release \
  -storepass "$RELEASE_STORE_PASSWORD" \
  -keypass "$RELEASE_KEY_PASSWORD" \
  -dname "CN=Pairhub, OU=Eng, O=Pairhub, L=SF, ST=CA, C=US"

# 2. one-time: write app/android/key.properties (gitignored)
cp app/android/key.properties.example app/android/key.properties
$EDITOR app/android/key.properties   # fill in the 4 values

# 3. build a signed AAB
cd app/
bundle install
bundle exec fastlane android build_aab

# 4. upload to Play internal test track (CI does this in step 5)
bundle exec fastlane android upload_play

# 5. (or) let CI do it
git tag v1.0.0 && git push --tags   # triggers .github/workflows/android-release.yml
```

## One-time setup

### 1. Google Play Console account

- **Cost**: USD $25 one-time (lifetime developer account). Non-refundable.
- **URL**: https://play.google.com/console
- **Required**:
  - D-U-N-S number for the org (free from https://www.dnb.com/duns-number/lookup.html,
    takes 5-30 days if you don't already have one). For personal
    accounts D-U-N-S is optional.
  - Government ID matching the account holder
  - A contact email + phone (visible on the listing)
- **Verification**: Google may take 3-7 days to verify the developer
  identity. Build the Play Store listing during this window so it's
  ready to go live the moment verification completes.

### 2. Create the app in the Console

1. Console → "Create app" → name "Pairhub", default language English
2. Default language: English (United States). Second language:
   Chinese (Simplified, China)
3. App / Game: App
4. Free / Paid: Free
5. Declarations:
   - Privacy policy: `https://pairhub.app/privacy` (after the
     v1.1 marketing site ships; for now use the GitHub raw link
     `https://raw.githubusercontent.com/YuanshuoDu/pairhub/main/docs/ops/legal/privacy-policy.en.md`)
   - Ads: No
   - App access: All functionality is available without special access
   - Content rating: complete the IARC questionnaire (see below)
   - Government apps: No
   - Financial features: No
   - Health apps: No
   - Data safety: complete the form (see below)
   - Families: not designed for children
6. App category: **Social** (closest match; "Lifestyle" is the runner-up
   for v1.1 if we want to signal "in-person events" over "chat")

### 3. IARC content rating

- Console → Policy → App content → Content rating
- Questionnaire answers for Pairhub (rated PG):
  - Violence: None
  - Sexual content: None (no user-generated adult content; the
    content-safety filter at activity-create time catches 99%+ of
    attempts, with the platform as the manual review fallback)
  - Language: Mild (users can describe their activity with mild
    language; no profanity filter pre-send)
  - Controlled substances: References only (an activity could be a
    wine-tasting for the 21+ audience, but no commerce)
  - User-generated content: Yes (the core feature) — answer
    "users can share text + images with each other"
  - Personal data collected: yes (account profile + location)
  - Target audience: 18+
- Result: **PEGI 18** / **ESRB T** / **USK 12** — Play unifies these
  to "Mature 17+" in the US storefront

### 4. Data safety form

- Account creation: email OR phone OR social login (we collect the
  chosen identifier + a display name)
- Location: precise (foreground only; never background)
- Personal info: nickname, school, major, year (all user-supplied)
- App activity: pages viewed, activities signed up for, reviews left
- Device or other IDs: device push token (FCM)
- Data handling: data is encrypted in transit, encrypted at rest,
  user can request deletion, data is **not** shared with third parties
- Data deletion: user can request deletion in-app (7-day cooling off)

### 5. Store listing

- **App name**: Pairhub
- **Short description** (80 chars): "Find your people on campus and
  beyond — study groups, sports, food, trips. 海外留学生同好匹配。"
- **Full description** (4000 chars): see `docs/release/play-listing.md`
  (to be drafted in a follow-up)
- **App icon**: 512×512 PNG, 32-bit with alpha, ≤ 1 MB. Use the
  dark-glass Pairhub mark.
- **Feature graphic**: 1024×500 PNG, ≤ 1 MB
- **Screenshots**: 5-8 per device class (see
  `docs/release/screenshots/README.md`)
- **Color**: `#0F1A2E` (matches the brand)
- **Category**: Social

### 6. Signing keystore

**One-time, on a trusted operator machine.**

```bash
keytool -genkey -v -keystore app/android/pairhub-release.jks \
  -keyalg RSA -keysize 2048 -validity 25000 \
  -alias pairhub-release
```

You'll be prompted for a 20+ char store + key passphrase. **Store
these in 1Password** (or your team password manager) under the
"Pairhub release signing" entry. **Never** email them; **never**
commit them.

The `.jks` file:
- **NEVER** commit (in `.gitignore` via `*.jks`)
- **ALWAYS** back up to encrypted cloud storage (1Password / Bitwarden
  attach, or a sealed envelope in a fireproof safe)
- Treat the loss of the keystore as a P0 incident: you can never
  re-issue the same `applicationId` for updates, only a new app

### 7. `app/android/key.properties`

```bash
cp app/android/key.properties.example app/android/key.properties
# Edit the 4 values:
#   storeFile=pairhub-release.jks
#   storePassword=<from 1Password>
#   keyPassword=<from 1Password>
#   keyAlias=pairhub-release
```

The file is gitignored. Keep it on the build host (CI secret + the
1-2 trusted operator machines).

## Per-release flow

### 1. Bump the version

```bash
# Edit pubspec.yaml: version: 1.0.0+1   (versionName + versionCode)
# Or use the fastlane lane:
cd app/
bundle exec fastlane android bump_version version:1.0.0
```

The versionCode is auto-incremented on each `flutter build`. The
fastlane lane only updates `pubspec.yaml`; `flutter pub get` will
regenerate `local.properties` with the new versionCode.

### 2. Build the AAB

```bash
cd app/
bundle exec fastlane android build_aab
# → build/app/outputs/bundle/release/app-release.aab
# (~ 25-30 MB for arm64-only; ~ 60-80 MB universal)
```

Verify with `aapt2 dump badging`:

```bash
$ANDROID_HOME/build-tools/34.0.0/aapt2 dump badging \
  build/app/outputs/bundle/release/app-release.aab
# Expected:
#   package: name='com.pairhub.app' versionCode='1' versionName='0.1.0'
#   application-label:'Pairhub'
#   uses-permission: name='android.permission.INTERNET'
#   ...
```

### 3. Internal test track

The internal test track is the "employees + 100 trusted testers"
ring. It bypasses the Play Store review (mostly) and lets you shake
out bugs in a real-distribution build.

1. Console → Release → Testing → Internal testing → Create new release
2. Upload `app-release.aab` (drag-drop)
3. Release name: `1.0.0 (1) - internal`
4. Release notes: "Initial internal build for M3 launch dry-run."
5. Review the release → Start rollout to Internal testing
6. Add 100 trusted tester emails (under "Testers" tab)
7. They get an opt-in link via email; they install via Play Store

**Gate: don't promote to production until**:
- [ ] 7+ days of internal testing with no P0/P1 crash
- [ ] 5+ distinct test devices (Pixel, Samsung, OnePlus, Xiaomi, Huawei)
- [ ] 1 cold-start test on each (force-stop + relaunch)
- [ ] 1 offline test (airplane mode, verify "you're offline" UX)
- [ ] 1 permission-revoke test (location off, verify fallback)
- [ ] 1 deep-link test (sign-up flow + activity deep link)
- [ ] 1 Mapbox tile load test (the "blank grey map" is a known
      failure mode; if you see it, the ProGuard rules in
      `proguard-rules.pro` are wrong)

### 4. Production cutover

Once internal testing is clean:

1. Console → Release → Production → Create new release
2. **Use the same AAB** you uploaded to internal (Promote, not new
   upload — keeps the versionCode + signing consistent)
3. Release name: `1.0.0 (1) - public launch`
4. Release notes (English): "Welcome to Pairhub! Find study groups,
   sports, food runs, and weekend trips near you."
5. Release notes (Chinese — secondary language): "Pairhub 上线啦！找
   学习搭子、运动局、桌游夜、约饭、周末出游。"
6. Rollout: 10% staged → 25% (day 3 if crash-free) → 50% → 100%
7. Monitor: Console → Vital stats (crash rate, ANR rate, install
   success rate). Set up alerts in `docs/ops/monitoring/`.

## CI workflow (`.github/workflows/android-release.yml`)

A push of a `v*.*.*` tag triggers:
1. `flutter pub get`
2. `flutter build appbundle --release --obfuscate --split-debug-info=...`
3. `aapt2 dump badging` sanity check
4. Upload the AAB as a workflow artifact (manual download; not
   auto-promoted to Play because we want a human in the loop)

**DO NOT** put the signing keystore in CI. The fastlane lane
`build_aab` is intended for the operator's local machine. CI only
builds unsigned AABs for QA + Play Console review.

## App signing key upgrade (Play App Signing)

Google recommends Play App Signing: you upload your upload key (which
signs the AAB you send to Play), and Google keeps the **app signing
key** (which signs the actual APK users download). If your upload key
is ever compromised, you can request a reset from Google without
losing your install base.

To enable:
1. Console → Setup → App integrity → App signing
2. Google-generated encryption key: **on**
3. Upload your **app signing key** (the same `.jks`) to Google's
   service. The first time you upload a new AAB, Google will
   re-sign it with the app signing key.
4. Subsequent uploads use the upload key (a separate `.jks` you
   generate for this purpose). The upload key is the one in your
   `key.properties`.

**For v1.0 we skip Play App Signing** (the 2-key dance is more setup
than benefit at this stage). Enable it in v1.1 once we have
real install counts.

## Common pitfalls

- **AAB rejected: "Missing app icon"** → feature graphic missing or
  the wrong resolution. Re-export at exactly 1024×500.
- **"Your app currently targets API level 33"** → bump `targetSdk`
  to 34 (already done; verify the next minor release keeps it).
- **"64-bit requirement"** → set `abiFilters 'arm64-v8a', 'x86_64'`
  in `defaultConfig.ndk` (already done).
- **"The supplied input is not a valid AAB"** → Flutter build was
  run without `--release`. Re-run.
- **Crash on first launch with `NoSuchMethodError`** → ProGuard
  stripped a class. See `proguard-rules.pro` for the keep list.
  The most common culprit is forgetting to keep
  `com.pairhub.app.MainActivity` — the manifest references it
  by FQN.
- **"This release is not compliant with the 64-bit requirement"**
  → `abiFilters` excludes `arm64-v8a`. Verify.

## What ships in v1.0

| Track | Day | Rollout | Expected installs |
| --- | --- | --- | --- |
| Internal | 0 | 100% (≤ 100 testers) | 50-100 |
| Closed alpha (optional) | +3 | 100% (≤ 1000 testers) | 200-500 |
| Production 10% | +7 | 10% staged | 200-1000 |
| Production 50% | +10 | 50% staged | 1000-5000 |
| Production 100% | +14 | 100% | 2000-10000 |

Numbers are aspirational for the M3 launch (海外留学生 audience is
niche). Track install velocity in Console → Acquisition reports.
