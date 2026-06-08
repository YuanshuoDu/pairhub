// Status pill — issue #32 admin UI (Flutter half).
//
// Small glass surface that renders a status enum value as a colored
// dot + text label. Used for user status (ACTIVE / BANNED) and any
// other binary state where color alone would be ambiguous (the
// brief §8 mandates "icon + text label" for all status pills).
//
// The pill itself is a tiny [Glass] surface with the [GlassSize.sm]
// blur/radius and a colored "tint" on the left dot. Color is derived
// from the semantic token (DesignColors.success / warning / error /
// info) — never a hard-coded hex — so light + dark mode share the
// same source of truth.

import 'package:flutter/material.dart';

import '../../../../core/theme/design_tokens.dart';
import 'glass_card.dart';

class StatusPill extends StatelessWidget {
  const StatusPill({
    required this.label,
    required this.tone,
    this.icon,
    super.key,
  });

  /// Human-readable label (e.g. "已激活", "已封禁").
  final String label;

  /// Semantic tone — drives both the dot color and the subtle text
  /// accent.
  final StatusTone tone;

  /// Optional leading icon. Defaults to a filled circle so the pill
  /// remains accessible (icon + text + color, per brief §8).
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final Color color = _resolveColor();
    final Brightness brightness = Theme.of(context).brightness;
    return Glass(
      size: GlassSize.sm,
      padding: const EdgeInsets.symmetric(
        horizontal: DesignSpacing.md,
        vertical: DesignSpacing.xs,
      ),
      color: color.withOpacity(brightness == Brightness.dark ? 0.18 : 0.16),
      border: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(
            icon ?? Icons.circle,
            size: 8,
            color: color,
          ),
          const SizedBox(width: DesignSpacing.xs),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }

  Color _resolveColor() {
    switch (tone) {
      case StatusTone.success:
        return DesignColors.success;
      case StatusTone.warning:
        return DesignColors.warning;
      case StatusTone.error:
        return DesignColors.error;
      case StatusTone.info:
        return DesignColors.info;
      case StatusTone.neutral:
        return DesignColors.textSecondary;
    }
  }
}

enum StatusTone { success, warning, error, info, neutral }

// ---------------------------------------------------------------------------
// Convenience constructors — pre-baked pills for the admin screens.
// ---------------------------------------------------------------------------

/// User status pill (ACTIVE / BANNED). Brightness + tone are derived
/// from [AdminUserStatus].
class AdminUserStatusPill extends StatelessWidget {
  const AdminUserStatusPill({required this.status, super.key});

  final AdminUserStatusLike status;

  @override
  Widget build(BuildContext context) {
    return StatusPill(
      label: status.label,
      tone: status.tone,
      icon: status.icon,
    );
  }
}

/// Interface so this widget stays decoupled from the data-layer
/// `AdminUserStatus` enum (which lives in `data/admin_api.dart`).
abstract class AdminUserStatusLike {
  String get label;
  StatusTone get tone;
  IconData get icon;
}

/// Activity status pill (PENDING_REVIEW / RECRUITING / …).
class AdminActivityStatusPill extends StatelessWidget {
  const AdminActivityStatusPill({required this.status, super.key});

  final AdminActivityStatusLike status;

  @override
  Widget build(BuildContext context) {
    return StatusPill(
      label: status.label,
      tone: status.tone,
      icon: status.icon,
    );
  }
}

abstract class AdminActivityStatusLike {
  String get label;
  StatusTone get tone;
  IconData get icon;
}
