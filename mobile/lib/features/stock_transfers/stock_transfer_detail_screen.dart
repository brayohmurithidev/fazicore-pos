import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import 'stock_transfers_repository.dart';

const _statusLabels = {
  'initiated': 'Initiated',
  'in_transit': 'In Transit',
  'confirmed': 'Confirmed',
  'cancelled': 'Cancelled',
};

Color _statusColor(String status) {
  return switch (status) {
    'initiated' => Colors.orange,
    'in_transit' => Colors.blue,
    'confirmed' => Colors.green,
    'cancelled' => Colors.red,
    _ => Colors.grey,
  };
}

class StockTransferDetailScreen extends ConsumerWidget {
  final int transferId;
  const StockTransferDetailScreen({super.key, required this.transferId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(stockTransfersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Transfer Details')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(apiError(e))),
        data: (transfers) {
          final t = transfers.where((x) => x.id == transferId).firstOrNull;
          if (t == null) return const Center(child: Text('Transfer not found'));
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
                            child: Text(t.transferNumber,
                                style: Theme.of(context)
                                    .textTheme
                                    .titleLarge
                                    ?.copyWith(fontWeight: FontWeight.bold)),
                          ),
                          Container(
                            padding:
                                const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: _statusColor(t.status).withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              _statusLabels[t.status] ?? t.status,
                              style: TextStyle(
                                color: _statusColor(t.status),
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _meta('Product',
                          t.productName ?? 'Product #${t.productId}'),
                      _meta('Quantity', t.quantity.toString()),
                      _meta(
                          'Route',
                          '${t.fromBranchName ?? "Branch ${t.fromBranchId}"} → ${t.toBranchName ?? "Branch ${t.toBranchId}"}'),
                      if (t.initiatorName != null)
                        _meta('Initiated by', t.initiatorName!),
                      if (t.confirmerName != null)
                        _meta('Confirmed by', t.confirmerName!),
                      if (t.notes != null && t.notes!.isNotEmpty)
                        _meta('Notes', t.notes!),
                      _meta('Date', dateTimeShort(t.createdAt)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),
              _ActionButtons(transfer: t, ref: ref),
            ],
          );
        },
      ),
    );
  }

  Widget _meta(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 100,
              child: Text(label,
                  style: const TextStyle(color: Colors.grey, fontSize: 13)),
            ),
            Expanded(
                child: Text(value,
                    style: const TextStyle(fontWeight: FontWeight.w500))),
          ],
        ),
      );
}

class _ActionButtons extends ConsumerStatefulWidget {
  final StockTransfer transfer;
  final WidgetRef ref;
  const _ActionButtons({required this.transfer, required this.ref});

  @override
  ConsumerState<_ActionButtons> createState() => _ActionButtonsState();
}

class _ActionButtonsState extends ConsumerState<_ActionButtons> {
  bool _loading = false;

  Future<void> _doAction(String action) async {
    setState(() => _loading = true);
    try {
      await transferAction(widget.ref, widget.transfer.id, action);
      widget.ref.invalidate(stockTransfersProvider);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Transfer updated')));
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _cancel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel transfer?'),
        content: const Text(
            'Cancelling will return the stock to the source branch. This cannot be undone.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Keep')),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Cancel transfer'),
          ),
        ],
      ),
    );
    if (ok == true) _doAction('cancel');
  }

  @override
  Widget build(BuildContext context) {
    final status = widget.transfer.status;
    if (status == 'confirmed' || status == 'cancelled') return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (status == 'initiated') ...[
          FilledButton.icon(
            onPressed: _loading ? null : () => _doAction('mark-transit'),
            icon: const Icon(Icons.local_shipping_outlined),
            label: const Text('Mark In Transit'),
          ),
          const SizedBox(height: 8),
        ],
        FilledButton.icon(
          onPressed: _loading ? null : () => _doAction('confirm'),
          icon: const Icon(Icons.check_circle_outlined),
          label: const Text('Confirm Receipt'),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _loading ? null : _cancel,
          style: OutlinedButton.styleFrom(
              foregroundColor: Theme.of(context).colorScheme.error),
          icon: const Icon(Icons.cancel_outlined),
          label: const Text('Cancel Transfer'),
        ),
      ],
    );
  }
}
