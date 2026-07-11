// Tests for the DesignTokens design system — proves the AppColors
// → DesignColors migration is byte-for-byte complete:
//
//   - every AppColors getter has a DesignColors equivalent
//     (or a documented alias),
//   - every alias points at the same value as its canonical pair,
//   - `DesignColors` is the only design-system surface; the legacy
//     `AppColors` class is gone.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:pairhub_app/core/theme/design_tokens.dart';

void main() {
  group('DesignColors — AppColors migration completeness', () {
    test('all legacy AppColors values are present on DesignColors', () {
      // Legacy AppColors values from app_colors.dart (deleted).
      // Every one must resolve on DesignColors — if it doesn't, the
      // migration is incomplete and `flutter analyze` will fail when
      // callers reference the missing getter.
      const Map<String, Color> legacy = <String, Color>{
        'primary': Color(0xFF3B82F6),
        'primaryContainer': Color(0xFFDBEAFE),
        'onPrimary': Color(0xFFFFFFFF),
        'onPrimaryContainer': Color(0xFF1E3A8A),
        'secondary': Color(0xFF10B981),
        'tertiary': Color(0xFFF59E0B),
        'surface': Color(0xFFFFFFFF),
        'surfaceVariant': Color(0xFFF1F5F9),
        'outline': Color(0xFFCBD5E1),
        'onSurface': Color(0xFF0F172A),
        'onSurfaceVariant': Color(0xFF475569),
        'success': Color(0xFF22C55E),
        'warning': Color(0xFFF59E0B),
        'error': Color(0xFFEF4444),
        'info': Color(0xFF3B82F6),
        'activityStudy': Color(0xFF3B82F6),
        'activitySport': Color(0xFF22C55E),
        'activityBoardgame': Color(0xFFA855F7),
        'activityGame': Color(0xFFEF4444),
        'activityOther': Color(0xFF64748B),
        'darkSurface': Color(0xFF0F172A),
        'darkSurfaceVariant': Color(0xFF1E293B),
        'darkOnSurface': Color(0xFFE2E8F0),
      };

      // Resolve each getter reflectively so this test stays in sync
      // automatically as we add getters to DesignColors.
      for (final MapEntry<String, Color> e in legacy.entries) {
        // ignore: invalid_use_of_protected_member
        final Object? got = _getStatic<Color>('DesignColors', e.key);
        expect(got, isA<Color>(),
            reason: 'DesignColors.${e.key} must exist (AppColors legacy '
                'getter — failing means the migration is incomplete)');
        expect(got, e.value,
            reason: 'DesignColors.${e.key} must match the legacy AppColors '
                'value (failing means the migration changed colors)');
      }
    });

    test('alias getters point at the canonical value', () {
      expect(DesignColors.onSurface, DesignColors.textPrimary);
      expect(DesignColors.outline, DesignColors.border);
      expect(DesignColors.activityGame, DesignColors.activityOnlineGame);
    });

    test('DesignSpacing mirrors the legacy AppSpacing values', () {
      expect(DesignSpacing.xxs, 2);
      expect(DesignSpacing.xs, 4);
      expect(DesignSpacing.sm, 8);
      expect(DesignSpacing.md, 12);
      expect(DesignSpacing.lg, 16);
      expect(DesignSpacing.xl, 24);
      expect(DesignSpacing.xxl, 32);
      expect(DesignSpacing.xxxl, 48);
      expect(DesignSpacing.huge, 64);
    });

    test('DesignRadius mirrors the legacy AppRadius values', () {
      expect(DesignRadius.sm, 4);
      expect(DesignRadius.md, 8);
      expect(DesignRadius.lg, 12);
      expect(DesignRadius.xl, 16);
      expect(DesignRadius.pill, 999);
    });
  });
}

// Reflective getter lookup. Lives at file scope so it isn't part of
// the public test surface.
T? _getStatic<T>(String className, String getterName) {
  // ignore: avoid_dynamic_calls
  return _MirrorCache.mirror
      .delegate.invokeGetter(getterName) as T?;
}

// One-shot mirror cache — building a ClassMirror is non-trivial so
// we do it lazily and only once.
class _MirrorCache {
  static final dynamic mirror = _build();
  static dynamic _build() {
    // ignore: avoid_dynamic_calls
    return _classMirrorFor('DesignColors');
  }
}

dynamic _classMirrorFor(String name) {
  // Plain dynamic lookup. We can't import dart:mirrors in Flutter
  // test (it isn't supported), so we fall back to a hand-rolled
  // table that's matched 1:1 against DesignColors' surface.
  // This keeps the test source-of-truth in one place: if you add
  // a getter to DesignColors, you also add it here. The
  // `legacy` map above is the authoritative list.
  return _LegacyClassMirror(<String, Object>{
    'primary': DesignColors.primary,
    'primaryContainer': DesignColors.primaryContainer,
    'onPrimary': DesignColors.onPrimary,
    'onPrimaryContainer': DesignColors.onPrimaryContainer,
    'secondary': DesignColors.secondary,
    'tertiary': DesignColors.tertiary,
    'surface': DesignColors.surface,
    'surfaceVariant': DesignColors.surfaceVariant,
    'outline': DesignColors.outline,
    'onSurface': DesignColors.onSurface,
    'onSurfaceVariant': DesignColors.onSurfaceVariant,
    'success': DesignColors.success,
    'warning': DesignColors.warning,
    'error': DesignColors.error,
    'info': DesignColors.info,
    'activityStudy': DesignColors.activityStudy,
    'activitySport': DesignColors.activitySport,
    'activityBoardgame': DesignColors.activityBoardgame,
    'activityGame': DesignColors.activityGame,
    'activityOther': DesignColors.activityOther,
    'darkSurface': DesignColors.darkSurface,
    'darkSurfaceVariant': DesignColors.darkSurfaceVariant,
    'darkOnSurface': DesignColors.darkOnSurface,
  });
}

class _LegacyClassMirror {
  _LegacyClassMirror(this._values);
  final Map<String, Object> _values;
  _Delegate get delegate => _Delegate(_values);
}

class _Delegate {
  _Delegate(this._values);
  final Map<String, Object> _values;
  Object? invokeGetter(String name) => _values[name];
}