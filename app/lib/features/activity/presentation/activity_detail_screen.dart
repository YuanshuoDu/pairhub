// Activity detail screen — issue #23.
//
// Loaded with `:id` from the go_router path. Renders:
//   - Cover (placeholder) + title + type/status badges
//   - Time / location / participants info rows
//   - Tags + description
//   - Map placeholder with the lat/lng + locationName (TODO: issue #35)
//   - Footer CTA:
//       * Anonymous user → "登录后报名" (redirects to /login)
//       * Logged-in non-creator + RECRUITING + not joined → "立即报名"
//       * Logged-in non-creator + already joined → "取消报名"
//       * Logged-in creator → "编辑" + "取消活动" (edit is issue #33 TODO)
//
// Optimistic updates: the [ActivityDetailController] patches the cached
// activity in place on signup / cancelSignup, so the screen re-renders
// without a network round-trip. The full refresh is still available via
// pull-to-refresh.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/auth/auth_state.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/extensions/context.dart';
import '../../../shared/widgets/error_view.dart';
import '../../../shared/widgets/loading_view.dart';
import '../application/activity_providers.dart';
import '../data/activity_model.dart';

class ActivityDetailScreen extends ConsumerWidget {
  const ActivityDetailScreen({required this.activityId, super.key});

  final String activityId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<Activity> async = ref.watch(activityDetailProvider(activityId));

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: const Text('活动详情'),
      ),
      body: async.when(
        loading: () => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: const <Widget>[
            SizedBox(height: 120),
            LoadingView(label: '加载详情…'),
          ],
        ),
        error: (Object e, _) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: <Widget>[
            const SizedBox(height: 80),
            ErrorView(
              message: e is ApiException ? e.message : e.toString(),
              onRetry: () => ref
                  .read(activityDetailProvider(activityId).notifier)
                  .refresh(),
            ),
          ],
        ),
        data: (Activity activity) => _DetailBody(activity: activity),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

class _DetailBody extends ConsumerWidget {
  const _DetailBody({required this.activity});
  final Activity activity;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AuthState auth = ref.watch(authStateProvider);
    final String? currentUserId = auth.user?.id;
    final bool isCreator =
        currentUserId != null && currentUserId == activity.creatorId;

