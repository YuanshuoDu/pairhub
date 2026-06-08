// Mapbox access token + bootstrap.
//
// The token is read from .env (`MAPBOX_ACCESS_TOKEN`). The .env file
// ships a placeholder in source; ops must replace the real token at
// build / deploy time. NEVER commit a real Mapbox public token to git.
//
// `mapbox_gl` 0.16 doesn't expose a public `MapboxOptions` class; the
// access token is passed directly to `MapboxMap` widgets via the
// `accessToken` parameter, or set on a per-call basis. We just expose
// the token here so callers (the future map widget) can read it.

import 'package:flutter_dotenv/flutter_dotenv.dart';

class MapboxConfig {
  static const String _envKey = 'MAPBOX_ACCESS_TOKEN';

  /// Mapbox public access token from .env, or empty when not configured.
  /// Empty token means the map screen will render a friendly "configure
  /// your token" placeholder instead of a broken map.
  static String get accessToken {
    final String value = (dotenv.maybeGet(_envKey) ?? '').trim();
    return value;
  }

  /// True if the token looks like a valid Mapbox public token (`pk.…`).
  /// We don't validate the body — Mapbox SDK does that at request time.
  static bool get isConfigured =>
      accessToken.isNotEmpty && accessToken.startsWith('pk.');
}
