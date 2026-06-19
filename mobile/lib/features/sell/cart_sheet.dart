import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import 'cart_controller.dart';
import 'checkout_screen.dart';

Future<void> showCartSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => const _CartSheet(),
  );
}

/// Prompt for a 0–100 percentage. Returns the value (0 clears), or null if dismissed.
Future<num?> askPercent(BuildContext context, String title, num initial) {
  final ctrl = TextEditingController(text: initial > 0 ? '${initial % 1 == 0 ? initial.toInt() : initial}' : '');
  return showDialog<num>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: ctrl,
        autofocus: true,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
        decoration: const InputDecoration(labelText: 'Percentage', suffixText: '%', border: OutlineInputBorder()),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, 0 as num), child: const Text('Clear')),
        FilledButton(
          onPressed: () => Navigator.pop(context, (num.tryParse(ctrl.text.trim()) ?? 0).clamp(0, 100)),
          child: const Text('Apply'),
        ),
      ],
    ),
  );
}

class _CartSheet extends ConsumerWidget {
  const _CartSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final notifier = ref.read(cartProvider.notifier);

    if (cart.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (Navigator.of(context).canPop()) Navigator.of(context).pop();
      });
    }

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text('Cart', style: Theme.of(context).textTheme.titleLarge),
                const Spacer(),
                TextButton.icon(
                  icon: const Icon(Icons.delete_outline, size: 18),
                  label: const Text('Clear'),
                  onPressed: () => notifier.clear(),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: cart.items.length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (_, i) => _LineRow(line: cart.items[i]),
              ),
            ),
            const Divider(),
            _summaryRow('Subtotal', kes(cart.subtotal)),
            if (cart.itemDiscountTotal > 0)
              _summaryRow('Item discounts', '−${kes(cart.itemDiscountTotal)}', muted: true),
            // Cart discount row (tappable).
            InkWell(
              onTap: () async {
                final v = await askPercent(context, 'Cart discount', cart.cartDiscountPct);
                if (v != null) notifier.setCartDiscount(v);
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    Text(cart.cartDiscountPct > 0 ? 'Cart discount (${_pct(cart.cartDiscountPct)}%)' : 'Add cart discount',
                        style: const TextStyle(color: AppColors.brand, fontWeight: FontWeight.w600)),
                    const Spacer(),
                    Text(cart.cartDiscountAmt > 0 ? '−${kes(cart.cartDiscountAmt)}' : '',
                        style: const TextStyle(color: Colors.grey)),
                    const Icon(Icons.chevron_right, size: 18, color: Colors.grey),
                  ],
                ),
              ),
            ),
            const Divider(),
            Row(
              children: [
                const Text('Total', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const Spacer(),
                Text(kes(cart.total), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
              icon: const Icon(Icons.point_of_sale),
              label: Text('Charge · ${kes(cart.total)}'),
              onPressed: cart.isEmpty
                  ? null
                  : () {
                      Navigator.of(context).pop();
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const CheckoutScreen()),
                      );
                    },
            ),
          ],
        ),
      ),
    );
  }

  Widget _summaryRow(String label, String value, {bool muted = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            Text(label, style: TextStyle(fontSize: 15, color: muted ? Colors.grey : null)),
            const Spacer(),
            Text(value,
                style: TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w600, color: muted ? Colors.grey : null)),
          ],
        ),
      );
}

String _pct(num v) => v % 1 == 0 ? '${v.toInt()}' : '$v';

class _LineRow extends ConsumerWidget {
  final CartLine line;
  const _LineRow({required this.line});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(cartProvider.notifier);
    final discounted = line.discountPct > 0;
    final atStockLimit = line.product.trackInventory && line.qty >= line.product.stockQuantity;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(line.product.name,
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w500)),
                    Text('${kes(line.product.price)} each',
                        style: const TextStyle(color: Colors.grey, fontSize: 12)),
                  ],
                ),
              ),
              _QtyStepper(
                qty: line.qty,
                onDec: () => notifier.setQty(line.product.id, line.qty - 1),
                onInc: atStockLimit ? null : () => notifier.add(line.product),
              ),
              SizedBox(
                width: 84,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(kes(line.lineTotal),
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    if (discounted)
                      Text(kes(line.lineGross),
                          style: const TextStyle(
                              fontSize: 11, color: Colors.grey, decoration: TextDecoration.lineThrough)),
                  ],
                ),
              ),
            ],
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              icon: Icon(discounted ? Icons.discount : Icons.add, size: 14),
              label: Text(discounted ? 'Item discount: ${_pct(line.discountPct)}% off' : 'Add item discount',
                  style: const TextStyle(fontSize: 12)),
              onPressed: () async {
                final v = await askPercent(context, line.product.name, line.discountPct);
                if (v != null) notifier.setItemDiscount(line.product.id, v);
              },
            ),
          ),
          if (atStockLimit)
            const Padding(
              padding: EdgeInsets.only(left: 8, top: 2),
              child: Text('Max stock reached', style: TextStyle(fontSize: 11, color: Colors.red)),
            ),
        ],
      ),
    );
  }
}

class _QtyStepper extends StatelessWidget {
  final int qty;
  final VoidCallback onDec;
  final VoidCallback? onInc; // null when at the stock ceiling
  const _QtyStepper({required this.qty, required this.onDec, required this.onInc});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          visualDensity: VisualDensity.compact,
          icon: Icon(qty <= 1 ? Icons.delete_outline : Icons.remove_circle_outline),
          onPressed: onDec,
        ),
        SizedBox(
          width: 24,
          child: Text('$qty', textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w600)),
        ),
        IconButton(
          visualDensity: VisualDensity.compact,
          icon: const Icon(Icons.add_circle_outline),
          onPressed: onInc,
        ),
      ],
    );
  }
}
