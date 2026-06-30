// GENERATED from docs/api/openapi.json by tools/codegen-dart.mjs.
// Do not edit by hand — re-run `pnpm run openapi:codegen` after spec changes.

class Creator {
  const Creator({
    required id,
    required nickname,
    this.avatar = null,
  });

  final String id;
  final String nickname;
  final String? avatar;

  factory Creator.fromJson(Map<String, dynamic> json) => Creator(
    id: json['id'] as String,
    nickname: json['nickname'] as String,
    avatar: (json['avatar'] == null ? null : json['avatar'] as String),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'nickname': nickname,
    'avatar': avatar,
  };
}
