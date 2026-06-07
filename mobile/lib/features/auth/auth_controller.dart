import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'auth_models.dart';
import 'auth_repository.dart';

enum AuthStatus { unknown, loggedOut, loggedIn }

class AuthState {
  final AuthStatus status;
  final AppUser? user;
  const AuthState(this.status, [this.user]);
}

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.read(apiClientProvider)),
);

final authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((ref) => AuthController(ref));

class AuthController extends StateNotifier<AuthState> {
  final Ref ref;
  AuthController(this.ref) : super(const AuthState(AuthStatus.unknown)) {
    _init();
  }

  Future<void> _init() async {
    final token = await ref.read(secureStoreProvider).accessToken;
    state = AuthState(token != null ? AuthStatus.loggedIn : AuthStatus.loggedOut);
  }

  /// Used by the login screen to list users for the entered slug.
  Future<List<AppUser>> usersForSlug(String slug) async {
    await ref.read(secureStoreProvider).saveSlug(slug.trim());
    return ref.read(authRepositoryProvider).fetchOrgUsers(slug.trim());
  }

  Future<void> loginWithPin(String slug, int userId, String pin) async {
    final result = await ref.read(authRepositoryProvider).pinLogin(slug.trim(), userId, pin);
    final store = ref.read(secureStoreProvider);
    await store.saveSlug(slug.trim());
    await store.saveTokens(result.accessToken, result.refreshToken);
    // Persist the cashier name so receipts can attribute the sale across restarts.
    await ref.read(appDatabaseProvider).setMeta('cashier_name', result.user.name);
    state = AuthState(AuthStatus.loggedIn, result.user);
  }

  Future<void> logout() async {
    await ref.read(secureStoreProvider).clearTokens();
    state = const AuthState(AuthStatus.loggedOut);
  }
}
