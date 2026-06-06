# iOS Build & TestFlight Upload Playbook

This is the **end-to-end** guide for shipping the Pairhub Flutter app to
TestFlight (and from there to the App Store). It covers prerequisites, the
local build chain, the Xcode upload flow, and the Fastlane alternative.

> **TL;DR** — after prerequisites are met, the happy path is:
> `flutter pub get` → `cd ios && pod install` → `flutter build ios --release --export-options-plist=ios/ExportOptions.plist` → Xcode → Distribute App → App Store Connect → TestFlight.

---

## 1. Prerequisites

You need **all** of these before the first upload. None of them are in this
repo — they live in your Apple Developer account and your local machine.

| # | What | Where to get it |
|---|------|-----------------|
| 1 | **Apple Developer Program** membership ($99 / year) | <https://developer.apple.com/programs/enroll/> — enrollment can take 24–48 h to activate |
| 2 | **Xcode 15+** installed (ships with iOS 17 SDK) | Mac App Store |
| 3 | **Xcode Command Line Tools** | `xcode-select --install` |
| 4 | **CocoaPods 1.13+** | `sudo gem install cocoapods` (or `brew install cocoapods`) |
| 5 | **Flutter SDK 3.24+** (stable) matching `pubspec.yaml` | <https://docs.flutter.dev/get-started/install/macos> |
| 6 | **App Store Connect app** created with bundle id `com.pairhub.app` | <https://appstoreconnect.apple.com/apps> → My Apps → **+** → New App |
| 7 | **Distribution signing certificate** (Apple Distribution) | Xcode → Settings → Accounts → Manage Certificates → **+** → Apple Distribution |
| 8 | **Provisioning profile** for `com.pairhub.app` (App Store, distribution) | Xcode will auto-create when you enable **Automatic** signing, or generate manually in <https://developer.apple.com/account/resources/profiles/list> |
| 9 | **App Store Connect API key** (only required for Fastlane path) | App Store Connect → Users & Access → Keys → **+** → In-App (or Team key) |

> **Why the bundle id `com.pairhub.app`?** — This matches the placeholder
> in `ExportOptions.plist` and the Fastfile. If your team owns a different
> reverse-DNS prefix, edit all three files (`ExportOptions.plist`, `Fastfile`,
> and `Runner.xcodeproj` → Signing & Capabilities → Bundle Identifier) and
> keep them in sync.

---

## 2. One-time setup

Run these once after cloning the repo on a Mac. None of them touch Apple
servers — they just prepare the workspace.

```bash
# 1. Pull dependencies
cd app
flutter pub get
dart run build_runner build --delete-conflicting-outputs   # freezed / json_serializable

# 2. Install iOS native pods
cd ios
pod install

# 3. Open the workspace (NOT the .xcodeproj) in Xcode
open Runner.xcworkspace
```

In Xcode, verify **once**:

- **Runner** target → **Signing & Capabilities** → Team = your Apple Developer
  team, Bundle Identifier = `com.pairhub.app`, Signing = **Automatic** (or
  Manual with the provisioning profile from §1).
- **Build Settings** → search for `IPHONEOS_DEPLOYMENT_TARGET` → must be
  **≥ 13.0** (Mapbox / sign_in_with_apple minimum).

Commit any `ios/Podfile.lock` or `Runner.xcodeproj/project.pbxproj` changes
that Xcode produced.

---

## 3. Build a release IPA

From `app/`:

```bash
flutter build ios --release \
  --export-options-plist=ios/ExportOptions.plist
```

This produces a signed `.ipa` at:
`app/build/ios/ipa/pairhub_app.ipa` (name follows `pubspec.yaml`).

**Before running, edit `app/ios/ExportOptions.plist`:**

