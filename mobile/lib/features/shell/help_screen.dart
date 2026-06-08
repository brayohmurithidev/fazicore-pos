import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/env.dart';
import '../../core/theme.dart';

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  static const _supportEmail = 'support@fazilabs.com';
  static const _supportPhone = '+254 700 000 000';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Help & support')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.email_outlined),
                  title: const Text('Email support'),
                  subtitle: const Text(_supportEmail),
                  trailing: const Icon(Icons.copy, size: 18),
                  onTap: () => _copy(context, _supportEmail),
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: const Icon(Icons.phone_outlined),
                  title: const Text('Call support'),
                  subtitle: const Text(_supportPhone),
                  trailing: const Icon(Icons.copy, size: 18),
                  onTap: () => _copy(context, _supportPhone),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const Text('Tips', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Colors.grey)),
          const SizedBox(height: 8),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _Tip('Sales made offline are queued and pushed automatically once you reconnect — check "Pending sales" in the Account tab.'),
                  SizedBox(height: 12),
                  _Tip('Sync from the Account tab to pull the latest products, customers and business details onto this device.'),
                  SizedBox(height: 12),
                  _Tip('Pair your thermal printer in the phone\'s Bluetooth settings first, then select it under Manage store → Receipt printer.'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          const Center(
            child: Text('FaziPOS  v${Env.appVersion}',
                style: TextStyle(color: Colors.grey, fontSize: 12)),
          ),
          const SizedBox(height: 4),
          const Center(
            child: Text('Powered by Fazilabs Technologies',
                style: TextStyle(color: Colors.grey, fontSize: 12)),
          ),
        ],
      ),
    );
  }

  void _copy(BuildContext context, String text) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Copied')));
  }
}

class _Tip extends StatelessWidget {
  final String text;
  const _Tip(this.text);
  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.lightbulb_outline, size: 18, color: AppColors.brand),
        const SizedBox(width: 10),
        Expanded(child: Text(text, style: const TextStyle(fontSize: 13))),
      ],
    );
  }
}
