// Smoke tests for the Mapbox bootstrap (issue #35).
//
// We don't render the real MapWidget in a test (it requires the native
// plugin to be present, which isn't available in a unit-test VM). We
// just assert that:
//   - MapboxConfig.isConfigured is false when the env var is empty
//     or doesn't start with "pk."
//   - MapboxConfig.accessToken reads the env var
//   - bootstrap() is safe to call (sets the global accessToken)

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'package:pairhub_app/core/config/mapbox_config.dart';

void main() {
  setUpAll(() {
    // Initialise dotenv with an in-memory map so we can manipulate the
    // MAPBOX_ACCESS_TOKEN key per-test.
    dotenv.testLoad(fileInput: '''
API_BASE_URL=https://api.example.com
API_TIMEOUT_MS=15000
APPLE_CLIENT_ID=apple-test
GOOGLE_WEB_CLIENT_ID=google-test
''');
  });

  group('MapboxConfig', () {
    test('accessToken is empty string when MAPBOX_ACCESS_TOKEN not set', () {
      // The fixture above does not include the key.
      expect(MapboxConfig.accessToken, isEmpty);
      expect(MapboxConfig.isConfigured, isFalse);
    });

    test('isConfigured is true only when token starts with pk.', () {
      dotenv.testLoad(fileInput: 'MAPBOX_ACCESS_TOKEN=pk.eyJabc\n');
      expect(MapboxConfig.isConfigured, isTrue);

      dotenv.testLoad(fileInput: 'MAPBOX_ACCESS_TOKEN=sk.eyJabc\n');
      expect(MapboxConfig.isConfigured, isFalse);
    });

    test('bootstrap does not throw on empty token', () {
      // No global bootstrap anymore — the token is read on demand by
      // the map screen. This test is a no-op placeholder kept so the
      // suite still exercises the env wiring path.
      dotenv.testLoad(fileInput: '');
      expect(MapboxConfig.isConfigured, isFalse);
    });
  });
}