| Key | Value |
|-----|-------|
| `teamID` | Your 10-character Apple Team ID (Xcode → Settings → Accounts → your team, or <https://developer.apple.com/account/#/membership/>) |
| `bundleID` | Must match Xcode → Bundle Identifier (default `com.pairhub.app`) |

> If `teamID` / `bundleID` are wrong, `flutter build ios` will fail with
> `No signing certificate "iOS Distribution" found` or
> `Provisioning profile ... doesn't include signing certificate`.

---

## 4. Upload to App Store Connect (Xcode path — **primary**)

The Xcode path is the simplest and is the recommended one for first uploads.

1. Open `app/ios/Runner.xcworkspace` in Xcode.
2. Select **Any iOS Device (arm64)** as the build target (top toolbar, left of
   the Run/Stop buttons). **Do not** select a simulator — you'll get a
   "build for simulator" error.
3. **Product → Archive**. Wait 2–5 min.
4. Once the Organizer opens, select the new archive → **Distribute App**.
5. Choose **App Store Connect** → **Upload** → Next.
6. Select your distribution certificate and provisioning profile (or use
   Automatic) → Next.
7. Check **Upload your app's symbols** (helps with symbolicated crash logs) →
   Next.
8. Click **Upload**. Wait for "Upload Successful" (~2 min).
9. Xcode may show "The upload was successful but ..." warnings — read them.
   Common harmless ones: `ITMS-90717` (deprecated API), `ITMS-90000` (missing
   icon). Anything else, fix before continuing.

App Store Connect will start **processing** the build — this takes
~5–30 min and you cannot skip it. You'll get an email when it's done.

---

## 5. Distribute on TestFlight

Once App Store Connect has finished processing the build:

1. Open <https://appstoreconnect.apple.com/apps> → **Pairhub**.
2. **TestFlight** tab.
3. The new build will appear in **iOS Builds** with status "Processing" →
   "Ready to Submit" or "Ready for Internal Testing".
4. **Compliance** — first time only, you'll be asked export-compliance
   questions. For Pairhub (no encryption beyond HTTPS), answer
   **No** to all of them.
5. Click on the build → fill in **Test Information**:
   - **What to test**: 1–2 sentences. E.g. "Sign in with Apple, browse the
     activity list, sign up for an activity."
   - **Test account** (optional but recommended): an email + password you
     control so testers can log in.
   - **Feedback email**: an address testers can use.
6. **Internal Testing** → create a group (e.g. "Core Team") → add testers by
   email → they get an instant TestFlight invite.
7. **External Testing** (when you're ready for outside users) → create a
   group → add testers → submit the build for **Beta App Review**.
   - Apple reviews external TestFlight builds; this is faster than App Store
     review (usually < 48 h) but still required.

---

## 6. Fastlane path (secondary / CI)

For CI-driven uploads (later), a minimal Fastfile is at
[`fastlane/Fastfile`](./fastlane/Fastfile). The path is:

```bash
cd app/ios
bundle install                       # if using a Gemfile
export APPLE_TEAM_ID="ABCDE12345"    # 10-char team id
fastlane ios beta
```

The `beta` lane runs `build_app` + `upload_to_testflight`. To run it from
GitHub Actions later, you'll also need an **App Store Connect API key** stored
as `APP_STORE_CONNECT_API_KEY_PATH` (or set via `match` / `pilot` env vars).

> This lane is **secondary**. The Xcode path in §4 is the primary one and is
> what you should use for the first few uploads until the Fastlane path is
> battle-tested in CI.

---

## 7. Common gotchas

These are the issues that bite people most often. Fix the cause, not the
symptom.

### 7.1 `NSLocationWhenInUseUsageDescription` missing

**Symptom**: App Store Connect rejects the upload with
`ITMS-90683: Missing Info.plist key`. Or the app crashes on first launch when
trying to get user location.

**Fix**: `app/ios/Runner/Info.plist` must contain
`<key>NSLocationWhenInUseUsageDescription</key>`. We added it for the
Mapbox-backed "show activities near me" feature. **Do not** delete it,
even if Mapbox isn't wired in yet.

### 7.2 `NSPhotoLibraryUsageDescription` missing

**Symptom**: App Store Connect rejects upload (`ITMS-90683` again), or the
"Choose cover image" flow crashes on first open.

**Fix**: `app/ios/Runner/Info.plist` already has
`NSPhotoLibraryUsageDescription` ("...upload cover images for your
activities..."). The string is shown to the user the first time your app
reads from the photo library — write it in the user's language and explain
**why** (not just "we need access").

### 7.3 `NSAppTransportSecurity` and cleartext HTTP

**Symptom**: API calls fail with `The resource could not be loaded because
the App Transport Security policy requires the use of a secure connection`.

**Fix**: Production must use **HTTPS only**. The Pairhub backend
(`https://api.pairhub.example`) is HTTPS. If you ever need a dev/staging
exception, add `NSAppTransportSecurity` → `NSAllowsLocalNetworking` (NOT
`NSAllowsArbitraryLoads`) to `Info.plist`, and only inside an `#if DEBUG`
Swift flag.

### 7.4 Bundle identifier mismatch

**Symptom**: `Provisioning profile "X" doesn't include signing certificate
"Y"` or `No code signing identity found`.

**Fix**: `app/ios/Runner.xcodeproj/project.pbxproj` →
`PRODUCT_BUNDLE_IDENTIFIER` must match the `bundleID` in
`ExportOptions.plist` and the App ID you created in App Store Connect.

### 7.5 Build version / build number out of sync

**Symptom**: Xcode refuses to upload — "CFBundleVersion Mismatch".

**Fix**: `pubspec.yaml` `version: 0.1.0+1` — the `+1` is the build number.
For a TestFlight release, bump it (`0.1.0+2`, `0.1.0+3`, …) **before** the
next `flutter build ios`. App Store Connect will reject two builds with the
same `CFBundleVersion`.

### 7.6 `pod install` fails on Apple Silicon (M1/M2/M3)

**Symptom**: `CocoaPods could not find compatible versions for pod
"Flutter"`.

**Fix**: Ensure Xcode Command Line Tools point at the right Xcode:
`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`. If using
Rosetta, prefer running terminal as native arm64.

### 7.7 Code signing stuck on "no signing identity"

**Symptom**: Xcode shows a red "Sign in to your Apple ID" prompt and
refuses to fetch certificates.

**Fix**: Xcode → Settings → Accounts → your Apple ID → **Manage
Certificates** → **+** → Apple Distribution. If the team shows
"Free (no team)", the account is not enrolled in the Developer Program yet.

### 7.8 Mapbox / `MapboxMaps` Pod won't compile

**Symptom**: `flutter build ios` fails with `Undefined symbols for
architecture arm64: "_OBJC_CLASS_$_MGLMapboxAPIClient"`.

**Fix**: Mapbox needs a **secret access token** in
`ios/Runner/Info.plist` → `MGLMapboxAccessToken`. Get it from
<https://account.mapbox.com/access-tokens/>. **Never** commit the token —
inject it at build time via `--dart-define` + a Swift `#if DEBUG` block, or
in CI from a secret.

---

## 8. Sanity checklist before upload

Run through this every time, even after the first successful upload.

- [ ] `pubspec.yaml` version bumped (`major.minor.patch+build`)
- [ ] `flutter pub get` and `pod install` both clean
- [ ] `flutter analyze` returns 0 errors
- [ ] `flutter test` passes
- [ ] `flutter build ios --release` produces an `.ipa`
- [ ] `ExportOptions.plist` has the correct `teamID` and `bundleID`
- [ ] `Runner/Info.plist` still has `NSLocationWhenInUseUsageDescription` +
      `NSPhotoLibraryUsageDescription`
- [ ] App icon (`Runner/Assets.xcassets/AppIcon`) — all 1024×1024 sizes
      present
- [ ] Launch screen (`Runner/Base.lproj/LaunchScreen.storyboard`) renders
- [ ] Tested on a real device, not just the simulator
- [ ] Tested sign-in (Apple / Google) end-to-end on a real device
- [ ] Release notes drafted in `docs/release/ios-metadata.md`
- [ ] Privacy policy URL reachable (replaces placeholder once #34 lands)
- [ ] TestFlight "What to Test" filled in

---

## 9. Where to go next

- **App Store submission** — once TestFlight is stable, the same Xcode
  archive can be submitted for App Store review from
  App Store Connect → the build → **Submit for Review**.
- **Sentry / crash reporting** — confirm `Runner/Info.plist`
  `NSAppTransportSecurity` does NOT allow arbitrary loads before adding the
  Sentry upload-symbols step.
- **Phased release** — App Store Connect lets you release to 1% / 2% / 5% /
  10% / 20% / 50% / 100% of users over 7 days. Recommended for the first
  App Store release.

See also:

- [`ExportOptions.plist`](./ExportOptions.plist) — `flutter build ipa` template
- [`fastlane/Fastfile`](./fastlane/Fastfile) — CI-friendly upload lane
- [`../../docs/release/ios-metadata.md`](../../docs/release/ios-metadata.md) —
  App Store Connect copy / keywords / URLs
