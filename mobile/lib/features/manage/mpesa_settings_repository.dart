import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class MpesaCredentials {
  final String environment; // 'sandbox' | 'production'
  final String shortcode;
  final String consumerKeyMasked;
  final String consumerSecretMasked;
  final String passkeyMasked;
  final String? callbackUrlOverride;
  final bool isActive;
  final bool isLive;
  final String stkCallbackUrl;
  final String c2bConfirmationUrl;
  final String c2bValidationUrl;

  MpesaCredentials({
    required this.environment,
    required this.shortcode,
    required this.consumerKeyMasked,
    required this.consumerSecretMasked,
    required this.passkeyMasked,
    this.callbackUrlOverride,
    required this.isActive,
    required this.isLive,
    required this.stkCallbackUrl,
    required this.c2bConfirmationUrl,
    required this.c2bValidationUrl,
  });

  factory MpesaCredentials.fromJson(Map<String, dynamic> j) => MpesaCredentials(
        environment: j['environment'] as String,
        shortcode: (j['shortcode'] ?? '').toString(),
        consumerKeyMasked: (j['consumer_key_masked'] ?? '').toString(),
        consumerSecretMasked: (j['consumer_secret_masked'] ?? '').toString(),
        passkeyMasked: (j['passkey_masked'] ?? '').toString(),
        callbackUrlOverride: j['callback_url_override'] as String?,
        isActive: (j['is_active'] ?? false) as bool,
        isLive: (j['is_live'] ?? false) as bool,
        stkCallbackUrl: (j['stk_callback_url'] ?? '').toString(),
        c2bConfirmationUrl: (j['c2b_confirmation_url'] ?? '').toString(),
        c2bValidationUrl: (j['c2b_validation_url'] ?? '').toString(),
      );
}

/// GET /mpesa/credentials — admin only.
final mpesaCredentialsProvider = FutureProvider.autoDispose<List<MpesaCredentials>>((ref) async {
  final res = await ref.read(apiClientProvider).dio.get('/mpesa/credentials');
  return (res.data as List).map((e) => MpesaCredentials.fromJson(e as Map<String, dynamic>)).toList();
});

/// PUT /mpesa/credentials — blank secret fields keep the existing encrypted value.
Future<MpesaCredentials> saveMpesaCredentials(
  WidgetRef ref, {
  required String environment,
  required String shortcode,
  String consumerKey = '',
  String consumerSecret = '',
  String passkey = '',
  String? callbackUrlOverride,
}) async {
  final res = await ref.read(apiClientProvider).dio.put('/mpesa/credentials', data: {
    'environment': environment,
    'shortcode': shortcode,
    'consumer_key': consumerKey,
    'consumer_secret': consumerSecret,
    'passkey': passkey,
    'callback_url_override': callbackUrlOverride,
  });
  return MpesaCredentials.fromJson(res.data as Map<String, dynamic>);
}

/// DELETE /mpesa/credentials/{environment}
Future<void> deleteMpesaCredentials(WidgetRef ref, String environment) async {
  await ref.read(apiClientProvider).dio.delete('/mpesa/credentials/$environment');
}

/// POST /mpesa/credentials/set-live/{environment}
Future<void> setLiveMpesaEnvironment(WidgetRef ref, String environment) async {
  await ref.read(apiClientProvider).dio.post('/mpesa/credentials/set-live/$environment');
}

/// POST /mpesa/register-c2b?environment=... — returns the confirmation/validation URLs.
Future<void> registerC2bUrls(WidgetRef ref, String environment) async {
  await ref.read(apiClientProvider).dio.post('/mpesa/register-c2b', queryParameters: {'environment': environment});
}
