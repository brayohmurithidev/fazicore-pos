import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'mpesa_settings_repository.dart';

class MpesaSettingsScreen extends ConsumerStatefulWidget {
  const MpesaSettingsScreen({super.key});

  @override
  ConsumerState<MpesaSettingsScreen> createState() => _MpesaSettingsScreenState();
}

class _MpesaSettingsScreenState extends ConsumerState<MpesaSettingsScreen> {
  String _env = 'sandbox';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(mpesaCredentialsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('M-Pesa Daraja API')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(children: [
          const SizedBox(height: 120),
          Center(child: Text(apiError(e), textAlign: TextAlign.center)),
        ]),
        data: (creds) {
          final sandbox = creds.where((c) => c.environment == 'sandbox').toList();
          final production = creds.where((c) => c.environment == 'production').toList();
          final existing = (_env == 'sandbox' ? sandbox : production).firstOrNull;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Configure each environment independently, then choose which one is live.',
                style: TextStyle(color: Colors.grey, fontSize: 13),
              ),
              const SizedBox(height: 16),
              SegmentedButton<String>(
                segments: [
                  ButtonSegment(
                    value: 'sandbox',
                    label: Text(sandbox.firstOrNull?.isLive == true ? 'Sandbox  ●' : 'Sandbox'),
                  ),
                  ButtonSegment(
                    value: 'production',
                    label: Text(production.firstOrNull?.isLive == true ? 'Production  ●' : 'Production'),
                  ),
                ],
                selected: {_env},
                onSelectionChanged: (s) => setState(() => _env = s.first),
              ),
              const SizedBox(height: 16),
              _EnvPanel(key: ValueKey(_env), environment: _env, existing: existing),
            ],
          );
        },
      ),
    );
  }
}

class _EnvPanel extends ConsumerStatefulWidget {
  final String environment;
  final MpesaCredentials? existing;
  const _EnvPanel({super.key, required this.environment, required this.existing});

  @override
  ConsumerState<_EnvPanel> createState() => _EnvPanelState();
}

