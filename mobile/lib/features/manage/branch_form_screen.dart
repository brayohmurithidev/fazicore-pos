import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'manage_repository.dart';
import 'plan_provider.dart';

class BranchFormScreen extends ConsumerStatefulWidget {
  const BranchFormScreen({super.key});

  @override
  ConsumerState<BranchFormScreen> createState() => _BranchFormScreenState();
}

class _BranchFormScreenState extends ConsumerState<BranchFormScreen> {
  final _name = TextEditingController();
  final _location = TextEditingController();
  final _phone = TextEditingController();
  final _manager = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_name, _location, _phone, _manager]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _error = 'Enter a branch name');
      return;
    }
    setState(() { _saving = true; _error = null; });
    final nav = Navigator.of(context);
    final msg = ScaffoldMessenger.of(context);
    try {
      await createBranch(ref,
          name: _name.text.trim(),
          location: _location.text.trim(),
          phone: _phone.text.trim(),
          managerName: _manager.text.trim());
      ref.invalidate(branchesProvider);
      ref.invalidate(planProvider);
      nav.pop(true);
      msg.showSnackBar(const SnackBar(content: Text('Branch added')));
    } catch (e) {
      if (mounted) setState(() { _saving = false; _error = apiError(e); });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Add branch')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _field(_name, 'Branch name'),
          _field(_location, 'Location'),
          _field(_phone, 'Phone', keyboard: TextInputType.phone),
          _field(_manager, 'Manager name'),
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
                : const Text('Add branch'),
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
