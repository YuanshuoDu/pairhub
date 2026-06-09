// Color tokens — DEPRECATED shim.
//
// **This file is deprecated as of design-system-v1 (issue #17).**
// New code MUST import `design_tokens.dart` instead:
//
//     import 'package:studybuddy/core/theme/design_tokens.dart';
//
// This file is kept as a thin typedef re-export for one release cycle so
// the existing ~150 call-sites across the app keep compiling. The
// `AppColors` / `AppSpacing` / `AppRadius` symbol names map to the new
// `DesignColors` / `DesignSpacing` / `DesignRadius` classes. The merge of
// the design-system-v1 spec also added a few new tokens (successBg /
// warningBg / errorBg / primaryActive / etc.) that the old shim does not
// surface — use `DesignColors` directly if you need them.
//
// The shim will be removed in a follow-up PR (v1.1). After removal the
// legacy `AppColors.activityGame` etc. will be gone too — use
// `DesignColors.activityOnlineGame` to match the spec.
//
// Spec: docs/design/system-v1.md

import 'design_tokens.dart';

/// @deprecated Use `DesignColors` from `design_tokens.dart`. This
/// re-export is removed in v1.1.
@Deprecated('Use DesignColors from design_tokens.dart; will be removed in v1.1')
typedef AppColors = DesignColors;

/// @deprecated Use `DesignSpacing` from `design_tokens.dart`. This
/// re-export is removed in v1.1.
@Deprecated('Use DesignSpacing from design_tokens.dart; will be removed in v1.1')
typedef AppSpacing = DesignSpacing;

/// @deprecated Use `DesignRadius` from `design_tokens.dart`. This
/// re-export is removed in v1.1.
@Deprecated('Use DesignRadius from design_tokens.dart; will be removed in v1.1')
typedef AppRadius = DesignRadius;
