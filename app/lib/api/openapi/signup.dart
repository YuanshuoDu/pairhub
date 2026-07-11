// GENERATED from docs/api/openapi.json by tools/codegen-dart.mjs.
// Do not edit by hand — re-run `pnpm run openapi:codegen` after spec changes.

import 'creator.dart';

enum SignupStatus {
  approved,
  canceled,
  kicked,
}

extension SignupStatusWire on SignupStatus {
  String get wire {
    switch (this) {
      case SignupStatus.approved: return 'APPROVED';
      case SignupStatus.canceled: return 'CANCELED';
      case SignupStatus.kicked: return 'KICKED';
    }
  }

  static SignupStatus fromWire(String wire) {
    switch (wire) {
      case 'APPROVED': return SignupStatus.approved;
      case 'CANCELED': return SignupStatus.canceled;
      case 'KICKED': return SignupStatus.kicked;
      default: throw ArgumentError.value(wire, 'wire', 'unknown SignupStatus value');
    }
  }
}

class Signup {
  const Signup({
    required this.id,
    required this.activityId,
    required this.user,
    required this.status,
    this.message = null,
    required this.signedAt,
  });

  final String id;
  final String activityId;
  final Creator user;
  final SignupStatus status;
  final String? message;
  final DateTime signedAt;

  factory Signup.fromJson(Map<String, dynamic> json) => Signup(
    id: json['id'] as String,
    activityId: json['activityId'] as String,
    user: Creator.fromJson(json['user'] as Map<String, dynamic>),
    status: SignupStatusWire.fromWire(json['status'] as String),
    message: (json['message'] == null ? null : json['message'] as String),
    signedAt: DateTime.parse(json['signedAt'] as String),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'activityId': activityId,
    'user': user.toJson(),
    'status': status.wire,
    'message': message,
    'signedAt': signedAt.toIso8601String(),
  };
}