class _EnvPanelState extends ConsumerState<_EnvPanel> {
  final _shortcode = TextEditingController();
  final _consumerKey = TextEditingController();
  final _consumerSecret = TextEditingController();
  final _passkey = TextEditingController();
  final _callbackUrl = TextEditingController();
  bool _editing = false;
  bool _saving = false;
  bool _settingLive = false;
  bool _registering = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fillFromExisting();
  }

  void _fillFromExisting() {
    final e = widget.existing;
    _shortcode.text = e?.shortcode ?? '';
    _callbackUrl.text = e?.callbackUrlOverride ?? '';
    _consumerKey.clear();
    _consumerSecret.clear();
    _passkey.clear();
  }

  @override
  void dispose() {
    for (final c in [_shortcode, _consumerKey, _consumerSecret, _passkey, _callbackUrl]) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _isSandbox => widget.environment == 'sandbox';

  Future<void> _save() async {
    if (_shortcode.text.trim().isEmpty) {
      setState(() => _error = 'Business shortcode is required.');
      return;
    }
    if (widget.existing == null &&
        (_consumerKey.text.trim().isEmpty || _consumerSecret.text.trim().isEmpty || _passkey.text.trim().isEmpty)) {
      setState(() => _error = 'Consumer key, consumer secret and passkey are required for first setup.');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      await saveMpesaCredentials(
        ref,
        environment: widget.environment,
        shortcode: _shortcode.text.trim(),
        consumerKey: _consumerKey.text.trim(),
        consumerSecret: _consumerSecret.text.trim(),
        passkey: _passkey.text.trim(),
        callbackUrlOverride: _callbackUrl.text.trim().isEmpty ? null : _callbackUrl.text.trim(),
      );
      ref.invalidate(mpesaCredentialsProvider);
      if (mounted) {
        setState(() { _saving = false; _editing = false; });
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Credentials saved')));
      }
    } catch (e) {
      if (mounted) setState(() { _saving = false; _error = apiError(e); });
    }
  }

  Future<void> _setLive() async {
    setState(() => _settingLive = true);
    try {
      await setLiveMpesaEnvironment(ref, widget.environment);
      ref.invalidate(mpesaCredentialsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    } finally {
      if (mounted) setState(() => _settingLive = false);
    }
  }

  Future<void> _registerC2b() async {
    setState(() => _registering = true);
    try {
      await registerC2bUrls(ref, widget.environment);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('C2B URLs registered with Safaricom.')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    } finally {
      if (mounted) setState(() => _registering = false);
    }
  }

  Future<void> _remove() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Remove ${widget.environment} credentials?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Remove')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await deleteMpesaCredentials(ref, widget.environment);
      ref.invalidate(mpesaCredentialsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    }
  }

  void _copy(String label, String url) {
    Clipboard.setData(ClipboardData(text: url));
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$label URL copied')));
  }

  @override
  Widget build(BuildContext context) {
    final existing = widget.existing;
    final showForm = existing == null || _editing;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (existing != null)
              Row(
                children: [
                  if (existing.isLive)
                    const Chip(
                      label: Text('LIVE', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      backgroundColor: Colors.green,
                      visualDensity: VisualDensity.compact,
                    )
                  else
                    TextButton(
                      onPressed: _settingLive ? null : _setLive,
                      child: _settingLive
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Set as live'),
                    ),
                  const Spacer(),
                  if (!showForm)
                    IconButton(
                      tooltip: 'Edit',
                      icon: const Icon(Icons.edit_outlined),
                      onPressed: () => setState(() { _editing = true; _error = null; }),
                    ),
                  IconButton(
                    tooltip: 'Remove',
                    icon: const Icon(Icons.delete_outline, color: Colors.red),
                    onPressed: _remove,
                  ),
                ],
              ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(8)),
              child: Text(
                _isSandbox
                    ? 'Test only — no real money charged. Use test credentials from developer.safaricom.co.ke.'
                    : 'Live payments — real money. Ensure your production app is approved.',
                style: const TextStyle(fontSize: 12, color: Colors.black54),
              ),
            ),
            const SizedBox(height: 12),
            if (!showForm) ...[
              _summaryRow('Shortcode', existing.shortcode),
              const SizedBox(height: 12),
              const Text('Callback URLs', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12, color: Colors.grey)),
              const SizedBox(height: 6),
              _urlRow('STK', existing.stkCallbackUrl),
              _urlRow('C2B Confirm', existing.c2bConfirmationUrl),
              _urlRow('C2B Validate', existing.c2bValidationUrl),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: _registering ? null : _registerC2b,
                  child: _registering
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Register C2B with Safaricom'),
                ),
              ),
            ] else ...[
              _field(_shortcode, 'Business Shortcode *', hint: _isSandbox ? '174379' : 'Your paybill/till'),
              _field(_consumerKey, 'Consumer Key${existing != null ? ' (blank = keep current)' : ' *'}',
                  hint: existing?.consumerKeyMasked, obscure: true),
              _field(_consumerSecret, 'Consumer Secret${existing != null ? ' (blank = keep current)' : ' *'}',
                  hint: existing?.consumerSecretMasked, obscure: true),
              _field(_passkey, 'Lipa na M-Pesa Passkey${existing != null ? ' (blank = keep current)' : ' *'}',
                  hint: existing?.passkeyMasked, obscure: true),
              _field(_callbackUrl, 'Callback URL override (optional)', hint: 'For ngrok / custom domain'),
              if (_error != null) ...[
                const SizedBox(height: 4),
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12)),
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  if (existing != null)
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _saving
                            ? null
                            : () => setState(() { _editing = false; _error = null; _fillFromExisting(); }),
                        child: const Text('Cancel'),
                      ),
                    ),
                  if (existing != null) const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton(
                      onPressed: _saving ? null : _save,
                      child: _saving
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : Text(existing != null ? 'Update' : 'Save Credentials'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _summaryRow(String label, String value) => Row(
        children: [
          Text('$label: ', style: const TextStyle(color: Colors.grey, fontSize: 13)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        ],
      );

  Widget _urlRow(String label, String url) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          children: [
            SizedBox(width: 70, child: Text(label, style: const TextStyle(fontSize: 11, color: Colors.grey))),
            Expanded(
              child: Text(url, maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11, fontFamily: 'monospace')),
            ),
            IconButton(
              icon: const Icon(Icons.copy, size: 16),
              visualDensity: VisualDensity.compact,
              onPressed: () => _copy(label, url),
            ),
          ],
        ),
      );

  Widget _field(TextEditingController c, String label, {String? hint, bool obscure = false}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: c,
          obscureText: obscure,
          autocorrect: false,
          decoration: InputDecoration(
            labelText: label,
            hintText: hint,
            border: const OutlineInputBorder(),
            isDense: true,
          ),
        ),
      );
}
