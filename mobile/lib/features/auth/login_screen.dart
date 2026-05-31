import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'auth_controller.dart';
import 'auth_models.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _slugCtrl = TextEditingController();
  final _pinCtrl = TextEditingController();

  String? _slug;
  List<AppUser> _users = [];
  AppUser? _selectedUser;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _slugCtrl.dispose();
    _pinCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadUsers() async {
    final slug = _slugCtrl.text.trim();
    if (slug.isEmpty) {
      setState(() => _error = 'Enter your business slug');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      final users = await ref.read(authControllerProvider.notifier).usersForSlug(slug);
      setState(() { _slug = slug; _users = users; });
    } catch (e) {
      setState(() => _error = "Can't reach \"$slug\" — ${apiError(e)}");
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _login() async {
    if (_selectedUser == null) { setState(() => _error = 'Select a user'); return; }
    if (_pinCtrl.text.trim().isEmpty) { setState(() => _error = 'Enter your PIN'); return; }
    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(authControllerProvider.notifier)
          .loginWithPin(_slug!, _selectedUser!.id, _pinCtrl.text.trim());
      // router redirect handles navigation
    } catch (e) {
      setState(() => _error = apiError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1e293b),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 380),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const _Wordmark(),
                const SizedBox(height: 28),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: _slug == null ? _slugStep() : _pinStep(),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: Color(0xFFfca5a5), fontSize: 13)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _slugStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Business', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
        const SizedBox(height: 4),
        const Text('Enter your business slug to get started',
            style: TextStyle(color: Colors.grey, fontSize: 13)),
        const SizedBox(height: 16),
        TextField(
          controller: _slugCtrl,
          autocorrect: false,
          decoration: const InputDecoration(hintText: 'your-business-slug', border: OutlineInputBorder()),
          onSubmitted: (_) => _loadUsers(),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _loading ? null : _loadUsers,
          child: Text(_loading ? 'Connecting…' : 'Continue'),
        ),
      ],
    );
  }

  Widget _pinStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text(_slug!, style: const TextStyle(fontWeight: FontWeight.w600))),
            TextButton(
              onPressed: () => setState(() { _slug = null; _users = []; _selectedUser = null; _pinCtrl.clear(); }),
              child: const Text('Change'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        const Text('Select user', style: TextStyle(color: Colors.grey, fontSize: 13)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _users.map((u) {
            final sel = _selectedUser?.id == u.id;
            return ChoiceChip(
              label: Text(u.name),
              selected: sel,
              onSelected: (_) => setState(() => _selectedUser = u),
            );
          }).toList(),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _pinCtrl,
          obscureText: true,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'PIN', border: OutlineInputBorder()),
          onSubmitted: (_) => _login(),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _loading ? null : _login,
          child: Text(_loading ? 'Signing in…' : 'Sign In'),
        ),
      ],
    );
  }
}

class _Wordmark extends StatelessWidget {
  const _Wordmark();
  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        Text.rich(
          TextSpan(children: [
            TextSpan(text: 'FAZI', style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: 1)),
            TextSpan(text: 'LABS', style: TextStyle(color: Color(0xFFf5a020), fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: 1)),
          ]),
        ),
        SizedBox(height: 2),
        Text('POS', style: TextStyle(color: Color(0xFF94a3b8), fontSize: 11, letterSpacing: 4)),
      ],
    );
  }
}
