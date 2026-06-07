import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets/mpesa_logo.dart';
import '../auth/auth_controller.dart';
import '../reports/reports_repository.dart';
import 'dashboard_repository.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(dashboardProvider);
    final user = ref.watch(authControllerProvider).user;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () {
          ref.invalidate(salesTrendProvider);
          return ref.refresh(dashboardProvider.future);
        },
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              Center(child: Text(apiError(e), textAlign: TextAlign.center)),
              const SizedBox(height: 12),
              Center(
                child: FilledButton(
                  onPressed: () => ref.refresh(dashboardProvider),
                  child: const Text('Retry'),
                ),
              ),
            ],
          ),
          data: (d) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _Greeting(name: user?.name),
              const SizedBox(height: 12),
              _RevenueHero(d: d),
              const SizedBox(height: 16),
              _PaymentsCard(payments: d.payments),
              const SizedBox(height: 16),
              _LowStockTile(count: d.lowStockCount),
              const SizedBox(height: 24),
              const _SectionTitle('Last 7 days'),
              const SizedBox(height: 12),
              const SizedBox(height: 150, child: _DashTrend()),
              const SizedBox(height: 24),
              const _SectionTitle('Top products today'),
              const SizedBox(height: 8),
              if (d.topProducts.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 20),
                  child: Center(child: Text('No sales yet today', style: TextStyle(color: Colors.grey))),
                )
              else
                ...d.topProducts.map((p) => Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        dense: true,
                        title: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text('${p.qtySold} sold'),
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

class _Greeting extends StatelessWidget {
  final String? name;
  const _Greeting({this.name});

  @override
  Widget build(BuildContext context) {
    final h = DateTime.now().hour;
    final part = h < 12 ? 'Good morning' : (h < 17 ? 'Good afternoon' : 'Good evening');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(name == null ? part : '$part, ${name!.split(' ').first}',
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        Text(DateFormat('EEEE, d MMM yyyy').format(DateTime.now()),
            style: const TextStyle(color: Colors.grey, fontSize: 13)),
      ],
    );
  }
}

class _RevenueHero extends StatelessWidget {
  final DashboardSummary d;
  const _RevenueHero({required this.d});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Today's revenue", style: TextStyle(color: Colors.grey, fontSize: 13)),
            const SizedBox(height: 4),
            Text(kes(d.todayRevenue),
                style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(child: _MiniStat(label: 'Transactions', value: '${d.todayTransactions}')),
                Container(width: 1, height: 32, color: Colors.black.withValues(alpha: 0.08)),
                Expanded(child: _MiniStat(label: 'Avg sale', value: kes(d.avgSale))),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  const _MiniStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 12),
          child: Text(label, style: const TextStyle(color: Colors.grey, fontSize: 12)),
        ),
        const SizedBox(height: 2),
        Padding(
          padding: const EdgeInsets.only(left: 12),
          child: Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }
}

class _PaymentsCard extends StatelessWidget {
  final List<PaymentStat> payments;
  const _PaymentsCard({required this.payments});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Payments today', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            if (payments.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Text('No sales yet', style: TextStyle(color: Colors.grey)),
              )
            else
              ...payments.map((p) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      children: [
                        SizedBox(width: 72, child: _methodLabel(p.method)),
                        Text('${p.count}×', style: const TextStyle(color: Colors.grey, fontSize: 12)),
                        const Spacer(),
                        Text(kes(p.total), style: const TextStyle(fontWeight: FontWeight.w600)),
                      ],
                    ),
                  )),
          ],
        ),
      ),
    );
  }

  Widget _methodLabel(String m) {
    if (m == 'mpesa') return const Align(alignment: Alignment.centerLeft, child: MpesaLogo(height: 14));
    final label = switch (m) {
      'cash' => 'Cash',
      'credit' => 'Credit',
      'split' => 'Split',
      _ => m.isEmpty ? 'Other' : '${m[0].toUpperCase()}${m.substring(1)}',
    };
    return Text(label, style: const TextStyle(fontWeight: FontWeight.w500));
  }
}

class _LowStockTile extends StatelessWidget {
  final int count;
  const _LowStockTile({required this.count});

  @override
  Widget build(BuildContext context) {
    final has = count > 0;
    return Card(
      child: ListTile(
        onTap: () => context.push('/inventory'),
        leading: Icon(Icons.warning_amber_rounded, color: has ? AppColors.warning : Colors.grey),
        title: Text(has ? '$count item${count == 1 ? '' : 's'} low on stock' : 'Stock levels healthy'),
        subtitle: const Text('Tap to view inventory'),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);
  @override
  Widget build(BuildContext context) =>
      Text(text, style: const TextStyle(fontWeight: FontWeight.w600));
}

class _DashTrend extends ConsumerWidget {
  const _DashTrend();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(salesTrendProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
          child: Text(apiError(e), style: const TextStyle(fontSize: 12, color: Colors.grey))),
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
                  for (var i = 0; i < points.length; i++)
                    FlSpot(i.toDouble(), points[i].revenue.toDouble()),
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