    return Column(
      children: <Widget>[
        Expanded(
          child: RefreshIndicator(
            onRefresh: () =>
                ref.read(activityDetailProvider(activity.id).notifier).refresh(),
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: <Widget>[
                // Cover placeholder — real image lands in a follow-up issue.
                AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.primaryContainer,
                      borderRadius: BorderRadius.circular(AppRadius.lg),
                    ),
                    child: Center(
                      child: Icon(
                        activity.coverUrl == null
                            ? Icons.image_outlined
                            : Icons.image,
                        size: 48,
                        color: context.colorScheme.onPrimaryContainer,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                _Badges(activity: activity),
                const SizedBox(height: AppSpacing.sm),
                Text(activity.title, style: context.text.headlineSmall),
                const SizedBox(height: AppSpacing.lg),
                _InfoCard(activity: activity),
                const SizedBox(height: AppSpacing.lg),
                if (activity.description.isNotEmpty) ...<Widget>[
                  _SectionCard(
                    title: '活动介绍',
                    child:
                        Text(activity.description, style: context.text.bodyMedium),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                ],
                if (activity.tags.isNotEmpty) ...<Widget>[
                  _TagsRow(tags: activity.tags),
                  const SizedBox(height: AppSpacing.lg),
                ],
                _MapPlaceholder(activity: activity),
                const SizedBox(height: AppSpacing.lg),
                _OrganizerCard(creatorId: activity.creatorId),
                const SizedBox(height: AppSpacing.lg),
              ],
            ),
          ),
        ),
        _ActionFooter(
          activity: activity,
          isCreator: isCreator,
          isLoggedIn: auth.status == AuthStatus.authenticated,
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Reusable bits
// ---------------------------------------------------------------------------

class _Badges extends StatelessWidget {
  const _Badges({required this.activity});
  final Activity activity;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xs,
      children: <Widget>[
        _TypeChip(type: activity.type),
        _StatusChip(status: activity.status),
      ],
    );
  }
}

class _TypeChip extends StatelessWidget {
  const _TypeChip({required this.type});
  final ActivityType type;

  @override
  Widget build(BuildContext context) {
    final Color color = _typeColor(type);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Text(
        type.label,
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }

  static Color _typeColor(ActivityType t) {
    switch (t) {
      case ActivityType.study:
        return AppColors.activityStudy;
      case ActivityType.sports:
        return AppColors.activitySport;
      case ActivityType.boardGame:
        return AppColors.activityBoardgame;
      case ActivityType.onlineGame:
        return AppColors.activityGame;
      case ActivityType.other:
        return AppColors.activityOther;
    }
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final ActivityStatus status;

  @override
  Widget build(BuildContext context) {
    final Color color = _statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Text(
        status.label,
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }

  static Color _statusColor(ActivityStatus s) {
    switch (s) {
      case ActivityStatus.recruiting:
        return AppColors.success;
      case ActivityStatus.full:
        return AppColors.warning;
      case ActivityStatus.started:
        return AppColors.info;
      case ActivityStatus.ended:
        return AppColors.outline;
      case ActivityStatus.canceled:
        return AppColors.error;
    }
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.activity});
  final Activity activity;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          children: <Widget>[
            _InfoRow(
              icon: Icons.schedule_outlined,
              title: formatActivityTimeRange(activity.startTime, activity.endTime),
              subtitle: '${formatIso(activity.startTime)} ~ ${formatIso(activity.endTime)}',
            ),
            const Divider(height: AppSpacing.lg),
            _InfoRow(
              icon: Icons.place_outlined,
              title: activity.locationName,
              subtitle: activity.locationAddr,
            ),
            const Divider(height: AppSpacing.lg),
            _InfoRow(
              icon: Icons.group_outlined,
              title: '${activity.currentCount} / ${activity.maxParticipants} 人',
              subtitle: '活动 ID: ${activity.id}',
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.title,
    this.subtitle,
  });
  final IconData icon;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Icon(icon, size: 20, color: context.colorScheme.outline),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(title, style: context.text.bodyLarge),
              if (subtitle != null) ...<Widget>[
                const SizedBox(height: 2),
                Text(
                  subtitle!,
                  style: context.text.bodySmall?.copyWith(
                    color: context.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(title, style: context.text.titleSmall),
            const SizedBox(height: AppSpacing.sm),
            child,
          ],
        ),
      ),
    );
  }
}

class _TagsRow extends StatelessWidget {
  const _TagsRow({required this.tags});
  final List<String> tags;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xs,
      children: tags
          .map((String t) => Chip(
                label: Text('#$t'),
                visualDensity: VisualDensity.compact,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ))
          .toList(),
    );
  }
}

class _MapPlaceholder extends StatelessWidget {
  const _MapPlaceholder({required this.activity});
  final Activity activity;

