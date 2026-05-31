import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists auth tokens + the org slug securely on device.
class SecureStore {
  final FlutterSecureStorage _s = const FlutterSecureStorage();

  static const _kAccess = 'access_token';
  static const _kRefresh = 'refresh_token';
  static const _kSlug = 'org_slug';

  Future<String?> get accessToken => _s.read(key: _kAccess);
  Future<String?> get refreshToken => _s.read(key: _kRefresh);
  Future<String?> get orgSlug => _s.read(key: _kSlug);

  Future<void> saveTokens(String access, String refresh) async {
    await _s.write(key: _kAccess, value: access);
    await _s.write(key: _kRefresh, value: refresh);
  }

  Future<void> saveSlug(String slug) => _s.write(key: _kSlug, value: slug);

  Future<void> clearTokens() async {
    await _s.delete(key: _kAccess);
    await _s.delete(key: _kRefresh);
  }
}
