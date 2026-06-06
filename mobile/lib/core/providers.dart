import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'db/app_database.dart';
import 'secure_store.dart';

final secureStoreProvider = Provider<SecureStore>((ref) => SecureStore());

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(ref.read(secureStoreProvider)),
);

/// Single app-wide drift database instance.
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});
