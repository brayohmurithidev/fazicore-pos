import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/widgets/app_select.dart';
import '../../core/widgets/barcode_scanner_page.dart';
import '../sync/sync_engine.dart';
import 'products_repository.dart';

class ProductFormScreen extends ConsumerStatefulWidget {
  final Product? product; // null = create
  const ProductFormScreen({super.key, this.product});

  @override
  ConsumerState<ProductFormScreen> createState() => _ProductFormScreenState();
}

class _ProductFormScreenState extends ConsumerState<ProductFormScreen> {
  late final _name = TextEditingController(text: widget.product?.name ?? '');
  late final _price = TextEditingController(text: widget.product?.price.toStringAsFixed(0) ?? '');
  late final _cost = TextEditingController(text: widget.product?.cost?.toStringAsFixed(0) ?? '');
  late final _sku = TextEditingController(text: widget.product?.sku ?? '');
  late final _barcode = TextEditingController(text: widget.product?.barcode ?? '');
  late final _stock = TextEditingController();
  late int? _categoryId = widget.product?.categoryId;
  bool _saving = false;
  String? _error;

  bool get _isEdit => widget.product != null;

  @override
  void dispose() {
    for (final c in [_name, _price, _cost, _sku, _barcode, _stock]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    final price = num.tryParse(_price.text.trim());
    if (name.isEmpty) {
      setState(() => _error = 'Enter a product name');
      return;
    }
    if (price == null || price <= 0) {
      setState(() => _error = 'Enter a valid price');
      return;
    }
    setState(() { _saving = true; _error = null; });

    final data = <String, dynamic>{
      'name': name,
      'price': price,
      if (_cost.text.trim().isNotEmpty) 'cost': num.tryParse(_cost.text.trim()),
      'category_id': _categoryId,
      if (_sku.text.trim().isNotEmpty) 'sku': _sku.text.trim(),
      if (_barcode.text.trim().isNotEmpty) 'barcode': _barcode.text.trim(),
      if (!_isEdit && _stock.text.trim().isNotEmpty) 'initial_stock': int.tryParse(_stock.text.trim()) ?? 0,
    };

    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await saveProduct(ref, id: widget.product?.id, data: data);
      ref.invalidate(productsProvider);
      ref.read(syncControllerProvider.notifier).syncNow(); // refresh local cache
      navigator.pop(true);
      messenger.showSnackBar(SnackBar(content: Text(_isEdit ? 'Product updated' : 'Product added')));
    } catch (e) {
      if (mounted) setState(() { _saving = false; _error = apiError(e); });
    }
  }

  Future<void> _confirmDelete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete product?'),
        content: Text('Remove "${widget.product!.name}"? This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() { _saving = true; _error = null; });
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await deleteProduct(ref, widget.product!.id);
      ref.invalidate(productsProvider);
      ref.read(syncControllerProvider.notifier).syncNow();
      navigator.pop(true);
      messenger.showSnackBar(const SnackBar(content: Text('Product deleted')));
    } catch (e) {
      if (mounted) setState(() { _saving = false; _error = apiError(e); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(categoriesProvider).valueOrNull ?? const [];
    return Scaffold(
      appBar: AppBar(title: Text(_isEdit ? 'Edit product' : 'Add product')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _field(_name, 'Product name'),
          _field(_price, 'Selling price', number: true, prefix: 'KES '),
          _field(_cost, 'Capital price (cost)', number: true, prefix: 'KES '),
          AppSelect<int>(
            label: 'Category',
            hint: 'Choose category',
            value: _categoryId,
            searchable: categories.length > 8,
            options: [
              const SelectOption('No category', null),
              ...categories.map((c) => SelectOption(c.name, c.id)),
            ],
            onChanged: (v) => setState(() => _categoryId = v),
          ),
          const SizedBox(height: 12),
          _field(_sku, 'SKU (optional)'),
          _field(_barcode, 'Barcode (optional)', scan: true),
          if (!_isEdit) _field(_stock, 'Initial stock (optional)', number: true),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 16),
          FilledButton(
            style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(_isEdit ? 'Save changes' : 'Add product'),
          ),
          if (_isEdit) ...[
            const SizedBox(height: 8),
            TextButton.icon(
              icon: Icon(Icons.delete_outline, color: Theme.of(context).colorScheme.error),
              label: Text('Delete product', style: TextStyle(color: Theme.of(context).colorScheme.error)),
              onPressed: _saving ? null : _confirmDelete,
            ),
          ],
        ],
      ),
    );
  }

  Widget _field(TextEditingController c, String label, {bool number = false, String? prefix, bool scan = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: c,
        keyboardType: number ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.text,
        inputFormatters: number ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))] : null,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          isDense: true,
          prefixText: prefix,
          suffixIcon: scan
              ? IconButton(
                  icon: const Icon(Icons.qr_code_scanner),
                  onPressed: () async {
                    final code = await scanBarcode(context);
                    if (code != null) setState(() => c.text = code);
                  },
                )
              : null,
        ),
      ),
    );
  }
}
