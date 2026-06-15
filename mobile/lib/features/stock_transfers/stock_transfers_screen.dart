import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../manage/manage_repository.dart';
import '../sell/catalog_providers.dart';
import 'stock_transfers_repository.dart';

const _statuses = ['All', 'initiated', 'in_transit', 'confirmed', 'cancelled'];
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

class StockTransfersScreen extends ConsumerStatefulWidget {
  const StockTransfersScreen({super.key});

  @override
  ConsumerState<StockTransfersScreen> createState() => _StockTransfersScreenState();
}

class _StockTransfersScreenState extends ConsumerState<StockTransfersScreen> {
  String _filter = 'All';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(stockTransfersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Stock Transfers')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openInitiateSheet(context),
        icon: const Icon(Icons.swap_horiz),
        label: const Text('Transfer'),
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
              onRefresh: () async => ref.refresh(stockTransfersProvider.future),
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => ListView(
                  children: [
                    const SizedBox(height: 120),
                    Center(child: Text(apiError(e), textAlign: TextAlign.center)),
                    const SizedBox(height: 12),
                    Center(
                      child: FilledButton(
                        onPressed: () => ref.refresh(stockTransfersProvider),
                        child: const Text('Retry'),
                      ),
                    ),
                  ],
                ),
                data: (transfers) {
                  final filtered = _filter == 'All'
                      ? transfers
                      : transfers.where((t) => t.status == _filter).toList();
                  if (filtered.isEmpty) {
                    return ListView(
                      children: const [
                        SizedBox(height: 120),
                        Center(
                          child: Column(
                            children: [
                              Icon(Icons.swap_horiz, size: 48, color: Colors.grey),
                              SizedBox(height: 8),
                              Text('No stock transfers', style: TextStyle(color: Colors.grey)),
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
                      final t = filtered[i];
                      return Card(
                        margin: EdgeInsets.zero,
                        child: ListTile(
                          onTap: () => context.push('/stock-transfers/${t.id}'),
                          title: Text(t.productName ?? 'Product #${t.productId}',
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                          subtitle: Text(
                            '${t.fromBranchName ?? "Branch ${t.fromBranchId}"} → ${t.toBranchName ?? "Branch ${t.toBranchId}"}',
                          ),
                          trailing: Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text('Qty ${t.quantity}',
                                  style: const TextStyle(fontWeight: FontWeight.w600)),
                              const SizedBox(height: 4),
                              Container(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: _statusColor(t.status).withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  _statusLabels[t.status] ?? t.status,
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: _statusColor(t.status),
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

  void _openInitiateSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _InitiateTransferSheet(ref: ref),
    );
  }
}

class _InitiateTransferSheet extends StatefulWidget {
  final WidgetRef ref;
  const _InitiateTransferSheet({required this.ref});

  @override
  State<_InitiateTransferSheet> createState() => _InitiateTransferSheetState();
}

class _InitiateTransferSheetState extends State<_InitiateTransferSheet> {
  final _formKey = GlobalKey<FormState>();
  final _productCtrl = TextEditingController();
  final _qtyCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  int? _productId;
  int? _fromBranchId;
  int? _toBranchId;
  bool _loading = false;

  @override
  void dispose() {
    _productCtrl.dispose();
    _qtyCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_productId == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Select a product')));
      return;
    }
    if (_fromBranchId == null || _toBranchId == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Select both branches')));
      return;
    }
    if (_fromBranchId == _toBranchId) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Source and destination must differ')));
      return;
    }
    setState(() => _loading = true);
    try {
      await initiateTransfer(
        widget.ref,
        productId: _productId!,
        fromBranchId: _fromBranchId!,
        toBranchId: _toBranchId!,
        quantity: int.parse(_qtyCtrl.text),
        notes: _notesCtrl.text.trim(),
      );
      widget.ref.invalidate(stockTransfersProvider);
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
    final productsAsync = widget.ref.watch(cachedProductsProvider);
    final branchesAsync = widget.ref.watch(branchesProvider);

    final products = productsAsync.valueOrNull ?? [];
    final branches = branchesAsync.valueOrNull ?? [];

    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Initiate Transfer', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            DropdownButtonFormField<int>(
              value: _productId,
              decoration: const InputDecoration(labelText: 'Product *'),
              items: products
                  .map((p) => DropdownMenuItem(value: p.id, child: Text(p.name)))
                  .toList(),
              onChanged: (v) => setState(() => _productId = v),
              validator: (v) => v == null ? 'Select a product' : null,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<int>(
              value: _fromBranchId,
              decoration: const InputDecoration(labelText: 'From branch *'),
              items: branches
                  .map((b) => DropdownMenuItem(value: b.id, child: Text(b.name)))
                  .toList(),
              onChanged: (v) => setState(() => _fromBranchId = v),
              validator: (v) => v == null ? 'Select source branch' : null,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<int>(
              value: _toBranchId,
              decoration: const InputDecoration(labelText: 'To branch *'),
              items: branches
                  .map((b) => DropdownMenuItem(value: b.id, child: Text(b.name)))
                  .toList(),
              onChanged: (v) => setState(() => _toBranchId = v),
              validator: (v) => v == null ? 'Select destination branch' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _qtyCtrl,
              decoration: const InputDecoration(labelText: 'Quantity *'),
              keyboardType: TextInputType.number,
              validator: (v) {
                if (v == null || v.isEmpty) return 'Required';
                if (int.tryParse(v) == null || int.parse(v) <= 0) return 'Must be > 0';
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _notesCtrl,
              decoration: const InputDecoration(labelText: 'Notes'),
              maxLines: 2,
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Initiate Transfer'),
            ),
          ],
        ),
      ),
    );
  }
}
