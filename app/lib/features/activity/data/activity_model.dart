// Activity data model — matches the M2 backend contract exactly.
//
// Hard rules (issue #23):
//   - `type` is UPPERCASE: STUDY / SPORTS / BOARD_GAME / ONLINE_GAME / OTHER
//   - `status` is UPPERCASE: RECRUITING / FULL / STARTED / ENDED / CANCELED
//   - Location is flat: locationName / locationAddr / locationLat / locationLng
//   - Participants: maxParticipants / currentCount
//   - Detail endpoint returns `isJoined` (default false if not authenticated)
//
// We intentionally do NOT use the legacy scaffold types
// (lowercase enum + nested location object) — see the old
// `lib/shared/models/activity.dart` for the deprecated definition that the
// create form (issue #33) will replace.
//
// JSON conventions: the server uses snake-free camelCase keys (locationName
// not location_name), so we don't need @JsonKey remapping.

/// Activity type — must stay in sync with the server `activityTypeSchema` in
/// `server/src/modules/activity/index.ts`. New values are added server-side
/// first; this enum follows.
enum ActivityType {
  study('STUDY', '自习'),
  sports('SPORTS', '运动'),
  boardGame('BOARD_GAME', '桌游'),
  onlineGame('ONLINE_GAME', '开黑'),
  other('OTHER', '其他');

  const ActivityType(this.wire, this.label);
  final String wire;
  final String label;

  static ActivityType fromWire(String value) {
    for (final ActivityType t in ActivityType.values) {
      if (t.wire == value) return t;
    }
    return ActivityType.other;
  }
}

/// Activity status — must stay in sync with the server `activityStatusSchema`.
enum ActivityStatus {
  recruiting('RECRUITING', '招募中'),
  full('FULL', '已满员'),
  started('STARTED', '进行中'),
  ended('ENDED', '已结束'),
  canceled('CANCELED', '已取消');

  const ActivityStatus(this.wire, this.label);
  final String wire;
  final String label;

  static ActivityStatus fromWire(String value) {
    for (final ActivityStatus s in ActivityStatus.values) {
      if (s.wire == value) return s;
    }
    return ActivityStatus.canceled;
  }

  /// Statuses a non-creator user can still sign up to.
  bool get isRecruiting => this == ActivityStatus.recruiting;
}

/// Activity entity (GET /api/v1/activities/:id).
class Activity {
  const Activity({
    required this.id,
    required this.type,
    required this.title,
    required this.description,
    required this.coverUrl,
    required this.locationName,
    required this.locationAddr,
    required this.locationLat,
    required this.locationLng,
    required this.startTime,
    required this.endTime,
    required this.maxParticipants,
    required this.currentCount,
    required this.tags,
    required this.status,
    required this.creatorId,
    required this.createdAt,
    required this.updatedAt,
    this.isJoined = false,
  });

  final String id;
  final ActivityType type;
  final String title;
  final String description;
  final String? coverUrl;

  // Flat location fields per M2 contract.
  final String locationName;
  final String locationAddr;
  final double locationLat;
  final double locationLng;

  // ISO-8601 strings — kept as String (not DateTime) to avoid timezone bugs
  // and to match the miniprogram/types/activity.ts shape exactly.
  final String startTime;
  final String endTime;

  final int maxParticipants;
  final int currentCount;
  final List<String> tags;
  final ActivityStatus status;
  final String creatorId;

  final String createdAt;
  final String updatedAt;

  /// Only populated by the detail endpoint. False when the request is
  /// anonymous or the user has not signed up.
  final bool isJoined;

  factory Activity.fromJson(Map<String, dynamic> json) {
    return Activity(
      id: json['id'] as String,
      type: ActivityType.fromWire(json['type'] as String? ?? ''),
      title: (json['title'] as String?) ?? '',
      description: (json['description'] as String?) ?? '',
      coverUrl: json['coverUrl'] as String?,
      locationName: (json['locationName'] as String?) ?? '',
      locationAddr: (json['locationAddr'] as String?) ?? '',
      locationLat: (json['locationLat'] as num?)?.toDouble() ?? 0.0,
      locationLng: (json['locationLng'] as num?)?.toDouble() ?? 0.0,
      startTime: (json['startTime'] as String?) ?? '',
      endTime: (json['endTime'] as String?) ?? '',
      maxParticipants: (json['maxParticipants'] as num?)?.toInt() ?? 0,
      currentCount: (json['currentCount'] as num?)?.toInt() ?? 0,
      tags: (json['tags'] as List<dynamic>?)?.cast<String>() ?? const <String>[],
      status: ActivityStatus.fromWire(json['status'] as String? ?? ''),
      creatorId: (json['creatorId'] as String?) ?? '',
      createdAt: (json['createdAt'] as String?) ?? '',
      updatedAt: (json['updatedAt'] as String?) ?? '',
      isJoined: json['isJoined'] as bool? ?? false,
    );
  }

