// =============================================================================
// ProGuard / R8 rules for Pairhub Android release build (issue #31).
// =============================================================================
// Without these rules R8 will (correctly) strip classes that the
// Flutter engine, Mapbox native SDK, FCM/TPNS push SDKs, Dio, Riverpod,
// and Freezed use via reflection / JNI / dynamic dispatch. The result
// is a release build that crashes on first launch with a NoSuchMethod
// or ClassNotFound error.
//
// Run with `flutter build appbundle --release --obfuscate --split-debug-info=build/symbols`
// to keep the obfuscation useful while still keeping this rules file
// honest (every line here was learned from a real crash).
// =============================================================================

# -----------------------------------------------------------------------
# Flutter
# -----------------------------------------------------------------------
# Keep Flutter engine classes — the embedding references them by name
# from the native side.
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# Keep our MainActivity (the manifest names it by class FQN; renaming
# breaks the manifest).
-keep class com.pairhub.app.MainActivity { *; }

# -----------------------------------------------------------------------
# Mapbox GL Native (issue #35)
# -----------------------------------------------------------------------
# Mapbox's native side calls into Java/Kotlin through JNI. Stripping
# the annotations classes will cause silent map-tile load failures
# and the famous "blank grey map" symptom.
-keep class com.mapbox.** { *; }
-keep interface com.mapbox.** { *; }
-keep enum com.mapbox.** { *; }
-dontwarn com.mapbox.**

# -----------------------------------------------------------------------
# Geolocator (issue #35)
# -----------------------------------------------------------------------
-keep class com.baseflow.geolocator.** { *; }
-dontwarn com.baseflow.geolocator.**

# -----------------------------------------------------------------------
# Firebase Cloud Messaging + 腾讯 TPNS push
# -----------------------------------------------------------------------
# FCM: the manifest references the service by name; keep it.
-keep class com.google.firebase.** { *; }
-keep class com.google.firebase.messaging.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# TPNS: Tencent's push SDK uses reflection for callbacks.
-keep class com.tencent.tpns.** { *; }
-keep class com.tencent.tpns.baseapi.** { *; }
-keep class com.tencent.android.tpush.** { *; }
-keep class com.tencent.mmkv.** { *; }
-dontwarn com.tencent.**

# -----------------------------------------------------------------------
# Riverpod (uses code generation; some classes are accessed by name)
# -----------------------------------------------------------------------
-keep class * extends io.flutter.embedding.android.FlutterActivity
-keep,allowobfuscation,allowshrinking class * extends androidx.lifecycle.ViewModel
-keep class * implements io.flutter.plugin.common.MethodChannel$MethodCallHandler

# -----------------------------------------------------------------------
# Dart-side notes
# -----------------------------------------------------------------------
# Dart's release AOT compiler handles all Dart classes — they are NOT
# affected by R8 because R8 only sees the Java/Kotlin side. You don't
# need to keep Dart classes here.

# -----------------------------------------------------------------------
# Suppress noisy warnings from optional deps
# -----------------------------------------------------------------------
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
-dontwarn com.google.errorprone.annotations.**
