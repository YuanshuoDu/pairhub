// Top-level MaterialApp.router configuration.
//
// Kept tiny on purpose: all routing decisions live in core/router/app_router.dart
// and all theming in core/theme/app_theme.dart. This file just glues them
// together.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

class PairhubApp extends ConsumerWidget {
  const PairhubApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final GoRouter router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Pairhub',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      // GoRouter 14.x: the router is itself a RouterConfig, so we just hand
      // it straight to MaterialApp.router.
      routerConfig: router,
    );
  }
}
