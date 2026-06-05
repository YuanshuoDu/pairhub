// Auth service — Apple + Google sign-in glue.
//
// This file is intentionally platform-agnostic: it depends on the upstream
// sign_in_with_apple and google_sign_in packages, but the rest of the app
// talks only to [AuthService] so we can stub it in tests and (in the future)
// add WeChat / phone-code flows without changing call sites.

import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../../shared/models/user.dart';
import '../network/api_exception.dart';
import '../network/dio_client.dart';

class AuthResult {
  const AuthResult({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });
  final String accessToken;
  final String? refreshToken;
  final User user;
}

abstract class AuthService {
  Future<AuthResult> signInWithApple();
  Future<AuthResult> signInWithGoogle();
  Future<User> fetchCurrentUser();
}

class AuthServiceImpl implements AuthService {
  AuthServiceImpl(this._dio);

  /// Lightweight, transient client used ONLY to call /auth/apple,
  /// /auth/google, /me. The main [Dio] instance is fine here because the
  /// request happens BEFORE the JWT is in secure storage — there's no
  /// recursion risk.
  final Dio _dio;

  @override
  Future<AuthResult> signInWithApple() async {
    // 1. Trigger native Apple sheet.
    final AuthorizationCredentialAppleID apple = await SignInWithApple.getAppleIDCredential(
      scopes: <AppleIDAuthorizationScopes>[
        AppleIDAuthorizationScopes.email,
        AppleIDAuthorizationScopes.fullName,
      ],
      webAuthenticationOptions: WebAuthenticationOptions(
        clientId: dotenv.maybeGet('APPLE_CLIENT_ID') ?? 'com.pairhub.app',
        redirectUri: Uri.parse('https://pairhub.local/callback/apple'),
      ),
    );

    // 2. Hand the identity token to the backend; the server returns a JWT.
    final Response<dynamic> res = await _dio.post<dynamic>(
      '/auth/apple',
      data: <String, dynamic>{
        'identityToken': apple.identityToken,
        'authorizationCode': apple.authorizationCode,
        'email': apple.email,
        'fullName': apple.givenName != null
            ? <String, dynamic>{'given': apple.givenName, 'family': apple.familyName}
            : null,
      },
    );
    return _parseAuthResponse(res);
  }

  @override
  Future<AuthResult> signInWithGoogle() async {
    final GoogleSignIn signIn = GoogleSignIn(
      scopes: <String>['email', 'profile'],
      clientId: dotenv.maybeGet('GOOGLE_WEB_CLIENT_ID'),
    );
    final GoogleSignInAccount? account = await signIn.signIn();
    if (account == null) {
      throw const _UserCancelledException();
    }
    final GoogleSignInAuthentication auth = await account.authentication;
    final Response<dynamic> res = await _dio.post<dynamic>(
      '/auth/google',
      data: <String, dynamic>{
        'idToken': auth.idToken,
        'accessToken': auth.accessToken,
        'email': account.email,
        'displayName': account.displayName,
      },
    );
    return _parseAuthResponse(res);
  }

  @override
  Future<User> fetchCurrentUser() async {
    final Response<dynamic> res = await _dio.get<dynamic>('/me');
    final dynamic data = res.data;
    if (data is! Map<String, dynamic>) {
      throw const UnknownApiException('invalid_user_response');
    }
    return User.fromJson(data);
  }

  AuthResult _parseAuthResponse(Response<dynamic> res) {
    final dynamic data = res.data;
    if (data is! Map<String, dynamic>) {
      throw const UnknownApiException('invalid_auth_response');
    }
    final String access = (data['accessToken'] as String?) ?? '';
    final String? refresh = data['refreshToken'] as String?;
    final dynamic userJson = data['user'];
    if (access.isEmpty || userJson is! Map<String, dynamic>) {
      throw const UnknownApiException('missing_tokens_or_user');
    }
    return AuthResult(
      accessToken: access,
      refreshToken: refresh,
      user: User.fromJson(userJson),
    );
  }
}

class _UserCancelledException implements Exception {
  const _UserCancelledException();
  @override
  String toString() => 'user_cancelled';
}

/// Riverpod entry point — override at the test root to inject fakes.
final Provider<AuthService> authServiceProvider = Provider<AuthService>(
  (Ref ref) => AuthServiceImpl(ref.watch(dioProvider)),
);
