// Activity Riverpod providers.
//
// Layer split (this file is the "application" layer):
//   - `activityListQueryProvider` — current filter selection for the list screen.
//   - `activityListProvider`     — paginated list, refetches when the query changes.
//   - `activityDetailProvider`   — AsyncNotifier per activityId with a `signup` /
//     `cancelSignup` / `cancelActivity` action that mutates the cached
//     activity in place so the UI doesn't have to refetch.
//
// The data-layer `activityApiProvider` (data/activity_api.dart) is re-exported
// from this file so presentation code only has to import
// `application/activity_providers.dart`.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/activity_api.dart';
import '../data/activity_model.dart';

export '../data/activity_api.dart' show activityApiProvider;

// ---------------------------------------------------------------------------
// List screen
// ---------------------------------------------------------------------------

/// Current filter selection for the activity list screen. The list screen
/// reads + writes this provider; the [activityListProvider] watches it.
class ActivityListQueryController extends StateNotifier<ActivityListQuery> {
  ActivityListQueryController() : super(const ActivityListQuery());

  /// Set or clear the type filter. Pass `null` to clear.
  void setType(ActivityType? type) {
    state = ActivityListQuery(
      type: type,
      status: state.status,
      city: state.city,
      page: 1,
      pageSize: state.pageSize,
    );
  }

  /// Set or clear the status filter. Pass `null` to clear.
  void setStatus(ActivityStatus? status) {
    state = ActivityListQuery(
      type: state.type,
      status: status,
      city: state.city,
      page: 1,
      pageSize: state.pageSize,
    );
  }

  void reset() {
    state = const ActivityListQuery();
  }
}

final StateNotifierProvider<ActivityListQueryController, ActivityListQuery>
    activityListQueryProvider =
    StateNotifierProvider<ActivityListQueryController, ActivityListQuery>(
  (Ref ref) => ActivityListQueryController(),
);

/// Paginated activity list state for the screen.
///
/// Holds an in-memory list of fetched activities, tracks the next page
/// to request, and exposes `loadMore` / `refresh` actions. The list
/// is reset to the first page whenever the [activityListQueryProvider]
/// changes (filter chip toggled).
///
/// Issue #25.
class ActivityListState {
  const ActivityListState({
    this.items = const <Activity>[],
    this.page = 1,
    this.pageSize = 20,
    this.hasMore = true,
    this.isLoadingMore = false,
    this.total = 0,
  });

  final List<Activity> items;
  final int page;
  final int pageSize;
  final bool hasMore;
  final bool isLoadingMore;
  final int total;

  ActivityListState copyWith({
    List<Activity>? items,
    int? page,
    int? pageSize,
    bool? hasMore,
    bool? isLoadingMore,
    int? total,
  }) {
    return ActivityListState(
      items: items ?? this.items,
      page: page ?? this.page,
      pageSize: pageSize ?? this.pageSize,
      hasMore: hasMore ?? this.hasMore,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      total: total ?? this.total,
    );
  }
}

/// Manages the paginated list. Watches the filter query — whenever it
/// changes, the next `build` resets to page 1. The `loadMore` action
/// appends to the list and bumps the page counter.
class ActivityListController
    extends AutoDisposeFamilyAsyncNotifier<ActivityListState, int> {
  // int is unused; family is required to invalidate on a logical key.
  // The screen reads the filter via [activityListQueryProvider], so we
  // pass `0` as the family key (only one instance at a time).

  ActivityApi get _api => ref.read(activityApiProvider);

  @override
  Future<ActivityListState> build(int _ignored) async {
    // Reset to page 1 whenever the filter changes.
    final ActivityListQuery query = ref.watch(activityListQueryProvider);
    final ActivityApi api = ref.watch(activityApiProvider);
    final ActivityListResponse res = await api.list(query.copyWith(page: 1));
    return ActivityListState(
      items: res.data,
      page: 2,
      pageSize: res.pageSize,
      hasMore: res.resolveHasMore(),
      total: res.total,
    );
  }

  /// Fetch the next page and append to the list. No-op if already
  /// loading or if there are no more pages.
  Future<void> loadMore() async {
    final ActivityListState? current = state.value;
    if (current == null) return;
    if (current.isLoadingMore || !current.hasMore) return;
    state = AsyncValue<ActivityListState>.data(
      current.copyWith(isLoadingMore: true),
    );
    try {
      final ActivityListQuery query = ref.read(activityListQueryProvider);
      final ActivityApi api = ref.read(activityApiProvider);
      final ActivityListResponse res = await api.list(
        query.copyWith(page: current.page),
      );
      state = AsyncValue<ActivityListState>.data(current.copyWith(
        items: [...current.items, ...res.data],
        page: current.page + 1,
        hasMore: res.resolveHasMore(),
        isLoadingMore: false,
        total: res.total,
      ));
    } catch (e, st) {
      state = AsyncValue<ActivityListState>.error(e, st)
          .copyWithPrevious(state);
      // Re-emit previous data with isLoadingMore=false so the UI can
      // show a retry footer instead of a hard error.
      state = AsyncValue<ActivityListState>.data(
        current.copyWith(isLoadingMore: false),
      );
    }
  }

  /// Pull-to-refresh: reset to page 1.
  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }
}

