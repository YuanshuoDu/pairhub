// Zone-based top-level runner: catches async errors during bootstrap and
// reports them via FlutterError / debugPrint without crashing the process.
// In release this should be wired to a real crash reporter (Sentry).

import 'dart:async';

import 'package:flutter/foundation.dart';

Future<void> runWithGuards(Future<void> Function() body) async {
  // Catch sync + async errors during startup (e.g. dotenv load failure,
  // secure storage plugin missing).
  await runZonedGuarded<Future<void>>(
    () async {
      FlutterError.onError = (FlutterErrorDetails details) {
        FlutterError.presentError(details);
        debugPrint('FlutterError: ${details.exceptionAsString()}');
      };
      await body();
    },
    (Object error, StackTrace stack) {
      debugPrint('Uncaught zone error: $error\n$stack');
    },
  );
}
