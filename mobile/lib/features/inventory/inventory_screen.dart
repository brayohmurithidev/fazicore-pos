import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'inventory_repository.dart';

class InventoryScreen extends ConsumerWidget {
  const InventoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(inventoryProvider);
    final lowOnly = ref.watch(inventoryLowOnlyProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inventory'),
        actions: [
          Row(
            children: [
              const Text('Low only', style: TextStyle(fontSize: 13)),
              Switch(
                value: lowOnly,
                onChanged: (v) => ref.read(inventoryLowOnlyProvider.notifier).state = v,
              ),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(inventoryProvider.future),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              Center(child: Text(apiError(e), textAlign: TextAlign.center)),
              const SizedBox(height: 12),
              Center(
                child: FilledButton(
                  onPressed: () => ref.refresh(inventoryProvider),
                  child: const Text('Retry'),
                ),
              ),
            ],
          ),
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                children: [
                  const SizedBox(height: 120),
                  Center(
                    child: Text(lowOnly ? 'Nothing low on stock' : 'No inventory records',
                        style: const TextStyle(color: Colors.grey)),
                  ),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) {
                final it = items[i];
                return Card(
                  margin: EdgeInsets.zero,
                  child: ListTile(
                    onTap: () => _showAdjust(context, ref, it),
                    title: Text(it.productName ?? 'Product #${it.productId}',
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                    subtitle: Text([
                      if (it.branchName != null) it.branchName!,
                      if (it.reservedQuantity > 0) '${it.reservedQuantity} reserved',
                    ].join(' · ')),
                    trailing: Text(
                      '${it.quantity}',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: it.isLow ? AppColors.warning : null,
                      ),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  Future<void> _showAdjust(BuildContext context, WidgetRef ref, InventoryItem it) async {
    await showDialog<void>(
      context: context,
      builder: (_) => _AdjustDialog(item: it, ref: ref),
    );
  }
}

class _AdjustDialog extends StatefulWidget {
  final InventoryItem item;
  final WidgetRef ref;
  const _AdjustDialog({required this.item, required this.ref});

  @override
  State<_AdjustDialog> createState() => _AdjustDialogState();
}

class _AdjustDialogState extends State<_AdjustDialog> {
  final _qtyController = TextEditingController();
  final _notesController = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _qtyController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final delta = int.tryParse(_qtyController.text.trim());
    if (delta == null || delta == 0) {
      setState(() => _error = 'Enter a non-zero quantity (use - to remove)');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await adjustInventory(
        widget.ref,
        productId: widget.item.productId,
        branchId: widget.item.branchId,
        qtyChange: delta,
        notes: _notesController.text.trim(),
      );
      widget.ref.invalidate(inventoryProvider);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = apiError(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final it = widget.item;
    return AlertDialog(
      title: Text(it.productName ?? 'Adjust stock'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Current: ${it.quantity}', style: const TextStyle(color: Colors.grey)),
          const SizedBox(height: 12),
          TextField(
            controller: _qtyController,
            keyboardType: const TextInputType.numberWithOptions(signed: true),
            autofocus: true,
            decoration: const InputDecoration(
              labelText: 'Quantity change',
              hintText: 'e.g. 10 to add, -5 to remove',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notesController,
            decoration: const InputDecoration(
              labelText: 'Reason (optional)',
              border: OutlineInputBorder(),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _saving ? null : _submit,
          child: _saving
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Save'),
        ),
      ],
    );
  }
}
