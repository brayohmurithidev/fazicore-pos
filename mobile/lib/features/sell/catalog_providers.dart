import 'dart:convert';

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

/// Persisted variant metadata from the last sync.
/// Returns {hasVariants: Set<int>, variants: Map<int, List<Map>>}
final variantMetaProvider = FutureProvider<_VariantMeta>((ref) async {
  final db = ref.watch(appDatabaseProvider);
  final raw = await db.getMeta('variant_meta');
  if (raw == null) return const _VariantMeta({}, {});
  final j = jsonDecode(raw) as Map<String, dynamic>;
  final hasVariants = ((j['has_variants'] as List?) ?? []).cast<int>().toSet();
  final variantMap = <int, List<Map<String, dynamic>>>{};
  final rawMap = (j['variants'] as Map<String, dynamic>?) ?? {};
  for (final entry in rawMap.entries) {
    variantMap[int.parse(entry.key)] = (entry.value as List).cast<Map<String, dynamic>>();
  }
  return _VariantMeta(hasVariants, variantMap);
});

class _VariantMeta {
  final Set<int> hasVariants;
  final Map<int, List<Map<String, dynamic>>> variants;
  const _VariantMeta(this.hasVariants, this.variants);
}
