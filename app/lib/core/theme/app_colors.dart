// Color tokens.
//
// Colors are intentionally centralised here so the design system can swap the
// palette in one file. Material 3 will derive ColorScheme from the seed below.

import 'package:flutter/material.dart';

/// Placeholder brand color. Final palette to be supplied by UI/UX track
/// (see docs/flutter/architecture.md §3).
const Color kBrandSeed = Color(0xFF3B82F6);

abstract final class AppColors {
  // Brand
  static const Color primary = kBrandSeed;
  static const Color primaryContainer = Color(0xFFDBEAFE);
  static const Color onPrimary = Colors.white;
  static const Color onPrimaryContainer = Color(0xFF1E3A8A);

  // Accent
  static const Color secondary = Color(0xFF10B981);
  static const Color tertiary = Color(0xFFF59E0B);

  // Neutrals (slate)
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceVariant = Color(0xFFF1F5F9);
  static const Color outline = Color(0xFFCBD5E1);
  static const Color onSurface = Color(0xFF0F172A);
  static const Color onSurfaceVariant = Color(0xFF475569);

  // Semantic
  static const Color success = Color(0xFF22C55E);
  static const Color warning = Color(0xFFF59E0B);
  static const Color error = Color(0xFFEF4444);
  static const Color info = Color(0xFF3B82F6);

  // Activity type tints (used by cards / chips)
  static const Color activityStudy = Color(0xFF3B82F6);
  static const Color activitySport = Color(0xFF22C55E);
  static const Color activityBoardgame = Color(0xFFA855F7);
  static const Color activityGame = Color(0xFFEF4444);
  static const Color activityOther = Color(0xFF64748B);

  // Dark mode surfaces
  static const Color darkSurface = Color(0xFF0F172A);
  static const Color darkSurfaceVariant = Color(0xFF1E293B);
  static const Color darkOnSurface = Color(0xFFE2E8F0);
}

/// Spacing scale (4-pt grid). Centralised so layouts stay consistent.
abstract final class AppSpacing {
  static const double xxs = 2;
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
  static const double xxxl = 48;
  static const double huge = 64;
}

/// Corner radius scale.
abstract final class AppRadius {
  static const double sm = 4;
  static const double md = 8;
  static const double lg = 12;
  static const double xl = 16;
  static const double pill = 999;
}
