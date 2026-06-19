import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/db/app_database.dart';
import '../../core/providers.dart';
import '../printing/printer_service.dart';
import '../sell/catalog_providers.dart';

const _kProductsSync = 'products_last_sync';
const _kCustomersSync = 'customers_last_sync';
// Stores JSON: {"has_variants": [id,...], "is_variant": [id,...], "variants": {parentId: [{...}]}}
const _kVariantMeta = 'variant_meta';
const _uuid = Uuid();

class SyncState {
  final bool isSyncing;
  final int pendingCount;
  final DateTime? productsLastSync;
  final DateTime? customersLastSync;
  final String? lastError;

  const SyncState({
    this.isSyncing = false,
    this.pendingCount = 0,
    this.productsLastSync,
    this.customersLastSync,
    this.lastError,
  });

  SyncState copyWith({
    bool? isSyncing,
    int? pendingCount,
    DateTime? productsLastSync,
    DateTime? customersLastSync,
    String? lastError,
    bool clearError = false,
  }) =>
      SyncState(
        isSyncing: isSyncing ?? this.isSyncing,
        pendingCount: pendingCount ?? this.pendingCount,
        productsLastSync: productsLastSync ?? this.productsLastSync,
        customersLastSync: customersLastSync ?? this.customersLastSync,
        lastError: clearError ? null : (lastError ?? this.lastError),
      );
}

final syncControllerProvider =
    StateNotifierProvider<SyncController, SyncState>((ref) => SyncController(ref));

/// Pulls catalog/customers from the API into drift, and replays queued offline
/// sales via POST /orders/ (idempotency_key = local row id, mirroring desktop).
class SyncController extends StateNotifier<SyncState> {
  final Ref ref;
  SyncController(this.ref) : super(const SyncState()) {
    refreshStatus();
  }

  AppDatabase get _db => ref.read(appDatabaseProvider);
  ApiClient get _api => ref.read(apiClientProvider);

  Future<void> refreshStatus() async {
    final count = await _db.pendingCount();
    final pAt = await _db.getMeta(_kProductsSync);
    final cAt = await _db.getMeta(_kCustomersSync);
    state = state.copyWith(
      pendingCount: count,
      productsLastSync: pAt != null ? DateTime.tryParse(pAt) : null,
      customersLastSync: cAt != null ? DateTime.tryParse(cAt) : null,
    );
  }

  /// Queue a sale created offline. [payload] is an OrderCreate-shaped map.
  /// Returns the local id (also used as the server idempotency_key).
  Future<String> enqueueOrder(Map<String, dynamic> payload) async {
    final id = _uuid.v4();
    await _db.enqueueOrder(id, jsonEncode(payload));
    await refreshStatus();
    return id;
  }

  /// Push queued sales, then pull catalog + customers. Safe to call repeatedly.
  Future<void> syncNow() async {
    if (state.isSyncing) return;
    state = state.copyWith(isSyncing: true, clearError: true);
    String? error;
    try {
      await _pushPending();
      await _pullProducts();
      // Drift rows changed under these providers — force a fresh read on
      // next access instead of leaving screens stuck on whatever (possibly
      // empty) snapshot they first resolved to before this sync landed.
      ref.invalidate(variantMetaProvider);
      ref.invalidate(cachedProductsProvider);
      ref.invalidate(cachedCategoriesProvider);
      await _pullCustomers();
      ref.invalidate(cachedCustomersProvider);
      await _pullOrgInfo();
      await ref.read(printerProvider.notifier).reload(); // refresh receipt header
    } catch (e) {
      error = apiError(e);
    }
    await refreshStatus();
    state = state.copyWith(isSyncing: false, lastError: error);
  }

  // ── Push ──────────────────────────────────────────────────────────────────
  Future<void> _pushPending() async {
    final pending = await _db.pendingOrdersList();
    for (final order in pending) {
      final body = jsonDecode(order.payload) as Map<String, dynamic>;
      body['idempotency_key'] = order.id;
      try {
        final res = await _api.dio.post('/orders/', data: body);
        final code = res.statusCode ?? 0;
        if (code == 200 || code == 201) {
          await _db.deletePending(order.id);
        }
      } catch (e) {
        final status = _statusOf(e);
        if (status == 409) {
          // Server already has this idempotency_key — treat as synced.
          await _db.deletePending(order.id);
        } else if (status == 401) {
          rethrow; // token problem — abort the whole sync
        } else {
          await _db.bumpAttempt(order.id);
          await _db.markPendingFailed(order.id, apiError(e));
        }
      }
    }
  }