final AutoDisposeAsyncNotifierProviderFamily<ActivityListController,
        ActivityListState, int> activityListProvider =
    AsyncNotifierProvider.autoDispose
        .family<ActivityListController, ActivityListState, int>(
  ActivityListController.new,
);

// ---------------------------------------------------------------------------
// Detail screen
// ---------------------------------------------------------------------------

/// One cached detail fetch + signup / cancel action.
///
/// Use `ref.watch(activityDetailProvider(id))` in a widget; the result is an
/// `AsyncValue<Activity>`. After a successful signup/cancel the controller
/// patches its internal state in place (currentCount / status / isJoined) so
/// subscribers re-render without an extra round-trip.
class ActivityDetailController
    extends AutoDisposeFamilyAsyncNotifier<Activity, String> {
  ActivityApi get _api => ref.read(activityApiProvider);

  @override
  Future<Activity> build(String activityId) async {
    if (activityId.isEmpty) {
      throw StateError('activity_id_missing');
    }
    return _api.getActivity(activityId);
  }

  /// Sign the current user up for the activity. The cached [Activity] is
  /// updated: currentCount bumps, isJoined → true, and the status flips to
  /// FULL if the server reports `isFull`.
  Future<Activity> signup() async {
    final Activity? current = state.value;
    if (current == null) {
      throw StateError('signup() called before detail was loaded');
    }
    final SignupResult result = await _api.signup(current.id);
    final Activity next = current.copyWith(
      currentCount: result.newCount,
      status: result.isFull ? ActivityStatus.full : current.status,
      isJoined: true,
    );
    state = AsyncValue<Activity>.data(next);
    return next;
  }

  /// Cancel the current user's signup. The cached [Activity] is updated:
  /// currentCount drops, isJoined → false, and the status re-opens to
  /// RECRUITING if the server reports `reopened`.
  Future<Activity> cancelSignup() async {
    final Activity? current = state.value;
    if (current == null) {
      throw StateError('cancelSignup() called before detail was loaded');
    }
    final CancelSignupResult result = await _api.cancelSignup(current.id);
    final Activity next = current.copyWith(
      currentCount: result.newCount,
      status: result.reopened ? ActivityStatus.recruiting : current.status,
      isJoined: false,
    );
    state = AsyncValue<Activity>.data(next);
    return next;
  }

  /// Refresh from the network (pull-to-refresh on the detail screen).
  Future<void> refresh() async {
    state = const AsyncValue<Activity>.loading();
    state = await AsyncValue.guard<Activity>(() => _api.getActivity(arg));
  }

  /// Cancel the activity (creator only). The detail is refreshed so the
  /// local copy reflects the new CANCELED status.
  Future<Activity> cancelActivity() async {
    final Activity? current = state.value;
    if (current == null) {
      throw StateError('cancelActivity() called before detail was loaded');
    }
    await _api.cancel(current.id);
    await refresh();
    return state.value ?? current;
  }
}

final AutoDisposeAsyncNotifierProviderFamily<ActivityDetailController, Activity, String>
    activityDetailProvider =
    AsyncNotifierProvider.autoDispose
        .family<ActivityDetailController, Activity, String>(
  ActivityDetailController.new,
);
