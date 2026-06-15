import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import 'purchase_orders_repository.dart';

const _statusLabels = {
  'pending': 'Pending',
  'in_transit': 'In Transit',
  'received': 'Received',
  'cancelled': 'Cancelled',
};

Color _statusColor(String status) {
  return switch (status) {
    'pending' => Colors.orange,
    'in_transit' => Colors.blue,
    'received' => Colors.green,
    'cancelled' => Colors.red,
    _ => Colors.grey,
  };
}

class PurchaseOrderDetailScreen extends ConsumerWidget {
  final int orderId;
  const PurchaseOrderDetailScreen({super.key, required this.orderId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(purchaseOrdersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Purchase Order')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(apiError(e))),
        data: (orders) {
          final o = orders.where((x) => x.id == orderId).firstOrNull;
          if (o == null) {
            return const Center(child: Text('Order not found'));
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(o.poNumber,
                                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                      fontWeight: FontWeight.bold,
                                    )),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: _statusColor(o.status).withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              _statusLabels[o.status] ?? o.status,
                              style: TextStyle(
                                color: _statusColor(o.status),
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _meta('Supplier', o.supplier),
                      if (o.branchName != null) _meta('Branch', o.branchName!),
                      _meta('Date', dateTimeShort(o.createdAt)),
                      _meta('Total', kes(o.total)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text('Items (${o.items.length})',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Colors.grey)),
              const SizedBox(height: 8),
              Card(
                child: Column(
                  children: [
                    for (var i = 0; i < o.items.length; i++) ...[
                      ListTile(
                        title: Text(o.items[i].productName),
                        subtitle: Text('Qty: ${o.items[i].quantity}'),
                        trailing: Text(kes(o.items[i].unitCost),
                            style: const TextStyle(fontWeight: FontWeight.w600)),
                      ),
                      if (i != o.items.length - 1) const Divider(height: 1, indent: 16),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 20),
              _ActionButtons(order: o, ref: ref),
            ],
          );
        },
      ),
    );
  }

  Widget _meta(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          children: [
            SizedBox(
              width: 80,
              child: Text(label, style: const TextStyle(color: Colors.grey, fontSize: 13)),
            ),
            Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500))),
          ],
        ),
      );
}

class _ActionButtons extends ConsumerStatefulWidget {
  final PurchaseOrder order;
  final WidgetRef ref;
  const _ActionButtons({required this.order, required this.ref});

  @override
  ConsumerState<_ActionButtons> createState() => _ActionButtonsState();
}

class _ActionButtonsState extends ConsumerState<_ActionButtons> {
  bool _loading = false;

  Future<void> _doAction(String status) async {
    setState(() => _loading = true);
    try {
      await updatePOStatus(widget.ref, widget.order.id, status);
      widget.ref.invalidate(purchaseOrdersProvider);
      if (mounted) {
        final msg = status == 'received' ? 'Stock updated' : 'Status updated';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete PO?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _loading = true);
    try {
      await deletePurchaseOrder(widget.ref, widget.order.id);
      widget.ref.invalidate(purchaseOrdersProvider);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = widget.order.status;
    if (status == 'received' || status == 'cancelled') return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (status == 'pending') ...[
          FilledButton.icon(
            onPressed: _loading ? null : () => _doAction('in_transit'),
            icon: const Icon(Icons.local_shipping_outlined),
            label: const Text('Mark In Transit'),
          ),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: _loading ? null : () => _doAction('received'),
            icon: const Icon(Icons.check_circle_outlined),
            label: const Text('Mark Received'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _loading ? null : _delete,
            style: OutlinedButton.styleFrom(
              foregroundColor: Theme.of(context).colorScheme.error,
            ),
            icon: const Icon(Icons.delete_outline),
            label: const Text('Delete'),
          ),
        ],
        if (status == 'in_transit') ...[
          FilledButton.icon(
            onPressed: _loading ? null : () => _doAction('received'),
            icon: const Icon(Icons.check_circle_outlined),
            label: const Text('Mark Received'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _loading ? null : () => _doAction('cancelled'),
            style: OutlinedButton.styleFrom(
              foregroundColor: Theme.of(context).colorScheme.error,
            ),
            icon: const Icon(Icons.cancel_outlined),
            label: const Text('Cancel Order'),
          ),
        ],
      ],
    );
  }
}
