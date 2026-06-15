import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import 'etims_repository.dart';

const _subStatuses = ['All', 'pending', 'submitted', 'failed'];
const _subStatusLabels = {
  'pending': 'Pending',
  'submitted': 'Submitted',
  'failed': 'Failed',
};

Color _subStatusColor(String status) {
  return switch (status) {
    'pending' => Colors.orange,
    'submitted' => Colors.green,
    'failed' => Colors.red,
    _ => Colors.grey,
  };
}

class EtimsScreen extends ConsumerStatefulWidget {
  const EtimsScreen({super.key});

  @override
  ConsumerState<EtimsScreen> createState() => _EtimsScreenState();
}

class _EtimsScreenState extends ConsumerState<EtimsScreen> {
  String _filter = 'All';
  bool _testLoading = false;
  String? _testResult;
  bool _testOk = false;

  Future<void> _testConnection() async {
    setState(() {
      _testLoading = true;
      _testResult = null;
    });
    try {
      final result = await testEtimsConnection(ref);
      final ok = result['ok'] == true;
      setState(() {
        _testOk = ok;
        _testResult = ok ? 'Connection successful' : (result['error']?.toString() ?? 'Failed');
      });
    } catch (e) {
      setState(() {
        _testOk = false;
        _testResult = apiError(e);
      });
    } finally {
      setState(() => _testLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final configAsync = ref.watch(etimsConfigProvider);
    final subsAsync = ref.watch(etimsSubmissionsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('eTIMS')),
      body: RefreshIndicator(
        onRefresh: () => Future.wait([
          ref.refresh(etimsConfigProvider.future),
          ref.refresh(etimsSubmissionsProvider.future),
        ]),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Config card
            configAsync.when(
              loading: () => const Card(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
              error: (e, _) => Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(apiError(e), style: const TextStyle(color: Colors.red)),
                ),
              ),
              data: (config) => Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text('Configuration',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(fontWeight: FontWeight.bold)),
                          const Spacer(),
                          TextButton.icon(
                            onPressed: () => _openConfigSheet(context, config),
                            icon: const Icon(Icons.edit_outlined),
                            label: const Text('Edit'),
                          ),
                        ],
                      ),
                      if (config == null)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 8),
                          child: Text('Not configured',
                              style: TextStyle(color: Colors.grey)),
                        )
                      else ...[
                        const SizedBox(height: 8),
                        _meta('KRA PIN', config.kraPin),
                        _meta('BHF ID', config.bhfId),
                        if (config.deviceSerial != null)
                          _meta('Device Serial', config.deviceSerial!),
                        _meta('Mode', config.sandboxMode ? 'Sandbox' : 'Production'),
                        _meta('Status', config.isActive ? 'Active' : 'Inactive'),
                      ],
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          OutlinedButton.icon(
                            onPressed: _testLoading ? null : _testConnection,
                            icon: _testLoading
                                ? const SizedBox(
                                    height: 14,
                                    width: 14,
                                    child: CircularProgressIndicator(strokeWidth: 2))
                                : const Icon(Icons.wifi_tethering_outlined),
                            label: const Text('Test Connection'),
                          ),
                          if (_testResult != null) ...[
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                _testResult!,
                                style: TextStyle(
                                  color: _testOk ? Colors.green : Colors.red,
                                  fontSize: 13,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 20),
            const Text('Submissions',
                style: TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 13, color: Colors.grey)),
            const SizedBox(height: 8),
            SizedBox(
              height: 44,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _subStatuses.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final s = _subStatuses[i];
                  final label = s == 'All' ? 'All' : (_subStatusLabels[s] ?? s);
                  final selected = _filter == s;
                  return FilterChip(
                    label: Text(label),
                    selected: selected,
                    onSelected: (_) => setState(() => _filter = s),
                  );
                },
              ),
            ),
            const SizedBox(height: 8),
            subsAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.all(16),
                child: Text(apiError(e), style: const TextStyle(color: Colors.red)),
              ),
              data: (subs) {
                final filtered = _filter == 'All'
                    ? subs
                    : subs.where((s) => s.status == _filter).toList();
                if (filtered.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.all(32),
                    child: Center(
                        child: Text('No submissions', style: TextStyle(color: Colors.grey))),
                  );
                }
                return Column(
                  children: [
                    for (final sub in filtered) ...[
                      _SubmissionCard(sub: sub, ref: ref),
                      const SizedBox(height: 8),
                    ],
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _meta(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Row(
          children: [
            SizedBox(
              width: 110,
              child: Text(label, style: const TextStyle(color: Colors.grey, fontSize: 13)),
            ),
            Expanded(
                child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500))),
          ],
        ),
      );

  void _openConfigSheet(BuildContext context, EtimsConfig? existing) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _EtimsConfigSheet(existing: existing, ref: ref),
    );
  }
}

