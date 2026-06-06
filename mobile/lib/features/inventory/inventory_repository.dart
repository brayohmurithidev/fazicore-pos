import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class InventoryItem {
  final int id;
  final int productId;
  final String? productName;
  final int? branchId;
  final String? branchName;
  final int quantity;
  final int reservedQuantity;
  final int lowStockThreshold;

  InventoryItem({
    required this.id,
    required this.productId,
    this.productName,
    this.branchId,
    this.branchName,
    required this.quantity,
    required this.reservedQuantity,
    required this.lowStockThreshold,
  });

  bool get isLow => quantity <= lowStockThreshold;

  factory InventoryItem.fromJson(Map<String, dynamic> j) => InventoryItem(
        id: j['id'] as int,
        productId: j['product_id'] as int,
        productName: j['product_name'] as String?,
        branchId: j['branch_id'] as int?,
        branchName: j['branch_name'] as String?,
        quantity: (j['quantity'] ?? 0) as int,
        reservedQuantity: (j['reserved_quantity'] ?? 0) as int,
        lowStockThreshold: (j['low_stock_threshold'] ?? 0) as int,
      );
}

/// Toggle for the low-stock-only filter.
final inventoryLowOnlyProvider = StateProvider.autoDispose<bool>((_) => false);

/// GET /inventory/?low_stock_only=<bool>
final inventoryProvider = FutureProvider.autoDispose<List<InventoryItem>>((ref) async {
  final api = ref.read(apiClientProvider);
  final lowOnly = ref.watch(inventoryLowOnlyProvider);
  final res = await api.dio.get('/inventory/', queryParameters: {
    if (lowOnly) 'low_stock_only': true,
    'limit': 300,
  });
  return (res.data as List)
      .map((e) => InventoryItem.fromJson(e as Map<String, dynamic>))
      .toList();
});

/// POST /inventory/adjust — qtyChange may be negative.
Future<void> adjustInventory(
  WidgetRef ref, {
  required int productId,
  int? branchId,
  required int qtyChange,
  String? notes,
}) async {
  final api = ref.read(apiClientProvider);
  await api.dio.post('/inventory/adjust', data: {
    'product_id': productId,
    if (branchId != null) 'branch_id': branchId,
    'qty_change': qtyChange,
    'type': 'adjustment',
    if (notes != null && notes.isNotEmpty) 'notes': notes,
  });
}
