import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../printing/printer_service.dart';

class BusinessInfoScreen extends ConsumerStatefulWidget {
  const BusinessInfoScreen({super.key});

  @override
  ConsumerState<BusinessInfoScreen> createState() => _BusinessInfoScreenState();
}

class _BusinessInfoScreenState extends ConsumerState<BusinessInfoScreen> {
  late final _settings = ref.read(printerProvider);
  late final _kra = TextEditingController(text: _settings.kraPin);
  late final _vat = TextEditingController(text: _settings.vatNumber);

  @override
  void dispose() {
    _kra.dispose();
    _vat.dispose();
    super.dispose();
  }

  void _save() {
    ref.read(printerProvider.notifier).setTaxInfo(
          kraPin: _kra.text.trim(),
          vatNumber: _vat.text.trim(),
        );
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved')));
  }

  @override
  Widget build(BuildContext context) {
    final biz = ref.watch(printerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Business information')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(biz.shopName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  if (biz.phone.isNotEmpty) _line(Icons.phone_outlined, biz.phone),
                  if (biz.email.isNotEmpty) _line(Icons.email_outlined, biz.email),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(Icons.cloud_done_outlined, size: 14, color: Colors.grey),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text('Synced from your business profile. Edit name/phone on the web admin.',
                            style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          const Text('Tax details (printed on receipts)',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Colors.grey)),
          const SizedBox(height: 12),
          TextField(
            controller: _kra,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(
                labelText: 'KRA PIN', hintText: 'P051234567W', border: OutlineInputBorder(), isDense: true),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _vat,
            decoration: const InputDecoration(
                labelText: 'VAT number', border: OutlineInputBorder(), isDense: true),
          ),
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(onPressed: _save, child: const Text('Save')),
          ),
        ],
      ),
    );
  }

  Widget _line(IconData icon, String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            Icon(icon, size: 16, color: Colors.grey),
            const SizedBox(width: 8),
            Expanded(child: Text(text)),
          ],
        ),
      );
}
