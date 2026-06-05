// Unified API exception.
//
// Every Dio error (or non-2xx response) thrown anywhere in the app should be
// funnelled into one of these subclasses so UI code can pattern-match on a
// stable type instead of inspecting Dio internals.

import 'package:dio/dio.dart';

/// Base type for all errors surfaced by the network layer.
sealed class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode, this.requestPath});

  /// Human-readable message safe to show in toasts / banners.
  final String message;

  /// HTTP status code, if applicable. Null for transport errors.
  final int? statusCode;

  /// Path of the request that triggered the error (for logs / Sentry tags).
  final String? requestPath;

  @override
  String toString() => 'ApiException($statusCode, $requestPath): $message';
}

/// No network / DNS / TLS / timeout. 0 status code by convention.
final class NetworkException extends ApiException {
  const NetworkException(super.message, {super.requestPath});
}

/// 4xx — caller did something wrong.
final class ClientException extends ApiException {
  const ClientException(
    super.message, {
    required int super.statusCode,
    super.requestPath,
  });
}

/// 401 specifically — token missing / expired / invalid.
final class UnauthorizedException extends ApiException {
  const UnauthorizedException({
    String message = 'unauthorized',
    super.requestPath,
  }) : super(message, statusCode: 401);
}

/// 403 specifically — token valid but caller lacks the required scope.
final class ForbiddenException extends ApiException {
  const ForbiddenException({
    String message = 'forbidden',
    super.requestPath,
  }) : super(message, statusCode: 403);
}

/// 404 — resource not found.
final class NotFoundException extends ApiException {
  const NotFoundException({
    String message = 'not_found',
    super.requestPath,
  }) : super(message, statusCode: 404);
}

/// 409 — conflict (e.g. duplicate signup).
final class ConflictException extends ApiException {
  const ConflictException({
    String message = 'conflict',
    super.requestPath,
    int statusCode = 409,
  }) : super(message, statusCode: statusCode);
}

/// 5xx — server broke. UI should show "try again later".
final class ServerException extends ApiException {
  const ServerException({
    required int statusCode,
    String message = 'server_error',
    super.requestPath,
  }) : super(message, statusCode: statusCode);
}

/// Anything we don't recognise — keep the original Dio error around for logs.
final class UnknownApiException extends ApiException {
  const UnknownApiException(
    super.message, {
    super.statusCode,
    super.requestPath,
    this.cause,
  });
  final Object? cause;
}

/// Helper that maps a [DioException] into a typed [ApiException].
///
/// We deliberately don't throw inside this function so the call site can
/// choose what to do (e.g. propagate, or swallow and return a fallback).
ApiException mapDioException(DioException error) {
  final String path = error.requestOptions.path;
  switch (error.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.connectionError:
    case DioExceptionType.unknown:
      return NetworkException(
        error.message ?? 'network_error',
        requestPath: path,
      );
    case DioExceptionType.badCertificate:
      return NetworkException('bad_certificate', requestPath: path);
    case DioExceptionType.cancel:
      return UnknownApiException('cancelled', requestPath: path, cause: error);
    case DioExceptionType.badResponse:
      final int? code = error.response?.statusCode;
      final String message = _extractMessage(error.response) ?? 'http_error';
      if (code == 401) {
        return UnauthorizedException(message: message, requestPath: path);
      }
      if (code == 403) {
        return ForbiddenException(message: message, requestPath: path);
      }
      if (code == 404) {
        return NotFoundException(message: message, requestPath: path);
      }
      if (code == 409) {
        return ConflictException(message: message, requestPath: path);
      }
      if (code != null && code >= 400 && code < 500) {
        return ClientException(message, statusCode: code, requestPath: path);
      }
      if (code != null && code >= 500) {
        return ServerException(message: message, statusCode: code, requestPath: path);
      }
      return UnknownApiException(message, statusCode: code, requestPath: path, cause: error);
  }
}

String? _extractMessage(Response<dynamic>? response) {
  final dynamic data = response?.data;
  if (data is Map<String, dynamic>) {
    final dynamic m = data['message'] ?? data['error'] ?? data['msg'];
    if (m is String) return m;
    if (m is List && m.isNotEmpty) return m.first.toString();
  }
  return null;
}
