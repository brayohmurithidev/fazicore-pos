import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class StockTransfer {
  final int id;
  final String transferNumber;
  final int productId;
  final String? productName;
  final int fromBranchId;
  final String? fromBranchName;
  final int toBranchId;
  final String? toBranchName;
  final int quantity;
  final String status;
  final String? notes;
  final String? initiatorName;
  final String? confirmerName;
  final DateTime createdAt;

  StockTransfer({
    required this.id,
    required this.transferNumber,
    required this.productId,
    this.productName,
    required this.fromBranchId,
    this.fromBranchName,
    required this.toBranchId,
    this.toBranchName,
    required this.quantity,
    required this.status,
    this.notes,
    this.initiatorName,
    this.confirmerName,
    required this.createdAt,
  });

  factory StockTransfer.fromJson(Map<String, dynamic> j) => StockTransfer(
        id: j['id'] as int,
        transferNumber: (j['transfer_number'] ?? '').toString(),
        productId: j['product_id'] as int,
        productName: j['product_name'] as String?,
        fromBranchId: j['from_branch_id'] as int,
        fromBranchName: j['from_branch_name'] as String?,
        toBranchId: j['to_branch_id'] as int,
        toBranchName: j['to_branch_name'] as String?,
        quantity: (j['quantity'] ?? 0) as int,
        status: (j['status'] ?? 'initiated').toString(),
        notes: j['notes'] as String?,
        initiatorName: j['initiator_name'] as String?,
        confirmerName: j['confirmer_name'] as String?,
        createdAt: DateTime.parse(j['created_at'] as String),
      );
}

final stockTransfersProvider = FutureProvider.autoDispose<List<StockTransfer>>((ref) async {
  final res = await ref.read(apiClientProvider).dio.get('/stock-transfers/');
  return (res.data as List)
      .map((e) => StockTransfer.fromJson(e as Map<String, dynamic>))
      .toList();
});

Future<void> initiateTransfer(
  WidgetRef ref, {
  required int productId,
  required int fromBranchId,
  required int toBranchId,
  required int quantity,
  String? notes,
}) async {
  await ref.read(apiClientProvider).dio.post('/stock-transfers/', data: {
    'product_id': productId,
    'from_branch_id': fromBranchId,
    'to_branch_id': toBranchId,
    'quantity': quantity,
    if (notes != null && notes.isNotEmpty) 'notes': notes,
  });
}

Future<void> transferAction(WidgetRef ref, int id, String action) async {
  await ref.read(apiClientProvider).dio.post('/stock-transfers/$id/$action');
}
