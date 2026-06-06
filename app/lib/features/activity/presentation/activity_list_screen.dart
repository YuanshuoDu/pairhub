// Activity list screen — issue #23.
//
// Renders the activity feed from GET /api/v1/activities with:
//   - Horizontal filter chips for type and status
//   - Pull-to-refresh
//   - Loading / empty / error states via the shared widgets
//   - Tap a card to navigate to the detail screen at /activities/:id
//
// The screen is a thin ConsumerWidget — all data flow lives in
// `application/activity_providers.dart`.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/extensions/context.dart';
import '../../../shared/widgets/empty_view.dart';
import '../../../shared/widgets/error_view.dart';
import '../../../shared/widgets/loading_view.dart';
import '../application/activity_providers.dart';
import '../data/activity_model.dart';

class ActivityListScreen extends ConsumerWidget {
  const ActivityListScreen({super.key});

  static const int _pageSize = 20;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<ActivityListResponse> async = ref.watch(activityListProvider);
    final ActivityListQuery query = ref.watch(activityListQueryProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('StudyBuddy'),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.person_outline),
            tooltip: '我的',
            onPressed: () => context.go(AppRoutes.profile),
          ),
        ],
      ),
      body: Column(
        children: <Widget>[
          _FilterBar(
            query: query,
            onTypeChanged: (ActivityType? t) =>
                ref.read(activityListQueryProvider.notifier).setType(t),
            onStatusChanged: (ActivityStatus? s) =>
                ref.read(activityListQueryProvider.notifier).setStatus(s),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(activityListProvider);
                await ref.read(activityListProvider.future);
              },
              child: async.when(
                loading: () => ListView(
                  // Always-scrollable list so RefreshIndicator can be pulled
                  // even before the first request resolves.
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: const <Widget>[
                    SizedBox(height: 120),
                    LoadingView(label: '加载活动中…'),
                  ],
                ),
                error: (Object e, _) => _ErrorList(
                  error: e,
                  onRetry: () => ref.invalidate(activityListProvider),
                ),
                data: (ActivityListResponse res) {
                  if (res.data.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const <Widget>[
                        SizedBox(height: 80),
                        EmptyView(
                          icon: Icons.event_busy_outlined,
                          title: '暂无活动',
                          message: '试试切换类型 / 状态，或下拉刷新',
                        ),
                      ],
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    itemCount: res.data.length,
                    separatorBuilder: (_, __) =>
                        const SizedBox(height: AppSpacing.md),
                    itemBuilder: (BuildContext context, int i) =>
                        _ActivityCard(activity: res.data[i]),
                  );
                },
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.go(AppRoutes.create),
        icon: const Icon(Icons.add),
        label: const Text('创建'),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.query,
    required this.onTypeChanged,
    required this.onStatusChanged,
  });

  final ActivityListQuery query;
  final ValueChanged<ActivityType?> onTypeChanged;
  final ValueChanged<ActivityStatus?> onStatusChanged;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.colorScheme.surface,
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            _ChipRow<ActivityType>(
              chips: ActivityFilters.typeChips,
              selected: query.type,
              onChanged: onTypeChanged,
            ),
            const SizedBox(height: AppSpacing.xs),
            _ChipRow<ActivityStatus>(
              chips: ActivityFilters.statusChips,
              selected: query.status,
              onChanged: onStatusChanged,
              dense: true,
            ),
          ],
        ),
      ),
    );
  }
}

class _ChipRow<T> extends StatelessWidget {
  const _ChipRow({
    required this.chips,
    required this.selected,
    required this.onChanged,
    this.dense = false,
  });

  final List<({String label, T? value})> chips;
  final T? selected;
  final ValueChanged<T?> onChanged;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: dense ? 36 : 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
        itemCount: chips.length,
        separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (BuildContext context, int i) {
          final ({String label, T? value}) chip = chips[i];
          final bool isActive = chip.value == selected;
          return Center(
            child: ChoiceChip(
              label: Text(chip.label),
              selected: isActive,
              onSelected: (_) => onChanged(isActive ? null : chip.value),
            ),
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

class _ActivityCard extends StatelessWidget {
  const _ActivityCard({required this.activity});
  final Activity activity;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: () => context.go(AppRoutes.activityPath(activity.id)),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  _TypeBadge(type: activity.type),
                  const SizedBox(width: AppSpacing.sm),
                  _StatusBadge(status: activity.status),
                  const Spacer(),
                  Text(
                    '${activity.currentCount}/${activity.maxParticipants}',
                    style: context.text.bodySmall,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                activity.title,
                style: context.text.titleLarge,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: AppSpacing.xs),
              Row(
                children: <Widget>[
                  Icon(
                    Icons.schedule_outlined,
                    size: 14,
                    color: context.colorScheme.outline,
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      formatActivityTimeRange(activity.startTime, activity.endTime),
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
                    color: context.colorScheme.outline,
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      activity.locationName,
                      style: context.text.bodySmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TypeBadge extends StatelessWidget {
  const _TypeBadge({required this.type});
  final ActivityType type;

  @override
  Widget build(BuildContext context) {
    final Color color = _typeColor(type);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
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

  static Color _typeColor(ActivityType type) {
    switch (type) {
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

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final ActivityStatus status;

  @override
  Widget build(BuildContext context) {
    final Color color = _statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
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

// ---------------------------------------------------------------------------
// Error / loading states
// ---------------------------------------------------------------------------

class _ErrorList extends StatelessWidget {
  const _ErrorList({required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final String message = error is ApiException
        ? (error as ApiException).message
        : error.toString();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: <Widget>[
        const SizedBox(height: 80),
        ErrorView(message: message, onRetry: onRetry),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Time formatting helpers
// ---------------------------------------------------------------------------

/// "06-10 13:30 ~ 17:30" style. Falls back to the raw ISO string on parse
/// failure so we never crash on a malformed server response.
String formatActivityTimeRange(String startIso, String endIso) {
  final DateTime? start = _parseIso(startIso);
  final DateTime? end = _parseIso(endIso);
  if (start == null || end == null) {
    return startIso;
  }
  final DateFormat monthDay = DateFormat('MM-dd');
  final DateFormat hm = DateFormat('HH:mm');
  return '${monthDay.format(start)} ${hm.format(start)} ~ ${hm.format(end)}';
}

DateTime? _parseIso(String s) {
  if (s.isEmpty) return null;
  return DateTime.tryParse(s)?.toLocal();
}
