import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/providers.dart';
import '../../core/widgets/digit_keypad.dart';
import 'auth_controller.dart';
import 'auth_models.dart';

enum _Step { slug, user, pin }

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _slugCtrl = TextEditingController();
  final _pinCtrl = TextEditingController();

  _Step _step = _Step.slug;
  String? _slug;
  List<AppUser> _users = [];
  AppUser? _selectedUser;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Pre-fill the last business used on this device.
    ref.read(secureStoreProvider).orgSlug.then((slug) {
      if (slug != null && slug.isNotEmpty && mounted) {
        setState(() => _slugCtrl.text = slug);
      }
    });
  }

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
      setState(() { _slug = slug; _users = users; _step = _Step.user; });
    } catch (e) {
      setState(() => _error = "Can't reach \"$slug\" — ${apiError(e)}");
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _pickUser(AppUser u) {
    setState(() { _selectedUser = u; _pinCtrl.clear(); _error = null; _step = _Step.pin; });
  }

  Future<void> _login() async {
    if (_selectedUser == null || _pinCtrl.text.length < 4) return;
    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(authControllerProvider.notifier)
          .loginWithPin(_slug!, _selectedUser!.id, _pinCtrl.text.trim());
      // router redirect handles navigation
    } catch (e) {
      setState(() { _error = apiError(e); _loading = false; });
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
                    child: switch (_step) {
                      _Step.slug => _slugStep(),
                      _Step.user => _userStep(),
                      _Step.pin => _pinStep(),
                    },
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: Color(0xFFfca5a5), fontSize: 13), textAlign: TextAlign.center),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _slugStep() {
    final cached = _slugCtrl.text.trim();
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
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(hintText: 'your-business-slug', border: OutlineInputBorder()),
          onSubmitted: (_) => _loadUsers(),
        ),
        const SizedBox(height: 16),
        FilledButton(
          style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
          onPressed: _loading ? null : _loadUsers,
          child: Text(_loading ? 'Connecting…' : (cached.isEmpty ? 'Continue' : 'Continue as $cached')),
        ),
      ],
    );
  }

  Widget _userStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _stepHeader(_slug!, 'Change business', () => setState(() { _step = _Step.slug; _users = []; })),
        const SizedBox(height: 12),
        const Text('Who is signing in?', style: TextStyle(color: Colors.grey, fontSize: 13)),
        const SizedBox(height: 8),
        if (_users.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(child: Text('No users for this business', style: TextStyle(color: Colors.grey))),
          )
        else
          ..._users.map((u) => Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: CircleAvatar(child: Text(u.name.isNotEmpty ? u.name[0].toUpperCase() : '?')),
                  title: Text(u.name),
                  subtitle: Text(u.role),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _pickUser(u),
                ),
              )),
      ],
    );
  }

  Widget _pinStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _stepHeader(_selectedUser!.name, 'Change user', () => setState(() { _step = _Step.user; _pinCtrl.clear(); })),
        const SizedBox(height: 16),
        const Text('Enter your PIN', style: TextStyle(color: Colors.grey, fontSize: 13), textAlign: TextAlign.center),
        const SizedBox(height: 14),
        _PinDots(length: _pinCtrl.text.length),
        const SizedBox(height: 12),
        DigitKeypad(
          onKey: (k) {
            if (_pinCtrl.text.length >= 8) return; // PIN is 4–8 digits
            setState(() { _pinCtrl.text += k; _error = null; });
          },
          onBackspace: () {
            if (_pinCtrl.text.isEmpty) return;
            setState(() => _pinCtrl.text = _pinCtrl.text.substring(0, _pinCtrl.text.length - 1));
          },
        ),
        const SizedBox(height: 8),
        FilledButton(
          style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
          onPressed: (_loading || _pinCtrl.text.length < 4) ? null : _login,
          child: Text(_loading ? 'Signing in…' : 'Sign In'),
        ),
      ],
    );
  }

  Widget _stepHeader(String title, String changeLabel, VoidCallback onChange) {
    return Row(
      children: [
        Expanded(
          child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
        ),
        TextButton(onPressed: onChange, child: Text(changeLabel)),
      ],
    );
  }
}

class _PinDots extends StatelessWidget {
  final int length;
  const _PinDots({required this.length});

  @override
  Widget build(BuildContext context) {
    final slots = length < 4 ? 4 : length; // grow past 4 up to 8
    final brand = Theme.of(context).colorScheme.primary;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < slots; i++)
          Container(
            width: 14,
            height: 14,
            margin: const EdgeInsets.symmetric(horizontal: 6),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: i < length ? brand : Colors.transparent,
              border: Border.all(color: i < length ? brand : Colors.grey.shade400, width: 1.5),
            ),
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
