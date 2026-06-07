import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';
import '../sales/sales_repository.dart';

class ReportProduct {
  final String name;
  final num qty;
  final num revenue;
  ReportProduct(this.name, this.qty, this.revenue);
  factory ReportProduct.fromJson(Map<String, dynamic> j) =>
      ReportProduct((j['name'] ?? '') as String, (j['qty'] ?? 0) as num, (j['revenue'] ?? 0) as num);
}

class PaymentLine {
  final String method;
  final int count;
  final num total;
  PaymentLine(this.method, this.count, this.total);
  factory PaymentLine.fromJson(Map<String, dynamic> j) =>
      PaymentLine((j['method'] ?? '').toString(), (j['count'] ?? 0) as int, (j['total'] ?? 0) as num);
}

class DailyReport {
  final String reportDate;
  final num totalRevenue;
  final int totalOrders;
  final num avgOrderValue;
  final num totalDiscount;
  final int totalVoids;
  final num voidAmount;
  final List<ReportProduct> topProducts;
  final List<PaymentLine> payments;

  DailyReport({
    required this.reportDate,
    required this.totalRevenue,
    required this.totalOrders,
    required this.avgOrderValue,
    required this.totalDiscount,
    required this.totalVoids,
    required this.voidAmount,
    required this.topProducts,
    required this.payments,
  });

  /// Revenue minus discounts.
  num get netSales => (totalRevenue - totalDiscount).clamp(0, double.infinity);

  factory DailyReport.fromJson(Map<String, dynamic> j) {
    final payments = ((j['by_payment'] ?? []) as List)
        .map((e) => PaymentLine.fromJson(e as Map<String, dynamic>))
        .where((p) => p.total > 0)
        .toList()
      ..sort((a, b) => b.total.compareTo(a.total));
    return DailyReport(
      reportDate: (j['report_date'] ?? '') as String,
      totalRevenue: (j['total_revenue'] ?? 0) as num,
      totalOrders: (j['total_orders'] ?? 0) as int,
      avgOrderValue: (j['avg_order_value'] ?? 0) as num,
      totalDiscount: (j['total_discount'] ?? 0) as num,
      totalVoids: (j['total_voids'] ?? 0) as int,
      voidAmount: (j['void_amount'] ?? 0) as num,
      topProducts: ((j['top_products'] ?? []) as List)
          .map((e) => ReportProduct.fromJson(e as Map<String, dynamic>))
          .toList(),
      payments: payments,
    );
  }
}

/// Selected report date (defaults to today).
final reportDateProvider = StateProvider.autoDispose<DateTime>((_) => DateTime.now());

/// Daily report computed client-side from /orders/ for the selected *local* day.
/// This avoids the UTC day-boundary mismatch in /reports/daily (a sale just
/// after local midnight would otherwise land in the previous UTC day).
final dailyReportProvider = FutureProvider.autoDispose<DailyReport>((ref) async {
  final api = ref.read(apiClientProvider);
  final date = ref.watch(reportDateProvider);
  final day = DateTime(date.year, date.month, date.day);
  // Over-fetch a day on each side so the local window is fully covered.
  final from = day.subtract(const Duration(days: 1));
  final to = day.add(const Duration(days: 1));

  // /orders/ caps limit at 200 — paginate so busy days aggregate fully.
  final orders = <Order>[];
  var skip = 0;
  const limit = 200;
  while (true) {
    final res = await api.dio.get('/orders/', queryParameters: {
      'date_from': DateFormat('yyyy-MM-dd').format(from),
      'date_to': DateFormat('yyyy-MM-dd').format(to),
      'skip': skip,
      'limit': limit,
    });
    final page = (res.data as List).map((e) => Order.fromJson(e as Map<String, dynamic>)).toList();
    orders.addAll(page);
    if (page.length < limit) break;
    skip += limit;
  }

  bool sameDay(DateTime d) => d.year == day.year && d.month == day.month && d.day == day.day;
  final dayOrders = orders.where((o) => sameDay(o.createdAt)).toList();
  final completed = dayOrders.where((o) => o.status == 'completed').toList();
  final voided = dayOrders.where((o) => o.isVoided).toList();

  final revenue = completed.fold<num>(0, (s, o) => s + o.total);
  final discount = completed.fold<num>(0, (s, o) => s + o.discountAmount);

  // Payment breakdown.
  final payMap = <String, ({int count, num total})>{};
  for (final o in completed) {
    final m = o.paymentMethod;
    final cur = payMap[m] ?? (count: 0, total: 0);
    payMap[m] = (count: cur.count + 1, total: cur.total + o.total);
  }
  final payments = payMap.entries
      .map((e) => PaymentLine(e.key, e.value.count, e.value.total))
      .where((p) => p.total > 0)
      .toList()
    ..sort((a, b) => b.total.compareTo(a.total));

  // Best-selling products.
  final prodMap = <String, ({num qty, num revenue})>{};
  for (final o in completed) {
    for (final it in o.items) {
      final cur = prodMap[it.productName] ?? (qty: 0, revenue: 0);
      prodMap[it.productName] = (qty: cur.qty + it.quantity, revenue: cur.revenue + it.total);
    }
  }
  final topProducts = prodMap.entries
      .map((e) => ReportProduct(e.key, e.value.qty, e.value.revenue))
      .toList()
    ..sort((a, b) => b.revenue.compareTo(a.revenue));

  return DailyReport(
    reportDate: DateFormat('yyyy-MM-dd').format(day),
    totalRevenue: revenue,
    totalOrders: completed.length,
    avgOrderValue: completed.isEmpty ? 0 : revenue / completed.length,
    totalDiscount: discount,
    totalVoids: voided.length,
    voidAmount: voided.fold<num>(0, (s, o) => s + o.total),
    topProducts: topProducts.take(5).toList(),
    payments: payments,
  );
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
