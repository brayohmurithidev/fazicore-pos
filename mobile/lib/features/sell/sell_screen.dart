import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/db/app_database.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets/app_select.dart';
import 'cart_controller.dart';
import 'cart_sheet.dart';
import 'catalog_providers.dart';
import 'scan_screen.dart';

class SellScreen extends ConsumerStatefulWidget {
  const SellScreen({super.key});

  @override
  ConsumerState<SellScreen> createState() => _SellScreenState();
}

class _SellScreenState extends ConsumerState<SellScreen> {
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
    _debounce = Timer(const Duration(milliseconds: 250), () {
      ref.read(sellSearchProvider.notifier).state = value;
    });
  }

  @override
  Widget build(BuildContext context) {
    final products = ref.watch(cachedProductsProvider);
    final cart = ref.watch(cartProvider);
    final grid = ref.watch(sellGridViewProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Sell')),
      body: Column(
        children: [
          _FilterRow(
            controller: _controller,
            onSearch: _onChanged,
            grid: grid,
            onToggleView: () => ref.read(sellGridViewProvider.notifier).state = !grid,
            onScan: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ScanScreen()),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(cachedProductsProvider.future),
              child: products.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => ListView(children: [const SizedBox(height: 120), Center(child: Text(apiError(e)))]),
                data: (items) {
                  if (items.isEmpty) {
                    return ListView(
                      children: const [
                        SizedBox(height: 120),
                        Padding(
                          padding: EdgeInsets.all(32),
                          child: Text(
                            'No products cached yet.\nSync from the More tab while online.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Colors.grey),
                          ),
                        ),
                      ],
                    );
                  }
                  return grid ? _ProductGrid(items: items) : _ProductList(items: items);
                },
              ),
            ),
          ),
          if (!cart.isEmpty) _CartBar(cart: cart),
        ],
      ),
    );
  }
}

