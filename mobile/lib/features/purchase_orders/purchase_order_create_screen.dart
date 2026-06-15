import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import 'purchase_orders_repository.dart';

class _LineItem {
  final TextEditingController name;
  final TextEditingController qty;
  final TextEditingController cost;

  _LineItem()
      : name = TextEditingController(),
        qty = TextEditingController(),
        cost = TextEditingController();

  void dispose() {
    name.dispose();
    qty.dispose();
    cost.dispose();
  }

  num get total {
    final q = int.tryParse(qty.text) ?? 0;
    final c = num.tryParse(cost.text) ?? 0;
    return q * c;
  }

  Map<String, dynamic> toJson() => {
        'product_name': name.text.trim(),
        'quantity': int.tryParse(qty.text) ?? 0,
        'unit_cost': num.tryParse(cost.text) ?? 0,
      };
}

class PurchaseOrderCreateScreen extends ConsumerStatefulWidget {
  const PurchaseOrderCreateScreen({super.key});

  @override
  ConsumerState<PurchaseOrderCreateScreen> createState() => _PurchaseOrderCreateScreenState();
}

class _PurchaseOrderCreateScreenState extends ConsumerState<PurchaseOrderCreateScreen> {
  final _formKey = GlobalKey<FormState>();
  final _supplier = TextEditingController();
  final List<_LineItem> _items = [_LineItem()];
  bool _loading = false;

  @override
  void dispose() {
    _supplier.dispose();
    for (final item in _items) {
      item.dispose();
    }
    super.dispose();
  }

  num get _total => _items.fold<num>(0, (sum, item) => sum + item.total);

  void _addItem() => setState(() => _items.add(_LineItem()));

  void _removeItem(int index) {
    if (_items.length == 1) return;
    setState(() {
      _items[index].dispose();
      _items.removeAt(index);
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await createPurchaseOrder(
        ref,
        supplier: _supplier.text.trim(),
        items: _items.map((e) => e.toJson()).toList(),
      );
      ref.invalidate(purchaseOrdersProvider);
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
    return Scaffold(
      appBar: AppBar(title: const Text('New Purchase Order')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _supplier,
              decoration: const InputDecoration(labelText: 'Supplier *', border: OutlineInputBorder()),
              textCapitalization: TextCapitalization.words,
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Supplier is required' : null,
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Text('Line Items',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w600)),
                const Spacer(),
                TextButton.icon(
                  onPressed: _addItem,
                  icon: const Icon(Icons.add),
                  label: const Text('Add row'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            for (var i = 0; i < _items.length; i++) ...[
              Card(
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Text('Item ${i + 1}',
                              style: const TextStyle(fontWeight: FontWeight.w600)),
                          const Spacer(),
                          if (_items.length > 1)
                            IconButton(
                              icon: const Icon(Icons.remove_circle_outline),
                              color: Theme.of(context).colorScheme.error,
                              onPressed: () => _removeItem(i),
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(),
                            ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      TextFormField(
                        controller: _items[i].name,
                        decoration:
                            const InputDecoration(labelText: 'Product name *', isDense: true),
                        textCapitalization: TextCapitalization.words,
                        validator: (v) =>
                            (v == null || v.trim().isEmpty) ? 'Required' : null,
                        onChanged: (_) => setState(() {}),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              controller: _items[i].qty,
                              decoration:
                                  const InputDecoration(labelText: 'Qty *', isDense: true),
                              keyboardType: TextInputType.number,
                              validator: (v) {
                                if (v == null || v.isEmpty) return 'Required';
                                if (int.tryParse(v) == null || int.parse(v) <= 0) {
                                  return 'Invalid';
                                }
                                return null;
                              },
                              onChanged: (_) => setState(() {}),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              controller: _items[i].cost,
                              decoration:
                                  const InputDecoration(labelText: 'Unit cost *', isDense: true),
                              keyboardType:
                                  const TextInputType.numberWithOptions(decimal: true),
                              validator: (v) {
                                if (v == null || v.isEmpty) return 'Required';
                                if (num.tryParse(v) == null) return 'Invalid';
                                return null;
                              },
                              onChanged: (_) => setState(() {}),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 8),
            ],
            const SizedBox(height: 8),
            Card(
              color: Theme.of(context).colorScheme.primaryContainer,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    Text('Total',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: Theme.of(context).colorScheme.onPrimaryContainer,
                        )),
                    const Spacer(),
                    Text(kes(_total),
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 18,
                          color: Theme.of(context).colorScheme.onPrimaryContainer,
                        )),
                  ],
                ),
              ),
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
                  : const Text('Create Purchase Order'),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
