// Activities review queue — issue #32 frontend (Flutter half).
//
// Scrollable list of PENDING_REVIEW activities fetched from
// `GET /api/v1/admin/activities?status=PENDING_REVIEW`. Each row is
// a glass card with inline Approve / Reject buttons; tapping the row
// body opens the detail screen.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/design_tokens.dart';
import '../../../shared/extensions/context.dart';
import '../../../shared/widgets/empty_view.dart';
import '../../../shared/widgets/error_view.dart';
import '../../../shared/widgets/loading_view.dart';
import '../application/admin_providers.dart';
import '../data/admin_api.dart';
import 'activity_detail_page.dart';
import 'widgets/glass_card.dart';
import 'widgets/mesh_background.dart';
import 'widgets/status_pill.dart';

class AdminActivitiesPage extends ConsumerStatefulWidget {
  const AdminActivitiesPage({super.key});

  /// Path used by `go_router`. Both the review-queue link in the
  /// dashboard and the app router consult this.
  static const String routePath = '/admin/activities';

  @override
  ConsumerState<AdminActivitiesPage> createState() =>
      _AdminActivitiesPageState();
}

class _AdminActivitiesPageState extends ConsumerState<AdminActivitiesPage> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final double max = _scrollController.position.maxScrollExtent;
    final double cur = _scrollController.position.pixels;
    if (max <= 0 || cur < max * 0.8) return;
    final AdminActivityListState? state =
        ref.read(adminActivitiesListProvider).value;
    if (state == null) return;
    if (!state.hasMore || state.isLoadingMore) return;
    ref.read(adminActivitiesListProvider.notifier).loadMore();
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<AdminActivityListState> async =
        ref.watch(adminActivitiesListProvider);
    final AdminActivityListQuery query =
        ref.watch(adminActivitiesQueryProvider);
    final bool reduced = MediaQuery.of(context).disableAnimations;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: MeshBackground(
        animated: !reduced,
        child: SafeArea(
          child: Column(
            children: <Widget>[
              _Header(
                total: async.value?.total ?? 0,
                query: query,
                onStatusChanged: (AdminActivityStatus s) =>
                    ref.read(adminActivitiesQueryProvider.notifier).setStatus(s),
                onTypeChanged: (AdminActivityType? t) =>
                    ref.read(adminActivitiesQueryProvider.notifier).setType(t),
              ),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () =>
                      ref.read(adminActivitiesListProvider.notifier).refresh(),
                  child: async.when(
                    loading: () => ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const <Widget>[
                        SizedBox(height: 120),
                        LoadingView(label: '加载审核队列…'),
                      ],
                    ),
                    error: (Object e, _) => ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: <Widget>[
                        const SizedBox(height: 80),
                        ErrorView(
                          message: e is ApiException
                              ? e.message
                              : e.toString(),
                          onRetry: () => ref.invalidate(
                              adminActivitiesListProvider),
                        ),
                      ],
                    ),
                    data: (AdminActivityListState state) {
                      if (state.items.isEmpty) {
                        return ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: const <Widget>[
                            SizedBox(height: 80),
                            EmptyView(
                              icon: Icons.check_circle_outline,
                              title: '队列已清空',
                              message: '没有需要审核的活动。',
                            ),
                          ],
                        );
                      }
                      return ListView.separated(
                        controller: _scrollController,
                        padding: const EdgeInsets.symmetric(
                          horizontal: DesignSpacing.lg,
                          vertical: DesignSpacing.md,
                        ),
                        itemCount: state.items.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: DesignSpacing.md),
                        itemBuilder: (BuildContext context, int i) {
                          return _Row(activity: state.items[i]);
                        },
                      );
                    },
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

class _Header extends StatelessWidget {
  const _Header({
    required this.total,
    required this.query,
    required this.onStatusChanged,
    required this.onTypeChanged,
  });

  final int total;
  final AdminActivityListQuery query;
  final ValueChanged<AdminActivityStatus> onStatusChanged;
  final ValueChanged<AdminActivityType?> onTypeChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        DesignSpacing.lg,
        DesignSpacing.lg,
        DesignSpacing.lg,
        DesignSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              IconButton(
                icon: const Icon(Icons.arrow_back),
                color: DesignColors.onSurface,
                onPressed: () => context.pop(),
                tooltip: '返回',
              ),
              const SizedBox(width: DesignSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text('审核队列', style: context.text.titleLarge),
                    Text(
                      '共 $total 条待处理',
                      style: context.text.bodySmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: DesignSpacing.md),
          _StatusFilterRow(current: query.status, onChanged: onStatusChanged),
          const SizedBox(height: DesignSpacing.sm),
          _TypeFilterRow(current: query.type, onChanged: onTypeChanged),
        ],
      ),
    );
  }
}

