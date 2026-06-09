import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets/app_select.dart';
import '../../core/widgets/mpesa_logo.dart';
import 'sales_repository.dart';

class SalesScreen extends ConsumerStatefulWidget {
  const SalesScreen({super.key});

  @override
  ConsumerState<SalesScreen> createState() => _SalesScreenState();
}

class _SalesScreenState extends ConsumerState<SalesScreen> {
  final _searchCtrl = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  void _onSearch(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      final f = ref.read(salesFilterProvider);
      ref.read(salesFilterProvider.notifier).state = f.copyWith(search: v);
    });
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(salesProvider);
    final filter = ref.watch(salesFilterProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Sales'),
        actions: [
          IconButton(
            tooltip: 'Filters',
            icon: Badge(
              isLabelVisible: filter.activeCount > 0,
              label: Text('${filter.activeCount}'),
              child: const Icon(Icons.tune),
            ),
            onPressed: () => _openFilters(context),
          ),
          IconButton(
            tooltip: 'Export CSV',
            icon: const Icon(Icons.ios_share),
            onPressed: () => _export(async.valueOrNull ?? const []),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _searchCtrl,
              onChanged: _onSearch,
              decoration: InputDecoration(
                hintText: 'Search order # or customer',
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                suffixIcon: _searchCtrl.text.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () { _searchCtrl.clear(); _onSearch(''); },
                      ),
              ),
            ),
          ),
          if (filter.isActive) _ActiveChips(filter: filter),
          if (async.valueOrNull != null && async.value!.isNotEmpty)
            _SummaryBar(orders: async.value!),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(salesProvider.future),
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => ListView(
                  children: [
                    const SizedBox(height: 120),
                    Center(child: Text(apiError(e), textAlign: TextAlign.center)),
                    const SizedBox(height: 12),
                    Center(child: FilledButton(onPressed: () => ref.refresh(salesProvider), child: const Text('Retry'))),
                  ],
                ),
                data: (orders) {
                  if (orders.isEmpty) {
                    return ListView(children: [
                      const SizedBox(height: 120),
                      Center(child: Text(filter.isActive ? 'No sales match these filters' : 'No sales yet',
                          style: const TextStyle(color: Colors.grey))),
                    ]);
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                    itemCount: orders.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) => _SaleTile(orders[i]),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openFilters(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _FilterSheet(),
    );
  }

  Future<void> _export(List<Order> orders) async {
    if (orders.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Nothing to export')));
      return;
    }
    final df = DateFormat('yyyy-MM-dd HH:mm');
    final rows = <String>['Order,Date,Cashier,Payment,Status,Items,Total'];
    for (final o in orders) {
      String esc(String s) => '"${s.replaceAll('"', '""')}"';
      rows.add([
        esc(o.orderNumber),
        esc(df.format(o.createdAt)),
        esc(o.cashierName ?? ''),
        o.paymentMethod,
        o.status,
        '${o.items.length}',
        o.total.toStringAsFixed(2),
      ].join(','));
    }
    final stamp = DateFormat('yyyyMMdd_HHmm').format(DateTime.now());
    await SharePlus.instance.share(ShareParams(
      files: [XFile.fromData(
        Uint8List.fromList(utf8.encode(rows.join('\n'))),
        mimeType: 'text/csv',
        name: 'sales_$stamp.csv',
      )],
      subject: 'Sales export',
    ));
  }
}

class _SummaryBar extends StatelessWidget {
  final List<Order> orders;
  const _SummaryBar({required this.orders});

  @override
  Widget build(BuildContext context) {
    final completed = orders.where((o) => !o.isVoided);
    final total = completed.fold<num>(0, (s, o) => s + o.total);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Text('${orders.length} sale${orders.length == 1 ? '' : 's'}',
              style: const TextStyle(fontWeight: FontWeight.w600)),
          const Spacer(),
          Text(kes(total), style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.brand)),
        ],
      ),
    );
  }
}

class _ActiveChips extends ConsumerWidget {
  final SalesFilter filter;
  const _ActiveChips({required this.filter});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(salesFilterProvider.notifier);
    final df = DateFormat('d MMM');
    final chips = <Widget>[];

    if (filter.paymentMethod != null) {
      chips.add(_chip(_methodLabel(filter.paymentMethod!),
          () => notifier.state = filter.copyWith(clearPayment: true)));
    }
    if (filter.from != null || filter.to != null) {
      final label = filter.from != null && filter.to != null
          ? '${df.format(filter.from!)} – ${df.format(filter.to!)}'
          : filter.from != null
              ? 'From ${df.format(filter.from!)}'
              : 'Until ${df.format(filter.to!)}';
      chips.add(_chip(label, () => notifier.state = filter.copyWith(clearDates: true)));
    }
    if (chips.isEmpty) return const SizedBox.shrink();

    return Container(
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
      child: Wrap(spacing: 8, children: chips),
    );
  }

  Widget _chip(String label, VoidCallback onClear) => Chip(
        label: Text(label, style: const TextStyle(fontSize: 12)),
        onDeleted: onClear,
        deleteIcon: const Icon(Icons.close, size: 16),
        visualDensity: VisualDensity.compact,
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      );

  static String _methodLabel(String m) => switch (m) {
        'cash' => 'Cash',
        'mpesa' => 'M-Pesa',
        'credit' => 'Credit',
        'split' => 'Split',
        _ => m,
      };
}

class _FilterSheet extends ConsumerStatefulWidget {
  const _FilterSheet();

  @override
  ConsumerState<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends ConsumerState<_FilterSheet> {
  late SalesFilter _draft = ref.read(salesFilterProvider);

  @override
  Widget build(BuildContext context) {
    final df = DateFormat('d MMM yyyy');
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Text('Filter sales', style: Theme.of(context).textTheme.titleLarge),
          ),
          const SizedBox(height: 16),
          AppSelect<String>(
            label: 'Payment method',
            hint: 'Any method',
            value: _draft.paymentMethod,
            options: const [
              SelectOption('Any method', null),
              SelectOption('Cash', 'cash'),
              SelectOption('M-Pesa', 'mpesa'),
              SelectOption('Credit', 'credit'),
              SelectOption('Split', 'split'),
            ],
            onChanged: (v) => setState(() => _draft = _draft.copyWith(paymentMethod: v, clearPayment: v == null)),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _dateField('From', _draft.from, df, (d) => setState(() => _draft = _draft.copyWith(from: d)))),
              const SizedBox(width: 12),
              Expanded(child: _dateField('To', _draft.to, df, (d) => setState(() => _draft = _draft.copyWith(to: d)))),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () {
                    ref.read(salesFilterProvider.notifier).state =
                        SalesFilter(search: ref.read(salesFilterProvider).search);
                    Navigator.pop(context);
                  },
                  child: const Text('Clear'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: () {
                    final cur = ref.read(salesFilterProvider);
                    ref.read(salesFilterProvider.notifier).state = _draft.copyWith(search: cur.search);
                    Navigator.pop(context);
                  },
                  child: const Text('Apply'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _dateField(String label, DateTime? value, DateFormat df, ValueChanged<DateTime> onPick) {
    return InkWell(
      onTap: () async {
        final picked = await showDatePicker(
          context: context,
          initialDate: value ?? DateTime.now(),
          firstDate: DateTime(2023),
          lastDate: DateTime.now(),
        );
        if (picked != null) onPick(picked);
      },
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          isDense: true,
        ),
        child: Text(value != null ? df.format(value) : 'Any',
            style: TextStyle(color: value != null ? null : Colors.grey)),
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