  @override
  Widget build(BuildContext context) {
    // TODO(issue #35): swap for Mapbox webview per ADR-0006 (decision B).
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('地点', style: context.text.titleSmall),
            const SizedBox(height: AppSpacing.sm),
            AspectRatio(
              aspectRatio: 16 / 9,
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.surfaceVariant,
                  borderRadius: BorderRadius.circular(AppRadius.md),
                ),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Icon(
                        Icons.map_outlined,
                        size: 36,
                        color: context.colorScheme.outline,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        activity.locationName,
                        style: context.text.bodySmall,
                      ),
                      Text(
                        'lat ${activity.locationLat.toStringAsFixed(4)}, '
                        'lng ${activity.locationLng.toStringAsFixed(4)}',
                        style: context.text.bodySmall?.copyWith(
                          color: context.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              '地图渲染待 issue #35 接入',
              style: context.text.labelSmall?.copyWith(
                color: context.colorScheme.outline,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OrganizerCard extends StatelessWidget {
  const _OrganizerCard({required this.creatorId});
  final String creatorId;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Row(
          children: <Widget>[
            CircleAvatar(
              backgroundColor: AppColors.primaryContainer,
              child: Icon(
                Icons.person,
                color: context.colorScheme.onPrimaryContainer,
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text('组织者', style: context.text.titleSmall),
                  const SizedBox(height: 2),
                  Text(
                    'userId: $creatorId',
                    style: context.text.bodySmall?.copyWith(
                      color: context.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Footer (the action button(s))
// ---------------------------------------------------------------------------

class _ActionFooter extends ConsumerStatefulWidget {
  const _ActionFooter({
    required this.activity,
    required this.isCreator,
    required this.isLoggedIn,
  });

  final Activity activity;
  final bool isCreator;
  final bool isLoggedIn;

  @override
  ConsumerState<_ActionFooter> createState() => _ActionFooterState();
}

class _ActionFooterState extends ConsumerState<_ActionFooter> {
  bool _busy = false;

  Future<void> _handlePrimary() async {
    final Activity a = widget.activity;
    if (_busy) return;

    if (!widget.isLoggedIn) {
      context.go('${AppRoutes.login}?next=${Uri.encodeComponent(AppRoutes.activityPath(a.id))}');
      return;
    }

    if (widget.isCreator) {
      // Edit form is issue #33.
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('编辑表单在 issue #33 接入')),
      );
      return;
    }

    setState(() => _busy = true);
    try {
      final ActivityDetailController controller =
          ref.read(activityDetailProvider(a.id).notifier);
      if (a.isJoined) {
        await controller.cancelSignup();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('已取消报名')),
          );
        }
      } else {
        await controller.signup();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('报名成功')),
          );
        }
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${a.isJoined ? "取消" : "报名"}失败: ${e.message}')),
        );
      }
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${a.isJoined ? "取消" : "报名"}失败: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _handleCancelActivity() async {
    final Activity a = widget.activity;
    if (_busy) return;
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('取消活动'),
        content: const Text('取消后所有报名者将收到通知，且无法恢复。继续？'),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('返回'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('确认取消'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _busy = true);
    try {
      await ref.read(activityDetailProvider(a.id).notifier).cancelActivity();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('活动已取消')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('取消失败: ${e.message}')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final Activity a = widget.activity;
    final String label = _buttonLabel(a);
    final bool disabled = _buttonDisabled(a);

    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.md,
          AppSpacing.lg,
          AppSpacing.md,
        ),
        decoration: BoxDecoration(
          color: context.colorScheme.surface,
          border: Border(
            top: BorderSide(color: AppColors.outline),
          ),
        ),
        child: widget.isCreator
            ? Row(
                children: <Widget>[
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _busy ? null : _handlePrimary,
                      icon: const Icon(Icons.edit_outlined),
                      label: const Text('编辑'),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: (_busy || a.status == ActivityStatus.canceled)
                          ? null
                          : _handleCancelActivity,
                      icon: const Icon(Icons.delete_outline),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.error,
                      ),
                      label: Text(
                        a.status == ActivityStatus.canceled
                            ? '已取消'
                            : '取消活动',
                      ),
                    ),
                  ),
                ],
              )
            : SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: disabled ? null : _handlePrimary,
                  icon: _busy
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Icon(_buttonIcon(a)),
                  label: Text(label),
                ),
              ),
      ),
    );
  }

  String _buttonLabel(Activity a) {
    if (widget.isCreator) return '编辑';
    if (a.isJoined) return '取消报名';
    switch (a.status) {
      case ActivityStatus.recruiting:
        return widget.isLoggedIn ? '立即报名' : '登录后报名';
      case ActivityStatus.full:
        return '已满员';
      case ActivityStatus.started:
        return '进行中';
      case ActivityStatus.ended:
        return '已结束';
      case ActivityStatus.canceled:
        return '已取消';
    }
  }

  bool _buttonDisabled(Activity a) {
    if (widget.isCreator) return false;
    if (a.isJoined) return false; // we always allow cancel-signup
    if (a.status != ActivityStatus.recruiting) return true;
    return false;
  }

  IconData _buttonIcon(Activity a) {
    if (a.isJoined) return Icons.event_busy_outlined;
    return Icons.check_circle_outline;
  }
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

String formatActivityTimeRange(String startIso, String endIso) {
  final DateTime? start = _parseIso(startIso);
  final DateTime? end = _parseIso(endIso);
  if (start == null || end == null) return startIso;
  return '${DateFormat('MM-dd').format(start)} '
      '${DateFormat('HH:mm').format(start)} ~ '
      '${DateFormat('HH:mm').format(end)}';
}

String formatIso(String s) {
  final DateTime? dt = _parseIso(s);
  if (dt == null) return s;
  return DateFormat('yyyy-MM-dd HH:mm').format(dt);
}

DateTime? _parseIso(String s) {
  if (s.isEmpty) return null;
  return DateTime.tryParse(s)?.toLocal();
}
