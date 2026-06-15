import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/db/app_database.dart';
import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/features.dart';
import '../../core/theme.dart';
import '../../core/widgets/app_select.dart';
import '../../core/widgets/mpesa_logo.dart';
import '../auth/auth_controller.dart';
import '../manage/plan_provider.dart';
import '../printing/printer_service.dart';
import '../printing/receipt.dart';
import '../sync/connectivity.dart';
import '../sync/sync_engine.dart';
import 'cart_controller.dart';
import 'catalog_providers.dart';
import 'stk_service.dart';
import 'success_screen.dart';

enum PayMethod { cash, mpesa, credit, split }

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  late final num _total = ref.read(cartProvider).total;
  int _tab = 0; // 0 = cash, 1 = non-cash

  // Cash entry.
  String _cash = '';
  // Non-cash.
  PayMethod _nonCash = PayMethod.mpesa;
  final _refController = TextEditingController();
  final _phone = TextEditingController();
  final _mpesaCash = TextEditingController(); // optional cash portion → split
  LocalCustomer? _customer;

  bool _saving = false;
  bool _stkBusy = false;
  String? _stkMsg;
  String? _error;

  @override
  void dispose() {
    _refController.dispose();
    _phone.dispose();
    _mpesaCash.dispose();
    super.dispose();
  }

  num get _mpesaCashNum => num.tryParse(_mpesaCash.text.trim()) ?? 0;

  num get _cashNum => num.tryParse(_cash) ?? 0;
  num get _change => (_cashNum - _total).clamp(0, double.infinity);

  void _key(String k) {
    setState(() {
      _error = null;
      if (k == '000') {
        if (_cash.isNotEmpty) _cash += '000';
      } else {
        _cash = (_cash + k);
      }
      // Strip leading zeros / cap length.
      _cash = _cash.replaceFirst(RegExp(r'^0+'), '');
      if (_cash.length > 9) _cash = _cash.substring(0, 9);
    });
  }

  void _backspace() => setState(() {
        if (_cash.isNotEmpty) _cash = _cash.substring(0, _cash.length - 1);
      });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payment')),
      body: Column(
        children: [
          _totalBar(),
          _tabs(),
          Expanded(child: _tab == 0 ? _cashTab() : _nonCashTab()),
        ],
      ),
    );
  }

  Widget _totalBar() => Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
        child: Row(
          children: [
            const Text('Total bill', style: TextStyle(color: Colors.grey, fontSize: 15)),
            const Spacer(),
            Text(kes(_total),
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: AppColors.brand)),
          ],
        ),
      );

  Widget _tabs() => Container(
        color: Colors.white,
        child: Row(
          children: [
            _tabBtn('Cash', 0),
            _tabBtn('Non-cash', 1),
          ],
        ),
      );

  Widget _tabBtn(String label, int i) {
    final sel = _tab == i;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() { _tab = i; _error = null; }),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: sel ? AppColors.brand : Colors.transparent,
                width: 2,
              ),
            ),
          ),
          alignment: Alignment.center,
          child: Text(label,
              style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  color: sel ? AppColors.ink : Colors.grey)),
        ),
      ),
    );
  }

  // ── Cash ──────────────────────────────────────────────────────────────────
  Widget _cashTab() {
    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                OutlinedButton.icon(
                  icon: const Icon(Icons.account_balance_wallet_outlined, size: 18),
                  label: const Text('EXACT AMOUNT'),
                  onPressed: () => setState(() => _cash = _total.toStringAsFixed(0)),
                ),
                const SizedBox(height: 20),
                const Text('Cash received', style: TextStyle(color: Colors.grey)),
                const SizedBox(height: 4),
                Text(_cash.isEmpty ? kes(0) : kes(_cashNum),
                    style: const TextStyle(fontSize: 34, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                if (_cashNum >= _total && _cashNum > 0)
                  Text('Change: ${kes(_change)}',
                      style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.brand)),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  ),
              ],
            ),
          ),
        ),
        _Keypad(onKey: _key, onBackspace: _backspace),
        _confirmBar(
          label: 'Complete sale',
          onPressed: _saving ? null : _completeCash,
        ),
      ],
    );
  }

  void _completeCash() {
    // Empty entry = exact amount.
    final paid = _cash.isEmpty ? _total : _cashNum;
    if (paid < _total) {
      setState(() => _error = 'Cash received is less than the total');
      return;
    }
    _complete(
      method: 'cash',
      amountPaid: paid,
      change: (paid - _total).clamp(0, double.infinity),
      cashAmount: _total,
    );
  }

  // ── Non-cash ──────────────────────────────────────────────────────────────
  Widget _nonCashTab() {
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  _methodCard(PayMethod.mpesa, const MpesaLogo(height: 20)),
                  if (planAllows(ref, Feat.creditSystem)) ...[
                    const SizedBox(width: 12),
                    _methodCard(PayMethod.credit, const Text('Credit', style: TextStyle(fontWeight: FontWeight.w600))),
                  ],
                ],
              ),
              const SizedBox(height: 20),
              ..._nonCashFields(),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ),
            ],
          ),
        ),
        _confirmBar(label: 'Complete sale', onPressed: _saving ? null : _completeNonCash),
      ],
    );
  }

  Widget _methodCard(PayMethod m, Widget label) {
    final sel = _nonCash == m;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() { _nonCash = m; _error = null; }),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          height: 64,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: sel ? AppColors.brand : Colors.black.withValues(alpha: 0.1), width: sel ? 2 : 1),
            color: sel ? AppColors.brand.withValues(alpha: 0.06) : Colors.white,
          ),
          child: label,
        ),
      ),
    );
  }

  List<Widget> _nonCashFields() {
    if (_nonCash == PayMethod.credit) {
      return [_customerPicker(optional: false)];
    }
    // M-Pesa (with an optional cash portion → split).
    final cash = _mpesaCashNum;
    final mpesaPortion = (cash > 0 && cash < _total) ? _total - cash : _total;
    final online = ref.watch(isOnlineProvider);
    return [
          _customerPicker(optional: true),
          const SizedBox(height: 12),
          _phoneField(),
          _textField(_mpesaCash, 'Cash received (optional — makes it a split)', number: true),
          if (cash > 0 && cash < _total)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text('M-Pesa portion: ${kes(mpesaPortion)}',
                  style: const TextStyle(color: AppColors.brand, fontWeight: FontWeight.w600)),
            ),
          if (planAllows(ref, Feat.mpesaStk)) ...[
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: _stkBusy
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.smartphone),
                label: Text(_stkBusy ? 'Waiting for payment…' : 'Push STK to phone'),
                onPressed: (online && !_stkBusy && !_saving) ? _pushStk : null,
              ),
            ),
            if (!online)
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text('STK needs internet. Record the M-Pesa code manually below while offline.',
                    style: TextStyle(color: Colors.grey, fontSize: 12)),
              ),
          ],
          if (_stkMsg != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(_stkMsg!, style: const TextStyle(color: AppColors.brand, fontSize: 13)),
            ),
          const SizedBox(height: 8),
          _textField(_refController, 'M-Pesa reference (optional)'),
        ];
  }

  /// Resolve the M-Pesa method + amounts, honouring the optional cash portion.
  ({String method, num cash, num mpesa}) _mpesaSplit() {
    final cash = _mpesaCashNum;
    if (cash > 0 && cash < _total) {
      return (method: 'split', cash: cash, mpesa: _total - cash);
    }
    return (method: 'mpesa', cash: 0, mpesa: _total);
  }

  Future<void> _pushStk() async {
    final phone = _phone.text.trim();
    if (phone.length < 9) {
      setState(() => _error = 'Enter the customer phone number');
      return;
    }
    final split = _mpesaSplit();
    setState(() { _stkBusy = true; _stkMsg = 'Sent to $phone — ask the customer to enter their PIN'; _error = null; });
    try {
      final result = await pushStkAndWait(
        ref.read(apiClientProvider),
        phone: phone,
        amount: split.mpesa.toInt(),
        orderRef: 'POS${DateTime.now().millisecondsSinceEpoch % 100000000}',
      );
      if (!mounted) return;
      if (result.success) {
        if (result.receipt != null) _refController.text = result.receipt!;
        await _complete(
          method: split.method,
          amountPaid: _total,
          change: 0,
          cashAmount: split.cash,
          mpesaAmount: split.mpesa,
        );
      } else {
        setState(() { _stkBusy = false; _stkMsg = null; _error = result.message; });
      }
    } catch (e) {
      if (mounted) setState(() { _stkBusy = false; _stkMsg = null; _error = apiError(e); });
    }
  }

  void _completeNonCash() {
    if (_nonCash == PayMethod.credit) {
      if (_customer == null) {
        setState(() => _error = 'Select a customer for credit sales');
        return;
      }
      _complete(method: 'credit', amountPaid: 0, change: 0);
      return;
    }
    // M-Pesa recorded manually (no STK) — optionally split with cash.
    final split = _mpesaSplit();
    _complete(method: split.method, amountPaid: _total, change: 0, cashAmount: split.cash, mpesaAmount: split.mpesa);
  }

  Widget _textField(TextEditingController c, String label, {bool number = false}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: c,
          keyboardType: number ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.text,
          onChanged: (_) => setState(() => _error = null),
          decoration: InputDecoration(
            labelText: label,
            border: const OutlineInputBorder(),
            isDense: true,
            prefixText: number ? 'KES ' : null,
          ),
        ),
      );

  Widget _phoneField() => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          onChanged: (_) => setState(() => _error = null),
          decoration: const InputDecoration(
            labelText: 'Customer phone (for STK)',
            border: OutlineInputBorder(),
            isDense: true,
            prefix: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('🇰🇪', style: TextStyle(fontSize: 15)),
                SizedBox(width: 4),
                Text('+254', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                Icon(Icons.arrow_drop_down, size: 18),
                SizedBox(width: 2),
              ],
            ),
          ),
        ),
      );

  Widget _customerPicker({required bool optional}) {
    final customers = ref.watch(cachedCustomersProvider);
    return customers.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (list) => AppSelect<LocalCustomer>(
        label: optional ? 'Customer (optional)' : 'Customer',
        hint: optional ? 'Walk-in' : 'Select customer',
        value: _customer,
        searchable: list.length > 6,
        options: [
          if (optional) const SelectOption('Walk-in', null, leading: Icon(Icons.person_outline)),
          ...list.map((c) => SelectOption(
                c.name,
                c,
                leading: CircleAvatar(
                  radius: 14,
                  child: Text(c.name.isNotEmpty ? c.name[0].toUpperCase() : '?',
                      style: const TextStyle(fontSize: 12)),
                ),
              )),
        ],
        onChanged: (c) => setState(() {
          _customer = c;
          if (c?.phone != null && c!.phone!.isNotEmpty && _phone.text.isEmpty) {
            _phone.text = c.phone!;
          }
        }),
      ),
    );
  }

  Widget _confirmBar({required String label, required VoidCallback? onPressed}) => Material(
        elevation: 8,
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton(
                style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                onPressed: onPressed,
                child: _saving
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text('$label · ${kes(_total)}'),
              ),
            ),
          ),
        ),
      );

  // ── Submit ────────────────────────────────────────────────────────────────
  Future<void> _complete({
    required String method,
    required num amountPaid,
    required num change,
    num cashAmount = 0,
    num mpesaAmount = 0,
  }) async {
    final cart = ref.read(cartProvider);
    if (cart.isEmpty) return;
    setState(() { _saving = true; _error = null; });

    final navigator = Navigator.of(context);
    final cashier = ref.read(authControllerProvider).user?.name ??
        await ref.read(appDatabaseProvider).getMeta('cashier_name');
    final payload = _buildPayload(cart, method, amountPaid, cashAmount, mpesaAmount);

    try {
      final controller = ref.read(syncControllerProvider.notifier);
      final orderId = await controller.enqueueOrder(payload);
      if (ref.read(isOnlineProvider)) controller.syncNow();

      final receipt = _buildReceipt(cart, method, amountPaid, change,
          ref: orderId.substring(0, 8).toUpperCase(), cashier: cashier);

      ref.read(cartProvider.notifier).clear();
      navigator.pushReplacement(MaterialPageRoute(
        builder: (_) => SuccessScreen(
          method: method,
          change: change,
          total: _total,
          receipt: receipt,
        ),
      ));
    } catch (e) {
      if (mounted) setState(() { _saving = false; _error = apiError(e); });
    }
  }

  Map<String, dynamic> _buildPayload(Cart cart, String method, num amountPaid, num cashAmount, num mpesaAmount) {
    return {
      'items': cart.items
          .map((l) => {
                'product_id': l.product.id,
                'product_name': l.product.name,
                'product_sku': l.product.sku,
                'quantity': l.qty,
                'unit_price': l.product.price,
                'discount_amount': l.lineDiscount,
              })
          .toList(),
      'discount_amount': cart.cartDiscountAmt,
      'payment_method': method,
      'amount_paid': amountPaid,
      if (cashAmount > 0) 'cash_amount': cashAmount,
      if (mpesaAmount > 0) 'mpesa_amount': mpesaAmount,
      if (_refController.text.trim().isNotEmpty) 'mpesa_ref': _refController.text.trim(),
      if (_customer != null) 'customer_id': _customer!.id,
      if (method == 'credit') 'credit_customer_name': _customer?.name,
      if (method == 'credit') 'credit_customer_phone': _customer?.phone,
    };
  }

  Receipt _buildReceipt(Cart cart, String method, num amountPaid, num change, {String? ref, String? cashier}) {
    final s = this.ref.read(printerProvider);
    return Receipt(
      shopName: s.shopName,
      address: s.address,
      phone: s.phone,
      email: s.email,
      kraPin: s.kraPin,
      vatNumber: s.vatNumber,
      footer: s.footer,
      ref: ref,
      cashier: cashier,
      dateTime: DateTime.now(),
      items: cart.items.map((l) => ReceiptLine(l.product.name, l.qty, l.product.price, l.lineTotal)).toList(),
      subtotal: cart.subtotal,
      discount: cart.cartDiscountAmt,
      total: cart.total,
      paymentMethod: method,
      amountPaid: amountPaid,
      change: change,
      customerName: _customer?.name,
    );
  }
}

class _Keypad extends StatelessWidget {
  final ValueChanged<String> onKey;
  final VoidCallback onBackspace;
  const _Keypad({required this.onKey, required this.onBackspace});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFFf2f3f5),
      padding: const EdgeInsets.all(8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final row in const [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['000', '0', '⌫']])
            Row(
              children: [
                for (final k in row)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.all(4),
                      child: Material(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(8),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(8),
                          onTap: () => k == '⌫' ? onBackspace() : onKey(k),
                          child: Container(
                            height: 52,
                            alignment: Alignment.center,
                            child: k == '⌫'
                                ? const Icon(Icons.backspace_outlined, size: 22)
                                : Text(k, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w500)),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}
