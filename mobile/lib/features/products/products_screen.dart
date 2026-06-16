import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../manage/plan_provider.dart';
import 'product_form_screen.dart';
import 'products_repository.dart';

class ProductsScreen extends ConsumerStatefulWidget {
  const ProductsScreen({super.key});

  @override
  ConsumerState<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends ConsumerState<ProductsScreen> {
  final _controller = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      ref.read(productSearchProvider.notifier).state = value;
    });
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(productsProvider);
    final canAdd = ref.watch(planProvider).valueOrNull?.canAddProduct ?? true;
    return Scaffold(
      appBar: AppBar(title: const Text('Products')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          if (!canAdd) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content: Text('Product limit reached for your plan. Upgrade on the web admin.')));
            return;
          }
          Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ProductFormScreen()));
        },
        icon: const Icon(Icons.add),
        label: const Text('Add product'),
        backgroundColor: canAdd ? null : Colors.grey,
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _controller,
              onChanged: _onChanged,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Search by name, SKU or barcode',
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                suffixIcon: _controller.text.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _controller.clear();
                          _onChanged('');
                        },
                      ),
              ),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.refresh(productsProvider.future),
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => ListView(
                  children: [
                    const SizedBox(height: 120),
                    Center(child: Text(apiError(e), textAlign: TextAlign.center)),
                    const SizedBox(height: 12),
                    Center(
                      child: FilledButton(
                        onPressed: () => ref.refresh(productsProvider),
                        child: const Text('Retry'),
                      ),
                    ),
                  ],
                ),
                data: (items) {
                  if (items.isEmpty) {
                    return ListView(
                      children: const [
                        SizedBox(height: 120),
                        Center(child: Text('No products found', style: TextStyle(color: Colors.grey))),
                      ],
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) => _ProductTile(items[i]),
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

class _ProductTile extends StatelessWidget {
  final Product p;
  const _ProductTile(this.p);

  @override
  Widget build(BuildContext context) {
    final subtitleParts = <String>[
      if (p.sku != null && p.sku!.isNotEmpty) p.sku!,
      if (p.categoryName != null) p.categoryName!,
    ];
    return Card(
      margin: EdgeInsets.zero,
      child: ListTile(
        onTap: () {
          showModalBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            shape: const RoundedRectangleBorder(
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            ),
            builder: (_) => _ProductActionsSheet(product: p),
          );
        },
        title: Row(
          children: [
            Expanded(child: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis)),
            if (p.hasVariants) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                decoration: BoxDecoration(
                  color: const Color(0xFFEEF2FF),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  '${p.variantCount}v',
                  style: const TextStyle(fontSize: 10, color: Color(0xFF6366F1), fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ],
        ),
        subtitle: subtitleParts.isEmpty ? null : Text(subtitleParts.join(' · ')),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(kes(p.price), style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            if (p.trackInventory)
              Text(
                '${p.stockQuantity} ${p.unit}',
                style: TextStyle(
                  fontSize: 12,
                  color: p.isLowStock ? AppColors.warning : Colors.grey,
                  fontWeight: p.isLowStock ? FontWeight.w600 : FontWeight.normal,
                ),
              )
            else
              const Text('—', style: TextStyle(fontSize: 12, color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}

// ── Product actions sheet ─────────────────────────────────────────────────────

class _ProductActionsSheet extends StatelessWidget {
  final Product product;
  const _ProductActionsSheet({required this.product});

  void _openVariantStock(BuildContext context) {
    Navigator.of(context).pop();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _VariantStockSheet(product: product),
    );
  }

  void _openManageVariants(BuildContext context) {
    Navigator.of(context).pop();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _ManageVariantsSheet(product: product),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasVariants = product.hasVariants;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 14),
            Text(product.name,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                maxLines: 1, overflow: TextOverflow.ellipsis),
            Text(
              hasVariants ? '${product.variantCount} variants' : 'No variants',
              style: const TextStyle(color: Colors.grey, fontSize: 13),
            ),
            const SizedBox(height: 16),
            if (hasVariants) ...[
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.inventory_2_outlined),
                title: const Text('Stock Entry'),
                subtitle: const Text('Add stock to multiple variants at once'),
                onTap: () => _openVariantStock(context),
              ),
              const Divider(height: 1),
            ],
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.style_outlined),
              title: Text(hasVariants ? 'Manage Variants' : 'Set up Variants'),
              subtitle: Text(hasVariants
                  ? 'Edit options and generate new combinations'
                  : 'Add Size, Color and other options'),
              onTap: () => _openManageVariants(context),
            ),
            const Divider(height: 1),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Edit product'),
              onTap: () {
                Navigator.of(context).pop();
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => ProductFormScreen(product: product)),
                );
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

// ── Manage variants sheet ─────────────────────────────────────────────────────

class _ManageVariantsSheet extends ConsumerStatefulWidget {
  final Product product;
  const _ManageVariantsSheet({required this.product});

  @override
  ConsumerState<_ManageVariantsSheet> createState() => _ManageVariantsSheetState();
}

class _ManageVariantsSheetState extends ConsumerState<_ManageVariantsSheet> {
  late final Map<String, List<String>> _options;
  bool _generating = false;
  String? _error;

  // Add-attribute inline form state
  bool _showAddForm = false;
  final _nameCtrl = TextEditingController();
  final _valuesCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _options = Map<String, List<String>>.from(
      widget.product.variantOptions.map((k, v) => MapEntry(k, List<String>.from(v))),
    );
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _valuesCtrl.dispose();
    super.dispose();
  }

  void _addAttribute() {
    final name = _nameCtrl.text.trim();
    final values = _valuesCtrl.text
        .split(',')
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
    if (name.isEmpty || values.isEmpty) return;
    setState(() {
      _options[name] = values;
      _showAddForm = false;
      _nameCtrl.clear();
      _valuesCtrl.clear();
    });
  }

  Future<void> _generate() async {
    if (_options.isEmpty) {
      setState(() => _error = 'Add at least one attribute (e.g. Size) before generating.');
      return;
    }
    setState(() { _generating = true; _error = null; });
    try {
      final attrs = _options.entries
          .map((e) => {'name': e.key, 'values': e.value})
          .toList();
      final count = await generateVariants(ref, productId: widget.product.id, attributes: attrs);
      ref.invalidate(productsProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
      // Show result snackbar and offer to open stock entry
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(count > 0 ? 'Generated $count new variant${count != 1 ? 's' : ''}' : 'No new variants (all combinations already exist)'),
          action: count > 0
              ? SnackBarAction(
                  label: 'Add Stock',
                  onPressed: () {
                    // Re-fetch product to get updated variantOptions, then open stock entry
                    final updated = Product(
                      id: widget.product.id,
                      name: widget.product.name,
                      sku: widget.product.sku,
                      price: widget.product.price,
                      unit: widget.product.unit,
                      minStock: widget.product.minStock,
                      isActive: widget.product.isActive,
                      trackInventory: widget.product.trackInventory,
                      stockQuantity: widget.product.stockQuantity,
                      variantCount: widget.product.variantCount + count,
                      variantOptions: _options,
                    );
                    showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      shape: const RoundedRectangleBorder(
                        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                      ),
                      builder: (_) => _VariantStockSheet(product: updated),
                    );
                  },
                )
              : null,
          duration: const Duration(seconds: 5),
        ),
      );
    } catch (e) {
      if (mounted) setState(() { _generating = false; _error = apiError(e); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      maxChildSize: 0.92,
      builder: (_, scrollController) => Padding(
        padding: EdgeInsets.fromLTRB(20, 12, 20, MediaQuery.of(context).viewInsets.bottom + 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 14),
            Text(widget.product.name,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                maxLines: 1, overflow: TextOverflow.ellipsis),
            const Text('Define attributes and generate variant combinations',
                style: TextStyle(color: Colors.grey, fontSize: 13)),
            const SizedBox(height: 16),

            Expanded(
              child: ListView(
                controller: scrollController,
                children: [
                  // ── Existing attribute groups ──────────────────────────────
                  if (_options.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text('No attributes yet. Add one below.',
                          style: TextStyle(color: Colors.grey.shade500, fontSize: 13)),
                    )
                  else
                    ..._options.entries.map((entry) => Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(entry.key,
                                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                      const SizedBox(height: 4),
                                      Wrap(
                                        spacing: 6,
                                        runSpacing: 4,
                                        children: entry.value
                                            .map((v) => Container(
                                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                                  decoration: BoxDecoration(
                                                    color: scheme.primary.withValues(alpha: 0.08),
                                                    borderRadius: BorderRadius.circular(12),
                                                  ),
                                                  child: Text(v,
                                                      style: TextStyle(
                                                          fontSize: 12,
                                                          color: scheme.primary,
                                                          fontWeight: FontWeight.w500)),
                                                ))
                                            .toList(),
                                      ),
                                    ],
                                  ),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline, size: 18),
                                  color: Colors.grey,
                                  onPressed: () => setState(() => _options.remove(entry.key)),
                                ),
                              ],
                            ),
                          ),
                        )),

                  // ── Add attribute form ─────────────────────────────────────
                  if (_showAddForm) ...[
                    const SizedBox(height: 4),
                    TextField(
                      controller: _nameCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Attribute name',
                        hintText: 'e.g. Size',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      textCapitalization: TextCapitalization.words,
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _valuesCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Values (comma-separated)',
                        hintText: 'e.g. S, M, L, XL',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        TextButton(
                          onPressed: () => setState(() {
                            _showAddForm = false;
                            _nameCtrl.clear();
                            _valuesCtrl.clear();
                          }),
                          child: const Text('Cancel'),
                        ),
                        const SizedBox(width: 8),
                        FilledButton(
                          onPressed: _addAttribute,
                          child: const Text('Add'),
                        ),
                      ],
                    ),
                  ] else ...[
                    const SizedBox(height: 4),
                    TextButton.icon(
                      onPressed: () => setState(() => _showAddForm = true),
                      icon: const Icon(Icons.add, size: 18),
                      label: const Text('Add attribute'),
                    ),
                  ],

                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                  ],
                ],
              ),
            ),

            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _generating || _options.isEmpty ? null : _generate,
                icon: _generating
                    ? const SizedBox(
                        width: 16, height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.auto_awesome, size: 18),
                label: Text(_generating ? 'Generating…' : 'Generate Variants'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Variant stock entry sheet ─────────────────────────────────────────────────

class _VariantStockSheet extends ConsumerStatefulWidget {
  final Product product;
  const _VariantStockSheet({required this.product});

  @override
  ConsumerState<_VariantStockSheet> createState() => _VariantStockSheetState();
}

class _VariantStockSheetState extends ConsumerState<_VariantStockSheet> {
  List<ProductVariant>? _variants;
  String? _loadError;
  bool _saving = false;
  String? _saveError;
  final Map<int, TextEditingController> _controllers = {};
  final _notesController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final variants = await fetchProductVariants(ref, widget.product.id);
      if (!mounted) return;
      setState(() {
        _variants = variants;
        for (final v in variants) {
          _controllers[v.id] = TextEditingController();
        }
      });
    } catch (e) {
      if (mounted) setState(() => _loadError = e.toString());
    }
  }

  Future<void> _save() async {
    final entries = _controllers.entries
        .map((e) => {'variant_id': e.key, 'qty': int.tryParse(e.value.text.trim()) ?? 0})
        .where((e) => (e['qty'] as int) > 0)
        .toList();
    if (entries.isEmpty) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _saving = true;
      _saveError = null;
    });
    try {
      await bulkVariantStock(
        ref,
        productId: widget.product.id,
        entries: entries.cast<Map<String, int>>(),
        notes: _notesController.text.trim(),
      );
      ref.invalidate(productsProvider);
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Stock updated for ${entries.length} variant${entries.length != 1 ? 's' : ''}')),
        );
      }
    } catch (e) {
      if (mounted) setState(() { _saving = false; _saveError = e.toString(); });
    }
  }

  ProductVariant? _variantFor(Map<String, String> attrs) {
    for (final v in _variants ?? []) {
      if (attrs.entries.every((e) => v.attributes[e.key] == e.value)) return v;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final opts = widget.product.variantOptions;
    final attrKeys = opts.keys.toList();

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.65,
      maxChildSize: 0.95,
      builder: (_, scrollController) => Padding(
        padding: EdgeInsets.fromLTRB(20, 12, 20, MediaQuery.of(context).viewInsets.bottom + 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 14),
            Text(widget.product.name,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
            const Text('Enter qty to add per variant',
                style: TextStyle(color: Colors.grey, fontSize: 13)),
            const SizedBox(height: 16),

            // ── Loading / error / grid ────────────────────────────────────
            Expanded(
              child: _loadError != null
                  ? Center(child: Text(_loadError!, style: const TextStyle(color: Colors.red)))
                  : _variants == null
                      ? const Center(child: CircularProgressIndicator())
                      : ListView(
                          controller: scrollController,
                          children: [
                            // Matrix (2 attrs) or list (1 / 3+)
                            if (attrKeys.length == 2)
                              _buildMatrix(attrKeys[0], attrKeys[1], opts)
                            else
                              _buildList(),
                            const SizedBox(height: 16),
                            TextField(
                              controller: _notesController,
                              decoration: const InputDecoration(
                                labelText: 'Notes (optional)',
                                hintText: 'e.g. June shipment',
                                border: OutlineInputBorder(),
                                isDense: true,
                              ),
                            ),
                            if (_saveError != null) ...[
                              const SizedBox(height: 8),
                              Text(_saveError!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                            ],
                          ],
                        ),
            ),

            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _saving ? null : () => Navigator.of(context).pop(),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: _saving || _variants == null ? null : _save,
                    child: _saving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Text('Save'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMatrix(String rowKey, String colKey, Map<String, List<String>> opts) {
    final rowVals = opts[rowKey] ?? [];
    final colVals = opts[colKey] ?? [];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Table(
        defaultColumnWidth: const IntrinsicColumnWidth(),
        border: TableBorder(
          horizontalInside: BorderSide(color: Colors.grey.shade100),
        ),
        children: [
          // Header row
          TableRow(
            decoration: BoxDecoration(color: Colors.grey.shade50),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(0, 8, 16, 8),
                child: Text('$rowKey \\ $colKey',
                    style: const TextStyle(fontSize: 11, color: Colors.grey, fontWeight: FontWeight.w500)),
              ),
              ...colVals.map((c) => Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                    child: Text(c,
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                  )),
            ],
          ),
          // Data rows
          ...rowVals.map((row) {
            return TableRow(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(0, 6, 16, 6),
                  child: Text(row, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                ),
                ...colVals.map((col) {
                  final v = _variantFor({rowKey: row, colKey: col});
                  if (v == null) {
                    return const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                      child: Center(child: Text('—', style: TextStyle(color: Colors.black26))),
                    );
                  }
                  final ctrl = _controllers[v.id]!;
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                    child: Column(
                      children: [
                        Text(
                          '${v.stockQuantity}',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: v.stockQuantity == 0
                                ? Colors.red.shade400
                                : v.stockQuantity <= 5
                                    ? Colors.amber.shade700
                                    : Colors.green.shade600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        SizedBox(
                          width: 56,
                          height: 34,
                          child: TextField(
                            controller: ctrl,
                            keyboardType: TextInputType.number,
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontSize: 13),
                            decoration: InputDecoration(
                              hintText: '0',
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(vertical: 8),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }),
              ],
            );
          }),
        ],
      ),
    );
  }

  Widget _buildList() {
    final variants = _variants ?? [];
    return Column(
      children: variants.map((v) {
        final attrLabel = v.attributes.values.join(' / ');
        final ctrl = _controllers[v.id]!;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            children: [
              Expanded(child: Text(attrLabel, style: const TextStyle(fontSize: 13))),
              Text(
                '${v.stockQuantity}',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: v.stockQuantity == 0
                      ? Colors.red.shade400
                      : v.stockQuantity <= 5
                          ? Colors.amber.shade700
                          : Colors.green.shade600,
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 72,
                height: 36,
                child: TextField(
                  controller: ctrl,
                  keyboardType: TextInputType.number,
                  textAlign: TextAlign.center,
                  decoration: InputDecoration(
                    hintText: 'add',
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(vertical: 8),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
                  ),
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}
