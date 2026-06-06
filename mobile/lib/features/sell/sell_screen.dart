import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import 'cart_controller.dart';
import 'catalog_providers.dart';
import 'checkout_sheet.dart';

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

    return Scaffold(
      appBar: AppBar(
        title: const Text('New Sale'),
        actions: [
          if (!cart.isEmpty)
            IconButton(
              icon: const Icon(Icons.remove_shopping_cart_outlined),
              tooltip: 'Clear cart',
              onPressed: () => ref.read(cartProvider.notifier).clear(),
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _controller,
              onChanged: _onChanged,
              decoration: InputDecoration(
                hintText: 'Search products',
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
          Expanded(
            child: products.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text(apiError(e))),
              data: (items) {
                if (items.isEmpty) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(32),
                      child: Text(
                        'No products cached yet.\nSync from the More tab while online.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.grey),
                      ),
                    ),
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 6),
                  itemBuilder: (_, i) {
                    final p = items[i];
                    final qty = cart.lines[p.id]?.qty ?? 0;
                    return Card(
                      margin: EdgeInsets.zero,
                      child: ListTile(
                        onTap: () => ref.read(cartProvider.notifier).add(p),
                        title: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text(kes(p.price)),
                        trailing: qty > 0
                            ? CircleAvatar(
                                radius: 14,
                                backgroundColor: const Color(0xFFf5a020),
                                child: Text('$qty',
                                    style: const TextStyle(fontSize: 13, color: Colors.white)),
                              )
                            : const Icon(Icons.add_circle_outline, color: Color(0xFFf5a020)),
                      ),
                    );
                  },
                );
              },
            ),
          ),
          if (!cart.isEmpty) _CartBar(cart: cart),
        ],
      ),
    );
  }
}

class _CartBar extends ConsumerWidget {
  final Cart cart;
  const _CartBar({required this.cart});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Material(
      elevation: 8,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('${cart.itemCount} item${cart.itemCount == 1 ? '' : 's'}',
                        style: const TextStyle(color: Colors.grey, fontSize: 12)),
                    Text(kes(cart.subtotal),
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
              FilledButton.icon(
                icon: const Icon(Icons.point_of_sale),
                label: const Text('Charge'),
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                ),
                onPressed: () => showCheckoutSheet(context),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
