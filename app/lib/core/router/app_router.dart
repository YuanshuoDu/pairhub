// GoRouter 14.x configuration.
//
// Routes (auth required for everything except /login):
//   /login                public — Apple / Google login
//   /activities           auth required — activity list (default landing for signed-in users)
//   /activities/:id       auth required — activity detail
//   /create               auth required — create activity (issue #33)
//   /profile              auth required — user profile
//
// Auth guard is implemented with a `redirect:` callback that consults
// `authStateProvider` and bounces unauthenticated traffic to /login while
// preserving deep-link query params via `state.uri.queryParameters`.

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/activity/presentation/activity_detail_screen.dart';
import '../../features/activity/presentation/activity_list_screen.dart';
import '../../features/activity/create_activity_page.dart';
import '../../features/auth/login_page.dart';
import '../../features/profile/profile_page.dart';
import '../auth/auth_state.dart';

/// Public list of route paths used elsewhere in the app (e.g. when building
/// deep-link URLs in push notifications or share sheets).
///
/// Note: the activity list path is `/activities` (plural) to match the REST
/// resource name and the miniprogram convention introduced in PR #43. The
/// old scaffold used `/home`; that path is no longer registered.
abstract final class AppRoutes {
  static const String login = '/login';
  static const String activities = '/activities';
  static const String activity = '/activities/:id';
  static const String create = '/create';
  static const String profile = '/profile';

  /// Build a deep-link path to a specific activity's detail screen.
  static String activityPath(String id) => '/activities/$id';
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
    initialLocation: AppRoutes.activities,
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
        return AppRoutes.activities;
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
        path: AppRoutes.activities,
        name: 'activities',
        builder: (BuildContext context, GoRouterState state) =>
            const ActivityListScreen(),
      ),
      GoRoute(
        path: AppRoutes.activity,
        name: 'activity',
        builder: (BuildContext context, GoRouterState state) =>
            ActivityDetailScreen(
          activityId: state.pathParameters['id'] ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.create,
        name: 'create',
        builder: (BuildContext context, GoRouterState state) =>
            const CreateActivityPage(),
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