  Activity copyWith({
    int? currentCount,
    ActivityStatus? status,
    bool? isJoined,
  }) {
    return Activity(
      id: id,
      type: type,
      title: title,
      description: description,
      coverUrl: coverUrl,
      locationName: locationName,
      locationAddr: locationAddr,
      locationLat: locationLat,
      locationLng: locationLng,
      startTime: startTime,
      endTime: endTime,
      maxParticipants: maxParticipants,
      currentCount: currentCount ?? this.currentCount,
      tags: tags,
      status: status ?? this.status,
      creatorId: creatorId,
      createdAt: createdAt,
      updatedAt: updatedAt,
      isJoined: isJoined ?? this.isJoined,
    );
  }
}

/// List response envelope (GET /api/v1/activities).
class ActivityListResponse {
  const ActivityListResponse({
    required this.data,
    required this.total,
    required this.page,
    required this.pageSize,
  });

  final List<Activity> data;
  final int total;
  final int page;
  final int pageSize;

  bool get hasMore => page * pageSize < total;

  factory ActivityListResponse.fromJson(Map<String, dynamic> json) {
    final List<dynamic> raw = (json['data'] as List<dynamic>?) ?? const <dynamic>[];
    return ActivityListResponse(
      data: raw
          .whereType<Map<String, dynamic>>()
          .map(Activity.fromJson)
          .toList(growable: false),
      total: (json['total'] as num?)?.toInt() ?? 0,
      page: (json['page'] as num?)?.toInt() ?? 1,
      pageSize: (json['pageSize'] as num?)?.toInt() ?? 20,
    );
  }
}

/// Filter for the activity list endpoint. Both fields are optional and
/// serialised as query params by [ActivityApi.list].
class ActivityListQuery {
  const ActivityListQuery({
    this.type,
    this.status,
    this.city,
    this.page = 1,
    this.pageSize = 20,
  });

  final ActivityType? type;
  final ActivityStatus? status;
  final String? city;
  final int page;
  final int pageSize;

  ActivityListQuery copyWith({
    int? page,
    int? pageSize,
    ActivityType? type,
    ActivityStatus? status,
  }) {
    return ActivityListQuery(
      type: type ?? this.type,
      status: status ?? this.status,
      city: city,
      page: page ?? this.page,
      pageSize: pageSize ?? this.pageSize,
    );
  }

  Map<String, dynamic> toQueryMap() {
    final Map<String, dynamic> m = <String, dynamic>{
      'page': page,
      'pageSize': pageSize,
    };
    if (type != null) m['type'] = type!.wire;
    if (status != null) m['status'] = status!.wire;
    if (city != null && city!.isNotEmpty) m['city'] = city;
    return m;
  }
}

/// Payload for POST /api/v1/activities.
/// Not used in this PR (create form is issue #33) but defined here so the
/// API client signature is complete and the type lives next to the rest of
/// the activity contract.
class CreateActivityPayload {
  const CreateActivityPayload({
    required this.type,
    required this.title,
    required this.description,
    required this.locationName,
    required this.locationAddr,
    required this.locationLat,
    required this.locationLng,
    required this.startTime,
    required this.endTime,
    required this.maxParticipants,
    this.coverUrl,
    this.tags = const <String>[],
  });

  final ActivityType type;
  final String title;
  final String description;
  final String? coverUrl;
  final String locationName;
  final String locationAddr;
  final double locationLat;
  final double locationLng;
  final String startTime;
  final String endTime;
  final int maxParticipants;
  final List<String> tags;

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'type': type.wire,
      'title': title,
      'description': description,
      if (coverUrl != null) 'coverUrl': coverUrl,
      'location': <String, dynamic>{
        'name': locationName,
        'addr': locationAddr,
        'lat': locationLat,
        'lng': locationLng,
      },
      'startTime': startTime,
      'endTime': endTime,
      'maxParticipants': maxParticipants,
      if (tags.isNotEmpty) 'tags': tags,
    };
  }
}

/// Payload for PATCH /api/v1/activities/:id (creator only).
class UpdateActivityPayload {
  const UpdateActivityPayload({
    this.title,
    this.description,
    this.coverUrl,
    this.startTime,
    this.endTime,
    this.maxParticipants,
    this.tags,
  });

  final String? title;
  final String? description;
  final Object? coverUrl = null; // null = explicit null (clear); absent = leave alone
  final String? startTime;
  final String? endTime;
  final int? maxParticipants;
  final List<String>? tags;

