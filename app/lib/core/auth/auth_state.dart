// Auth state + provider.
//
// We split the state model into three concerns:
//   - AuthStatus: enum (unknown / unauthenticated / authenticated)
//   - AuthState:  immutable value object (status + user + error message)
//   - AuthStateNotifier: performs sign-in / sign-out side effects
//
// `unknown` is the bootstrap state — we don't know if there's a token until
// the secure storage read finishes. The router treats `unknown` as
// "unauthenticated" so we always land on /login first.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/models/user.dart';
import '../storage/secure_storage.dart';
import 'auth_service.dart';

enum AuthStatus { unknown, unauthenticated, authenticated }

class AuthState {
  const AuthState({
    this.status = AuthStatus.unknown,
    this.user,
    this.errorMessage,
  });

  final AuthStatus status;
  final User? user;
  final String? errorMessage;

  AuthState copyWith({
    AuthStatus? status,
    User? user,
    String? errorMessage,
    bool clearError = false,
    bool clearUser = false,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: clearUser ? null : (user ?? this.user),
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

class AuthStateNotifier extends StateNotifier<AuthState> {
  AuthStateNotifier({
    required AuthService authService,
    required SecureStorage storage,
  })  : _authService = authService,
        _storage = storage,
        super(const AuthState());

  final AuthService _authService;
  final SecureStorage _storage;

  /// Called once on app startup. Reads tokens from secure storage and, if
  /// present, hydrates the user via [AuthService.fetchCurrentUser].
  Future<void> bootstrap() async {
    final String? token = await _storage.readAccessToken();
    if (token == null || token.isEmpty) {
      state = const AuthState(status: AuthStatus.unauthenticated);
      return;
    }
    try {
      final User user = await _authService.fetchCurrentUser();
      state = AuthState(status: AuthStatus.authenticated, user: user);
    } on Exception catch (e) {
      // Token invalid/expired and refresh failed. Wipe and bounce to login.
      await _storage.clear();
      state = AuthState(status: AuthStatus.unauthenticated, errorMessage: e.toString());
    }
  }

  /// Sign in with Apple ID. Throws on failure.
  Future<void> signInWithApple() async {
    state = state.copyWith(clearError: true);
    try {
      final AuthResult result = await _authService.signInWithApple();
      await _storage.writeAccessToken(result.accessToken);
      if (result.refreshToken != null) {
        await _storage.writeRefreshToken(result.refreshToken!);
      }
      state = AuthState(status: AuthStatus.authenticated, user: result.user);
    } on Exception catch (e) {
      state = state.copyWith(errorMessage: e.toString());
      rethrow;
    }
  }

  /// Sign in with Google. Throws on failure.
  Future<void> signInWithGoogle() async {
    state = state.copyWith(clearError: true);
    try {
      final AuthResult result = await _authService.signInWithGoogle();
      await _storage.writeAccessToken(result.accessToken);
      if (result.refreshToken != null) {
        await _storage.writeRefreshToken(result.refreshToken!);
      }
      state = AuthState(status: AuthStatus.authenticated, user: result.user);
    } on Exception catch (e) {
      state = state.copyWith(errorMessage: e.toString());
      rethrow;
    }
  }

  Future<void> signOut() async {
    await _storage.clear();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}

/// The notifier that drives [authStateProvider]. Overridden in tests to swap
/// out the underlying [AuthService] / [SecureStorage].
final StateNotifierProvider<AuthStateNotifier, AuthState> authStateProvider =
    StateNotifierProvider<AuthStateNotifier, AuthState>(
  (Ref ref) => AuthStateNotifier(
    authService: ref.watch(authServiceProvider),
    storage: ref.watch(secureStorageProvider),
  ),
);
