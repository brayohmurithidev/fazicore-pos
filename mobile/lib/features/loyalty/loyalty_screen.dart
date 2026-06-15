import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'loyalty_repository.dart';

class LoyaltyScreen extends ConsumerStatefulWidget {
  const LoyaltyScreen({super.key});

  @override
  ConsumerState<LoyaltyScreen> createState() => _LoyaltyScreenState();
}

class _LoyaltyScreenState extends ConsumerState<LoyaltyScreen> {
  final _formKey = GlobalKey<FormState>();
  final _pointsPerKes = TextEditingController();
  final _kesPerPoint = TextEditingController();
  final _minRedeem = TextEditingController();
  bool _enabled = false;
  bool _initialized = false;
  bool _loading = false;

  @override
  void dispose() {
    _pointsPerKes.dispose();
    _kesPerPoint.dispose();
    _minRedeem.dispose();
    super.dispose();
  }

  void _init(LoyaltySettings? s) {
    if (_initialized) return;
    _initialized = true;
    _enabled = s?.enabled ?? false;
    _pointsPerKes.text = (s?.pointsPerKes ?? 1).toString();
    _kesPerPoint.text = (s?.kesPerPoint ?? 1).toString();
    _minRedeem.text = (s?.minRedeemPoints ?? 100).toString();
  }

  num get _pts => num.tryParse(_pointsPerKes.text) ?? 0;
  num get _kes => num.tryParse(_kesPerPoint.text) ?? 0;

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await updateLoyaltySettings(ref, {
        'enabled': _enabled,
        'points_per_kes': num.tryParse(_pointsPerKes.text) ?? 1,
        'kes_per_point': num.tryParse(_kesPerPoint.text) ?? 1,
        'min_redeem_points': int.tryParse(_minRedeem.text) ?? 100,
      });
      ref.invalidate(loyaltySettingsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Loyalty settings saved')));
      }
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
    final async = ref.watch(loyaltySettingsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Loyalty Program')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(apiError(e))),
        data: (settings) {
          _init(settings);
          return Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: SwitchListTile(
                    value: _enabled,
                    onChanged: (v) => setState(() => _enabled = v),
                    title: const Text('Enable Loyalty Program',
                        style: TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: const Text('Customers earn and redeem points on purchases'),
                  ),
                ),
                const SizedBox(height: 16),
                AnimatedOpacity(
                  duration: const Duration(milliseconds: 200),
                  opacity: _enabled ? 1 : 0.4,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TextFormField(
                        controller: _pointsPerKes,
                        decoration: const InputDecoration(
                          labelText: 'Points earned per KES 1 spent',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType:
                            const TextInputType.numberWithOptions(decimal: true),
                        enabled: _enabled,
                        onChanged: (_) => setState(() {}),
                        validator: (v) {
                          if (!_enabled) return null;
                          if (v == null || v.isEmpty) return 'Required';
                          if (num.tryParse(v) == null || num.parse(v) <= 0) {
                            return 'Must be > 0';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _kesPerPoint,
                        decoration: const InputDecoration(
                          labelText: 'KES redeemed per 1 point',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType:
                            const TextInputType.numberWithOptions(decimal: true),
                        enabled: _enabled,
                        onChanged: (_) => setState(() {}),
                        validator: (v) {
                          if (!_enabled) return null;
                          if (v == null || v.isEmpty) return 'Required';
                          if (num.tryParse(v) == null || num.parse(v) <= 0) {
                            return 'Must be > 0';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _minRedeem,
                        decoration: const InputDecoration(
                          labelText: 'Minimum points to redeem',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.number,
                        enabled: _enabled,
                        validator: (v) {
                          if (!_enabled) return null;
                          if (v == null || v.isEmpty) return 'Required';
                          if (int.tryParse(v) == null || int.parse(v) < 0) {
                            return 'Must be >= 0';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                      // Live preview card
                      if (_enabled && _pts > 0 && _kes > 0)
                        Card(
                          color: Theme.of(context).colorScheme.secondaryContainer,
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Preview',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSecondaryContainer,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  'Spend KES 1,000 → earn ${(1000 * _pts).toStringAsFixed(0)} pts',
                                  style: TextStyle(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSecondaryContainer,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Redeem 100 pts → save KES ${(100 * _kes).toStringAsFixed(0)}',
                                  style: TextStyle(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSecondaryContainer,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _loading ? null : _save,
                  child: _loading
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Save Settings'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
