import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/widgets/app_select.dart';
import 'manage_repository.dart';
import 'plan_provider.dart';

class EmployeeFormScreen extends ConsumerStatefulWidget {
  const EmployeeFormScreen({super.key});

  @override
  ConsumerState<EmployeeFormScreen> createState() => _EmployeeFormScreenState();
}

class _EmployeeFormScreenState extends ConsumerState<EmployeeFormScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _pin = TextEditingController();
  String _role = 'cashier';
  int? _branchId;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _pin.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _error = 'Enter the employee name');
      return;
    }
    if (_pin.text.trim().length < 4) {
      setState(() => _error = 'PIN must be at least 4 digits');
      return;
    }
    setState(() { _saving = true; _error = null; });
    final nav = Navigator.of(context);
    final msg = ScaffoldMessenger.of(context);
    try {
      await createUser(ref,
          name: _name.text.trim(),
          pin: _pin.text.trim(),
          role: _role,
          email: _email.text.trim(),
          branchId: _branchId);
      ref.invalidate(orgUsersProvider);
      ref.invalidate(planProvider);
      nav.pop(true);
      msg.showSnackBar(const SnackBar(content: Text('Employee added')));
    } catch (e) {
      if (mounted) setState(() { _saving = false; _error = apiError(e); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final branches = ref.watch(branchesProvider).valueOrNull ?? const [];
    return Scaffold(
      appBar: AppBar(title: const Text('Add employee')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _field(_name, 'Full name'),
          _field(_email, 'Email (optional)', keyboard: TextInputType.emailAddress),
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: TextField(
              controller: _pin,
              keyboardType: TextInputType.number,
              obscureText: true,
              maxLength: 8,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(
                  labelText: 'PIN (4–8 digits)', border: OutlineInputBorder(), isDense: true, counterText: ''),
            ),
          ),
          AppSelect<String>(
            label: 'Role',
            value: _role,
            options: const [
              SelectOption('Cashier', 'cashier'),
              SelectOption('Manager', 'manager'),
              SelectOption('Stock', 'stock'),
              SelectOption('Admin', 'admin'),
            ],
            onChanged: (v) => setState(() => _role = v ?? 'cashier'),
          ),
          const SizedBox(height: 12),
          AppSelect<int>(
            label: 'Branch (optional)',
            hint: 'No branch',
            value: _branchId,
            searchable: branches.length > 8,
            options: [
              const SelectOption('No branch', null),
              ...branches.map((b) => SelectOption(b.name, b.id)),
            ],
            onChanged: (v) => setState(() => _branchId = v),
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
                : const Text('Add employee'),
          ),
        ],
      ),
    );
  }

  Widget _field(TextEditingController c, String label, {TextInputType? keyboard}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: c,
          keyboardType: keyboard,
          decoration: InputDecoration(labelText: label, border: const OutlineInputBorder(), isDense: true),
        ),
      );
}
