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

class _ProductGrid extends ConsumerWidget {
  final List<LocalProduct> items;
  const _ProductGrid({required this.items});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
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
        final qty = cart.lines[p.id]?.qty ?? 0;
        return Card(
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => ref.read(cartProvider.notifier).add(p),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: _ProductImage(url: p.imageUrl)),
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Expanded(
                            child: Text(kes(p.price),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    color: AppColors.brand, fontWeight: FontWeight.bold, fontSize: 14)),
                          ),
                          _AddButton(qty: qty, onAdd: () => ref.read(cartProvider.notifier).add(p)),
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
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      itemCount: items.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final p = items[i];
        final qty = cart.lines[p.id]?.qty ?? 0;
        return Card(
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => ref.read(cartProvider.notifier).add(p),
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
                        Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 4),
                        Text(kes(p.price),
                            style: const TextStyle(color: AppColors.brand, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                  _AddButton(qty: qty, onAdd: () => ref.read(cartProvider.notifier).add(p)),
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
                Text('Total: ${kes(cart.subtotal)}',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
