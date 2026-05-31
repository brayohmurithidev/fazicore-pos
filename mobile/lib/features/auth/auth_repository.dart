import '../../core/api_client.dart';
import 'auth_models.dart';

class LoginResult {
  final String accessToken;
  final String refreshToken;
  final AppUser user;
  LoginResult(this.accessToken, this.refreshToken, this.user);
}

class AuthRepository {
  final ApiClient api;
  AuthRepository(this.api);

  /// GET /auth/users?org_slug=<slug>
  Future<List<AppUser>> fetchOrgUsers(String slug) async {
    final res = await api.dio.get('/auth/users', queryParameters: {'org_slug': slug});
    return (res.data as List).map((e) => AppUser.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// POST /auth/login {org_slug, user_id, pin}
  Future<LoginResult> pinLogin(String slug, int userId, String pin) async {
    final res = await api.dio.post('/auth/login', data: {
      'org_slug': slug,
      'user_id': userId,
      'pin': pin,
    });
    final d = res.data as Map<String, dynamic>;
    return LoginResult(
      d['access_token'] as String,
      d['refresh_token'] as String,
      AppUser.fromJson(d['user'] as Map<String, dynamic>),
    );
  }
}
