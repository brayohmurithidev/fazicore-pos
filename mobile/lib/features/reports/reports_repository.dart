import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';

class ReportProduct {
  final String name;
  final num qty;
  final num revenue;
  ReportProduct(this.name, this.qty, this.revenue);
  factory ReportProduct.fromJson(Map<String, dynamic> j) =>
      ReportProduct((j['name'] ?? '') as String, (j['qty'] ?? 0) as num, (j['revenue'] ?? 0) as num);
}

class DailyReport {
  final String reportDate;
  final num totalRevenue;
  final int totalOrders;
  final num avgOrderValue;
  final num totalDiscount;
  final int totalVoids;
  final num voidAmount;
  final num cashTotal;
  final num mpesaTotal;
  final num creditTotal;
  final num splitTotal;
  final num otherTotal;
  final List<ReportProduct> topProducts;

  DailyReport({
    required this.reportDate,
    required this.totalRevenue,
    required this.totalOrders,
    required this.avgOrderValue,
    required this.totalDiscount,
    required this.totalVoids,
    required this.voidAmount,
    required this.cashTotal,
    required this.mpesaTotal,
    required this.creditTotal,
    required this.splitTotal,
    required this.otherTotal,
    required this.topProducts,
  });

  /// Non-zero payment-method buckets, as (label, amount) pairs.
  List<(String, num)> get paymentBreakdown => [
        ('Cash', cashTotal),
        ('M-Pesa', mpesaTotal),
        ('Credit', creditTotal),
        ('Split', splitTotal),
        ('Other', otherTotal),
      ].where((e) => e.$2 > 0).toList();

  factory DailyReport.fromJson(Map<String, dynamic> j) => DailyReport(
        reportDate: (j['report_date'] ?? '') as String,
        totalRevenue: (j['total_revenue'] ?? 0) as num,
        totalOrders: (j['total_orders'] ?? 0) as int,
        avgOrderValue: (j['avg_order_value'] ?? 0) as num,
        totalDiscount: (j['total_discount'] ?? 0) as num,
        totalVoids: (j['total_voids'] ?? 0) as int,
        voidAmount: (j['void_amount'] ?? 0) as num,
        cashTotal: (j['cash_total'] ?? 0) as num,
        mpesaTotal: (j['mpesa_total'] ?? 0) as num,
        creditTotal: (j['credit_total'] ?? 0) as num,
        splitTotal: (j['split_total'] ?? 0) as num,
        otherTotal: (j['other_total'] ?? 0) as num,
        topProducts: ((j['top_products'] ?? []) as List)
            .map((e) => ReportProduct.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

/// Selected report date (defaults to today).
final reportDateProvider = StateProvider.autoDispose<DateTime>((_) => DateTime.now());

/// GET /reports/daily?report_date=YYYY-MM-DD
final dailyReportProvider = FutureProvider.autoDispose<DailyReport>((ref) async {
  final api = ref.read(apiClientProvider);
  final date = ref.watch(reportDateProvider);
  final res = await api.dio.get('/reports/daily', queryParameters: {
    'report_date': DateFormat('yyyy-MM-dd').format(date),
  });
  return DailyReport.fromJson(res.data as Map<String, dynamic>);
});

class TrendPoint {
  final DateTime day;
  final num revenue;
  TrendPoint(this.day, this.revenue);
}

/// 7-day revenue trend, derived from completed orders (no dedicated endpoint).
final salesTrendProvider = FutureProvider.autoDispose<List<TrendPoint>>((ref) async {
  final api = ref.read(apiClientProvider);
  final now = DateTime.now();
  final from = DateTime(now.year, now.month, now.day).subtract(const Duration(days: 6));
  final res = await api.dio.get('/orders/', queryParameters: {
    'date_from': DateFormat('yyyy-MM-dd').format(from),
    'limit': 200,
  });
  final orders = res.data as List;

  // Seed all 7 days at zero so the chart has a continuous axis.
  final buckets = <String, num>{};
  for (var i = 0; i < 7; i++) {
    final d = from.add(Duration(days: i));
    buckets[DateFormat('yyyy-MM-dd').format(d)] = 0;
  }
  for (final o in orders.cast<Map<String, dynamic>>()) {
    if ((o['status'] ?? '').toString() != 'completed') continue;
    final created = DateTime.parse(o['created_at'] as String).toLocal();
    final key = DateFormat('yyyy-MM-dd').format(created);
    if (buckets.containsKey(key)) {
      buckets[key] = buckets[key]! + ((o['total'] ?? 0) as num);
    }
  }
  return [
    for (var i = 0; i < 7; i++)
      TrendPoint(
        from.add(Duration(days: i)),
        buckets[DateFormat('yyyy-MM-dd').format(from.add(Duration(days: i)))] ?? 0,
      ),
  ];
});
