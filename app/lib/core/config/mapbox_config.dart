// Mapbox access token + bootstrap.
//
// The token is read from .env (`MAPBOX_ACCESS_TOKEN`). The .env file
// ships a placeholder in source; ops must replace the real token at
// build / deploy time. NEVER commit a real Mapbox public token to git.
//
// We initialise the global `mapbox_gl.accessToken` exactly once. The
// Flutter app calls `MapboxConfig.bootstrap()` from `main()` before
// `runApp` so any map widget mounted later is ready.

import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:mapbox_gl/mapbox_gl.dart' as mapbox;

class MapboxConfig {
  static const String _envKey = 'MAPBOX_ACCESS_TOKEN';

  /// Mapbox public access token from .env, or empty when not configured.
  /// Empty token causes `mapbox.MapWidget` to fail loud (not silent).
  static String get accessToken {
    final String value = (dotenv.maybeGet(_envKey) ?? '').trim();
    return value;
  }

  /// True if the token looks like a valid Mapbox public token (`pk.…`).
  /// We don't validate the body — Mapbox SDK does that at request time.
  static bool get isConfigured =>
      accessToken.isNotEmpty && accessToken.startsWith('pk.');

  /// One-time init called from main() so the global accessToken is
  /// set before any MapWidget is constructed.
  static void bootstrap() {
    mapbox.MapboxOptions.accessToken = accessToken;
  }
}
