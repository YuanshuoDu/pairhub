// Dio HTTP client with:
//   - JWT injection (reads token from secure storage on every request)
//   - 401-driven token refresh + single-flight refresh queue
//   - Structured error mapping (see api_exception.dart)
//   - Lightweight request/response logging (debug builds only)
//
// Exposed to the rest of the app as a Riverpod provider so unit tests can
// override it with a mock client.

import 'dart:async';
import 'dart:developer' as developer;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_state.dart';
import '../storage/secure_storage.dart';
import 'api_exception.dart';

/// Storage keys — kept in one place to avoid typos.
abstract final class TokenKeys {
  static const String access = 'auth.access_token';
  static const String refresh = 'auth.refresh_token';
}

/// Configurable knobs for [dioProvider]. Tests override this with shorter
/// timeouts and a mock base URL.
final Provider<DioConfig> dioConfigProvider = Provider<DioConfig>((Ref ref) {
  return DioConfig(
    baseUrl: dotenv.maybeGet('API_BASE_URL') ?? 'https://api.studybuddy.local',
    connectTimeoutMs: int.tryParse(dotenv.maybeGet('API_TIMEOUT_MS') ?? '') ?? 15000,
    receiveTimeoutMs: int.tryParse(dotenv.maybeGet('API_TIMEOUT_MS') ?? '') ?? 15000,
  );
});

class DioConfig {
  const DioConfig({
    required this.baseUrl,
    required this.connectTimeoutMs,
    required this.receiveTimeoutMs,
  });
  final String baseUrl;
  final int connectTimeoutMs;
  final int receiveTimeoutMs;
}

/// The single Dio instance used by the app.
final Provider<Dio> dioProvider = Provider<Dio>((Ref ref) {
  final DioConfig config = ref.watch(dioConfigProvider);
  final SecureStorage storage = ref.watch(secureStorageProvider);
  final AuthStateNotifier auth = ref.read(authStateProvider.notifier);

  final Dio dio = Dio(
    BaseOptions(
      baseUrl: config.baseUrl,
      connectTimeout: Duration(milliseconds: config.connectTimeoutMs),
      receiveTimeout: Duration(milliseconds: config.receiveTimeoutMs),
      headers: <String, dynamic>{
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      // Treat any 2xx as success; 4xx/5xx go through errorInterceptor.
      validateStatus: (int? status) => status != null && status >= 200 && status < 300,
    ),
  );

  dio.interceptors.add(_JwtAuthInterceptor(storage));
  dio.interceptors.add(_TokenRefreshInterceptor(dio, storage, auth, ref));
  dio.interceptors.add(_ErrorMappingInterceptor());
  if (kDebugMode) {
    dio.interceptors.add(_DebugLogInterceptor());
  }

  ref.onDispose(dio.close);
  return dio;
});

/// Injects `Authorization: Bearer <token>` if a token is present.
class _JwtAuthInterceptor extends Interceptor {
  _JwtAuthInterceptor(this.storage);
  final SecureStorage storage;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final String? token = await storage.readAccessToken();
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }
}

/// On 401, attempts a single refresh; subsequent 401s surface as
/// [UnauthorizedException] and the auth state is reset to logged-out.
///
/// Multiple parallel 401s are coalesced via [_pendingRefresh] so we don't
/// fire N refresh requests for N parallel calls.
class _TokenRefreshInterceptor extends Interceptor {
  _TokenRefreshInterceptor(this.dio, this.storage, this.auth, this.ref);
  final Dio dio;
  final SecureStorage storage;
  final AuthStateNotifier auth;
  final Ref ref;

  Future<String?>? _pendingRefresh;

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final int? status = err.response?.statusCode;
    final bool isAuthCall = err.requestOptions.path.contains('/auth/');
    if (status != 401 || isAuthCall || _retried(err.requestOptions)) {
      handler.next(err);
      return;
    }

    try {
      final Future<String?> pending = _pendingRefresh ??= _doRefresh();
      final String? newToken = await pending;
      if (newToken == null || newToken.isEmpty) {
        await auth.signOut();
        handler.next(err);
        return;
      }

      // Retry the original request with the new token.
      final RequestOptions req = err.requestOptions;
      req.headers['Authorization'] = 'Bearer $newToken';
      req.extra['__retried'] = true;
      final Response<dynamic> response = await dio.fetch<dynamic>(req);
      handler.resolve(response);
    } on DioException catch (e) {
      handler.next(e);
    } finally {
      _pendingRefresh = null;
    }
  }

  Future<String?> _doRefresh() async {
    final String? refresh = await storage.readRefreshToken();
    if (refresh == null || refresh.isEmpty) return null;
    // Use a fresh Dio (no interceptors) to avoid recursion.
    final Dio raw = Dio(BaseOptions(baseUrl: dio.options.baseUrl));
    final Response<dynamic> res = await raw.post<dynamic>(
      '/auth/refresh',
      data: <String, dynamic>{'refreshToken': refresh},
    );
    final dynamic data = res.data;
    if (data is Map<String, dynamic>) {
      final String? newAccess = data['accessToken'] as String?;
      final String? newRefresh = data['refreshToken'] as String?;
      if (newAccess != null) await storage.writeAccessToken(newAccess);
      if (newRefresh != null) await storage.writeRefreshToken(newRefresh);
      return newAccess;
    }
    return null;
  }

  bool _retried(RequestOptions options) {
    final bool retried = options.extra['__retried'] == true;
    return retried;
  }
}

/// Maps [DioException] → [ApiException] so call sites get a stable error type.
class _ErrorMappingInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final ApiException mapped = mapDioException(err);
    handler.reject(
      DioException(
        requestOptions: err.requestOptions,
        response: err.response,
        type: err.type,
        error: mapped,
        stackTrace: err.stackTrace,
        message: mapped.message,
      ),
    );
  }
}

/// Minimal request/response logger. Logs to `developer.log` (visible in
//  `flutter logs` / Xcode console) and is **disabled in release builds**.
class _DebugLogInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    developer.log('→ ${options.method} ${options.uri}', name: 'http');
    handler.next(options);
  }

  @override
  void onResponse(Response<dynamic> response, ResponseInterceptorHandler handler) {
    developer.log('← ${response.statusCode} ${response.requestOptions.uri}', name: 'http');
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    developer.log(
      '✗ ${err.response?.statusCode ?? '-'} ${err.requestOptions.uri} :: ${err.message}',
      name: 'http',
    );
    handler.next(err);
  }
}
