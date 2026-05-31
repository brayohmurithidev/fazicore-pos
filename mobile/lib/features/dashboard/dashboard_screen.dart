import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../auth/auth_controller.dart';
import 'dashboard_repository.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(dashboardProvider);
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
        onRefresh: () async => ref.refresh(dashboardProvider.future),
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
              Row(
                children: [
                  _StatCard(label: "Today's Revenue", value: kes(d.todayRevenue), color: const Color(0xFF059669)),
                  const SizedBox(width: 12),
                  _StatCard(label: 'Transactions', value: '${d.todayTransactions}'),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _StatCard(
                    label: 'Low Stock',
                    value: '${d.lowStockCount}',
                    color: d.lowStockCount > 0 ? const Color(0xFFb45309) : null,
                  ),
                  const SizedBox(width: 12),
                  const Expanded(child: SizedBox()),
                ],
              ),
              const SizedBox(height: 24),
              const Text('Top Products Today', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              if (d.topProducts.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: Text('No sales yet today', style: TextStyle(color: Colors.grey))),
                )
              else
                ...d.topProducts.map((p) => Card(
                      child: ListTile(
                        title: Text(p.name),
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

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color? color;
  const _StatCard({required this.label, required this.value, this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(color: Colors.grey, fontSize: 12)),
              const SizedBox(height: 6),
              Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
            ],
          ),
        ),
      ),
    );
  }
}
