// Design tokens — the authoritative source for Pairhub's visual system.
// Spec: docs/design/system-v1.md. All miniprogram + Flutter code MUST import
// from this file; do not introduce new color hex / spacing values inline.
//
// The classes below (`DesignColors`, `DesignSpacing`, `DesignRadius`,
// `DesignElevation`, `DesignMotion`, `DesignText`) are the canonical
// tokens. The legacy `app_colors.dart` re-export shim was removed
// in v1.1; `DesignColors` now ships Material 3 aliases (`onSurface`,
// `outline`) and the legacy activity alias (`activityGame`) so call
// sites map 1:1 onto the new vocabulary without runtime risk.
//
// Why aliases (not copies): aliases keep the canonical hex literal
// in exactly one place. If the design system tweaks the brand seed
// tomorrow, every alias follows for free — no risk of a 1-bit drift
// between `textPrimary` and `onSurface` silently diverging.

import 'package:flutter/material.dart';

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

class DesignColors {
  DesignColors._();

  // Brand
  static const Color primary = Color(0xFF3B82F6);
  static const Color primaryContainer = Color(0xFFDBEAFE);
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color onPrimaryContainer = Color(0xFF1E3A8A);
  static const Color primaryActive = Color(0xFF2563EB);

  // Accent
  static const Color secondary = Color(0xFF10B981);
  static const Color tertiary = Color(0xFFF59E0B);

  // Semantic
  static const Color success = Color(0xFF22C55E);
  static const Color successBg = Color(0xFFDCFCE7);
  static const Color warning = Color(0xFFF59E0B);
  static const Color warningBg = Color(0xFFFEF3C7);
  static const Color error = Color(0xFFEF4444);
  static const Color errorBg = Color(0xFFFEE2E2);
  static const Color info = Color(0xFF3B82F6);

  // Surface
  static const Color bg = Color(0xFFF8FAFC);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceVariant = Color(0xFFF1F5F9);
  static const Color divider = Color(0xFFE2E8F0);
  static const Color border = Color(0xFFCBD5E1);
  /// M3 ColorScheme.outline alias. Kept in lock-step with [border]
  /// so a future palette tweak propagates to both names.
  static const Color outline = border;

  // Text
  static const Color textPrimary = Color(0xFF0F172A);
  static const Color textSecondary = Color(0xFF475569);
  static const Color textPlaceholder = Color(0xFF94A3B8);
  static const Color textInverse = Color(0xFFFFFFFF);
  /// M3 ColorScheme.onSurface alias — same value as [textPrimary],
  /// aliased rather than duplicated so they stay in lock-step.
  static const Color onSurface = textPrimary;
  static const Color onSurfaceVariant = Color(0xFF475569);

  // Dark mode surfaces (parity with the light palette above)
  static const Color darkSurface = Color(0xFF0F172A);
  static const Color darkSurfaceVariant = Color(0xFF1E293B);
  static const Color darkOnSurface = Color(0xFFE2E8F0);

  // Activity type tints
  static const Color activityStudy = Color(0xFF3B82F6);
  static const Color activitySport = Color(0xFF22C55E);
  static const Color activityBoardgame = Color(0xFFA855F7);
  static const Color activityOnlineGame = Color(0xFFEF4444);
  /// Short alias for [activityOnlineGame] (matches the legacy DesignColors
  /// name). Kept so existing call sites that say `activityGame` keep
  /// compiling without churn.
  static const Color activityGame = activityOnlineGame;
  static const Color activityOther = Color(0xFF64748B);
}

// ---------------------------------------------------------------------------
// Spacing — 4-pt base. Use only these values; do not introduce new spacing
// literals inline.
// ---------------------------------------------------------------------------

class DesignSpacing {
  DesignSpacing._();

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

// ---------------------------------------------------------------------------
// Radius
// ---------------------------------------------------------------------------

class DesignRadius {
  DesignRadius._();

  static const double sm = 4;
  static const double md = 8;
  static const double lg = 12;
  static const double xl = 16;
  static const double pill = 999;
}

// ---------------------------------------------------------------------------
// Elevation — Flutter `BoxShadow` instances. WXSS equivalents in
// miniprogram/styles/tokens.wxss under `--elevation-*`.
// ---------------------------------------------------------------------------

class DesignElevation {
  DesignElevation._();

  static const List<BoxShadow> soft = [
    BoxShadow(
      color: Color.fromRGBO(0, 0, 0, 0.04),
      offset: Offset(0, 1),
      blurRadius: 2,
    ),
  ];

