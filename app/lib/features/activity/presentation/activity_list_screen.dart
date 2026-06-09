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
import '../../../core/theme/design_tokens.dart';
import '../../../shared/extensions/context.dart';
import '../../../shared/widgets/empty_view.dart';
import '../../../shared/widgets/error_view.dart';
import '../../../shared/widgets/loading_view.dart';
import '../application/activity_providers.dart';
import '../data/activity_model.dart';

class ActivityListScreen extends ConsumerStatefulWidget {
  const ActivityListScreen({super.key});

  @override
  ConsumerState<ActivityListScreen> createState() =>
      _ActivityListScreenState();
}

class _ActivityListScreenState extends ConsumerState<ActivityListScreen> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    // Auto-load more when the user scrolls past 80% of the list.
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
    final ActivityListState? state =
        ref.read(activityListProvider(0)).value;
    if (state == null) return;
    if (!state.hasMore || state.isLoadingMore) return;
    ref.read(activityListProvider(0).notifier).loadMore();
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<ActivityListState> async = ref.watch(activityListProvider(0));
    final ActivityListQuery query = ref.watch(activityListQueryProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('StudyBuddy'),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.map_outlined),
            tooltip: '附近地图',
            onPressed: () => context.push(AppRoutes.map),
          ),
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
              onRefresh: () =>
                  ref.read(activityListProvider(0).notifier).refresh(),
              child: _buildList(context, ref, async, query),
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

  Widget _buildList(
    BuildContext context,
    WidgetRef ref,
    AsyncValue<ActivityListState> async,
    ActivityListQuery query,
  ) {
    return async.when(
      loading: () => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const <Widget>[
          SizedBox(height: 120),
          LoadingView(label: '加载活动中…'),
        ],
      ),
      error: (Object e, _) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: <Widget>[
          const SizedBox(height: 80),
          ErrorView(
            message: e is ApiException ? e.message : e.toString(),
            onRetry: () => ref.invalidate(activityListProvider(0)),
          ),
        ],
      ),
      data: (ActivityListState state) {
        if (state.items.isEmpty) {
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: const <Widget>[
              const SizedBox(height: 80),
              const EmptyView(
                icon: Icons.event_busy_outlined,
                title: '暂无活动',
                message: '试试切换类型 / 状态，或下拉刷新',
              ),
            ],
          );
        }
        // Item count = cards + a footer for the load-more indicator
        // (which doubles as a tap-to-retry on error).
        return ListView.separated(
          controller: _scrollController,
          padding: const EdgeInsets.all(DesignSpacing.lg),
          itemCount: state.items.length + 1,
          separatorBuilder: (_, __) => const SizedBox(height: DesignSpacing.md),
          itemBuilder: (BuildContext context, int i) {
            if (i == state.items.length) {
              return _ListFooter(
                state: state,
                onLoadMore: () =>
                    ref.read(activityListProvider(0).notifier).loadMore(),
              );
            }
            return _ActivityCard(activity: state.items[i]);
          },
        );
      },
    );
  }
}

/// Footer row beneath the card list. Three states:
///   - hasMore + !isLoadingMore  → "加载更多" tap target
///   - isLoadingMore             → spinner
///   - !hasMore                  → "— 没有更多了 —"
class _ListFooter extends StatelessWidget {
  const _ListFooter({required this.state, required this.onLoadMore});

  final ActivityListState state;
  final VoidCallback onLoadMore;

  @override
  Widget build(BuildContext context) {
    if (!state.hasMore) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: DesignSpacing.lg),
        child: Center(
          child: Text(
            '— 没有更多了 —',
            style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
          ),
        ),
      );
    }
    if (state.isLoadingMore) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: DesignSpacing.lg),
        child: Center(
          child: SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }
    return InkWell(
      onTap: onLoadMore,
      child: const Padding(
        padding: EdgeInsets.symmetric(vertical: DesignSpacing.lg),
        child: Center(
          child: Text(
            '加载更多 ↓',
            style: TextStyle(
              color: Color(0xFF3B82F6),
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
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
        padding: const EdgeInsets.symmetric(vertical: DesignSpacing.sm),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            _ChipRow<ActivityType>(
              chips: ActivityFilters.typeChips,
              selected: query.type,
              onChanged: onTypeChanged,
            ),
            const SizedBox(height: DesignSpacing.xs),
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
        padding: const EdgeInsets.symmetric(horizontal: DesignSpacing.lg),
        itemCount: chips.length,
        separatorBuilder: (_, __) => const SizedBox(width: DesignSpacing.sm),
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
          padding: const EdgeInsets.all(DesignSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  _TypeBadge(type: activity.type),
                  const SizedBox(width: DesignSpacing.sm),
                  _StatusBadge(status: activity.status),
                  const Spacer(),
                  Text(
                    '${activity.currentCount}/${activity.maxParticipants}',
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
        borderRadius: BorderRadius.circular(DesignRadius.pill),
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
        return DesignColors.activityStudy;
      case ActivityType.sports:
        return DesignColors.activitySport;
      case ActivityType.boardGame:
        return DesignColors.activityBoardgame;
      case ActivityType.onlineGame:
        return DesignColors.activityGame;
      case ActivityType.other:
        return DesignColors.activityOther;
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
        borderRadius: BorderRadius.circular(DesignRadius.pill),
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
        return DesignColors.success;
      case ActivityStatus.full:
        return DesignColors.warning;
      case ActivityStatus.started:
        return DesignColors.info;
      case ActivityStatus.ended:
        return DesignColors.outline;
      case ActivityStatus.canceled:
        return DesignColors.error;
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
