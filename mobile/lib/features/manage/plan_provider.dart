import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// Current subscription: limits, usage counts, and feature flags.
class Plan {
  final String planName;
  final String status;
  final String? trialEndsAt;
  final Map<String, bool> features;
  final int? maxBranches;
  final int? maxUsers;
  final int? maxProducts;
  final int branchCount;
  final int userCount;
  final int productCount;

  Plan.fromJson(Map<String, dynamic> j)
      : planName = (j['plan_name'] ?? j['current_plan'] ?? '—').toString(),
        status = (j['status'] ?? '').toString(),
        trialEndsAt = j['trial_ends_at'] as String?,
        features = ((j['feature_flags'] ?? {}) as Map)
            .map((k, v) => MapEntry(k.toString(), v == true)),
        maxBranches = j['max_branches'] as int?,
        maxUsers = j['max_users'] as int?,
        maxProducts = j['max_products'] as int?,
        branchCount = (j['branch_count'] ?? 0) as int,
        userCount = (j['user_count'] ?? 0) as int,
        productCount = (j['active_product_count'] ?? 0) as int;

  bool has(String key) => features[key] ?? false;

  bool get canAddProduct => maxProducts == null || productCount < maxProducts!;
  bool get canAddUser => maxUsers == null || userCount < maxUsers!;
  bool get canAddBranch =>
      has('multi_branch') && (maxBranches == null || branchCount < maxBranches!);
}

/// GET /org/subscription — the source of truth for limits + feature flags.
/// When offline/unavailable the gates fall open (the backend still enforces).
final planProvider = FutureProvider.autoDispose<Plan>((ref) async {
  final res = await ref.read(apiClientProvider).dio.get('/org/subscription');
  return Plan.fromJson(res.data as Map<String, dynamic>);
});

class Invoice {
  final String? number;
  final String planName;
  final String amount;
  final String currency;
  final String status;
  final String? interval;
  final DateTime? createdAt;
  final DateTime? paidAt;

  Invoice.fromJson(Map<String, dynamic> j)
      : number = j['invoice_number'] as String?,
        planName = (j['plan_name'] ?? '—').toString(),
        amount = (j['amount'] ?? '0').toString(),
        currency = (j['currency'] ?? 'KES').toString(),
        status = (j['status'] ?? '').toString(),
        interval = j['billing_interval'] as String?,
        createdAt = j['created_at'] != null ? DateTime.tryParse(j['created_at'])?.toLocal() : null,
        paidAt = j['paid_at'] != null ? DateTime.tryParse(j['paid_at'])?.toLocal() : null;
}

/// GET /org/invoices — the org's own billing history.
final invoicesProvider = FutureProvider.autoDispose<List<Invoice>>((ref) async {
  final res = await ref.read(apiClientProvider).dio.get('/org/invoices');
  return (res.data as List).map((e) => Invoice.fromJson(e as Map<String, dynamic>)).toList();
});

/// Convenience: true when a feature is enabled, or while the plan is still
/// loading/unavailable (so we don't hide things spuriously offline).
bool planAllows(WidgetRef ref, String featureKey) {
  final plan = ref.watch(planProvider).valueOrNull;
  return plan == null ? true : plan.has(featureKey);
}
