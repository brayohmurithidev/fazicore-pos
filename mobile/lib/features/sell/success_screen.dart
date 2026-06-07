import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets/mpesa_logo.dart';
import '../printing/printer_service.dart';
import '../printing/receipt.dart';

class SuccessScreen extends ConsumerStatefulWidget {
  final String method;
  final num change;
  final num total;
  final Receipt receipt;

  const SuccessScreen({
    super.key,
    required this.method,
    required this.change,
    required this.total,
    required this.receipt,
  });

  @override
  ConsumerState<SuccessScreen> createState() => _SuccessScreenState();
}

class _SuccessScreenState extends ConsumerState<SuccessScreen> {
  bool _printing = false;

  Future<void> _print() async {
    setState(() => _printing = true);
    final err = await ref.read(printerProvider.notifier).printReceipt(widget.receipt);
    if (mounted) {
      setState(() => _printing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(err ?? 'Receipt sent to printer')),
      );
    }
  }

  Future<void> _share() async {
    await SharePlus.instance.share(
      ShareParams(text: receiptToText(widget.receipt), subject: 'Receipt ${widget.receipt.ref ?? ''}'.trim()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final printerSet = ref.watch(printerProvider).isConfigured;
    return Scaffold(
      backgroundColor: AppColors.brand,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 84,
                      height: 84,
                      decoration: BoxDecoration(color: AppColors.brand.withValues(alpha: 0.12), shape: BoxShape.circle),
                      child: const Icon(Icons.check_circle, color: AppColors.brand, size: 56),
                    ),
                    const SizedBox(height: 16),
                    const Text('Sale complete', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text(kes(widget.total), style: const TextStyle(fontSize: 16, color: Colors.grey)),
                    const SizedBox(height: 20),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFFf7f7f8),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        children: [
                          _row('Payment', _methodWidget()),
                          if (widget.change > 0) ...[
                            const SizedBox(height: 8),
                            _row('Change', Text(kes(widget.change), style: const TextStyle(fontWeight: FontWeight.bold))),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const Spacer(),
              Row(
                children: [
                  if (printerSet)
                    Expanded(
                      child: _whiteOutlined(
                        icon: _printing
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Icon(Icons.print_outlined),
                        label: 'Print',
                        onPressed: _printing ? null : _print,
                      ),
                    ),
                  if (printerSet) const SizedBox(width: 12),
                  Expanded(
                    child: _whiteOutlined(
                      icon: const Icon(Icons.ios_share),
                      label: 'Share',
                      onPressed: _share,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: AppColors.brand,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                  onPressed: () => Navigator.of(context).pop(), // back to Sell
                  child: const Text('New sale', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _whiteOutlined({required Widget icon, required String label, required VoidCallback? onPressed}) {
    return OutlinedButton.icon(
      style: OutlinedButton.styleFrom(
        foregroundColor: Colors.white,
        backgroundColor: Colors.transparent,
        side: const BorderSide(color: Colors.white),
        padding: const EdgeInsets.symmetric(vertical: 16),
      ),
      icon: icon,
      label: Text(label),
      onPressed: onPressed,
    );
  }

  Widget _methodWidget() {
    if (widget.method == 'mpesa') return const MpesaLogo(height: 16);
    final label = switch (widget.method) {
      'cash' => 'Cash',
      'credit' => 'Credit',
      'split' => 'Split',
      _ => widget.method,
    };
    return Text(label, style: const TextStyle(fontWeight: FontWeight.bold));
  }

  Widget _row(String label, Widget value) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [Text(label, style: const TextStyle(color: Colors.grey)), value],
      );
}
