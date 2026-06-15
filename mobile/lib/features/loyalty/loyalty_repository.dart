import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class LoyaltySettings {
  final bool enabled;
  final num pointsPerKes;
  final num kesPerPoint;
  final int minRedeemPoints;

  LoyaltySettings({
    required this.enabled,
    required this.pointsPerKes,
    required this.kesPerPoint,
    required this.minRedeemPoints,
  });

  factory LoyaltySettings.fromJson(Map<String, dynamic> j) => LoyaltySettings(
        enabled: (j['enabled'] ?? false) as bool,
        pointsPerKes: (j['points_per_kes'] ?? 1) as num,
        kesPerPoint: (j['kes_per_point'] ?? 1) as num,
        minRedeemPoints: (j['min_redeem_points'] ?? 100) as int,
      );
}

final loyaltySettingsProvider = FutureProvider.autoDispose<LoyaltySettings?>((ref) async {
  try {
    final res = await ref.read(apiClientProvider).dio.get('/loyalty/settings');
    if (res.data == null) return null;
    return LoyaltySettings.fromJson(res.data as Map<String, dynamic>);
  } catch (_) {
    return null;
  }
});

Future<void> updateLoyaltySettings(WidgetRef ref, Map<String, dynamic> data) async {
  await ref.read(apiClientProvider).dio.patch('/loyalty/settings', data: data);
}
