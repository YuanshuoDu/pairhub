// Activity HTTP client.
//
// Mirrors the 8 endpoints exposed by the M2 backend module
// (server/src/modules/activity + server/src/modules/signup) and matches
// the wrapper shape used by the miniprogram
// (miniprogram/api/activity.ts — PR #43):
//
//   GET    /api/v1/activities                       list
//   GET    /api/v1/activities/:id                   detail
//   POST   /api/v1/activities                       create           (auth)
//   PATCH  /api/v1/activities/:id                   update           (auth, creator)
//   DELETE /api/v1/activities/:id                   cancel           (auth, creator)
//   POST   /api/v1/activities/:id/signup            signup           (auth)
//   DELETE /api/v1/activities/:id/signup            cancelSignup     (auth)
//   GET    /api/v1/activities/:id/participants      getParticipants  (issue #32)
//
// Auth: the global JWT injection + 401 refresh + error-mapping interceptors
// are wired in `core/network/dio_client.dart`. This client does NOT touch
// the secure-storage layer directly — every authenticated call simply goes
// through the shared [Dio] instance and the Authorization header is added
// by the interceptor on each request.
//
// Response envelope: Fastify returns `{ data: <payload> }` for these
// endpoints, so each method unwraps `.data` before returning. Errors are
// surfaced as [ApiException] subclasses (see core/network/api_exception.dart).

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_client.dart';
import 'activity_model.dart';

class ActivityApi {
  const ActivityApi(this._dio);

  final Dio _dio;

  /// GET /api/v1/activities
  Future<ActivityListResponse> list([ActivityListQuery query = const ActivityListQuery()]) async {
    final Response<dynamic> res = await _dio.get<dynamic>(
      '/api/v1/activities',
      queryParameters: query.toQueryMap(),
    );
    return _unwrap<List<dynamic>>(res, (dynamic payload) {
      final Map<String, dynamic> map = payload is Map<String, dynamic>
          ? payload
          : <String, dynamic>{'data': payload};
      return ActivityListResponse.fromJson(map);
    });
  }

  /// GET /api/v1/activities/:id
  Future<Activity> getActivity(String id) async {
    final Response<dynamic> res = await _dio.get<dynamic>('/api/v1/activities/$id');
    return _unwrap<dynamic>(res, (dynamic payload) {
      final Map<String, dynamic> map = payload is Map<String, dynamic>
          ? payload
          : <String, dynamic>{};
      return Activity.fromJson(map);
    });
  }

  /// POST /api/v1/activities
  Future<Activity> create(CreateActivityPayload payload) async {
    final Response<dynamic> res = await _dio.post<dynamic>(
      '/api/v1/activities',
      data: payload.toJson(),
    );
    return _unwrap<dynamic>(res, (dynamic payload) {
      final Map<String, dynamic> map = payload is Map<String, dynamic>
          ? payload
          : <String, dynamic>{};
      return Activity.fromJson(map);
    });
  }

  /// PATCH /api/v1/activities/:id
  Future<Activity> update(String id, UpdateActivityPayload payload) async {
    final Response<dynamic> res = await _dio.patch<dynamic>(
      '/api/v1/activities/$id',
      data: payload.toJson(),
    );
    return _unwrap<dynamic>(res, (dynamic payload) {
      final Map<String, dynamic> map = payload is Map<String, dynamic>
          ? payload
          : <String, dynamic>{};
      return Activity.fromJson(map);
    });
  }

  /// DELETE /api/v1/activities/:id  (soft cancel)
  Future<CancelActivityResult> cancel(String id) async {
    final Response<dynamic> res = await _dio.delete<dynamic>('/api/v1/activities/$id');
    return _unwrap<dynamic>(
      res,
      (dynamic payload) => CancelActivityResult.fromJson(
        payload is Map<String, dynamic> ? payload : const <String, dynamic>{},
      ),
    );
  }

  /// POST /api/v1/activities/:id/signup
  Future<SignupResult> signup(String id) async {
    final Response<dynamic> res = await _dio.post<dynamic>('/api/v1/activities/$id/signup');
    return _unwrap<dynamic>(
      res,
      (dynamic payload) => SignupResult.fromJson(
        payload is Map<String, dynamic> ? payload : const <String, dynamic>{},
      ),
    );
  }

  /// DELETE /api/v1/activities/:id/signup
  Future<CancelSignupResult> cancelSignup(String id) async {
    final Response<dynamic> res = await _dio.delete<dynamic>('/api/v1/activities/$id/signup');
    return _unwrap<dynamic>(
      res,
      (dynamic payload) => CancelSignupResult.fromJson(
        payload is Map<String, dynamic> ? payload : const <String, dynamic>{},
      ),
    );
  }

  /// GET /api/v1/activities/:id/participants
  ///
  /// Not yet surfaced in the UI (the participant list lives behind the
  /// review screen in issue #32). Exposed here so the wrapper is complete
  /// and matches the miniprogram 8-method shape.
  Future<List<ParticipantSummary>> getParticipants(
    String id, {
    int page = 1,
    int pageSize = 50,
  }) async {
    final Response<dynamic> res = await _dio.get<dynamic>(
      '/api/v1/activities/$id/participants',
      queryParameters: <String, dynamic>{'page': page, 'pageSize': pageSize},
    );
    return _unwrap<List<dynamic>>(res, (dynamic payload) {
      final List<dynamic> raw = payload is List<dynamic>
          ? payload
          : (payload is Map<String, dynamic> && payload['data'] is List<dynamic>
              ? payload['data'] as List<dynamic>
              : const <dynamic>[]);
      return raw
          .whereType<Map<String, dynamic>>()
          .map(ParticipantSummary.fromJson)
          .toList(growable: false);
    });
  }

  /// Fastify's `reply.send({ data })` envelope: pull `data` out of the JSON
  /// body. If the server returns the payload directly (no envelope) we pass
  /// it through. Anything else becomes an [UnknownApiException].
  T _unwrap<T>(Response<dynamic> res, T Function(dynamic data) parser) {
    final dynamic body = res.data;
    if (body is Map<String, dynamic> && body.containsKey('data')) {
      return parser(body['data']);
    }
    return parser(body);
  }
}

/// One row of GET /api/v1/activities/:id/participants.
class ParticipantSummary {
  const ParticipantSummary({
    required this.userId,
    required this.nickname,
    required this.relation,
    this.avatar,
    this.school,
    required this.signedAt,
  });

  final String userId;
  final String nickname;
  final String? avatar;
  final String? school;

  /// `'creator'` for the activity owner, `'signup'` for an APPROVED signup.
  final String relation;
  final String signedAt;

  factory ParticipantSummary.fromJson(Map<String, dynamic> json) {
    return ParticipantSummary(
      userId: (json['userId'] as String?) ?? '',
      nickname: (json['nickname'] as String?) ?? '',
      avatar: json['avatar'] as String?,
      school: json['school'] as String?,
      relation: (json['relation'] as String?) ?? 'signup',
      signedAt: (json['signedAt'] as String?) ?? '',
    );
  }
}

/// Riverpod entry point. Override in tests with a fake.
final Provider<ActivityApi> activityApiProvider = Provider<ActivityApi>(
  (Ref ref) => ActivityApi(ref.watch(dioProvider)),
);
