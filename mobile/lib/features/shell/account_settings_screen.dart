import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/providers.dart';
import '../auth/auth_controller.dart';

class AccountSettingsScreen extends ConsumerStatefulWidget {
  const AccountSettingsScreen({super.key});

  @override
  ConsumerState<AccountSettingsScreen> createState() => _AccountSettingsScreenState();
}

class _AccountSettingsScreenState extends ConsumerState<AccountSettingsScreen> {
  late final _name = TextEditingController(text: ref.read(authControllerProvider).user?.name ?? '');
  final _pin = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _pin.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _error = 'Enter your name');
      return;
    }
    if (_pin.text.isNotEmpty && _pin.text.trim().length < 4) {
      setState(() => _error = 'PIN must be at least 4 digits');
      return;
    }
    setState(() { _saving = true; _error = null; });
    final msg = ScaffoldMessenger.of(context);
    try {
      final data = <String, dynamic>{
        'name': _name.text.trim(),
        if (_pin.text.trim().isNotEmpty) 'pin': _pin.text.trim(),
      };
      await ref.read(apiClientProvider).dio.patch('/users/me', data: data);
      // Keep the cached cashier name (used on receipts) in step.
      await ref.read(appDatabaseProvider).setMeta('cashier_name', _name.text.trim());
      if (mounted) {
        setState(() { _saving = false; _pin.clear(); });
        msg.showSnackBar(const SnackBar(content: Text('Saved')));
      }
    } catch (e) {
      if (mounted) setState(() { _saving = false; _error = apiError(e); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).user;
    return Scaffold(
      appBar: AppBar(title: const Text('Account settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (user != null)
            Card(
              child: ListTile(
                leading: CircleAvatar(child: Text(user.name.isNotEmpty ? user.name[0].toUpperCase() : '?')),
                title: Text(user.name),
                subtitle: Text(user.role),
              ),
            ),
          const SizedBox(height: 16),
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Your name', border: OutlineInputBorder(), isDense: true),
          ),
          const SizedBox(height: 16),
          const Text('Change PIN', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Colors.grey)),
          const SizedBox(height: 8),
          TextField(
            controller: _pin,
            keyboardType: TextInputType.number,
            obscureText: true,
            maxLength: 8,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(
                labelText: 'New PIN (leave blank to keep)',
                border: OutlineInputBorder(),
                isDense: true,
                counterText: ''),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 16),
          FilledButton(
            style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Save changes'),
          ),
        ],
      ),
    );
  }
}
