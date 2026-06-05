// Activity list page — scaffold (no business logic).
//
// Wires up a placeholder AsyncValue so we can see loading / empty / error
// transitions without yet calling the real API. The data layer is a
// Riverpod provider that will be filled in by the next iteration.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/router/app_router.dart';
import '../../core/theme/app_colors.dart';
import '../../shared/extensions/context.dart';
import '../../shared/models/activity.dart';
import '../../shared/widgets/empty_view.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/loading_view.dart';

/// Placeholder provider returning an empty async list. Real implementation
/// will be replaced when the activity API client lands.
final FutureProvider<List<Activity>> activityListProvider =
    FutureProvider<List<Activity>>((Ref ref) async {
  await Future<void>.delayed(const Duration(milliseconds: 200));
  return <Activity>[];
});

class ActivityListPage extends ConsumerWidget {
  const ActivityListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Activity>> async = ref.watch(activityListProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('StudyBuddy'),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.person_outline),
            onPressed: () => context.go(AppRoutes.profile),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(activityListProvider.future),
        child: async.when(
          loading: () => const LoadingView(label: '加载活动中…'),
          error: (Object e, _) => ErrorView(
            message: e.toString(),
            onRetry: () => ref.invalidate(activityListProvider),
          ),
          data: (List<Activity> items) {
            if (items.isEmpty) {
              return EmptyView(
                icon: Icons.event_busy_outlined,
                title: '还没有活动',
                message: '下拉刷新，或点击右下角创建第一个活动',
                action: FilledButton.icon(
                  onPressed: () => context.go(AppRoutes.create),
                  icon: const Icon(Icons.add),
                  label: const Text('创建活动'),
                ),
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(AppSpacing.lg),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.md),
              itemBuilder: (BuildContext context, int i) => _ActivityCard(activity: items[i]),
            );
          },
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.go(AppRoutes.create),
        icon: const Icon(Icons.add),
        label: const Text('创建'),
      ),
    );
  }
}

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
                  _TypeChip(type: activity.type),
                  const Spacer(),
                  Text(
                    '${activity.currentParticipants}/${activity.maxParticipants}',
                    style: context.text.bodySmall,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(activity.title, style: context.text.titleLarge),
              if (activity.location?.placeName != null) ...<Widget>[
                const SizedBox(height: AppSpacing.xs),
                Row(
                  children: <Widget>[
                    Icon(Icons.place_outlined, size: 16, color: context.colorScheme.outline),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        activity.location!.placeName!,
                        style: context.text.bodySmall,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _TypeChip extends StatelessWidget {
  const _TypeChip({required this.type});
  final ActivityType type;

  Color _color(BuildContext context) {
    switch (type) {
      case ActivityType.study:
        return AppColors.activityStudy;
      case ActivityType.sport:
        return AppColors.activitySport;
      case ActivityType.boardgame:
        return AppColors.activityBoardgame;
      case ActivityType.game:
        return AppColors.activityGame;
      case ActivityType.other:
        return AppColors.activityOther;
    }
  }

  @override
  Widget build(BuildContext context) {
    final Color c = _color(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: c.withOpacity(0.12),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Text(
        type.label,
        style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}