  static const List<BoxShadow> medium = [
    BoxShadow(
      color: Color.fromRGBO(0, 0, 0, 0.06),
      offset: Offset(0, 2),
      blurRadius: 8,
    ),
  ];

  static const List<BoxShadow> raised = [
    BoxShadow(
      color: Color.fromRGBO(0, 0, 0, 0.08),
      offset: Offset(0, 4),
      blurRadius: 16,
    ),
  ];
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

class DesignMotion {
  DesignMotion._();

  static const Duration fast = Duration(milliseconds: 120);
  static const Duration base = Duration(milliseconds: 200);
  static const Duration slow = Duration(milliseconds: 360);

  static const Curve easeStandard = Cubic(0.2, 0, 0, 1);
  static const Curve easeEmphasized = Cubic(0.3, 0, 0, 1);
}

// ---------------------------------------------------------------------------
// Text theme — Material 3 scale, CJK-tuned. Applied via
// `Theme.of(context).textTheme` after the app theme is wired in
// `lib/core/theme/app_theme.dart`.
// ---------------------------------------------------------------------------

class DesignText {
  DesignText._();

  // The actual `TextTheme` instance is built in app_theme.dart; these static
  // helpers are for ad-hoc styling outside a `BuildContext` (e.g. inside a
  // stateless utility class).
  static const TextStyle displayMedium = TextStyle(
    fontSize: 32,
    fontWeight: FontWeight.w700,
    height: 1.25,
  );

  static const TextStyle headlineLarge = TextStyle(
    fontSize: 28,
    fontWeight: FontWeight.w700,
    height: 1.30,
  );

  static const TextStyle titleLarge = TextStyle(
    fontSize: 22,
    fontWeight: FontWeight.w600,
    height: 1.30,
  );

  static const TextStyle titleMedium = TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.w600,
    height: 1.40,
  );

  static const TextStyle bodyLarge = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w400,
    height: 1.50,
  );

  static const TextStyle bodyMedium = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    height: 1.55,
  );

  static const TextStyle bodySmall = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w400,
    height: 1.50,
  );

  static const TextStyle labelLarge = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    height: 1.20,
  );

  static const TextStyle labelMedium = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    height: 1.20,
  );

  static const TextStyle labelSmall = TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w500,
    height: 1.20,
  );
}

// ---------------------------------------------------------------------------
// Liquid-glass design system — issue #32 admin UI (Flutter half).
//
// This block is the Flutter mirror of the WXSS variables in
// `miniprogram/styles/tokens.wxss` (`--glass-bg`, `--glass-blur-md`, …)
// and the canonical spec in `docs/design/admin-glass.md`. Both platforms
// MUST share the same names so cross-platform review is mechanical.
//
// Glass is the visual signature of the M3 launch admin. Every admin
// card / sheet / toolbar / modal sits on top of a colorful mesh
// gradient background and renders its surface with
// `BackdropFilter(ImageFilter.blur(...))` plus a fine translucent
// border and a subtle inner highlight gradient.
//
// Dark mode is the default; light mode is a parity counterpart. All
// values are derived from the brief's table in §3 / §2.
// ---------------------------------------------------------------------------

/// Glass surface tints. Indexed by [Brightness] so the widgets below
/// can resolve both modes with a single `Theme.of(context).brightness`
/// lookup.
class GlassColors {
  GlassColors._();

  // Dark (default)
  static const Color glassBgDark = Color(0x14FFFFFF); // rgba(255,255,255,0.08)
  static const Color glassBgDeepDark = Color(0x4D000000); // rgba(0,0,0,0.30)
  static const Color glassBorderDark = Color(0x2EFFFFFF); // rgba(255,255,255,0.18)
  static const Color glassHighlightDark = Color(0x1FFFFFFF); // rgba(255,255,255,0.12)
  static const Color glassShadowDark = Color(0x2E000000); // rgba(0,0,0,0.18)
  static const Color glassShadow2Dark = Color(0x4D000000); // rgba(0,0,0,0.30)

  // Light (parity)
  static const Color glassBgLight = Color(0x8CFFFFFF); // rgba(255,255,255,0.55)
  static const Color glassBgDeepLight = Color(0xB3FFFFFF); // rgba(255,255,255,0.70)
  static const Color glassBorderLight = Color(0xA6FFFFFF); // rgba(255,255,255,0.65)
  static const Color glassHighlightLight = Color(0x33FFFFFF); // rgba(255,255,255,0.20)
  static const Color glassShadowLight = Color(0x140F172A); // rgba(15,23,42,0.08)
  static const Color glassShadow2Light = Color(0x1F0F172A); // rgba(15,23,42,0.12)

