import 'package:dio/dio.dart';

import 'env.dart';
import 'secure_store.dart';

/// Dio wrapper that attaches the JWT + X-Org-Slug to every request and
/// transparently refreshes the token once on a 401.
class ApiClient {
  final SecureStore store;
  late final Dio dio;

  ApiClient(this.store) {
    dio = Dio(
      BaseOptions(
        baseUrl: Env.apiV1,
        headers: {'Content-Type': 'application/json'},
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 20),
      ),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await store.accessToken;
          final slug = await store.orgSlug;
          if (token != null) options.headers['Authorization'] = 'Bearer $token';
          if (slug != null) options.headers['X-Org-Slug'] = slug;
          handler.next(options);
        },
        onError: (e, handler) async {
          final path = e.requestOptions.path;
          final isAuthCall = path.contains('/auth/');
          if (e.response?.statusCode == 401 && !isAuthCall) {
            if (await _tryRefresh()) {
              try {
                final token = await store.accessToken;
                final req = e.requestOptions;
                req.headers['Authorization'] = 'Bearer $token';
                final retry = await dio.fetch(req);
                return handler.resolve(retry);
              } catch (_) {
                // fall through to original error
              }
            }
          }
          handler.next(e);
        },
      ),
    );
  }

  Future<bool> _tryRefresh() async {
    final refresh = await store.refreshToken;
    if (refresh == null) return false;
    try {
      // Bare Dio so the interceptor doesn't recurse
      final res = await Dio(BaseOptions(baseUrl: Env.apiV1))
          .post('/auth/refresh', data: {'refresh_token': refresh});
      final access = res.data['access_token'] as String;
      final newRefresh = (res.data['refresh_token'] as String?) ?? refresh;
      await store.saveTokens(access, newRefresh);
      return true;
    } catch (_) {
      await store.clearTokens();
      return false;
    }
  }
}

/// Map a Dio error to a human-readable message (mirrors web's getApiError).
String apiError(Object e) {
  if (e is DioException) {
    final data = e.response?.data;
    if (data is Map && data['detail'] != null) {
      final d = data['detail'];
      if (d is String) return d;
      if (d is Map && d['code'] != null) return d.toString();
    }
    if (e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout) {
      return 'Cannot reach the server. Check your connection.';
    }
    return e.message ?? 'Request failed';
  }
  return e.toString();
}