class _SubmissionCard extends ConsumerStatefulWidget {
  final EtimsSubmission sub;
  final WidgetRef ref;
  const _SubmissionCard({required this.sub, required this.ref});

  @override
  ConsumerState<_SubmissionCard> createState() => _SubmissionCardState();
}

class _SubmissionCardState extends ConsumerState<_SubmissionCard> {
  bool _retrying = false;

  Future<void> _retry() async {
    setState(() => _retrying = true);
    try {
      await retrySubmission(widget.ref, widget.sub.id);
      widget.ref.invalidate(etimsSubmissionsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Retry queued')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    } finally {
      if (mounted) setState(() => _retrying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sub = widget.sub;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: _subStatusColor(sub.status).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _subStatusLabels[sub.status] ?? sub.status,
                    style: TextStyle(
                      fontSize: 11,
                      color: _subStatusColor(sub.status),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const Spacer(),
                Text(dateTimeShort(sub.createdAt),
                    style: const TextStyle(color: Colors.grey, fontSize: 12)),
              ],
            ),
            const SizedBox(height: 6),
            if (sub.orderId != null)
              Text('Order #${sub.orderId}',
                  style: const TextStyle(fontWeight: FontWeight.w500)),
            if (sub.cuInvoiceNo != null)
              Text('CU: ${sub.cuInvoiceNo}',
                  style: const TextStyle(fontSize: 13, color: Colors.grey)),
            if (sub.errorMessage != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(sub.errorMessage!,
                    style: const TextStyle(fontSize: 12, color: Colors.red)),
              ),
            if (sub.status == 'failed') ...[
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: OutlinedButton.icon(
                  onPressed: _retrying ? null : _retry,
                  icon: _retrying
                      ? const SizedBox(
                          height: 14,
                          width: 14,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.refresh, size: 16),
                  label: const Text('Retry'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    textStyle: const TextStyle(fontSize: 13),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _EtimsConfigSheet extends StatefulWidget {
  final EtimsConfig? existing;
  final WidgetRef ref;
  const _EtimsConfigSheet({this.existing, required this.ref});

  @override
  State<_EtimsConfigSheet> createState() => _EtimsConfigSheetState();
}

class _EtimsConfigSheetState extends State<_EtimsConfigSheet> {
  final _formKey = GlobalKey<FormState>();
  late final _kraPin = TextEditingController(text: widget.existing?.kraPin);
  late final _bhfId = TextEditingController(text: widget.existing?.bhfId ?? '00');
  late final _serial = TextEditingController(text: widget.existing?.deviceSerial);
  late bool _sandbox = widget.existing?.sandboxMode ?? true;
  late bool _active = widget.existing?.isActive ?? false;
  bool _loading = false;

  @override
  void dispose() {
    _kraPin.dispose();
    _bhfId.dispose();
    _serial.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await upsertEtimsConfig(widget.ref, {
        'kra_pin': _kraPin.text.trim(),
        'bhf_id': _bhfId.text.trim(),
        if (_serial.text.isNotEmpty) 'device_serial': _serial.text.trim(),
        'sandbox_mode': _sandbox,
        'is_active': _active,
      });
      widget.ref.invalidate(etimsConfigProvider);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('eTIMS Configuration', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            TextFormField(
              controller: _kraPin,
              decoration: const InputDecoration(labelText: 'KRA PIN *'),
              textCapitalization: TextCapitalization.characters,
              validator: (v) => (v == null || v.trim().isEmpty) ? 'KRA PIN is required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _bhfId,
              decoration: const InputDecoration(labelText: 'BHF ID'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _serial,
              decoration: const InputDecoration(labelText: 'Device Serial (optional)'),
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              value: _sandbox,
              onChanged: (v) => setState(() => _sandbox = v),
              title: const Text('Sandbox mode'),
              subtitle: const Text('Use KRA sandbox environment'),
              contentPadding: EdgeInsets.zero,
            ),
            SwitchListTile(
              value: _active,
              onChanged: (v) => setState(() => _active = v),
              title: const Text('Active'),
              subtitle: const Text('Submit invoices to eTIMS'),
              contentPadding: EdgeInsets.zero,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}
