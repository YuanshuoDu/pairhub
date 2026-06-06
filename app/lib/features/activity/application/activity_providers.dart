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

import 'data/activity_api.dart';
import 'data/activity_model.dart';

export 'data/activity_api.dart' show activityApiProvider;

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

/// First page of activities matching the current filter. We keep it as a
/// `FutureProvider` for now — pagination ("load more") is intentionally
/// deferred to a follow-up issue; the miniprogram PR #43 ships the same
/// first-page-only behaviour for the list.
final FutureProvider<ActivityListResponse> activityListProvider =
    FutureProvider<ActivityListResponse>((Ref ref) async {
  final ActivityListQuery query = ref.watch(activityListQueryProvider);
  final ActivityApi api = ref.watch(activityApiProvider);
  return api.list(query);
});

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
    final Activity current = state.value;
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
    final Activity current = state.value;
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
    final Activity current = state.value;
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