class _StatusFilterRow extends StatelessWidget {
  const _StatusFilterRow({required this.current, required this.onChanged});
  final AdminActivityStatus current;
  final ValueChanged<AdminActivityStatus> onChanged;

  static const List<AdminActivityStatus> _options = <AdminActivityStatus>[
    AdminActivityStatus.pendingReview,
    AdminActivityStatus.recruiting,
    AdminActivityStatus.rejected,
    AdminActivityStatus.canceled,
  ];

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _options.length,
        separatorBuilder: (_, __) => const SizedBox(width: DesignSpacing.sm),
        itemBuilder: (BuildContext context, int i) {
          final AdminActivityStatus s = _options[i];
          final bool active = s == current;
          return GestureDetector(
            onTap: () => onChanged(s),
            child: Glass(
              size: GlassSize.sm,
              color: active
                  ? DesignColors.primary.withOpacity(0.30)
                  : null,
              padding: const EdgeInsets.symmetric(
                horizontal: DesignSpacing.md,
                vertical: DesignSpacing.xs,
              ),
              child: Text(
                s.label,
                style: TextStyle(
                  color: active
                      ? DesignColors.primary
                      : DesignColors.onSurface,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _TypeFilterRow extends StatelessWidget {
  const _TypeFilterRow({required this.current, required this.onChanged});
  final AdminActivityType? current;
  final ValueChanged<AdminActivityType?> onChanged;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 32,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: AdminActivityType.values.length + 1,
        separatorBuilder: (_, __) => const SizedBox(width: DesignSpacing.sm),
        itemBuilder: (BuildContext context, int i) {
          if (i == 0) {
            return GestureDetector(
              onTap: () => onChanged(null),
              child: Glass(
                size: GlassSize.sm,
                color: current == null
                    ? DesignColors.onSurface.withOpacity(0.20)
                    : null,
                padding: const EdgeInsets.symmetric(
                  horizontal: DesignSpacing.md,
                ),
                child: Text(
                  '全部类型',
                  style: TextStyle(
                    color: current == null
                        ? DesignColors.onSurface
                        : DesignColors.onSurfaceVariant,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            );
          }
          final AdminActivityType t = AdminActivityType.values[i - 1];
          final bool active = t == current;
          return GestureDetector(
            onTap: () => onChanged(active ? null : t),
            child: Glass(
              size: GlassSize.sm,
              color: active
                  ? DesignColors.onSurface.withOpacity(0.20)
                  : null,
              padding: const EdgeInsets.symmetric(
                horizontal: DesignSpacing.md,
              ),
              child: Text(
                t.label,
                style: TextStyle(
                  color: active
                      ? DesignColors.onSurface
                      : DesignColors.onSurfaceVariant,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

class _Row extends ConsumerWidget {
  const _Row({required this.activity});
  final AdminActivitySummary activity;

  Future<void> _approve(BuildContext context, WidgetRef ref) async {
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    HapticFeedback.selectionClick();
    try {
      await ref
          .read(adminActivityDecisionControllerProvider.notifier)
          .approve(activity.id);
      messenger.showSnackBar(
        const SnackBar(content: Text('已通过')),
      );
    } on Exception catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            '通过失败：${e is ApiException ? e.message : e.toString()}',
          ),
        ),
      );
    }
  }

  Future<void> _reject(BuildContext context, WidgetRef ref) async {
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    HapticFeedback.lightImpact();
    try {
      await ref
          .read(adminActivityDecisionControllerProvider.notifier)
          .reject(activity.id, '内容不符合规范');
      messenger.showSnackBar(
        const SnackBar(content: Text('已驳回')),
      );
    } on Exception catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            '驳回失败：${e is ApiException ? e.message : e.toString()}',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String creatorLabel = activity.creatorNickname ?? '匿名';
    final String location =
        activity.locationName.isNotEmpty ? activity.locationName : '—';
    return GlassCard(
      onTap: () => context.go(
        AdminActivityDetailPage.routePathFor(activity.id),
      ),
      padding: const EdgeInsets.all(DesignSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              AdminActivityStatusPill(
                status: _ActivityStatusAdapter(activity.status),
              ),
              const SizedBox(width: DesignSpacing.sm),
              AdminActivityStatusPill(
                status: _ActivityTypeAdapter(activity.type),
              ),
              const Spacer(),
              Icon(
                Icons.schedule_outlined,
                size: 14,
                color: DesignColors.onSurfaceVariant,
              ),
              const SizedBox(width: 4),
              Text(
                activity.startTime.substring(0, 10),
                style: context.text.bodySmall,
              ),
            ],
          ),
          const SizedBox(height: DesignSpacing.sm),
          Text(
            activity.title,
            style: context.text.titleLarge,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: DesignSpacing.xs),
          Row(
            children: <Widget>[
              Icon(
                Icons.person_outline,
                size: 14,
                color: DesignColors.onSurfaceVariant,
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  creatorLabel,
                  style: context.text.bodySmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Row(
            children: <Widget>[
              Icon(
                Icons.place_outlined,
                size: 14,
                color: DesignColors.onSurfaceVariant,
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  location,
                  style: context.text.bodySmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: DesignSpacing.sm),
              Text(
                '${activity.currentCount}/${activity.maxParticipants}',
                style: context.text.bodySmall,
              ),
            ],
          ),
          const SizedBox(height: DesignSpacing.md),
          Row(
            children: <Widget>[
              Expanded(
                child: _ActionButton(
                  label: '驳回',
                  icon: Icons.close_rounded,
                  tone: StatusTone.error,
                  onPressed: () => _reject(context, ref),
                ),
              ),
              const SizedBox(width: DesignSpacing.sm),
              Expanded(
                child: _ActionButton(
                  label: '通过',
                  icon: Icons.check_rounded,
                  tone: StatusTone.success,
                  onPressed: () => _approve(context, ref),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.icon,
    required this.tone,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final StatusTone tone;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44, // iOS HIG §8 — tappable target ≥ 44×44.
      child: Glass(
        size: GlassSize.sm,
        onTap: onPressed,
        padding: const EdgeInsets.symmetric(horizontal: DesignSpacing.md),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Icon(icon, size: 16, color: DesignColors.onSurface),
            const SizedBox(width: DesignSpacing.xs),
            Text(
              label,
              style: const TextStyle(
                color: DesignColors.onSurface,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Adapters — bridge the data-layer enums to the pill's interface so
// this file doesn't have to import the data layer directly.
// ---------------------------------------------------------------------------

class _ActivityStatusAdapter implements AdminActivityStatusLike {
  _ActivityStatusAdapter(this.status);
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
        return StatusTone.info;
      case AdminActivityStatus.started:
        return StatusTone.info;
      case AdminActivityStatus.ended:
        return StatusTone.neutral;
      case AdminActivityStatus.canceled:
        return StatusTone.neutral;
      case AdminActivityStatus.rejected:
        return StatusTone.error;
    }
  }

  @override
  IconData get icon => Icons.circle;
}

class _ActivityTypeAdapter implements AdminActivityStatusLike {
  _ActivityTypeAdapter(this.type);
  final AdminActivityType type;

  @override
  String get label => type.label;

  @override
  StatusTone get tone => StatusTone.info;

  @override
  IconData get icon => Icons.bookmark_outline;
}
