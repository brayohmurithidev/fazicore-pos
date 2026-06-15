import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class POItem {
  final int id;
  final int? productId;
  final String productName;
  final int quantity;
  final num unitCost;
  final String? expiryDate;

  POItem({
    required this.id,
    this.productId,
    required this.productName,
    required this.quantity,
    required this.unitCost,
    this.expiryDate,
  });

  factory POItem.fromJson(Map<String, dynamic> j) => POItem(
        id: j['id'] as int,
        productId: j['product_id'] as int?,
        productName: (j['product_name'] ?? '').toString(),
        quantity: (j['quantity'] ?? 0) as int,
        unitCost: (j['unit_cost'] ?? 0) as num,
        expiryDate: j['expiry_date'] as String?,
      );
}

class PurchaseOrder {
  final int id;
  final String poNumber;
  final String supplier;
  final int? branchId;
  final String? branchName;
  final String status;
  final num total;
  final List<POItem> items;
  final DateTime createdAt;

  PurchaseOrder({
    required this.id,
    required this.poNumber,
    required this.supplier,
    this.branchId,
    this.branchName,
    required this.status,
    required this.total,
    required this.items,
    required this.createdAt,
  });

  factory PurchaseOrder.fromJson(Map<String, dynamic> j) => PurchaseOrder(
        id: j['id'] as int,
        poNumber: (j['po_number'] ?? '').toString(),
        supplier: (j['supplier'] ?? '').toString(),
        branchId: j['branch_id'] as int?,
        branchName: j['branch_name'] as String?,
        status: (j['status'] ?? 'pending').toString(),
        total: (j['total'] ?? 0) as num,
        items: (j['items'] as List? ?? [])
            .map((e) => POItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        createdAt: DateTime.parse(j['created_at'] as String),
      );
}

final purchaseOrdersProvider = FutureProvider.autoDispose<List<PurchaseOrder>>((ref) async {
  final res = await ref.read(apiClientProvider).dio.get('/purchase-orders/');
  return (res.data as List)
      .map((e) => PurchaseOrder.fromJson(e as Map<String, dynamic>))
      .toList();
});

Future<void> createPurchaseOrder(
  WidgetRef ref, {
  required String supplier,
  int? branchId,
  required List<Map<String, dynamic>> items,
}) async {
  await ref.read(apiClientProvider).dio.post('/purchase-orders/', data: {
    'supplier': supplier,
    if (branchId != null) 'branch_id': branchId,
    'items': items,
  });
}

Future<void> updatePOStatus(WidgetRef ref, int id, String status) async {
  await ref
      .read(apiClientProvider)
      .dio
      .post('/purchase-orders/$id/status', queryParameters: {'new_status': status});
}

Future<void> deletePurchaseOrder(WidgetRef ref, int id) async {
  await ref.read(apiClientProvider).dio.delete('/purchase-orders/$id');
}
