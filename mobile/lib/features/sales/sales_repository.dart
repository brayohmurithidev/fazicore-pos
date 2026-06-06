import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class OrderItem {
  final int id;
  final String productName;
  final String? productSku;
  final int quantity;
  final num unitPrice;
  final num total;
  final String? unitName;

  OrderItem({
    required this.id,
    required this.productName,
    this.productSku,
    required this.quantity,
    required this.unitPrice,
    required this.total,
    this.unitName,
  });

  factory OrderItem.fromJson(Map<String, dynamic> j) => OrderItem(
        id: j['id'] as int,
        productName: (j['product_name'] ?? '') as String,
        productSku: j['product_sku'] as String?,
        quantity: (j['quantity'] ?? 0) as int,
        unitPrice: (j['unit_price'] ?? 0) as num,
        total: (j['total'] ?? 0) as num,
        unitName: j['unit_name'] as String?,
      );
}

class Order {
  final int id;
  final String orderNumber;
  final String status;
  final String paymentMethod;
  final String paymentStatus;
  final num subtotal;
  final num taxAmount;
  final num discountAmount;
  final num total;
  final String? cashierName;
  final String? notes;
  final DateTime createdAt;
  final List<OrderItem> items;

  Order({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.paymentMethod,
    required this.paymentStatus,
    required this.subtotal,
    required this.taxAmount,
    required this.discountAmount,
    required this.total,
    this.cashierName,
    this.notes,
    required this.createdAt,
    required this.items,
  });

  bool get isVoided => status == 'voided' || status == 'cancelled' || status == 'refunded';

  factory Order.fromJson(Map<String, dynamic> j) => Order(
        id: j['id'] as int,
        orderNumber: (j['order_number'] ?? '') as String,
        status: (j['status'] ?? '').toString(),
        paymentMethod: (j['payment_method'] ?? '').toString(),
        paymentStatus: (j['payment_status'] ?? '').toString(),
        subtotal: (j['subtotal'] ?? 0) as num,
        taxAmount: (j['tax_amount'] ?? 0) as num,
        discountAmount: (j['discount_amount'] ?? 0) as num,
        total: (j['total'] ?? 0) as num,
        cashierName: j['cashier_name'] as String?,
        notes: j['notes'] as String?,
        createdAt: DateTime.parse(j['created_at'] as String).toLocal(),
        items: ((j['items'] ?? []) as List)
            .map((e) => OrderItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

/// GET /orders/?limit=100
final salesProvider = FutureProvider.autoDispose<List<Order>>((ref) async {
  final api = ref.read(apiClientProvider);
  final res = await api.dio.get('/orders/', queryParameters: {'limit': 100});
  return (res.data as List)
      .map((e) => Order.fromJson(e as Map<String, dynamic>))
      .toList();
});

/// GET /orders/{id}
final saleDetailProvider =
    FutureProvider.autoDispose.family<Order, int>((ref, id) async {
  final api = ref.read(apiClientProvider);
  final res = await api.dio.get('/orders/$id');
  return Order.fromJson(res.data as Map<String, dynamic>);
});
