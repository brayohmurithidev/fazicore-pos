import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/widgets/mpesa_logo.dart';
import 'sales_repository.dart';

class SalesScreen extends ConsumerWidget {
  const SalesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(salesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Sales')),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(salesProvider.future),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              Center(child: Text(apiError(e), textAlign: TextAlign.center)),
              const SizedBox(height: 12),
              Center(
                child: FilledButton(
                  onPressed: () => ref.refresh(salesProvider),
                  child: const Text('Retry'),
                ),
              ),
            ],
          ),
          data: (orders) {
            if (orders.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  Center(child: Text('No sales yet', style: TextStyle(color: Colors.grey))),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: orders.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _SaleTile(orders[i]),
            );
          },
        ),
      ),
    );
  }
}

class _SaleTile extends StatelessWidget {
  final Order o;
  const _SaleTile(this.o);

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: ListTile(
        onTap: () => context.push('/sales/${o.id}'),
        title: Row(
          children: [
            Expanded(
              child: Text('#${o.orderNumber}',
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
            PaymentChip(o.paymentMethod),
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            '${dateTimeShort(o.createdAt)} · ${o.items.length} item${o.items.length == 1 ? '' : 's'}'
            '${o.cashierName != null ? ' · ${o.cashierName}' : ''}',
          ),
        ),
        trailing: Text(
          kes(o.total),
          style: TextStyle(
            fontWeight: FontWeight.bold,
            decoration: o.isVoided ? TextDecoration.lineThrough : null,
            color: o.isVoided ? Colors.grey : null,
          ),
        ),
      ),
    );
  }
}

class PaymentChip extends StatelessWidget {
  final String method;
  const PaymentChip(this.method, {super.key});

  @override
  Widget build(BuildContext context) {
    if (method == 'mpesa') return const MpesaLogo(height: 16);

    final label = switch (method) {
      'cash' => 'Cash',
      'credit' => 'Credit',
      'split' => 'Split',
      _ => method.isEmpty ? 'Other' : method,
    };
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label,
          style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant, fontWeight: FontWeight.w600)),
    );
  }
}
