import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';

import 'printer_service.dart';

class PrinterSettingsScreen extends ConsumerStatefulWidget {
  const PrinterSettingsScreen({super.key});

  @override
  ConsumerState<PrinterSettingsScreen> createState() => _PrinterSettingsScreenState();
}

class _PrinterSettingsScreenState extends ConsumerState<PrinterSettingsScreen> {
  late final _settings = ref.read(printerProvider);
  late final TextEditingController _address = TextEditingController(text: _settings.address);
  late final TextEditingController _footer = TextEditingController(text: _settings.footer);
  bool _scanning = false;
  bool _testing = false;

  @override
  void dispose() {
    _address.dispose();
    _footer.dispose();
    super.dispose();
  }

  void _saveDetails() {
    ref.read(printerProvider.notifier).setShopDetails(
          address: _address.text.trim(),
          footer: _footer.text.trim().isEmpty ? 'Thank you!' : _footer.text.trim(),
        );
    _toast('Saved');
  }

  void _toast(String msg) {
    final blocked = msg.contains('system settings');
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      action: blocked
          ? const SnackBarAction(label: 'Settings', onPressed: openAppSettings)
          : null,
    ));
  }

  Future<void> _choosePrinter() async {
    setState(() => _scanning = true);
    try {
      final devices = await ref.read(printerProvider.notifier).pairedDevices();
      if (!mounted) return;
      if (devices.isEmpty) {
        _toast('No paired Bluetooth printers. Pair one in system settings first.');
        return;
      }
      final picked = await showModalBottomSheet<BluetoothInfo>(
        context: context,
        showDragHandle: true,
        builder: (_) => ListView(
          shrinkWrap: true,
          children: devices
              .map((d) => ListTile(
                    leading: const Icon(Icons.print_outlined),
                    title: Text(d.name),
                    subtitle: Text(d.macAdress),
                    onTap: () => Navigator.of(context).pop(d),
                  ))
              .toList(),
        ),
      );
      if (picked != null) {
        await ref.read(printerProvider.notifier).selectPrinter(mac: picked.macAdress, name: picked.name);
        if (mounted) _toast('Printer set: ${picked.name}');
      }
    } catch (e) {
      if (mounted) _toast(e.toString());
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  Future<void> _testPrint() async {
    setState(() => _testing = true);
    final err = await ref.read(printerProvider.notifier).testPrint();
    if (mounted) {
      setState(() => _testing = false);
      _toast(err ?? 'Test receipt sent');
    }
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(printerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Receipt printer')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: Icon(settings.isConfigured ? Icons.print : Icons.print_disabled_outlined),
              title: Text(settings.isConfigured ? settings.name! : 'No printer selected'),
              subtitle: settings.isConfigured ? Text(settings.mac!) : const Text('Tap to choose a paired printer'),
              trailing: _scanning
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.chevron_right),
              onTap: _scanning ? null : _choosePrinter,
            ),
          ),
          const SizedBox(height: 16),
          const Text('Receipt header', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(settings.shopName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  if (settings.phone.isNotEmpty)
                    Text('Tel: ${settings.phone}', style: const TextStyle(color: Colors.grey)),
                  if (settings.email.isNotEmpty)
                    Text(settings.email, style: const TextStyle(color: Colors.grey)),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(Icons.cloud_done_outlined, size: 14, color: Colors.grey),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text('Synced from your business profile. Update it on the web admin.',
                            style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _address,
            decoration: const InputDecoration(
              labelText: 'Address (printed under the name)', border: OutlineInputBorder(), isDense: true),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _footer,
            decoration: const InputDecoration(
              labelText: 'Footer message', border: OutlineInputBorder(), isDense: true),
          ),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(onPressed: _saveDetails, child: const Text('Save details')),
          ),
          const SizedBox(height: 16),
          const Text('Paper size', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 58, label: Text('58 mm')),
              ButtonSegment(value: 80, label: Text('80 mm')),
            ],
            selected: {settings.paper},
            onSelectionChanged: (s) => ref.read(printerProvider.notifier).setPaper(s.first),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            icon: _testing
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.receipt_long),
            label: const Text('Test print'),
            onPressed: (!settings.isConfigured || _testing) ? null : _testPrint,
          ),
          const SizedBox(height: 8),
          const Text(
            'Pair your thermal printer in the phone\'s Bluetooth settings first, then choose it here.',
            style: TextStyle(color: Colors.grey, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
