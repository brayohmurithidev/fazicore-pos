import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/db/app_database.dart';
import '../../core/format.dart';
import '../../core/widgets/mpesa_logo.dart';
import '../sync/connectivity.dart';
import '../sync/sync_engine.dart';
import 'cart_controller.dart';
import 'catalog_providers.dart';

enum PayMethod { cash, mpesa, credit, split }

Future<void> showCheckoutSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => const _CheckoutSheet(),
  );
}

class _CheckoutSheet extends ConsumerStatefulWidget {
  const _CheckoutSheet();

  @override
  ConsumerState<_CheckoutSheet> createState() => _CheckoutSheetState();
}

class _CheckoutSheetState extends ConsumerState<_CheckoutSheet> {
  PayMethod _method = PayMethod.cash;
  final _cashController = TextEditingController();
  final _mpesaController = TextEditingController(); // amount for split
  final _refController = TextEditingController();
  LocalCustomer? _customer;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _cashController.dispose();
    _mpesaController.dispose();
    _refController.dispose();
    super.dispose();
  }

  num get _total => ref.read(cartProvider).subtotal;

  num get _cashEntered => num.tryParse(_cashController.text.trim()) ?? 0;
  num get _mpesaEntered => num.tryParse(_mpesaController.text.trim()) ?? 0;
  num get _change => _method == PayMethod.cash ? (_cashEntered - _total).clamp(0, double.infinity) : 0;

  Future<void> _placeOrder() async {
    final cart = ref.read(cartProvider);
    if (cart.isEmpty) return;

    // Validate per method.
    if (_method == PayMethod.credit && _customer == null) {
      setState(() => _error = 'Select a customer for credit sales');
      return;
    }
    if (_method == PayMethod.cash && _cashController.text.isNotEmpty && _cashEntered < _total) {
      setState(() => _error = 'Cash given is less than the total');
      return;
    }
    if (_method == PayMethod.split && (_cashEntered + _mpesaEntered) < _total) {
      setState(() => _error = 'Split amounts must cover the total');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final total = _total;
    final payload = _buildPayload(cart);
    try {
      final controller = ref.read(syncControllerProvider.notifier);
      await controller.enqueueOrder(payload);
      // Push immediately if we're online; otherwise it waits in the queue.
      if (ref.read(isOnlineProvider)) {
        controller.syncNow();
      }
      ref.read(cartProvider.notifier).clear();
      navigator.pop(); // close sheet
      navigator.pop(); // leave sell screen → back to shell
      messenger.showSnackBar(
        SnackBar(content: Text('Sale recorded (${kes(total)})')),
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = apiError(e);
        });
      }
    }
  }

  Map<String, dynamic> _buildPayload(Cart cart) {
    final items = cart.items
        .map((l) => {
              'product_id': l.product.id,
              'product_name': l.product.name,
              'product_sku': l.product.sku,
              'quantity': l.qty,
              'unit_price': l.product.price,
            })
        .toList();

    final total = cart.subtotal;
    final base = <String, dynamic>{
      'items': items,
      'discount_amount': 0,
      if (_customer != null) 'customer_id': _customer!.id,
    };

    switch (_method) {
      case PayMethod.cash:
        return {
          ...base,
          'payment_method': 'cash',
          'amount_paid': _cashController.text.isEmpty ? total : _cashEntered,
          'cash_amount': total,
        };
      case PayMethod.mpesa:
        return {
          ...base,
          'payment_method': 'mpesa',
          'amount_paid': total,
          'mpesa_amount': total,
          if (_refController.text.trim().isNotEmpty) 'mpesa_ref': _refController.text.trim(),
        };
      case PayMethod.credit:
        return {
          ...base,
          'payment_method': 'credit',
          'amount_paid': 0,
          'credit_customer_name': _customer?.name,
          'credit_customer_phone': _customer?.phone,
        };
      case PayMethod.split:
        return {
          ...base,
          'payment_method': 'split',
          'amount_paid': _cashEntered + _mpesaEntered,
          'cash_amount': _cashEntered,
          'mpesa_amount': _mpesaEntered,
          if (_refController.text.trim().isNotEmpty) 'mpesa_ref': _refController.text.trim(),
        };
    }
  }

  @override
  Widget build(BuildContext context) {
    final total = _total;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + bottomInset),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Text(kes(total),
                  style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
            ),
            const SizedBox(height: 16),
            SegmentedButton<PayMethod>(
              segments: const [
                ButtonSegment(value: PayMethod.cash, label: Text('Cash')),
                ButtonSegment(value: PayMethod.mpesa, label: MpesaLogo(height: 16)),
                ButtonSegment(value: PayMethod.credit, label: Text('Credit')),
                ButtonSegment(value: PayMethod.split, label: Text('Split')),
              ],
              selected: {_method},
              onSelectionChanged: (s) => setState(() {
                _method = s.first;
                _error = null;
              }),
            ),
            const SizedBox(height: 16),
            ..._methodFields(),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                onPressed: _saving ? null : _placeOrder,
                child: _saving
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text('Complete Sale · ${kes(total)}'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _methodFields() {
    switch (_method) {
      case PayMethod.cash:
        return [
          _amountField(_cashController, 'Cash received (optional)'),
          if (_cashController.text.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('Change: ${kes(_change)}',
                  style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
          _customerPicker(optional: true),
        ];
      case PayMethod.mpesa:
        return [
          _textField(_refController, 'M-Pesa reference (optional)'),
          _customerPicker(optional: true),
        ];
      case PayMethod.credit:
        return [_customerPicker(optional: false)];
      case PayMethod.split:
        return [
          _amountField(_cashController, 'Cash portion'),
          _amountField(_mpesaController, 'M-Pesa portion'),
          _textField(_refController, 'M-Pesa reference (optional)'),
          _customerPicker(optional: true),
        ];
    }
  }

  Widget _amountField(TextEditingController c, String label) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: c,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: label, border: const OutlineInputBorder(), prefixText: 'KES '),
        ),
      );

  Widget _textField(TextEditingController c, String label) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: c,
          decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
        ),
      );

  Widget _customerPicker({required bool optional}) {
    final customers = ref.watch(cachedCustomersProvider);
    return customers.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (list) => DropdownButtonFormField<LocalCustomer?>(
        initialValue: _customer,
        isExpanded: true,
        decoration: InputDecoration(
          labelText: optional ? 'Customer (optional)' : 'Customer',
          border: const OutlineInputBorder(),
        ),
        items: [
          if (optional) const DropdownMenuItem(value: null, child: Text('Walk-in')),
          ...list.map((c) => DropdownMenuItem(value: c, child: Text(c.name, overflow: TextOverflow.ellipsis))),
        ],
        onChanged: (c) => setState(() => _customer = c),
      ),
    );
  }
}
