import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/api_client.dart';
import '../../core/db/app_database.dart';
import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/features.dart';
import '../../core/theme.dart';
import '../../core/widgets/app_select.dart';
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

enum PayMethod { cash, mpesa, card, airtel, bankTransfer, cheque, credit, split }

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
  final _refController  = TextEditingController(); // mpesa ref / card approval / bank ref / cheque no
  final _phone          = TextEditingController(); // mpesa / airtel phone
  final _mpesaCash      = TextEditingController(); // optional cash split
  final _bankName       = TextEditingController(); // bank transfer / cheque bank
  LocalCustomer? _customer;

  bool _saving = false;
  bool _stkBusy = false;
  String? _stkMsg;
  String? _error;

  // Paystack card
  final _paystackEmail = TextEditingController();
  bool _paystackCardDone = false;
  String? _paystackRef;
  // Paystack M-Pesa provider toggle (Daraja vs Paystack)
  bool _usePsSdk = false; // false = Daraja STK, true = Paystack STK

  @override
  void dispose() {
    _refController.dispose();
    _phone.dispose();
    _mpesaCash.dispose();
    _bankName.dispose();
    _paystackEmail.dispose();
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
        _methodChipBar(),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            children: [
              ..._nonCashFields(),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ),
            ],
          ),
        ),
        _confirmBar(label: 'Complete sale', onPressed: _saving ? null : _completeNonCash),
      ],
    );
  }

  // Horizontal scrolling chip row — no overflow possible, labels never clip.
  Widget _methodChipBar() {
    final methods = <_MethodDef>[
      _MethodDef(PayMethod.mpesa,        'M-Pesa',        const Icon(Icons.mobile_friendly, size: 18, color: Color(0xFF00A550))),
      _MethodDef(PayMethod.card,         'Card',          const Icon(Icons.credit_card, size: 18, color: Color(0xFF2563EB))),
      _MethodDef(PayMethod.airtel,       'Airtel Money',  const Icon(Icons.signal_cellular_alt, size: 18, color: Color(0xFFDC2626))),
      _MethodDef(PayMethod.bankTransfer, 'Bank Transfer', const Icon(Icons.account_balance, size: 18, color: Color(0xFF4338CA))),
      _MethodDef(PayMethod.cheque,       'Cheque',        const Icon(Icons.description_outlined, size: 18, color: Color(0xFFD97706))),
      if (planAllows(ref, Feat.creditSystem))
        _MethodDef(PayMethod.credit,     'Credit',        const Icon(Icons.receipt_long, size: 18, color: Colors.grey)),
    ];
    return Container(
      color: Colors.white,
      child: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            child: Row(
              children: methods
                  .map((m) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: _methodChip(m),
                      ))
                  .toList(),
            ),
          ),
          const Divider(height: 1),
        ],
      ),
    );
  }

  Widget _methodChip(_MethodDef m) {
    final sel = _nonCash == m.method;
    return GestureDetector(
      onTap: () => setState(() { _nonCash = m.method; _error = null; }),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: sel ? AppColors.brand : const Color(0xFFF3F4F6),
          borderRadius: BorderRadius.circular(24),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconTheme(
              data: IconThemeData(color: sel ? Colors.white : null, size: 18),
              child: m.icon,
            ),
            const SizedBox(width: 7),
            Text(
              m.label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: sel ? Colors.white : const Color(0xFF374151),
              ),
            ),
          ],
        ),
      ),
    );
  }


  List<Widget> _nonCashFields() {
    switch (_nonCash) {
      case PayMethod.mpesa:
        return _mpesaFields();
      case PayMethod.card:
        return _cardFields();
      case PayMethod.airtel:
        return _airtelFields();
      case PayMethod.bankTransfer:
        return _bankTransferFields();
      case PayMethod.cheque:
        return _chequeFields();
      case PayMethod.credit:
        return [_customerPicker(optional: false)];
      default:
        return [];
    }
  }

  List<Widget> _mpesaFields() {
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
        // Provider toggle (show Paystack option when it's configured)
        FutureBuilder(
          future: ref.read(apiClientProvider).dio.get('/paystack/public-key').then((r) => r.data as Map<String, dynamic>?).catchError((_) => null),
          builder: (_, snap) {
            final hasPs = snap.hasData && snap.data != null;
            if (!hasPs) return const SizedBox.shrink();
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                children: [
                  const Text('Send via:', style: TextStyle(fontSize: 13, color: Colors.grey)),
                  const SizedBox(width: 8),
                  ChoiceChip(label: const Text('Daraja'), selected: !_usePsSdk, onSelected: (_) => setState(() { _usePsSdk = false; _stkMsg = null; })),
                  const SizedBox(width: 6),
                  ChoiceChip(label: const Text('Paystack'), selected: _usePsSdk, onSelected: (_) => setState(() { _usePsSdk = true; _stkMsg = null; })),
                ],
              ),
            );
          },
        ),
        if (_usePsSdk) ...[
          _textField(_paystackEmail, 'Customer email (required by Paystack)', number: false),
        ],
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            icon: _stkBusy
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.smartphone),
            label: Text(_stkBusy ? 'Waiting for payment…' : (_usePsSdk ? 'Push STK via Paystack' : 'Push STK to phone')),
            onPressed: (online && !_stkBusy && !_saving) ? (_usePsSdk ? _pushPaystackStk : _pushStk) : null,
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

  List<Widget> _cardFields() {
    if (_paystackCardDone) {
      return [
        Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFF2563EB).withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF2563EB).withValues(alpha: 0.25)),
          ),
          child: Row(
            children: [
              const Icon(Icons.check_circle, color: Color(0xFF2563EB), size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Card Authorised', style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF2563EB))),
                    Text(kes(_total), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xFF2563EB))),
                    if (_paystackRef != null)
                      Text('Ref: $_paystackRef', style: const TextStyle(fontSize: 11, color: Colors.grey, fontFamily: 'monospace')),
                  ],
                ),
              ),
            ],
          ),
        ),
        TextButton(
          onPressed: () => setState(() { _paystackCardDone = false; _paystackRef = null; }),
          child: const Text('Try a different card'),
        ),
      ];
    }
    return [
      _infoPanel(
        color: const Color(0xFF2563EB),
        icon: Icons.credit_card,
        title: 'Card Payment',
        subtitle: 'Pay via Paystack (Visa · Mastercard · Verve)',
      ),
      _textField(_paystackEmail, 'Customer email *'),
      SizedBox(
        width: double.infinity,
        child: FilledButton.icon(
          icon: const Icon(Icons.open_in_new, size: 18),
          label: const Text('Pay with Paystack'),
          style: FilledButton.styleFrom(backgroundColor: const Color(0xFF00C3F7)),
          onPressed: _saving ? null : _launchPaystackCard,
        ),
      ),
      const SizedBox(height: 12),
      const Divider(),
      const SizedBox(height: 8),
      const Text('Or enter approval code from a terminal:', style: TextStyle(fontSize: 12, color: Colors.grey)),
      const SizedBox(height: 8),
      _textField(_refController, 'Approval code (optional)'),
    ];
  }

  List<Widget> _airtelFields() => [
    _infoPanel(
      color: const Color(0xFFDC2626),
      icon: Icons.phone_android,
      title: 'Airtel Money',
      subtitle: 'Customer pays via Airtel Money',
    ),
    _phoneField(label: 'Customer Airtel number'),
    _textField(_refController, 'Confirmation code (optional)'),
  ];

  List<Widget> _bankTransferFields() => [
    _infoPanel(
      color: const Color(0xFF4338CA),
      icon: Icons.account_balance,
      title: 'Bank Transfer / EFT',
      subtitle: 'Confirm when transfer is received in your account',
    ),
    _textField(_bankName, 'Bank name (optional)'),
    _textField(_refController, 'Transaction reference *'),
  ];

  List<Widget> _chequeFields() => [
    _infoPanel(
      color: const Color(0xFFD97706),
      icon: Icons.description_outlined,
      title: 'Cheque Payment',
      subtitle: 'Verify cheque before completing the sale',
    ),
    _textField(_refController, 'Cheque number *'),
    _textField(_bankName, 'Bank name (optional)'),
  ];

  Widget _infoPanel({required Color color, required IconData icon, required String title, required String subtitle}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontWeight: FontWeight.bold, color: color)),
                const SizedBox(height: 2),
                Text(kes(_total), style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
                Text(subtitle, style: const TextStyle(fontSize: 11, color: Colors.grey)),
              ],
            ),
          ),
        ],
      ),
    );
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
    final normalized = normalizeKEPhone(_phone.text.trim());
    if (!normalized.startsWith('254') || normalized.length != 12) {
      setState(() => _error = 'Enter a valid Kenyan number, e.g. 0712 345 678');
      return;
    }
    final split = _mpesaSplit();
    if (split.mpesa < 1) {
      setState(() => _error = 'Amount must be at least KES 1');
      return;
    }
    setState(() { _stkBusy = true; _stkMsg = 'Prompt sent — ask the customer to enter their M-Pesa PIN'; _error = null; });
    try {
      final result = await pushStkAndWait(
        ref.read(apiClientProvider),
        phone: normalized,
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

  Future<void> _pushPaystackStk() async {
    final phone = _phone.text.trim();
    final email = _paystackEmail.text.trim();
    final normalized = normalizeKEPhone(phone);
    if (!normalized.startsWith('254') || normalized.length != 12) {
      setState(() => _error = 'Enter a valid Kenyan number, e.g. 0712 345 678');
      return;
    }
    if (!email.contains('@')) {
      setState(() => _error = 'Enter a valid customer email (required by Paystack)');
      return;
    }
    final split = _mpesaSplit();
    setState(() { _stkBusy = true; _stkMsg = 'Prompt sent — ask customer to enter M-Pesa PIN'; _error = null; });
    try {
      final result = await pushPaystackMobileMoneyAndWait(
        ref.read(apiClientProvider),
        phone: normalized,
        amount: split.mpesa.toInt(),
        email: email,
      );
      if (!mounted) return;
      if (result.success) {
        if (result.reference != null) _refController.text = result.reference!;
        await _complete(
          method: split.method, amountPaid: _total, change: 0,
          cashAmount: split.cash, mpesaAmount: split.mpesa,
        );
      } else {
        setState(() { _stkBusy = false; _stkMsg = null; _error = result.message; });
      }
    } catch (e) {
      if (mounted) setState(() { _stkBusy = false; _stkMsg = null; _error = apiError(e); });
    }
  }

  Future<void> _launchPaystackCard() async {
    final email = _paystackEmail.text.trim();
    if (!email.contains('@')) {
      setState(() => _error = 'Enter a valid customer email to use Paystack');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      final api = ref.read(apiClientProvider);
      final res = await api.dio.post('/paystack/initialize', data: {
        'amount': _total.toInt(),
        'email': email,
      });
      final authUrl   = res.data['authorization_url'] as String? ?? '';
      final reference = res.data['reference'] as String? ?? '';
      if (authUrl.isEmpty || !mounted) {
        setState(() { _saving = false; _error = 'Paystack not configured. Add credentials in Settings.'; });
        return;
      }
      setState(() => _saving = false);
      // Open Paystack hosted checkout in a WebView and wait for result.
      final result = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (_) => _PaystackWebView(authorizationUrl: authUrl, reference: reference),
        ),
      );
      if (!mounted) return;
      if (result == true) {
        setState(() { _paystackRef = reference; _paystackCardDone = true; _error = null; });
      } else {
        setState(() => _error = 'Card payment was cancelled or failed');
      }
    } catch (e) {
      if (mounted) setState(() { _saving = false; _error = 'Paystack error: $e'; });
    }
  }

  void _completeNonCash() {
    switch (_nonCash) {
      case PayMethod.credit:
        if (_customer == null) {
          setState(() => _error = 'Select a customer for credit sales');
          return;
        }
        _complete(method: 'credit', amountPaid: 0, change: 0);
      case PayMethod.card:
        final cardRef = _paystackRef ?? (_refController.text.trim().isEmpty ? null : _refController.text.trim());
        _complete(method: 'card', amountPaid: _total, change: 0, mpesaRef: cardRef);
      case PayMethod.airtel:
        if (_phone.text.trim().length < 9) {
          setState(() => _error = 'Enter the customer Airtel number');
          return;
        }
        _complete(method: 'airtel', amountPaid: _total, change: 0,
            mpesaRef: '${_phone.text.trim()}${_refController.text.trim().isEmpty ? '' : '·${_refController.text.trim()}'}');
      case PayMethod.bankTransfer:
        if (_refController.text.trim().isEmpty) {
          setState(() => _error = 'Enter the transaction reference');
          return;
        }
        _complete(method: 'bank_transfer', amountPaid: _total, change: 0,
            mpesaRef: '${_bankName.text.trim().isEmpty ? '' : '${_bankName.text.trim()} · '}${_refController.text.trim()}');
      case PayMethod.cheque:
        if (_refController.text.trim().isEmpty) {
          setState(() => _error = 'Enter the cheque number');
          return;
        }
        _complete(method: 'cheque', amountPaid: _total, change: 0,
            mpesaRef: _refController.text.trim());
      default:
        // M-Pesa recorded manually (no STK) — optionally split with cash.
        final split = _mpesaSplit();
        _complete(method: split.method, amountPaid: _total, change: 0, cashAmount: split.cash, mpesaAmount: split.mpesa);
    }
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

  Widget _phoneField({String label = 'Customer phone (for STK)'}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          onChanged: (_) => setState(() => _error = null),
          decoration: InputDecoration(
            labelText: label,
            border: const OutlineInputBorder(),
            isDense: true,
            prefix: const Row(
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
    String? mpesaRef,
  }) async {
    final cart = ref.read(cartProvider);
    if (cart.isEmpty) return;
    setState(() { _saving = true; _error = null; });

    final navigator = Navigator.of(context);
    final cashier = ref.read(authControllerProvider).user?.name ??
        await ref.read(appDatabaseProvider).getMeta('cashier_name');
    final payload = _buildPayload(cart, method, amountPaid, cashAmount, mpesaAmount, mpesaRef: mpesaRef);

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

  Map<String, dynamic> _buildPayload(Cart cart, String method, num amountPaid, num cashAmount, num mpesaAmount, {String? mpesaRef}) {
    final ref_ = mpesaRef ?? (_refController.text.trim().isNotEmpty ? _refController.text.trim() : null);
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
      if (ref_ != null) 'mpesa_ref': ref_,
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

class _MethodDef {
  final PayMethod method;
  final String label;
  final Widget icon;
  const _MethodDef(this.method, this.label, this.icon);
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

// ── Paystack WebView card checkout ────────────────────────────────────────────

class _PaystackWebView extends StatefulWidget {
  final String authorizationUrl;
  final String reference;
  const _PaystackWebView({required this.authorizationUrl, required this.reference});

  @override
  State<_PaystackWebView> createState() => _PaystackWebViewState();
}

class _PaystackWebViewState extends State<_PaystackWebView> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (req) {
          // Paystack redirects to the callback URL or standard.paystack.co/close on success
          final url = req.url.toLowerCase();
          if (url.contains('paystack.co/close') ||
              url.contains('/payment/callback') ||
              url.contains('fazipos') ||
              (url.contains(widget.reference.toLowerCase()) && url.contains('success'))) {
            Navigator.of(context).pop(true);
            return NavigationDecision.prevent;
          }
          return NavigationDecision.navigate;
        },
      ))
      ..loadRequest(Uri.parse(widget.authorizationUrl));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Card Payment'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).pop(false),
        ),
      ),
      body: WebViewWidget(controller: _controller),
    );
  }
}
