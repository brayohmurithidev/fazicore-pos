import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/features.dart';
import '../../core/theme.dart';
import 'plan_provider.dart';

class SubscriptionScreen extends ConsumerWidget {
  const SubscriptionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(planProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Subscription')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(planProvider.future),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(children: [const SizedBox(height: 120), Center(child: Text(apiError(e)))]),
          data: (p) {
            final active = p.status.toLowerCase() == 'active';
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Current plan', style: TextStyle(color: Colors.grey, fontSize: 13)),
                        const SizedBox(height: 4),
                        Text(p.planName, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: (active ? AppColors.brand : Theme.of(context).colorScheme.error)
                                .withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(p.status.toUpperCase(),
                              style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: active ? AppColors.brand : Theme.of(context).colorScheme.error)),
                        ),
                        if (p.trialEndsAt != null) ...[
                          const SizedBox(height: 8),
                          Text('Trial ends ${p.trialEndsAt!.split('T').first}',
                              style: const TextStyle(color: Colors.grey, fontSize: 12)),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                _heading('Usage'),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        _usage('Branches', p.branchCount, p.maxBranches),
                        const SizedBox(height: 14),
                        _usage('Users', p.userCount, p.maxUsers),
                        const SizedBox(height: 14),
                        _usage('Products', p.productCount, p.maxProducts),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                _heading('Features'),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Column(
                      children: [
                        for (final f in kFeatureCatalog)
                          ListTile(
                            dense: true,
                            leading: Icon(
                              p.has(f.key) ? Icons.check_circle : Icons.remove_circle_outline,
                              color: p.has(f.key) ? AppColors.brand : Colors.grey.shade400,
                              size: 20,
                            ),
                            title: Text(f.label,
                                style: TextStyle(color: p.has(f.key) ? null : Colors.grey)),
                            trailing: Text(f.group, style: const TextStyle(color: Colors.grey, fontSize: 11)),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                _heading('Billing history'),
                const _BillingHistory(),
                const Padding(
                  padding: EdgeInsets.all(8),
                  child: Text('Billing & plan changes are managed from the web admin.',
                      style: TextStyle(color: Colors.grey, fontSize: 12)),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _heading(String t) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 8),
        child: Text(t, style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.grey, fontSize: 13)),
      );

  Widget _usage(String label, int used, int? max) {
    final value = max == null || max == 0 ? null : (used / max).clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(fontWeight: FontWeight.w500)),
            Text(max == null ? '$used / ∞' : '$used / $max', style: const TextStyle(color: Colors.grey)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: value,
            minHeight: 6,
            backgroundColor: Colors.grey.shade200,
            valueColor: const AlwaysStoppedAnimation(AppColors.brand),
          ),
        ),
      ],
    );
  }
}

class _BillingHistory extends ConsumerWidget {
  const _BillingHistory();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(invoicesProvider);
    return async.when(
      loading: () => const Card(
        child: Padding(padding: EdgeInsets.all(16), child: Center(child: SizedBox(
          width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)))),
      ),
      error: (_, __) => const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text('No billing history available.', style: TextStyle(color: Colors.grey)),
        ),
      ),
      data: (invoices) {
        if (invoices.isEmpty) {
          return const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text('No invoices yet.', style: TextStyle(color: Colors.grey)),
            ),
          );
        }
        return Card(
          child: Column(
            children: [
              for (var i = 0; i < invoices.length; i++) ...[
                _invoiceTile(context, invoices[i]),
                if (i != invoices.length - 1) const Divider(height: 1, indent: 16, endIndent: 16),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _invoiceTile(BuildContext context, Invoice inv) {
    final paid = inv.status.toLowerCase() == 'paid';
    final date = inv.createdAt != null ? DateFormat('d MMM yyyy').format(inv.createdAt!) : '';
    final color = paid ? AppColors.brand : Theme.of(context).colorScheme.error;
    return ListTile(
      title: Text('${inv.planName}${inv.interval != null ? ' · ${inv.interval}' : ''}',
          style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text([if (inv.number != null) inv.number!, date].where((s) => s.isNotEmpty).join('  ·  ')),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text('${inv.currency} ${inv.amount}', style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text(inv.status.toUpperCase(), style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
