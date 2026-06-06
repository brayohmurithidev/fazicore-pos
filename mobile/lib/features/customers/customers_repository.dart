import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class Customer {
  final int id;
  final String name;
  final String? email;
  final String? phone;
  final String? address;
  final String? notes;
  final int loyaltyPoints;
  final num totalSpent;
  final int totalOrders;
  final num creditBalance;
  final bool isActive;

  Customer({
    required this.id,
    required this.name,
    this.email,
    this.phone,
    this.address,
    this.notes,
    required this.loyaltyPoints,
    required this.totalSpent,
    required this.totalOrders,
    required this.creditBalance,
    required this.isActive,
  });

  factory Customer.fromJson(Map<String, dynamic> j) => Customer(
        id: j['id'] as int,
        name: j['name'] as String,
        email: j['email'] as String?,
        phone: j['phone'] as String?,
        address: j['address'] as String?,
        notes: j['notes'] as String?,
        loyaltyPoints: (j['loyalty_points'] ?? 0) as int,
        totalSpent: (j['total_spent'] ?? 0) as num,
        totalOrders: (j['total_orders'] ?? 0) as int,
        creditBalance: (j['credit_balance'] ?? 0) as num,
        isActive: (j['is_active'] ?? true) as bool,
      );
}

final customerSearchProvider = StateProvider.autoDispose<String>((_) => '');

/// GET /customers/?q=<term>
final customersProvider = FutureProvider.autoDispose<List<Customer>>((ref) async {
  final api = ref.read(apiClientProvider);
  final q = ref.watch(customerSearchProvider).trim();
  final res = await api.dio.get('/customers/', queryParameters: {
    if (q.isNotEmpty) 'q': q,
    'limit': 200,
  });
  return (res.data as List)
      .map((e) => Customer.fromJson(e as Map<String, dynamic>))
      .toList();
});

/// GET /customers/{id}
final customerDetailProvider =
    FutureProvider.autoDispose.family<Customer, int>((ref, id) async {
  final api = ref.read(apiClientProvider);
  final res = await api.dio.get('/customers/$id');
  return Customer.fromJson(res.data as Map<String, dynamic>);
});
