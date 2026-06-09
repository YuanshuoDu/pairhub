// Activity detail (moderation) — issue #32 frontend (Flutter half).
//
// Full activity view identical to the consumer-facing detail, but with
// a sticky glass action bar at the bottom that lets the operator
// approve or reject the activity. Reject opens a glass bottom sheet
// with a textarea for the rejection reason.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/design_tokens.dart';
import '../../../shared/extensions/context.dart';
import '../../../shared/widgets/error_view.dart';
import '../../../shared/widgets/loading_view.dart';
import '../application/admin_providers.dart';
import '../data/admin_api.dart';
import 'widgets/glass_card.dart';
import 'widgets/mesh_background.dart';
import 'widgets/status_pill.dart';

class AdminActivityDetailPage extends ConsumerWidget {
  const AdminActivityDetailPage({required this.activityId, super.key});

  final String activityId;

  static String routePathFor(String id) => '/admin/activities/$id';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<AdminActivityListState> async =
        ref.watch(adminActivitiesListProvider);
    final bool reduced = MediaQuery.of(context).disableAnimations;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: MeshBackground(
        animated: !reduced,
        child: SafeArea(
          child: async.when(
            loading: () => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: const <Widget>[
                SizedBox(height: 120),
                LoadingView(label: '加载活动…'),
              ],
            ),
            error: (Object e, _) => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: <Widget>[
                const SizedBox(height: 80),
                ErrorView(
                  message:
                      e is ApiException ? e.message : e.toString(),
                  onRetry: () => ref.invalidate(adminActivitiesListProvider),
                ),
              ],
            ),
            data: (AdminActivityListState state) {
              AdminActivitySummary? match;
              for (final AdminActivitySummary s in state.items) {
                if (s.id == activityId) {
                  match = s;
                  break;
                }
              }
              if (match == null) {
                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: const <Widget>[
                    SizedBox(height: 80),
                    ErrorView(message: '活动不在当前队列中'),
                  ],
                );
              }
              return _Body(activity: match);
            },
          ),
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.activity});
  final AdminActivitySummary activity;

  Future<void> _onApprove(BuildContext context, WidgetRef ref) async {
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    HapticFeedback.selectionClick();
    try {
      await ref
          .read(adminActivityDecisionControllerProvider.notifier)
          .approve(activity.id);
      messenger.showSnackBar(const SnackBar(content: Text('已通过')));
      if (context.mounted) context.pop();
    } on Exception catch (e) {
      messenger.showSnackBar(SnackBar(
        content: Text(
          '通过失败：${e is ApiException ? e.message : e.toString()}',
        ),
      ));
    }
  }

  Future<void> _onReject(BuildContext context, WidgetRef ref) async {
    HapticFeedback.lightImpact();
    final String? reason = await _showRejectSheet(context);
    if (reason == null || !context.mounted) return;
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    try {
      await ref
          .read(adminActivityDecisionControllerProvider.notifier)
          .reject(activity.id, reason);
      messenger.showSnackBar(const SnackBar(content: Text('已驳回')));
      if (context.mounted) context.pop();
    } on Exception catch (e) {
      messenger.showSnackBar(SnackBar(
        content: Text(
          '驳回失败：${e is ApiException ? e.message : e.toString()}',
        ),
      ));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: <Widget>[
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(DesignSpacing.lg),
            children: <Widget>[
              Row(
                children: <Widget>[
                  IconButton(
                    icon: const Icon(Icons.arrow_back),
                    color: DesignColors.onSurface,
                    onPressed: () => context.pop(),
                  ),
                  const SizedBox(width: DesignSpacing.sm),
                  Text('活动详情', style: context.text.titleLarge),
                ],
              ),
              const SizedBox(height: DesignSpacing.lg),
              GlassCard(
                padding: const EdgeInsets.all(DesignSpacing.xl),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        AdminActivityStatusPill(
                          status: _StatusAdapter(activity.status),
                        ),
                        const SizedBox(width: DesignSpacing.sm),
                        AdminActivityStatusPill(
                          status: _TypeAdapter(activity.type),
                        ),
                      ],
                    ),
                    const SizedBox(height: DesignSpacing.md),
                    Text(activity.title, style: context.text.headlineSmall),
                    const SizedBox(height: DesignSpacing.lg),
                    _InfoRow(
                      icon: Icons.person_outline,
                      label: '创建者',
                      value: activity.creatorNickname ?? '匿名',
                    ),
                    _InfoRow(
                      icon: Icons.school_outlined,
                      label: '学校',
                      value: activity.creatorSchool ?? '—',
                    ),
                    _InfoRow(
                      icon: Icons.schedule_outlined,
                      label: '开始',
                      value: activity.startTime,
                    ),
                    _InfoRow(
                      icon: Icons.place_outlined,
                      label: '地点',
                      value: activity.locationName.isEmpty
                          ? '—'
                          : activity.locationName,
                    ),
                    _InfoRow(
                      icon: Icons.group_outlined,
                      label: '参与',
                      value:
                          '${activity.currentCount}/${activity.maxParticipants}',
                    ),
                    if (activity.moderationNote != null &&
                        activity.moderationNote!.isNotEmpty) ...<Widget>[
                      const SizedBox(height: DesignSpacing.md),
                      _ModerationNote(note: activity.moderationNote!),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: DesignSpacing.lg),
              if (activity.description.isNotEmpty)
                GlassCard(
                  padding: const EdgeInsets.all(DesignSpacing.lg),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text('活动介绍', style: context.text.titleMedium),
                      const SizedBox(height: DesignSpacing.sm),
                      Text(
                        activity.description,
                        style: context.text.bodyMedium,
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 100),
            ],
          ),
        ),
        _ActionBar(
          onApprove: () => _onApprove(context, ref),
          onReject: () => _onReject(context, ref),
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: DesignSpacing.xs),
      child: Row(
        children: <Widget>[
          Icon(icon, size: 18, color: DesignColors.onSurfaceVariant),
          const SizedBox(width: DesignSpacing.sm),
          SizedBox(
            width: 56,
            child: Text(
              label,
              style: context.text.bodySmall,
            ),
          ),
          const SizedBox(width: DesignSpacing.sm),
          Expanded(
            child: Text(
              value,
              style: context.text.bodyMedium,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

class _ModerationNote extends StatelessWidget {
  const _ModerationNote({required this.note});
  final String note;

  @override
  Widget build(BuildContext context) {
    return Glass(
      size: GlassSize.sm,
      padding: const EdgeInsets.all(DesignSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Icon(
            Icons.report_outlined,
            size: 16,
            color: DesignColors.error,
          ),
          const SizedBox(width: DesignSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  '审核备注',
                  style: context.text.labelLarge?.copyWith(
                    color: DesignColors.error,
                  ),
                ),
                const SizedBox(height: 2),
                Text(note, style: context.text.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionBar extends StatelessWidget {
  const _ActionBar({required this.onApprove, required this.onReject});
  final VoidCallback onApprove;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          DesignSpacing.lg,
          DesignSpacing.sm,
          DesignSpacing.lg,
          DesignSpacing.md,
        ),
        child: Glass(
          size: GlassSize.lg,
          padding: const EdgeInsets.all(DesignSpacing.md),
          child: Row(
            children: <Widget>[
              Expanded(
                child: SizedBox(
                  height: 48,
                  child: OutlinedButton.icon(
                    onPressed: onReject,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: DesignColors.error,
                      side: BorderSide(
                        color: DesignColors.error.withOpacity(0.5),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius:
                            BorderRadius.circular(GlassRadius.md),
                      ),
                    ),
                    icon: const Icon(Icons.close_rounded),
                    label: const Text('驳回'),
                  ),
                ),
              ),
              const SizedBox(width: DesignSpacing.md),
              Expanded(
                child: SizedBox(
                  height: 48,
                  child: FilledButton.icon(
                    onPressed: onApprove,
                    style: FilledButton.styleFrom(
                      backgroundColor: DesignColors.success,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius:
                            BorderRadius.circular(GlassRadius.md),
                      ),
                    ),
                    icon: const Icon(Icons.check_rounded),
                    label: const Text('通过'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Reject bottom sheet
// ---------------------------------------------------------------------------

Future<String?> _showRejectSheet(BuildContext context) {
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: const Color(0x00000000),
    isScrollControlled: true,
    builder: (BuildContext ctx) => _RejectSheet(),
  );
}

class _RejectSheet extends StatefulWidget {
  @override
  State<_RejectSheet> createState() => _RejectSheetState();
}

class _RejectSheetState extends State<_RejectSheet> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: GlassSheet(
        padding: const EdgeInsets.all(DesignSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: DesignColors.onSurfaceVariant.withOpacity(0.6),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: DesignSpacing.lg),
            Text(
              '驳回原因',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: DesignSpacing.sm),
            Text(
              '该原因会展示给活动创建者，请使用清晰、专业的语言。',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: DesignSpacing.lg),
            TextField(
              controller: _controller,
              maxLines: 4,
              autofocus: true,
              maxLength: 500,
              decoration: const InputDecoration(
                hintText: '例如：活动信息不完整，请补充地点…',
              ),
            ),
            const SizedBox(height: DesignSpacing.lg),
            Row(
              children: <Widget>[
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('取消'),
                  ),
                ),
                const SizedBox(width: DesignSpacing.md),
                Expanded(
                  child: FilledButton(
                    onPressed: () {
                      final String text = _controller.text.trim();
                      if (text.isEmpty) return;
                      Navigator.of(context).pop(text);
                    },
                    style: FilledButton.styleFrom(
                      backgroundColor: DesignColors.error,
                    ),
                    child: const Text('提交'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

class _StatusAdapter implements AdminActivityStatusLike {
  _StatusAdapter(this.status);
  final AdminActivityStatus status;
  @override
  String get label => status.label;
  @override
  StatusTone get tone {
    switch (status) {
      case AdminActivityStatus.pendingReview:
        return StatusTone.warning;
      case AdminActivityStatus.recruiting:
        return StatusTone.success;
      case AdminActivityStatus.full:
      case AdminActivityStatus.started:
        return StatusTone.info;
      case AdminActivityStatus.ended:
      case AdminActivityStatus.canceled:
        return StatusTone.neutral;
      case AdminActivityStatus.rejected:
        return StatusTone.error;
    }
  }

  @override
  IconData get icon => Icons.circle;
}

class _TypeAdapter implements AdminActivityStatusLike {
  _TypeAdapter(this.type);
  final AdminActivityType type;
  @override
  String get label => type.label;
  @override
  StatusTone get tone => StatusTone.info;
  @override
  IconData get icon => Icons.bookmark_outline;
}
