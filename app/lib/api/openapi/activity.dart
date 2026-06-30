// GENERATED from docs/api/openapi.json by tools/codegen-dart.mjs.
// Do not edit by hand — re-run `pnpm run openapi:codegen` after spec changes.

import 'creator.dart';

enum ActivityType {
  study,
  sports,
  boardGame,
  onlineGame,
  other,
}

extension ActivityTypeWire on ActivityType {
  String get wire {
    switch (this) {
      case ActivityType.study: return 'STUDY';
      case ActivityType.sports: return 'SPORTS';
      case ActivityType.boardGame: return 'BOARD_GAME';
      case ActivityType.onlineGame: return 'ONLINE_GAME';
      case ActivityType.other: return 'OTHER';
    }
  }

  static ActivityType fromWire(String wire) {
    switch (wire) {
      case 'STUDY': return ActivityType.study;
      case 'SPORTS': return ActivityType.sports;
      case 'BOARD_GAME': return ActivityType.boardGame;
      case 'ONLINE_GAME': return ActivityType.onlineGame;
      case 'OTHER': return ActivityType.other;
      default: throw ArgumentError.value(wire, 'wire', 'unknown ActivityType value');
    }
  }
}

enum ActivityStatus {
  recruiting,
  full,
  started,
  ended,
  canceled,
}

extension ActivityStatusWire on ActivityStatus {
  String get wire {
    switch (this) {
      case ActivityStatus.recruiting: return 'RECRUITING';
      case ActivityStatus.full: return 'FULL';
      case ActivityStatus.started: return 'STARTED';
      case ActivityStatus.ended: return 'ENDED';
      case ActivityStatus.canceled: return 'CANCELED';
    }
  }

  static ActivityStatus fromWire(String wire) {
    switch (wire) {
      case 'RECRUITING': return ActivityStatus.recruiting;
      case 'FULL': return ActivityStatus.full;
      case 'STARTED': return ActivityStatus.started;
      case 'ENDED': return ActivityStatus.ended;
      case 'CANCELED': return ActivityStatus.canceled;
      default: throw ArgumentError.value(wire, 'wire', 'unknown ActivityStatus value');
    }
  }
}

class Activity {
  const Activity({
    required id,
    required creator,
    required type,
    required title,
    this.description = '',
    this.locationName = '',
    this.locationAddr = '',
    this.locationLat = 0,
    this.locationLng = 0,
    required startTime,
    required endTime,
    required maxParticipants,
    required currentCount,
    required status,
    this.tags = const [],
    required createdAt,
  });

  final String id;
  final Creator creator;
  final ActivityType type;
  final String title;
  final String description;
  final String locationName;
  final String locationAddr;
  final double locationLat;
  final double locationLng;
  final DateTime startTime;
  final DateTime endTime;
  final int maxParticipants;
  final int currentCount;
  final ActivityStatus status;
  final List<String> tags;
  final DateTime createdAt;

  factory Activity.fromJson(Map<String, dynamic> json) => Activity(
    id: json['id'] as String,
    creator: Creator.fromJson(json['creator'] as Map<String, dynamic>),
    type: ActivityTypeWire.fromWire(json['type'] as String),
    title: json['title'] as String,
    description: json['description'] as String,
    locationName: json['locationName'] as String,
    locationAddr: json['locationAddr'] as String,
    locationLat: json['locationLat'] as double,
    locationLng: json['locationLng'] as double,
    startTime: DateTime.parse(json['startTime'] as String),
    endTime: DateTime.parse(json['endTime'] as String),
    maxParticipants: json['maxParticipants'] as int,
    currentCount: json['currentCount'] as int,
    status: ActivityStatusWire.fromWire(json['status'] as String),
    tags: (json['tags'] as List<dynamic>).map((e) => e as String).toList(),
    createdAt: DateTime.parse(json['createdAt'] as String),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'creator': creator.toJson(),
    'type': type.wire,
    'title': title,
    'description': description,
    'locationName': locationName,
    'locationAddr': locationAddr,
    'locationLat': locationLat,
    'locationLng': locationLng,
    'startTime': startTime.toIso8601String(),
    'endTime': endTime.toIso8601String(),
    'maxParticipants': maxParticipants,
    'currentCount': currentCount,
    'status': status.wire,
    'tags': tags,
    'createdAt': createdAt.toIso8601String(),
  };
}
