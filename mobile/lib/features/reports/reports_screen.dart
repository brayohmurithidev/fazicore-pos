import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets/mpesa_logo.dart';
import 'reports_repository.dart';

class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final daily = ref.watch(dailyReportProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Reports')),
      body: RefreshIndicator(
        onRefresh: () {
          ref.invalidate(salesTrendProvider);
          return ref.refresh(dailyReportProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const _FilterTile(),
            const SizedBox(height: 16),
            daily.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 80),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 60),
                child: Column(
                  children: [
                    Text(apiError(e), textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    FilledButton(onPressed: () => ref.refresh(dailyReportProvider), child: const Text('Retry')),
                  ],
                ),
              ),
              data: (d) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _SummaryCard(d: d),
                  const SizedBox(height: 16),
                  _BestSellingCard(products: d.topProducts),
                  const SizedBox(height: 16),
                  _PaymentCard(payments: d.payments),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterTile extends ConsumerWidget {
  const _FilterTile();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final date = ref.watch(reportDateProvider);
    final isToday = DateUtils.isSameDay(date, DateTime.now());
    return Card(
      child: ListTile(
        leading: const Icon(Icons.tune),
        title: Text(isToday ? 'Today' : DateFormat('EEEE, d MMM yyyy').format(date)),
        subtitle: const Text('Filter by date'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () async {
          final picked = await showDatePicker(
            context: context,
            initialDate: date,
            firstDate: DateTime(2023),
            lastDate: DateTime.now(),
          );
          if (picked != null) ref.read(reportDateProvider.notifier).state = picked;
        },
      ),
    );
  }
}

class _CardShell extends StatelessWidget {
  final String title;
  final Widget child;
  const _CardShell({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final DailyReport d;
  const _SummaryCard({required this.d});

  @override
  Widget build(BuildContext context) {
    return _CardShell(
      title: 'Summary',
      child: Column(
        children: [
          const SizedBox(height: 150, child: _Trend()),
          const SizedBox(height: 16),
          Row(
            children: [
              _stat('Gross sales', kes(d.totalRevenue)),
              _stat('Net sales', kes(d.netSales)),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _stat('Discount', kes(d.totalDiscount)),
              _stat('Voids', d.voidAmount > 0 ? kes(d.voidAmount) : '${d.totalVoids}',
                  warn: d.totalVoids > 0),
            ],
          ),
        ],
      ),
    );
  }

  Widget _stat(String label, String value, {bool warn = false}) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(color: Colors.grey, fontSize: 12)),
            const SizedBox(height: 2),
            Text(value,
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: warn ? AppColors.warning : null)),
          ],
        ),
      );
}

class _Trend extends ConsumerWidget {
  const _Trend();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(salesTrendProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text(apiError(e), style: const TextStyle(fontSize: 12, color: Colors.grey))),
      data: (points) {
        final maxY = points.fold<double>(0, (m, p) => p.revenue > m ? p.revenue.toDouble() : m);
        return LineChart(
          LineChartData(
            minY: 0,
            maxY: maxY == 0 ? 1 : maxY * 1.25,
            gridData: const FlGridData(show: false),
            borderData: FlBorderData(show: false),
            titlesData: FlTitlesData(
              leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              bottomTitles: AxisTitles(
                sideTitles: SideTitles(
                  showTitles: true,
                  interval: 1,
                  getTitlesWidget: (value, meta) {
                    final i = value.toInt();
                    if (i < 0 || i >= points.length) return const SizedBox.shrink();
                    return Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(DateFormat('E').format(points[i].day).substring(0, 1),
                          style: const TextStyle(fontSize: 10, color: Colors.grey)),
                    );
                  },
                ),
              ),
            ),
            lineBarsData: [
              LineChartBarData(
                spots: [for (var i = 0; i < points.length; i++) FlSpot(i.toDouble(), points[i].revenue.toDouble())],
                isCurved: true,
                color: AppColors.brand,
                barWidth: 3,
                dotData: const FlDotData(show: false),
                belowBarData: BarAreaData(show: true, color: AppColors.brand.withValues(alpha: 0.12)),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _BestSellingCard extends StatelessWidget {
  final List<ReportProduct> products;
  const _BestSellingCard({required this.products});

  @override
  Widget build(BuildContext context) {
    if (products.isEmpty) {
      return const _CardShell(
        title: 'Best-selling products',
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Text('No sales for this day', style: TextStyle(color: Colors.grey)),
        ),
      );
    }
    final maxRev = products.map((p) => p.revenue).fold<num>(0, (m, r) => r > m ? r : m);
    return _CardShell(
      title: 'Best-selling products',
      child: Column(
        children: [
          for (final p in products)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(p.name,
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w600)),
                      ),
                      Text(kes(p.revenue), style: const TextStyle(fontWeight: FontWeight.w700)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: maxRev == 0 ? 0 : (p.revenue / maxRev).toDouble(),
                            minHeight: 6,
                            backgroundColor: Colors.grey.shade200,
                            valueColor: const AlwaysStoppedAnimation(AppColors.brand),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text('${p.qty} sold', style: const TextStyle(color: Colors.grey, fontSize: 12)),
                    ],
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _PaymentCard extends StatelessWidget {
  final List<PaymentLine> payments;
  const _PaymentCard({required this.payments});

  @override
  Widget build(BuildContext context) {
    if (payments.isEmpty) {
      return const _CardShell(
        title: 'Payment methods',
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Text('No completed sales', style: TextStyle(color: Colors.grey)),
        ),
      );
    }
    final sum = payments.fold<num>(0, (s, p) => s + p.total);
    return _CardShell(
      title: 'Payment methods',
      child: Column(
        children: [
          for (final p in payments)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            _label(p.method),
                            const SizedBox(width: 8),
                            Text(kes(p.total), style: const TextStyle(fontWeight: FontWeight.w600)),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text('${p.count} sale${p.count == 1 ? '' : 's'}',
                            style: const TextStyle(color: Colors.grey, fontSize: 12)),
                      ],
                    ),
                  ),
                  Text('${sum == 0 ? 0 : ((p.total / sum) * 100).round()}%',
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.brand)),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _label(String m) {
    if (m == 'mpesa') return const MpesaLogo(height: 14);
    final t = switch (m) {
      'cash' => 'Cash',
      'credit' => 'Credit',
      'split' => 'Split',
      _ => m.isEmpty ? 'Other' : '${m[0].toUpperCase()}${m.substring(1)}',
    };
    return Text(t, style: const TextStyle(fontWeight: FontWeight.w600));
  }
}
