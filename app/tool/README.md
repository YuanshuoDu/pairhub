# Patched third-party packages

This directory contains patched copies of third-party Flutter packages that
have not been updated for Dart 3+ and are blocking the Pairhub build.

## `mapbox_gl_platform_interface/`

Upstream: <https://pub.dev/packages/mapbox_gl_platform_interface> (v0.16.0,
last published ~4 years ago; Min Dart SDK 2.12).

Why patched: the upstream package uses `hashValues(...)` in
`int get hashCode =>` declarations. `hashValues` was deprecated in Dart 3.0
and removed in Dart 3.4 (it doesn't exist in the SDK 3.4+ stdlib). The Pairhub
app's `lib/features/map/...` imports `package:mapbox_gl/mapbox_gl.dart`,
which transitively pulls in `mapbox_gl_platform_interface`. CI on Flutter
3.24 / Dart 3.5 fails to compile the package because of these references.

What the patch does:
- Replaces `hashValues(a, b, c)` with `Object.hash(a, b, c)`.
- Bumps the package's SDK constraint from `>=2.12.0 <3.0.0` to
  `>=2.12.0 <4.0.0` so the analyzer doesn't try to apply the old
  Dart-2.x inference rules (which produce `dynamic` errors).
- `analysis_options.yaml` excludes this directory from `flutter analyze`
  (it's not our code; we don't want lint findings on it).

Tracked: remove this directory + the `dependency_overrides` entry in
`pubspec.yaml` once upstream `mapbox_gl` migrates to a maintained
Mapbox SDK (or the team decides to drop the Mapbox feature and
delete `lib/features/map/...`).
