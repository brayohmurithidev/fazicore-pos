import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class PaymentStat {
  final String method;
  final int count;
  final num total;
  PaymentStat(this.method, this.count, this.total);
}

class DashboardSummary {
  final num todayRevenue;
  final int todayTransactions;
  final int lowStockCount;
  final List<TopProduct> topProducts;
  final List<PaymentStat> payments;

  DashboardSummary({
    required this.todayRevenue,
    required this.todayTransactions,
    required this.lowStockCount,
    required this.topProducts,
    required this.payments,
  });

  num get avgSale => todayTransactions == 0 ? 0 : todayRevenue / todayTransactions;

  factory DashboardSummary.fromJson(Map<String, dynamic> j) {
    final pb = (j['payment_breakdown'] ?? {}) as Map;
    final payments = pb.entries
        .map((e) => PaymentStat(
              e.key.toString(),
              (e.value['count'] ?? 0) as int,
              (e.value['total'] ?? 0) as num,
            ))
        .where((p) => p.count > 0)
        .toList()
      ..sort((a, b) => b.total.compareTo(a.total));

    return DashboardSummary(
      todayRevenue: (j['today_revenue'] ?? 0) as num,
      todayTransactions: (j['today_transactions'] ?? 0) as int,
      lowStockCount: (j['low_stock_count'] ?? 0) as int,
      topProducts: ((j['top_products'] ?? []) as List)
          .map((e) => TopProduct.fromJson(e as Map<String, dynamic>))
          .toList(),
      payments: payments,
    );
  }
}

class TopProduct {
  final String name;
  final num qtySold;
  final num revenue;
  TopProduct(this.name, this.qtySold, this.revenue);
  factory TopProduct.fromJson(Map<String, dynamic> j) =>
      TopProduct(j['product_name'] as String, (j['qty_sold'] ?? 0) as num, (j['revenue'] ?? 0) as num);
}

final dashboardProvider = FutureProvider.autoDispose<DashboardSummary>((ref) async {
  final api = ref.read(apiClientProvider);
  final res = await api.dio.get('/dashboard/');
  return DashboardSummary.fromJson(res.data as Map<String, dynamic>);
});