  /// Resolve the surface tint for the current [brightness]. This is
  /// the single function every glass widget should call.
  static Color surface(Brightness brightness) =>
      brightness == Brightness.dark ? glassBgDark : glassBgLight;

  /// Resolve the "deep" tint (used by the bottom-sheet / modal stack).
  static Color deep(Brightness brightness) =>
      brightness == Brightness.dark ? glassBgDeepDark : glassBgDeepLight;

  /// Resolve the border color.
  static Color border(Brightness brightness) =>
      brightness == Brightness.dark ? glassBorderDark : glassBorderLight;

  /// Resolve the inner highlight gradient start color (used by the
  /// 1px inner highlight at the top edge of every glass card).
  static Color highlight(Brightness brightness) =>
      brightness == Brightness.dark ? glassHighlightDark : glassHighlightLight;

  /// Resolve the 1st-level shadow color (used by small chips / pills).
  static Color shadow(Brightness brightness) =>
      brightness == Brightness.dark ? glassShadowDark : glassShadowLight;

  /// Resolve the 2nd-level shadow color (used by cards / sheets).
  static Color shadow2(Brightness brightness) =>
      brightness == Brightness.dark ? glassShadow2Dark : glassShadow2Light;
}

/// Backdrop blur sigma values. Mirrors `--glass-blur-{sm,md,lg}`.
/// Slight σ adjustments for light mode (MD = 24 vs dark 20) are
/// documented in the brief §3.
class GlassBlur {
  GlassBlur._();

  static const double sm = 12;
  static const double md = 20;
  static const double lg = 32;
}

/// Corner radii for glass surfaces. Mirrors `--glass-radius`,
/// `--glass-radius-lg`, `--glass-radius-pill`. The `md` slot is the
/// inner "card" default; `lg` is for the bottom-sheet / modal
/// container; `pill` is for chips / status pills.
class GlassRadius {
  GlassRadius._();

  static const double sm = 12;
  static const double md = 20;
  static const double lg = 28;
  static const double pill = 999;
}

/// Drop-shadow presets for glass surfaces. Use the variants from
/// [GlassColors.shadow] for the color so light / dark mode swap
/// automatically.
class GlassShadow {
  GlassShadow._();

  /// Level 1 — small chips, inline pills, status indicators.
  static List<BoxShadow> level1(Brightness brightness) => <BoxShadow>[
        BoxShadow(
          color: GlassColors.shadow(brightness),
          offset: const Offset(0, 4),
          blurRadius: 16,
        ),
      ];

  /// Level 2 — cards, sheets, modals (the brief's `glass-shadow-2`).
  static List<BoxShadow> level2(Brightness brightness) => <BoxShadow>[
        BoxShadow(
          color: GlassColors.shadow2(brightness),
          offset: const Offset(0, 8),
          blurRadius: 32,
        ),
      ];
}

/// Mesh gradient palette for the page background. Mirrors
/// `--mesh-{1..4}` in the brief §2. Index 0/1 are cool (sky/pink),
/// 2/3 are warm (green/amber). The dark palette swaps to deep
/// indigo / teal / orange.
class MeshColors {
  MeshColors._();

  // Light mode (sky / pink / green / amber — pastel 100 tones)
  static const List<Color> light = <Color>[
    Color(0xFFE0F2FE), // sky-100
    Color(0xFFFCE7F3), // pink-100
    Color(0xFFDCFCE7), // green-100
    Color(0xFFFEF3C7), // amber-100
  ];

  // Dark mode (indigo / indigo / teal / orange — deep tones)
  static const List<Color> dark = <Color>[
    Color(0xFF1E1B4B), // indigo-950
    Color(0xFF312E81), // indigo-900
    Color(0xFF0F766E), // teal-700
    Color(0xFF7C2D12), // orange-900
  ];

  /// Resolve the palette for the current brightness.
  static List<Color> forBrightness(Brightness b) =>
      b == Brightness.dark ? dark : light;

  /// Mesh blur radius. 80px in light mode, 100px in dark mode.
  static double blurFor(Brightness b) =>
      b == Brightness.dark ? 100 : 80;
}