class _FilterRow extends ConsumerWidget {
  final TextEditingController controller;
  final ValueChanged<String> onSearch;
  final bool grid;
  final VoidCallback onToggleView;
  final VoidCallback onScan;
  const _FilterRow({
    required this.controller,
    required this.onSearch,
    required this.grid,
    required this.onToggleView,
    required this.onScan,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories = ref.watch(cachedCategoriesProvider).valueOrNull ?? const [];
    final selected = ref.watch(sellCategoryProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: AppSelect<String>(
                  hint: 'All products',
                  value: selected,
                  searchable: categories.length > 8,
                  options: [
                    const SelectOption('All products', null),
                    ...categories.map((c) => SelectOption(c, c)),
                  ],
                  onChanged: (v) => ref.read(sellCategoryProvider.notifier).state = v,
                ),
              ),
              IconButton(icon: const Icon(Icons.qr_code_scanner), tooltip: 'Scan', onPressed: onScan),
              IconButton(
                icon: Icon(grid ? Icons.view_list_outlined : Icons.grid_view_outlined),
                tooltip: grid ? 'List view' : 'Grid view',
                onPressed: onToggleView,
              ),
            ],
          ),
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: TextField(
              controller: controller,
              onChanged: onSearch,
              decoration: InputDecoration(
                hintText: 'Search products',
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

Future<void> _onProductTap(BuildContext context, WidgetRef ref, LocalProduct p) async {
  final meta = ref.read(variantMetaProvider).valueOrNull;
  if (meta != null && meta.hasVariants.contains(p.id)) {
    final variants = meta.variants[p.id] ?? [];
    if (variants.isNotEmpty) {
      await showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (_) => _VariantPickerSheet(parent: p, variants: variants, ref: ref),
      );
      return;
    }
  }
  ref.read(cartProvider.notifier).add(p);
}

int _totalVariantQty(Cart cart, dynamic variantMeta, int parentId) {
  final variants = (variantMeta?.variants[parentId] as List?) ?? const [];
  return variants.fold<int>(0, (sum, v) {
    final vid = v['id'] as int?;
    return sum + (vid != null ? (cart.lines[vid]?.qty ?? 0) : 0);
  });
}

String _variantPriceLabel(dynamic variantMeta, LocalProduct p) {
  final variants = (variantMeta?.variants[p.id] as List?) ?? const [];
  if (variants.isEmpty) return kes(p.price);
  final prices = variants
      .map((v) => (v['price'] as num?)?.toDouble() ?? p.price)
      .toList();
  final minP = prices.reduce((a, b) => a < b ? a : b);
  final maxP = prices.reduce((a, b) => a > b ? a : b);
  if ((maxP - minP).abs() < 0.01) return kes(minP);
  return 'from ${kes(minP)}';
}

class _ProductGrid extends ConsumerWidget {
  final List<LocalProduct> items;
  const _ProductGrid({required this.items});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final variantMeta = ref.watch(variantMetaProvider).valueOrNull;
    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 0.74,
      ),
      itemCount: items.length,
      itemBuilder: (_, i) {
        final p = items[i];
        final hasVariants = variantMeta?.hasVariants.contains(p.id) ?? false;
        final qty = hasVariants
            ? _totalVariantQty(cart, variantMeta, p.id)
            : cart.lines[p.id]?.qty ?? 0;
        final variantCount = variantMeta?.variants[p.id]?.length ?? 0;
        return Card(
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => _onProductTap(context, ref, p),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: _ProductImage(url: p.imageUrl)),
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Expanded(child: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
                        if (hasVariants)
                          Container(
                            margin: const EdgeInsets.only(left: 4),
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(
                              color: const Color(0xFFEEF2FF),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              variantCount > 0 ? '${variantCount}v' : 'v',
                              style: const TextStyle(fontSize: 10, color: Color(0xFF6366F1), fontWeight: FontWeight.bold),
                            ),
                          ),
                      ]),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                                hasVariants ? _variantPriceLabel(variantMeta, p) : kes(p.price),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    color: AppColors.brand, fontWeight: FontWeight.bold, fontSize: 14)),
                          ),
                          _AddButton(qty: qty, onAdd: () => _onProductTap(context, ref, p)),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _ProductList extends ConsumerWidget {
  final List<LocalProduct> items;
  const _ProductList({required this.items});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final variantMeta = ref.watch(variantMetaProvider).valueOrNull;
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      itemCount: items.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final p = items[i];
        final hasVariants = variantMeta?.hasVariants.contains(p.id) ?? false;
        final qty = hasVariants
            ? _totalVariantQty(cart, variantMeta, p.id)
            : cart.lines[p.id]?.qty ?? 0;
        final variantCount = variantMeta?.variants[p.id]?.length ?? 0;
        return Card(
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => _onProductTap(context, ref, p),
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  SizedBox(width: 64, height: 64, child: _ProductImage(url: p.imageUrl)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(children: [
                          Expanded(child: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w600))),
                          if (hasVariants)
                            Container(
                              margin: const EdgeInsets.only(left: 4),
                              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                              decoration: BoxDecoration(
                                color: const Color(0xFFEEF2FF),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                variantCount > 0 ? '${variantCount}v' : 'v',
                                style: const TextStyle(fontSize: 9, color: Color(0xFF6366F1), fontWeight: FontWeight.bold),
                              ),
                            ),
                        ]),
                        const SizedBox(height: 4),
                        Text(
                          hasVariants ? _variantPriceLabel(variantMeta, p) : kes(p.price),
                          style: const TextStyle(color: AppColors.brand, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                  _AddButton(qty: qty, onAdd: () => _onProductTap(context, ref, p)),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _ProductImage extends StatelessWidget {
  final String? url;
  const _ProductImage({this.url});

  @override
  Widget build(BuildContext context) {
    final placeholder = Container(
      color: Colors.grey.shade100,
      child: Icon(Icons.inventory_2_outlined, color: Colors.grey.shade400),
    );
    if (url == null || !url!.startsWith('http')) return placeholder;
    return Image.network(
      url!,
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => placeholder,
      loadingBuilder: (ctx, child, progress) =>
          progress == null ? child : Container(color: Colors.grey.shade100),
    );
  }
}

class _AddButton extends StatelessWidget {
  final int qty;
  final VoidCallback onAdd;
  const _AddButton({required this.qty, required this.onAdd});

  @override
  Widget build(BuildContext context) {
    if (qty > 0) {
      return Container(
        width: 30,
        height: 30,
        decoration: const BoxDecoration(color: AppColors.brand, shape: BoxShape.circle),
        alignment: Alignment.center,
        child: Text('$qty', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
      );
    }
    return InkWell(
      onTap: onAdd,
      customBorder: const CircleBorder(),
      child: Container(
        width: 30,
        height: 30,
        decoration: BoxDecoration(color: AppColors.brand.withValues(alpha: 0.12), shape: BoxShape.circle),
        child: const Icon(Icons.add, color: AppColors.brand, size: 20),
      ),
    );
  }
}

class _VariantPickerSheet extends StatefulWidget {
  final LocalProduct parent;
  final List<Map<String, dynamic>> variants;
  final WidgetRef ref;
  const _VariantPickerSheet({required this.parent, required this.variants, required this.ref});

  @override
  State<_VariantPickerSheet> createState() => _VariantPickerSheetState();
}

class _VariantPickerSheetState extends State<_VariantPickerSheet> {
  final Map<String, String> _selected = {};
  int _qty = 1;

  @override
  void initState() {
    super.initState();
    // Auto-select attributes that have only one possible value.
    for (final key in _keysFor()) {
      final vals = _valuesFor(key);
      if (vals.length == 1) _selected[key] = vals.first;
    }
  }

  List<String> _keysFor() {
    final keys = <String>{};
    for (final v in widget.variants) {
      final attrs = (v['attributes'] as Map?)?.cast<String, String>() ?? {};
      keys.addAll(attrs.keys);
    }
    return keys.toList();
  }

  List<String> _valuesFor(String key) {
    final prior = Map<String, String>.from(_selected)..remove(key);
    return widget.variants
        .where((v) {
          final attrs = (v['attributes'] as Map?)?.cast<String, String>() ?? {};
          return prior.entries.every((e) => attrs[e.key] == e.value);
        })
        .map((v) => ((v['attributes'] as Map?)?.cast<String, String>() ?? {})[key] ?? '')
        .where((s) => s.isNotEmpty)
        .toSet()
        .toList();
  }

  bool _inStock(String key, String val) {
    final trial = Map<String, String>.from(_selected)..[key] = val;
    return widget.variants.any((v) {
      final attrs = (v['attributes'] as Map?)?.cast<String, String>() ?? {};
      return trial.entries.every((e) => attrs[e.key] == e.value) &&
          (v['stock_quantity'] as int? ?? 0) > 0;
    });
  }

  Map<String, dynamic>? get _chosenVariant {
    final keys = _keysFor();
    if (_selected.length < keys.length) return null;
    return widget.variants.firstWhere(
      (v) {
        final attrs = (v['attributes'] as Map?)?.cast<String, String>() ?? {};
        return keys.every((k) => attrs[k] == _selected[k]);
      },
      orElse: () => {},
    );
  }

  String _priceRangeLabel() {
    if (widget.variants.isEmpty) return kes(widget.parent.price);
    final prices = widget.variants
        .map((v) => (v['price'] as num?)?.toDouble() ?? widget.parent.price)
        .toList();
    final minP = prices.reduce((a, b) => a < b ? a : b);
    final maxP = prices.reduce((a, b) => a > b ? a : b);
    if ((maxP - minP).abs() < 0.01) return kes(minP);
    return '${kes(minP)} – ${kes(maxP)}';
  }

  void _confirm() {
    final v = _chosenVariant;
    if (v == null || v.isEmpty) return;
    final stock = v['stock_quantity'] as int? ?? 0;
    if (stock == 0) return;
    final qty = _qty.clamp(1, stock);

    final synthetic = LocalProduct(
      id: v['id'] as int,
      name: v['name'] as String,
      price: (v['price'] as num).toDouble(),
      cost: (v['cost'] as num?)?.toDouble(),
      sku: v['sku'] as String?,
      barcode: v['barcode'] as String?,
      unit: widget.parent.unit,
      categoryId: widget.parent.categoryId,
      categoryName: widget.parent.categoryName,
      stockQuantity: stock,
      minStock: widget.parent.minStock,
      imageUrl: widget.parent.imageUrl,
      vatRate: widget.parent.vatRate,
      isActive: true,
      trackInventory: widget.parent.trackInventory,
    );
    widget.ref.read(cartProvider.notifier).addWithQty(synthetic, qty);
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final keys = _keysFor();
    final chosen = _chosenVariant;
    final chosenStock = chosen?['stock_quantity'] as int? ?? 0;
    final canAdd = chosen != null && chosen.isNotEmpty && chosenStock > 0;
    final cappedQty = canAdd ? _qty.clamp(1, chosenStock) : 1;

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.58,
      maxChildSize: 0.92,
      builder: (_, controller) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Drag handle
          Center(
            child: Padding(
              padding: const EdgeInsets.only(top: 12, bottom: 8),
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
          // Header: image + product name + price range
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Row(children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: SizedBox(width: 60, height: 60, child: _ProductImage(url: widget.parent.imageUrl)),
              ),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(
                  widget.parent.name,
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  _priceRangeLabel(),
                  style: const TextStyle(color: AppColors.brand, fontWeight: FontWeight.w600, fontSize: 13),
                ),
              ])),
            ]),
          ),
          const Divider(height: 1),
          // Scrollable: attribute chips + selected summary + qty stepper
          Expanded(
            child: ListView(
              controller: controller,
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
              children: [
                ...keys.map((key) {
                  final values = _valuesFor(key);
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(key, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                        const SizedBox(height: 8),
                        Wrap(spacing: 8, runSpacing: 8, children: values.map((val) {
                          final isActive = _selected[key] == val;
                          final inStock = _inStock(key, val);
                          return GestureDetector(
                            onTap: inStock
                                ? () => setState(() {
                                      _selected[key] = val;
                                      _qty = 1;
                                    })
                                : null,
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 150),
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                              decoration: BoxDecoration(
                                color: isActive ? Colors.grey.shade900 : Colors.white,
                                border: Border.all(
                                  color: isActive
                                      ? Colors.grey.shade900
                                      : inStock
                                          ? Colors.grey.shade300
                                          : Colors.grey.shade100,
                                ),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                val,
                                style: TextStyle(
                                  color: isActive
                                      ? Colors.white
                                      : inStock
                                          ? Colors.grey.shade800
                                          : Colors.grey.shade300,
                                  fontWeight: FontWeight.w500,
                                  decoration: inStock ? null : TextDecoration.lineThrough,
                                ),
                              ),
                            ),
                          );
                        }).toList()),
                      ],
                    ),
                  );
                }),
                if (chosen != null && chosen.isNotEmpty) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    child: Row(children: [
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Text('Selected', style: TextStyle(fontSize: 11, color: Colors.grey)),
                        Text(
                          _selected.values.join(' · '),
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ])),
                      Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text(
                          kes((chosen['price'] as num).toDouble()),
                          style: const TextStyle(
                              fontWeight: FontWeight.bold, fontSize: 15, color: AppColors.brand),
                        ),
                        Text(
                          chosenStock == 0 ? 'Out of stock' : '$chosenStock in stock',
                          style: TextStyle(
                              fontSize: 11, color: chosenStock == 0 ? Colors.red : Colors.grey),
                        ),
                      ]),
                    ]),
                  ),
                  if (chosenStock > 0) ...[
                    const SizedBox(height: 16),
                    Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      _QtyButton(
                        icon: Icons.remove,
                        onTap: cappedQty > 1 ? () => setState(() => _qty = cappedQty - 1) : null,
                      ),
                      const SizedBox(width: 12),
                      SizedBox(
                        width: 52,
                        child: Center(
                          child: Text(
                            '$cappedQty',
                            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      _QtyButton(
                        icon: Icons.add,
                        onTap: cappedQty < chosenStock ? () => setState(() => _qty = cappedQty + 1) : null,
                      ),
                    ]),
                  ],
                ],
                const SizedBox(height: 8),
              ],
            ),
          ),
          // Fixed bottom buttons
          Padding(
            padding: EdgeInsets.fromLTRB(20, 8, 20, MediaQuery.of(context).padding.bottom + 16),
            child: Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cancel'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: canAdd ? _confirm : null,
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.grey.shade900),
                  child: Text(
                    canAdd ? 'Add $cappedQty to cart' : 'Add to cart',
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
              ),
            ]),
          ),
        ],
      ),
    );
  }
}

class _QtyButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  const _QtyButton({required this.icon, this.onTap});

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(
            color: enabled ? Colors.grey.shade400 : Colors.grey.shade200,
          ),
        ),
        child: Icon(
          icon,
          size: 20,
          color: enabled ? Colors.grey.shade800 : Colors.grey.shade300,
        ),
      ),
    );
  }
}

class _CartBar extends StatelessWidget {
  final Cart cart;
  const _CartBar({required this.cart});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.brand,
      child: InkWell(
        onTap: () => showCartSheet(context),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: Row(
              children: [
                const Icon(Icons.shopping_cart_outlined, color: Colors.white, size: 22),
                const SizedBox(width: 12),
                Text('${cart.itemCount} item${cart.itemCount == 1 ? '' : 's'}',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 16)),
                const Spacer(),
                Text('Total: ${kes(cart.total)}',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
