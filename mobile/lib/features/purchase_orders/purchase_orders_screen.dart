import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import 'purchase_orders_repository.dart';

const _statuses = ['All', 'pending', 'in_transit', 'received', 'cancelled'];
const _statusLabels = {
  'pending': 'Pending',
  'in_transit': 'In Transit',
  'received': 'Received',
  'cancelled': 'Cancelled',
};

Color _statusColor(BuildContext context, String status) {
  return switch (status) {
    'pending' => Colors.orange,
    'in_transit' => Colors.blue,
    'received' => Colors.green,
    'cancelled' => Colors.red,
    _ => Colors.grey,
  };
}

class PurchaseOrdersScreen extends ConsumerStatefulWidget {
  const PurchaseOrdersScreen({super.key});

  @override
  ConsumerState<PurchaseOrdersScreen> createState() => _PurchaseOrdersScreenState();
}

class _PurchaseOrdersScreenState extends ConsumerState<PurchaseOrdersScreen> {
  String _filter = 'All';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(purchaseOrdersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Purchase Orders')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/purchase-orders/create'),
        icon: const Icon(Icons.add),
        label: const Text('New PO'),
      ),
      body: Column(
        children: [
          SizedBox(
            height: 48,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: _statuses.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final s = _statuses[i];
                final label = s == 'All' ? 'All' : (_statusLabels[s] ?? s);
                final selected = _filter == s;
                return FilterChip(
                  label: Text(label),
                  selected: selected,
                  onSelected: (_) => setState(() => _filter = s),
                );
              },
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.refresh(purchaseOrdersProvider.future),
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => ListView(
                  children: [
                    const SizedBox(height: 120),
                    Center(child: Text(apiError(e), textAlign: TextAlign.center)),
                    const SizedBox(height: 12),
                    Center(
                      child: FilledButton(
                        onPressed: () => ref.refresh(purchaseOrdersProvider),
                        child: const Text('Retry'),
                      ),
                    ),
                  ],
                ),
                data: (orders) {
                  final filtered = _filter == 'All'
                      ? orders
                      : orders.where((o) => o.status == _filter).toList();
                  if (filtered.isEmpty) {
                    return ListView(
                      children: const [
                        SizedBox(height: 120),
                        Center(
                          child: Column(
                            children: [
                              Icon(Icons.receipt_long_outlined, size: 48, color: Colors.grey),
                              SizedBox(height: 8),
                              Text('No purchase orders', style: TextStyle(color: Colors.grey)),
                            ],
                          ),
                        ),
                      ],
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) {
                      final o = filtered[i];
                      return Card(
                        margin: EdgeInsets.zero,
                        child: ListTile(
                          onTap: () => context.push('/purchase-orders/${o.id}'),
                          title: Text(o.poNumber,
                              style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text(o.supplier),
                          trailing: Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(kes(o.total),
                                  style: const TextStyle(fontWeight: FontWeight.w600)),
                              const SizedBox(height: 4),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: _statusColor(context, o.status).withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  _statusLabels[o.status] ?? o.status,
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: _statusColor(context, o.status),
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
