// Pairhub Flutter app entry point.
//
// Wires up the dependency injection (Riverpod) and the router (GoRouter),
// then hands off to the theme + router configuration defined in core/.
//
// Design notes:
//  - We do NOT use `flutter create` defaults — every line of this scaffold is
//    intentional. Demo code (counter app, MyHomePage) is intentionally absent.
//  - All cross-cutting services (Dio, secure storage, auth state) are exposed
//    as Riverpod providers so widgets stay declarative and testable.
//  - The router uses GoRouter 14.x redirect-based auth guard so the login
//    screen and the rest of the app can be expressed declaratively.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'bootstrap.dart';

Future<void> main() async {
  // Ensure binding is up before we touch any platform channels (dotenv, secure
  // storage, etc.).
  WidgetsFlutterBinding.ensureInitialized();

  // Lock to portrait for the scaffold; individual pages can opt-out later
  // (e.g. map / camera screens).
  await SystemChrome.setPreferredOrientations(<DeviceOrientation>[
    DeviceOrientation.portraitUp,
  ]);

  await runWithGuards(() async {
    // Load .env BEFORE we build the ProviderScope so the API base URL is
    // available when Dio is constructed.
    await dotenv.load(fileName: 'assets/.env');
    runApp(const ProviderScope(child: PairhubApp()));
  });
}
