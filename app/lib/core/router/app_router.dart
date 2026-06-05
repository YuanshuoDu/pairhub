// GoRouter 14.x configuration.
//
// Routes:
//   /login          public — Apple / Google login
//   /home           auth required — activity feed (default landing for signed-in users)
//   /activity/:id   auth required — activity detail
//   /create         auth required — create activity
//   /profile        auth required — user profile
//
// Auth guard is implemented with a `redirect:` callback that consults
// `authStateProvider` and bounces unauthenticated traffic to /login while
// preserving deep-link query params via `state.uri.queryParameters`.

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/activity/activity_detail_page.dart';
import '../../features/activity/activity_list_page.dart';
import '../../features/activity/create_activity_page.dart';
import '../../features/auth/login_page.dart';
import '../../features/profile/profile_page.dart';
import '../auth/auth_state.dart';

/// Public list of route paths used elsewhere in the app (e.g. when building
/// deep-link URLs in push notifications or share sheets).
abstract final class AppRoutes {
  static const String login = '/login';
  static const String home = '/home';
  static const String activity = '/activity/:id';
  static const String create = '/create';
  static const String profile = '/profile';

  static String activityPath(String id) => '/activity/$id';
}

/// Root navigator key — used by services that need to show dialogs/snackbars
/// from outside the widget tree (e.g. token-expiry interceptor).
final GlobalKey<NavigatorState> rootNavigatorKey =
    GlobalKey<NavigatorState>(debugLabel: 'root');

/// Provides a single [GoRouter] instance for the app, listening to auth state
/// so the redirect logic re-evaluates on login / logout.
final Provider<GoRouter> routerProvider = Provider<GoRouter>((Ref ref) {
  final GoRouter router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: AppRoutes.home,
    debugLogDiagnostics: kDebugMode,
    refreshListenable: GoRouterRefreshStream(ref),
    redirect: (BuildContext context, GoRouterState state) {
      final AuthStatus status = ref.read(authStateProvider).status;
      final bool isLoggedIn = status == AuthStatus.authenticated;
      final bool goingToLogin = state.matchedLocation == AppRoutes.login;

      if (!isLoggedIn && !goingToLogin) {
        return '${AppRoutes.login}?next=${Uri.encodeComponent(state.uri.toString())}';
      }
      if (isLoggedIn && goingToLogin) {
        return AppRoutes.home;
      }
      return null;
    },
    routes: <RouteBase>[
      GoRoute(
        path: AppRoutes.login,
        name: 'login',
        builder: (BuildContext context, GoRouterState state) => const LoginPage(),
      ),
      GoRoute(
        path: AppRoutes.home,
        name: 'home',
        builder: (BuildContext context, GoRouterState state) => const ActivityListPage(),
      ),
      GoRoute(
        path: AppRoutes.activity,
        name: 'activity',
        builder: (BuildContext context, GoRouterState state) => ActivityDetailPage(
          activityId: state.pathParameters['id'] ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.create,
        name: 'create',
        builder: (BuildContext context, GoRouterState state) => const CreateActivityPage(),
      ),
      GoRoute(
        path: AppRoutes.profile,
        name: 'profile',
        builder: (BuildContext context, GoRouterState state) => const ProfilePage(),
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});

/// Bridge that turns a Riverpod [Ref] into a [Listenable] so [GoRouter] can
/// re-evaluate `redirect` when auth state changes.
class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Ref ref) {
    ref.listen<AuthState>(
      authStateProvider,
      (AuthState? previous, AuthState next) => notifyListeners(),
    );
  }
}