  Map<String, dynamic> toJson() {
    final Map<String, dynamic> m = <String, dynamic>{};
    if (title != null) m['title'] = title;
    if (description != null) m['description'] = description;
    if (coverUrl != null) m['coverUrl'] = coverUrl;
    if (startTime != null) m['startTime'] = startTime;
    if (endTime != null) m['endTime'] = endTime;
    if (maxParticipants != null) m['maxParticipants'] = maxParticipants;
    if (tags != null) m['tags'] = tags;
    return m;
  }
}

/// Signup status (server Prisma `SignupStatus`).
enum SignupStatus { pending, approved, rejected, canceled }

extension SignupStatusWire on SignupStatus {
  String get wire {
    switch (this) {
      case SignupStatus.pending:
        return 'PENDING';
      case SignupStatus.approved:
        return 'APPROVED';
      case SignupStatus.rejected:
        return 'REJECTED';
      case SignupStatus.canceled:
        return 'CANCELED';
    }
  }

  static SignupStatus fromWire(String? value) {
    switch (value) {
      case 'PENDING':
        return SignupStatus.pending;
      case 'APPROVED':
        return SignupStatus.approved;
      case 'REJECTED':
        return SignupStatus.rejected;
      case 'CANCELED':
        return SignupStatus.canceled;
      default:
        return SignupStatus.pending;
    }
  }
}

/// One signup record (embedded in POST /signup response).
class SignupRecord {
  const SignupRecord({
    required this.id,
    required this.activityId,
    required this.userId,
    required this.status,
    required this.signedAt,
    this.canceledAt,
  });

  final String id;
  final String activityId;
  final String userId;
  final SignupStatus status;
  final String signedAt;
  final String? canceledAt;

  factory SignupRecord.fromJson(Map<String, dynamic> json) {
    return SignupRecord(
      id: json['id'] as String,
      activityId: json['activityId'] as String,
      userId: json['userId'] as String,
      status: SignupStatusWire.fromWire(json['status'] as String?),
      signedAt: (json['signedAt'] as String?) ?? '',
      canceledAt: json['canceledAt'] as String?,
    );
  }
}

/// Response for POST /api/v1/activities/:id/signup.
class SignupResult {
  const SignupResult({
    required this.signup,
    required this.newCount,
    required this.isFull,
  });

  final SignupRecord signup;
  final int newCount;
  final bool isFull;

  factory SignupResult.fromJson(Map<String, dynamic> json) {
    final dynamic signupJson = json['signup'];
    return SignupResult(
      signup: SignupRecord.fromJson(
        signupJson is Map<String, dynamic> ? signupJson : const <String, dynamic>{},
      ),
      newCount: (json['newCount'] as num?)?.toInt() ?? 0,
      isFull: json['isFull'] as bool? ?? false,
    );
  }
}

/// Response for DELETE /api/v1/activities/:id/signup.
class CancelSignupResult {
  const CancelSignupResult({
    required this.signupId,
    required this.newCount,
    required this.reopened,
  });

  final String signupId;
  final int newCount;
  final bool reopened;

  factory CancelSignupResult.fromJson(Map<String, dynamic> json) {
    return CancelSignupResult(
      signupId: (json['signupId'] as String?) ?? '',
      newCount: (json['newCount'] as num?)?.toInt() ?? 0,
      reopened: json['reopened'] as bool? ?? false,
    );
  }
}

/// Response for DELETE /api/v1/activities/:id.
class CancelActivityResult {
  const CancelActivityResult({required this.id, required this.status});
  final String id;
  final ActivityStatus status;

  factory CancelActivityResult.fromJson(Map<String, dynamic> json) {
    return CancelActivityResult(
      id: (json['id'] as String?) ?? '',
      status: ActivityStatus.fromWire(json['status'] as String? ?? 'CANCELED'),
    );
  }
}

/// Filter chips for the list screen. Mirrors the miniprogram's
/// `ACTIVITY_TYPE_FILTERS` / `ACTIVITY_STATUS_FILTERS` arrays.
class ActivityFilters {
  static const List<({String label, ActivityType? value})> typeChips =
      <({String label, ActivityType? value})>[
    (label: '全部', value: null),
    (label: '自习', value: ActivityType.study),
    (label: '运动', value: ActivityType.sports),
    (label: '桌游', value: ActivityType.boardGame),
    (label: '开黑', value: ActivityType.onlineGame),
    (label: '其他', value: ActivityType.other),
  ];

  static const List<({String label, ActivityStatus? value})> statusChips =
      <({String label, ActivityStatus? value})>[
    (label: '全部', value: null),
    (label: '招募中', value: ActivityStatus.recruiting),
    (label: '已满员', value: ActivityStatus.full),
    (label: '进行中', value: ActivityStatus.started),
    (label: '已结束', value: ActivityStatus.ended),
  ];
}
