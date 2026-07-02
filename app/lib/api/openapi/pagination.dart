// GENERATED from docs/api/openapi.json by tools/codegen-dart.mjs.
// Do not edit by hand — re-run `pnpm run openapi:codegen` after spec changes.

class Pagination {
  const Pagination({
    required total,
    required page,
    required pageSize,
    this.hasMore = false,
  });

  final int total;
  final int page;
  final int pageSize;
  final bool hasMore;

  factory Pagination.fromJson(Map<String, dynamic> json) => Pagination(
    total: json['total'] as int,
    page: json['page'] as int,
    pageSize: json['pageSize'] as int,
    hasMore: json['hasMore'] as bool,
  );

  Map<String, dynamic> toJson() => {
    'total': total,
    'page': page,
    'pageSize': pageSize,
    'hasMore': hasMore,
  };
}
