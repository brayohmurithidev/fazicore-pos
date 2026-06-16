import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'db/app_database.dart';
import 'secure_store.dart';

final secureStoreProvider = Provider<SecureStore>((ref) => SecureStore());

/// Flipped to true by ApiClient when a token refresh fails.
/// AuthController listens and transitions to loggedOut so the router redirects.
final sessionExpiredProvider = StateProvider<bool>((ref) => false);

final apiClientProvider = Provider<ApiClient>((ref) {
  final store = ref.read(secureStoreProvider);
  return ApiClient(store, onSessionExpired: () {
    ref.read(sessionExpiredProvider.notifier).state = true;
  });
});

/// Single app-wide drift database instance.
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});
