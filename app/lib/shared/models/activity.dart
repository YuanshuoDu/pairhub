// Activity data model.
//
// Freezed + json_serializable. The generated parts live next to this file
// after `dart run build_runner build` is run.

import 'package:freezed_annotation/freezed_annotation.dart';

part 'activity.freezed.dart';
part 'activity.g.dart';

/// Activity type enum (mirrors the backend string set).
enum ActivityType {
  @JsonValue('study')
  study,
  @JsonValue('sport')
  sport,
  @JsonValue('boardgame')
  boardgame,
  @JsonValue('game')
  game,
  @JsonValue('other')
  other,
}

extension ActivityTypeLabel on ActivityType {
  String get label {
    switch (this) {
      case ActivityType.study:
        return '自习';
      case ActivityType.sport:
        return '运动';
      case ActivityType.boardgame:
        return '桌游';
      case ActivityType.game:
        return '开黑';
      case ActivityType.other:
        return '其他';
    }
  }
}

@freezed
class GeoPoint with _$GeoPoint {
  const factory GeoPoint({
    required double lat,
    required double lng,
    @JsonKey(name: 'address') String? address,
    @JsonKey(name: 'place_name') String? placeName,
  }) = _GeoPoint;

  factory GeoPoint.fromJson(Map<String, dynamic> json) => _$GeoPointFromJson(json);
}

@freezed
class Activity with _$Activity {
  const factory Activity({
    required String id,
    @JsonKey(name: 'creator_id') required String creatorId,
    required ActivityType type,
    required String title,
    @JsonKey(name: 'start_time') required DateTime startTime,
    @JsonKey(name: 'description') String? description,
    @JsonKey(name: 'location') GeoPoint? location,
    @JsonKey(name: 'end_time') DateTime? endTime,
    @JsonKey(name: 'max_participants') @Default(0) int maxParticipants,
    @JsonKey(name: 'current_participants') @Default(0) int currentParticipants,
    @Default(<String>[]) List<String> tags,
    @JsonKey(name: 'status') @Default('open') String status,
    @JsonKey(name: 'created_at') DateTime? createdAt,
  }) = _Activity;

  factory Activity.fromJson(Map<String, dynamic> json) => _$ActivityFromJson(json);
}
