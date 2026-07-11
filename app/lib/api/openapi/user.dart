// GENERATED from docs/api/openapi.json by tools/codegen-dart.mjs.
// Do not edit by hand — re-run `pnpm run openapi:codegen` after spec changes.

enum UserRole {
  user,
  admin,
}

extension UserRoleWire on UserRole {
  String get wire {
    switch (this) {
      case UserRole.user: return 'USER';
      case UserRole.admin: return 'ADMIN';
    }
  }

  static UserRole fromWire(String wire) {
    switch (wire) {
      case 'USER': return UserRole.user;
      case 'ADMIN': return UserRole.admin;
      default: throw ArgumentError.value(wire, 'wire', 'unknown UserRole value');
    }
  }
}

enum UserStatus {
  active,
  banned,
  deleted,
}

extension UserStatusWire on UserStatus {
  String get wire {
    switch (this) {
      case UserStatus.active: return 'ACTIVE';
      case UserStatus.banned: return 'BANNED';
      case UserStatus.deleted: return 'DELETED';
    }
  }

  static UserStatus fromWire(String wire) {
    switch (wire) {
      case 'ACTIVE': return UserStatus.active;
      case 'BANNED': return UserStatus.banned;
      case 'DELETED': return UserStatus.deleted;
      default: throw ArgumentError.value(wire, 'wire', 'unknown UserStatus value');
    }
  }
}

class User {
  const User({
    required this.id,
    required this.nickname,
    this.avatar = null,
    this.school = null,
    this.major = null,
    this.grade = null,
    this.bio = null,
    required this.role,
    required this.status,
    required this.createdAt,
    this.deletedAt = null,
  });

  final String id;
  final String nickname;
  final String? avatar;
  final String? school;
  final String? major;
  final String? grade;
  final String? bio;
  final UserRole role;
  final UserStatus status;
  final DateTime createdAt;
  final DateTime? deletedAt;

  factory User.fromJson(Map<String, dynamic> json) => User(
    id: json['id'] as String,
    nickname: json['nickname'] as String,
    avatar: (json['avatar'] == null ? null : json['avatar'] as String),
    school: (json['school'] == null ? null : json['school'] as String),
    major: (json['major'] == null ? null : json['major'] as String),
    grade: (json['grade'] == null ? null : json['grade'] as String),
    bio: (json['bio'] == null ? null : json['bio'] as String),
    role: UserRoleWire.fromWire(json['role'] as String),
    status: UserStatusWire.fromWire(json['status'] as String),
    createdAt: DateTime.parse(json['createdAt'] as String),
    deletedAt: (json['deletedAt'] == null ? null : DateTime.parse(json['deletedAt'] as String)),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'nickname': nickname,
    'avatar': avatar,
    'school': school,
    'major': major,
    'grade': grade,
    'bio': bio,
    'role': role.wire,
    'status': status.wire,
    'createdAt': createdAt.toIso8601String(),
    'deletedAt': deletedAt?.toIso8601String(),
  };
}
