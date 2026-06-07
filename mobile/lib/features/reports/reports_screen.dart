import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import 'reports_repository.dart';

class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final daily = ref.watch(dailyReportProvider);
    final date = ref.watch(reportDateProvider);
    final isToday = DateUtils.isSameDay(date, DateTime.now());

    return Scaffold(
      appBar: AppBar(
        title: const Text('Reports'),
        actions: [
          TextButton.icon(
            icon: const Icon(Icons.calendar_today, size: 16),
            label: Text(isToday ? 'Today' : DateFormat('d MMM').format(date)),
            onPressed: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: date,
                firstDate: DateTime(2023),
                lastDate: DateTime.now(),
              );
              if (picked != null) {
                ref.read(reportDateProvider.notifier).state = picked;
              }
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () {
          ref.invalidate(salesTrendProvider);
          return ref.refresh(dailyReportProvider.future);
        },
        child: daily.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              Center(child: Text(apiError(e), textAlign: TextAlign.center)),
              const SizedBox(height: 12),
              Center(
                child: FilledButton(
                  onPressed: () => ref.refresh(dailyReportProvider),
                  child: const Text('Retry'),
                ),
              ),
            ],
          ),
          data: (d) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(children: [
                _Stat(label: 'Revenue', value: kes(d.totalRevenue)),
                const SizedBox(width: 12),
                _Stat(label: 'Orders', value: '${d.totalOrders}'),
              ]),
              const SizedBox(height: 12),
              Row(children: [
                _Stat(label: 'Avg Order', value: kes(d.avgOrderValue)),
                const SizedBox(width: 12),
                _Stat(
                  label: 'Voids',
                  value: '${d.totalVoids}',
                  color: d.totalVoids > 0 ? Theme.of(context).colorScheme.error : null,
                ),
              ]),
              const SizedBox(height: 24),
              const Text('7-Day Revenue Trend', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              const SizedBox(height: 180, child: _TrendChart()),
              const SizedBox(height: 24),
              const Text('Payment Breakdown', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              if (d.paymentBreakdown.isEmpty)
                const Text('No completed sales', style: TextStyle(color: Colors.grey))
              else
                SizedBox(height: 160, child: _PaymentChart(d.paymentBreakdown)),
              const SizedBox(height: 24),
              const Text('Top Products', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              if (d.topProducts.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Text('No sales for this day', style: TextStyle(color: Colors.grey)),
                )
              else
                ...d.topProducts.map((p) => Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        dense: true,
                        title: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text('${p.qty} sold'),
                        trailing: Text(kes(p.revenue), style: const TextStyle(fontWeight: FontWeight.w600)),
                      ),
                    )),
            ],
          ),
        ),
      ),
    );
  }
}

class _TrendChart extends ConsumerWidget {
  const _TrendChart();

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
            maxY: maxY == 0 ? 1 : maxY * 1.2,
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
                      child: Text(DateFormat('E').format(points[i].day),
                          style: const TextStyle(fontSize: 10, color: Colors.grey)),
                    );
                  },
                ),
              ),
            ),
            lineBarsData: [
              LineChartBarData(
                spots: [
                  for (var i = 0; i < points.length; i++) FlSpot(i.toDouble(), points[i].revenue.toDouble()),
                ],
                isCurved: true,
                color: AppColors.brand,
                barWidth: 3,
                dotData: const FlDotData(show: true),
                belowBarData: BarAreaData(show: true, color: AppColors.brand.withValues(alpha: 0.12)),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _PaymentChart extends StatelessWidget {
  final List<(String, num)> data;
  const _PaymentChart(this.data);

  @override
  Widget build(BuildContext context) {
    final maxY = data.fold<double>(0, (m, e) => e.$2 > m ? e.$2.toDouble() : m);
    return BarChart(
      BarChartData(
        maxY: maxY == 0 ? 1 : maxY * 1.2,
        gridData: const FlGridData(show: false),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (value, meta) {
                final i = value.toInt();
                if (i < 0 || i >= data.length) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(data[i].$1, style: const TextStyle(fontSize: 10, color: Colors.grey)),
                );
              },
            ),
          ),
        ),
        barGroups: [
          for (var i = 0; i < data.length; i++)
            BarChartGroupData(x: i, barRods: [
              BarChartRodData(
                toY: data[i].$2.toDouble(),
                color: AppColors.brand,
                width: 22,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
              ),
            ]),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  final Color? color;
  const _Stat({required this.label, required this.value, this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(color: Colors.grey, fontSize: 12)),
              const SizedBox(height: 6),
              Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: color)),
            ],
          ),
        ),
      ),
    );
  }
}
