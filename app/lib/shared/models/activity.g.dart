// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'activity.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$GeoPointImpl _$$GeoPointImplFromJson(Map<String, dynamic> json) =>
    _$GeoPointImpl(
      lat: (json['lat'] as num).toDouble(),
      lng: (json['lng'] as num).toDouble(),
      address: json['address'] as String?,
      placeName: json['place_name'] as String?,
    );

Map<String, dynamic> _$$GeoPointImplToJson(_$GeoPointImpl instance) =>
    <String, dynamic>{
      'lat': instance.lat,
      'lng': instance.lng,
      'address': instance.address,
      'place_name': instance.placeName,
    };

_$ActivityImpl _$$ActivityImplFromJson(Map<String, dynamic> json) =>
    _$ActivityImpl(
      id: json['id'] as String,
      creatorId: json['creator_id'] as String,
      type: $enumDecode(_$ActivityTypeEnumMap, json['type']),
      title: json['title'] as String,
      description: json['description'] as String?,
      location: json['location'] == null
          ? null
          : GeoPoint.fromJson(json['location'] as Map<String, dynamic>),
      startTime: DateTime.parse(json['start_time'] as String),
      endTime: json['end_time'] == null
          ? null
          : DateTime.parse(json['end_time'] as String),
      maxParticipants: (json['max_participants'] as num?)?.toInt() ?? 0,
      currentParticipants: (json['current_participants'] as num?)?.toInt() ?? 0,
      tags:
          (json['tags'] as List<dynamic>?)?.map((e) => e as String).toList() ??
              const <String>[],
      status: json['status'] as String? ?? 'open',
      createdAt: json['created_at'] == null
          ? null
          : DateTime.parse(json['created_at'] as String),
    );

Map<String, dynamic> _$$ActivityImplToJson(_$ActivityImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'creator_id': instance.creatorId,
      'type': _$ActivityTypeEnumMap[instance.type]!,
      'title': instance.title,
      'description': instance.description,
      'location': instance.location,
      'start_time': instance.startTime.toIso8601String(),
      'end_time': instance.endTime?.toIso8601String(),
      'max_participants': instance.maxParticipants,
      'current_participants': instance.currentParticipants,
      'tags': instance.tags,
      'status': instance.status,
      'created_at': instance.createdAt?.toIso8601String(),
    };

const _$ActivityTypeEnumMap = {
  ActivityType.study: 'study',
  ActivityType.sport: 'sport',
  ActivityType.boardgame: 'boardgame',
  ActivityType.game: 'game',
  ActivityType.other: 'other',
};
