import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/app_database.dart';
import '../../core/providers.dart';

/// Search term for the sell-screen product picker.
final sellSearchProvider = StateProvider.autoDispose<String>((_) => '');

/// Offline-first product list read straight from the drift cache.
final cachedProductsProvider = FutureProvider.autoDispose<List<LocalProduct>>((ref) async {
  final db = ref.watch(appDatabaseProvider);
  final q = ref.watch(sellSearchProvider).trim();
  final rows = q.isEmpty ? await db.allProducts() : await db.searchProducts(q);
  return rows.where((p) => p.isActive).toList();
});

/// Offline-first customer list from the drift cache (for credit / attribution).
final cachedCustomersProvider = FutureProvider.autoDispose<List<LocalCustomer>>((ref) async {
  final db = ref.watch(appDatabaseProvider);
  return db.allCustomers();
});