  int? _statusOf(Object e) {
    if (e is DioException) return e.response?.statusCode;
    return null;
  }

  // ── Pull ──────────────────────────────────────────────────────────────────
  Future<void> _pullProducts() async {
    final rows = <LocalProductsCompanion>[];
    final allPages = <Map<String, dynamic>>[];
    var skip = 0;
    const limit = 200;
    while (true) {
      final res = await _api.dio.get('/products/', queryParameters: {'skip': skip, 'limit': limit});
      final page = (res.data as List).cast<Map<String, dynamic>>();
      allPages.addAll(page);
      for (final j in page) {
        // Skip child variants from the local catalog — they are only reachable via the picker
        if ((j['parent_product_id'] as int?) != null) continue;
        rows.add(LocalProductsCompanion.insert(
          id: Value(j['id'] as int),
          name: j['name'] as String,
          price: (j['price'] ?? 0).toDouble(),
          cost: Value((j['cost'] as num?)?.toDouble()),
          sku: Value(j['sku'] as String?),
          barcode: Value(j['barcode'] as String?),
          unit: Value((j['unit'] ?? 'pcs').toString()),
          categoryId: Value(j['category_id'] as int?),
          categoryName: Value(j['category_name'] as String?),
          stockQuantity: Value((j['stock_quantity'] ?? 0) as int),
          minStock: Value((j['min_stock'] ?? 0) as int),
          imageUrl: Value(j['image_url'] as String?),
          vatRate: Value((j['vat_rate'] ?? 0).toDouble()),
          isActive: Value((j['is_active'] ?? true) as bool),
          trackInventory: Value((j['track_inventory'] ?? true) as bool),
        ));
      }
      if (page.length < limit) break;
      skip += limit;
    }
    await _db.replaceProducts(rows);
    await _db.setMeta(_kProductsSync, DateTime.now().toIso8601String());

    // Persist variant metadata so the sell screen can show the picker without extra API calls.
    final hasVariants = <int>[];
    final variantMap = <String, dynamic>{};
    for (final j in allPages) {
      final variantCount = (j['variant_count'] as int?) ?? 0;
      if (variantCount > 0) {
        final id = j['id'] as int;
        hasVariants.add(id);
        variantMap[id.toString()] = (j['variants'] as List? ?? []);
      }
    }
    await _db.setMeta(_kVariantMeta, jsonEncode({'has_variants': hasVariants, 'variants': variantMap}));
  }

  Future<void> _pullCustomers() async {
    final rows = <LocalCustomersCompanion>[];
    var skip = 0;
    const limit = 200;
    while (true) {
      final res = await _api.dio.get('/customers/', queryParameters: {'skip': skip, 'limit': limit});
      final page = (res.data as List).cast<Map<String, dynamic>>();
      for (final j in page) {
        rows.add(LocalCustomersCompanion.insert(
          id: Value(j['id'] as int),
          name: j['name'] as String,
          phone: Value(j['phone'] as String?),
          email: Value(j['email'] as String?),
          creditBalance: Value((j['credit_balance'] ?? 0).toDouble()),
          totalSpent: Value((j['total_spent'] ?? 0).toDouble()),
          totalOrders: Value((j['total_orders'] ?? 0) as int),
          loyaltyPoints: Value((j['loyalty_points'] ?? 0) as int),
        ));
      }
      if (page.length < limit) break;
      skip += limit;
    }
    await _db.replaceCustomers(rows);
    await _db.setMeta(_kCustomersSync, DateTime.now().toIso8601String());
  }

  /// Cache the business profile (GET /org/info) so receipts can print the same
  /// header as the web/desktop app, even offline.
  Future<void> _pullOrgInfo() async {
    final res = await _api.dio.get('/org/info');
    final j = res.data as Map<String, dynamic>;
    await _db.setMeta('org_name', (j['name'] ?? '').toString());
    await _db.setMeta('org_phone', (j['phone'] ?? '').toString());
    await _db.setMeta('org_email', (j['email'] ?? '').toString());
    await _db.setMeta('org_currency', (j['currency'] ?? 'KES').toString());
  }
}
