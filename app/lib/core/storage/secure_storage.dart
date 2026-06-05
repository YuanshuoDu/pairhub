// Secure storage wrapper.
//
// WHY secure storage (not shared_preferences)?
//   We store JWTs and refresh tokens here. Anything that grants access to a
//   user account MUST be kept in the OS-level secure store (Keychain on iOS,
//   EncryptedSharedPreferences on Android). SharedPreferences is plaintext
//   on disk and is unacceptable for auth tokens.
//
// The wrapper exposes a typed API so callers don't deal with raw key strings
// and can be overridden in tests with an in-memory implementation.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../network/dio_client.dart' show TokenKeys;

/// Abstract interface — tests provide a fake.
abstract class SecureStorage {
  Future<String?> readAccessToken();
  Future<String?> readRefreshToken();
  Future<void> writeAccessToken(String token);
  Future<void> writeRefreshToken(String token);
  Future<void> clear();
}

/// Default implementation backed by [FlutterSecureStorage].
class FlutterSecureStorageImpl implements SecureStorage {
  FlutterSecureStorageImpl([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _storage;

  @override
  Future<String?> readAccessToken() => _storage.read(key: TokenKeys.access);

  @override
  Future<String?> readRefreshToken() => _storage.read(key: TokenKeys.refresh);

  @override
  Future<void> writeAccessToken(String token) =>
      _storage.write(key: TokenKeys.access, value: token);

  @override
  Future<void> writeRefreshToken(String token) =>
      _storage.write(key: TokenKeys.refresh, value: token);

  @override
  Future<void> clear() async {
    await _storage.delete(key: TokenKeys.access);
    await _storage.delete(key: TokenKeys.refresh);
  }
}

/// In-memory implementation for tests.
class InMemorySecureStorage implements SecureStorage {
  final Map<String, String> _store = <String, String>{};

  @override
  Future<String?> readAccessToken() async => _store[TokenKeys.access];

  @override
  Future<String?> readRefreshToken() async => _store[TokenKeys.refresh];

  @override
  Future<void> writeAccessToken(String token) async => _store[TokenKeys.access] = token;

  @override
  Future<void> writeRefreshToken(String token) async => _store[TokenKeys.refresh] = token;

  @override
  Future<void> clear() async => _store.clear();
}

/// Riverpod entry point. Override at the root ProviderScope in tests.
final Provider<SecureStorage> secureStorageProvider = Provider<SecureStorage>(
  (Ref ref) => FlutterSecureStorageImpl(),
);
