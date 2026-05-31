import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class DashboardSummary {
  final num todayRevenue;
  final int todayTransactions;
  final int lowStockCount;
  final List<TopProduct> topProducts;

  DashboardSummary({
    required this.todayRevenue,
    required this.todayTransactions,
    required this.lowStockCount,
    required this.topProducts,
  });

  factory DashboardSummary.fromJson(Map<String, dynamic> j) => DashboardSummary(
        todayRevenue: (j['today_revenue'] ?? 0) as num,
        todayTransactions: (j['today_transactions'] ?? 0) as int,
        lowStockCount: (j['low_stock_count'] ?? 0) as int,
        topProducts: ((j['top_products'] ?? []) as List)
            .map((e) => TopProduct.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
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
