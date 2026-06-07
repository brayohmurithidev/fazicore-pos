import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/app_database.dart';
import '../../core/providers.dart';

/// Search term for the sell-screen product picker.
final sellSearchProvider = StateProvider.autoDispose<String>((_) => '');

/// Selected category filter (null = all categories).
final sellCategoryProvider = StateProvider.autoDispose<String?>((_) => null);

/// Grid vs list view for the product picker (true = grid).
final sellGridViewProvider = StateProvider<bool>((_) => true);

/// Offline-first product list read straight from the drift cache, filtered by
/// the active search term + category.
final cachedProductsProvider = FutureProvider.autoDispose<List<LocalProduct>>((ref) async {
  final db = ref.watch(appDatabaseProvider);
  final q = ref.watch(sellSearchProvider).trim();
  final category = ref.watch(sellCategoryProvider);
  final rows = q.isEmpty ? await db.allProducts() : await db.searchProducts(q);
  return rows
      .where((p) => p.isActive)
      .where((p) => category == null || p.categoryName == category)
      .toList();
});

/// Distinct category names present in the cache, for the filter dropdown.
final cachedCategoriesProvider = FutureProvider.autoDispose<List<String>>((ref) async {
  final db = ref.watch(appDatabaseProvider);
  final rows = await db.allProducts();
  final names = rows
      .where((p) => p.isActive && p.categoryName != null && p.categoryName!.isNotEmpty)
      .map((p) => p.categoryName!)
      .toSet()
      .toList()
    ..sort();
  return names;
});

/// Offline-first customer list from the drift cache (for credit / attribution).
final cachedCustomersProvider = FutureProvider.autoDispose<List<LocalCustomer>>((ref) async {
  final db = ref.watch(appDatabaseProvider);
  return db.allCustomers();
});
