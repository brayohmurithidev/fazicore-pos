import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'app_database.g.dart';

/// Cached catalog (mirrors GET /products/).
class LocalProducts extends Table {
  IntColumn get id => integer()();
  TextColumn get name => text()();
  RealColumn get price => real()();
  RealColumn get cost => real().nullable()();
  TextColumn get sku => text().nullable()();
  TextColumn get barcode => text().nullable()();
  TextColumn get unit => text().withDefault(const Constant('pcs'))();
  IntColumn get categoryId => integer().nullable()();
  TextColumn get categoryName => text().nullable()();
  IntColumn get stockQuantity => integer().withDefault(const Constant(0))();
  IntColumn get minStock => integer().withDefault(const Constant(0))();
  TextColumn get imageUrl => text().nullable()();
  RealColumn get vatRate => real().withDefault(const Constant(0))();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  BoolColumn get trackInventory => boolean().withDefault(const Constant(true))();

  @override
  Set<Column> get primaryKey => {id};
}

/// Cached customers (mirrors GET /customers/).
class LocalCustomers extends Table {
  IntColumn get id => integer()();
  TextColumn get name => text()();
  TextColumn get phone => text().nullable()();
  TextColumn get email => text().nullable()();
  RealColumn get creditBalance => real().withDefault(const Constant(0))();
  RealColumn get totalSpent => real().withDefault(const Constant(0))();
  IntColumn get totalOrders => integer().withDefault(const Constant(0))();
  IntColumn get loyaltyPoints => integer().withDefault(const Constant(0))();

  @override
  Set<Column> get primaryKey => {id};
}

/// Queue of sales created while offline, replayed via POST /orders/.
/// [id] doubles as the server idempotency_key.
class PendingOrders extends Table {
  TextColumn get id => text()();
  TextColumn get payload => text()(); // JSON OrderCreate body
  TextColumn get status => text().withDefault(const Constant('pending'))(); // pending | failed
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  TextColumn get lastError => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Simple key/value store for sync timestamps etc.
class SyncMeta extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column> get primaryKey => {key};
}

@DriftDatabase(tables: [LocalProducts, LocalCustomers, PendingOrders, SyncMeta])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(driftDatabase(name: 'fazipos'));

  @override
  int get schemaVersion => 1;

  // ── Catalog ────────────────────────────────────────────────────────────────
  Future<List<LocalProduct>> allProducts() =>
      (select(localProducts)..orderBy([(t) => OrderingTerm(expression: t.name)])).get();

  Future<List<LocalProduct>> searchProducts(String q) {
    final like = '%${q.toLowerCase()}%';
    return (select(localProducts)
          ..where((t) =>
              t.name.lower().like(like) |
              t.sku.lower().like(like) |
              t.barcode.lower().like(like))
          ..orderBy([(t) => OrderingTerm(expression: t.name)]))
        .get();
  }

  Future<void> replaceProducts(List<LocalProductsCompanion> rows) async {
    await batch((b) {
      b.deleteAll(localProducts);
      b.insertAll(localProducts, rows);
    });
  }

  Future<List<LocalCustomer>> allCustomers() =>
      (select(localCustomers)..orderBy([(t) => OrderingTerm(expression: t.name)])).get();

  Future<void> replaceCustomers(List<LocalCustomersCompanion> rows) async {
    await batch((b) {
      b.deleteAll(localCustomers);
      b.insertAll(localCustomers, rows);
    });
  }

  // ── Pending orders queue ─────────────────────────────────────────────────────
  Future<void> enqueueOrder(String id, String payload) => into(pendingOrders).insert(
        PendingOrdersCompanion.insert(id: id, payload: payload, createdAt: DateTime.now()),
      );

  Future<List<PendingOrder>> pendingOrdersList() =>
      (select(pendingOrders)..orderBy([(t) => OrderingTerm(expression: t.createdAt)])).get();

  Future<int> pendingCount() async {
    final c = countAll();
    final row = await (selectOnly(pendingOrders)..addColumns([c])).getSingle();
    return row.read(c) ?? 0;
  }

  Future<void> deletePending(String id) =>
      (delete(pendingOrders)..where((t) => t.id.equals(id))).go();

  Future<void> markPendingFailed(String id, String error) =>
      (update(pendingOrders)..where((t) => t.id.equals(id))).write(
        PendingOrdersCompanion(
          status: const Value('failed'),
          lastError: Value(error),
          attempts: const Value.absent(),
        ),
      );

  Future<void> bumpAttempt(String id) async {
    await customUpdate(
      'UPDATE pending_orders SET attempts = attempts + 1 WHERE id = ?',
      variables: [Variable.withString(id)],
      updates: {pendingOrders},
    );
  }

  // ── Sync meta ────────────────────────────────────────────────────────────────
  Future<void> setMeta(String key, String value) => into(syncMeta).insertOnConflictUpdate(
        SyncMetaCompanion.insert(key: key, value: value),
      );

  Future<String?> getMeta(String key) async {
    final row = await (select(syncMeta)..where((t) => t.key.equals(key))).getSingleOrNull();
    return row?.value;
  }
}
