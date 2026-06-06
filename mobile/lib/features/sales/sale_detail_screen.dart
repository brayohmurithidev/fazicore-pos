import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import 'sales_repository.dart';
import 'sales_screen.dart' show PaymentChip;

class SaleDetailScreen extends ConsumerWidget {
  final int orderId;
  const SaleDetailScreen({super.key, required this.orderId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(saleDetailProvider(orderId));
    return Scaffold(
      appBar: AppBar(title: const Text('Sale')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(apiError(e), textAlign: TextAlign.center)),
        data: (o) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text('#${o.orderNumber}',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                ),
                PaymentChip(o.paymentMethod),
              ],
            ),
            const SizedBox(height: 4),
            Text(dateTimeShort(o.createdAt), style: const TextStyle(color: Colors.grey)),
            if (o.cashierName != null)
              Text('Cashier: ${o.cashierName}', style: const TextStyle(color: Colors.grey)),
            if (o.isVoided)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFdc2626).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(o.status.toUpperCase(),
                      style: const TextStyle(
                          fontSize: 11, color: Color(0xFFdc2626), fontWeight: FontWeight.w700)),
                ),
              ),
            const SizedBox(height: 16),
            const Text('Items', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Card(
              margin: EdgeInsets.zero,
              child: Column(
                children: [
                  for (final it in o.items) ...[
                    ListTile(
                      dense: true,
                      title: Text(it.productName),
                      subtitle: Text(
                        '${it.quantity}${it.unitName != null ? ' ${it.unitName}' : ''} × ${kes(it.unitPrice)}',
                      ),
                      trailing: Text(kes(it.total), style: const TextStyle(fontWeight: FontWeight.w600)),
                    ),
                    if (it != o.items.last) const Divider(height: 1),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),
            Card(
              margin: EdgeInsets.zero,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    _row('Subtotal', kes(o.subtotal)),
                    if (o.discountAmount > 0) _row('Discount', '-${kes(o.discountAmount)}'),
                    if (o.taxAmount > 0) _row('Tax', kes(o.taxAmount)),
                    const Divider(),
                    _row('Total', kes(o.total), bold: true),
                  ],
                ),
              ),
            ),
            if (o.notes != null && o.notes!.isNotEmpty) ...[
              const SizedBox(height: 16),
              const Text('Notes', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text(o.notes!),
            ],
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value, {bool bold = false}) {
    final style = TextStyle(
      fontWeight: bold ? FontWeight.bold : FontWeight.normal,
      fontSize: bold ? 16 : 14,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [Text(label, style: style), Text(value, style: style)],
      ),
    );
  }
}
