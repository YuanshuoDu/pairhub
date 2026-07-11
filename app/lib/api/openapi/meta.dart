// GENERATED from docs/api/openapi.json by tools/codegen-dart.mjs.
// Do not edit by hand — re-run `pnpm run openapi:codegen` after spec changes.

class Meta {
  const Meta({
    required this.requestId,
    required this.timestamp,
  });

  final String requestId;
  final DateTime timestamp;

  factory Meta.fromJson(Map<String, dynamic> json) => Meta(
    requestId: json['requestId'] as String,
    timestamp: DateTime.parse(json['timestamp'] as String),
  );

  Map<String, dynamic> toJson() => {
    'requestId': requestId,
    'timestamp': timestamp.toIso8601String(),
  };
}
