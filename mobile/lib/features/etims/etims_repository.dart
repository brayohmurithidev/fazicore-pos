import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class EtimsConfig {
  final String kraPin;
  final String bhfId;
  final String? deviceSerial;
  final bool sandboxMode;
  final bool isActive;

  EtimsConfig({
    required this.kraPin,
    required this.bhfId,
    this.deviceSerial,
    required this.sandboxMode,
    required this.isActive,
  });

  factory EtimsConfig.fromJson(Map<String, dynamic> j) => EtimsConfig(
        kraPin: (j['kra_pin'] ?? '').toString(),
        bhfId: (j['bhf_id'] ?? '00').toString(),
        deviceSerial: j['device_serial'] as String?,
        sandboxMode: (j['sandbox_mode'] ?? true) as bool,
        isActive: (j['is_active'] ?? false) as bool,
      );
}

class EtimsSubmission {
  final int id;
  final int? orderId;
  final String? cuInvoiceNo;
  final String status;
  final String? errorMessage;
  final int attemptCount;
  final DateTime? nextRetryAt;
  final DateTime? submittedAt;
  final DateTime createdAt;

  EtimsSubmission({
    required this.id,
    this.orderId,
    this.cuInvoiceNo,
    required this.status,
    this.errorMessage,
    required this.attemptCount,
    this.nextRetryAt,
    this.submittedAt,
    required this.createdAt,
  });

  factory EtimsSubmission.fromJson(Map<String, dynamic> j) => EtimsSubmission(
        id: j['id'] as int,
        orderId: j['order_id'] as int?,
        cuInvoiceNo: j['cu_invoice_no'] as String?,
        status: (j['status'] ?? 'pending').toString(),
        errorMessage: j['error_message'] as String?,
        attemptCount: (j['attempt_count'] ?? 0) as int,
        nextRetryAt: j['next_retry_at'] != null
            ? DateTime.parse(j['next_retry_at'] as String)
            : null,
        submittedAt: j['submitted_at'] != null
            ? DateTime.parse(j['submitted_at'] as String)
            : null,
        createdAt: DateTime.parse(j['created_at'] as String),
      );
}

final etimsConfigProvider = FutureProvider.autoDispose<EtimsConfig?>((ref) async {
  try {
    final res = await ref.read(apiClientProvider).dio.get('/etims/config');
    if (res.data == null) return null;
    return EtimsConfig.fromJson(res.data as Map<String, dynamic>);
  } catch (_) {
    return null;
  }
});

Future<void> upsertEtimsConfig(WidgetRef ref, Map<String, dynamic> data) async {
  await ref.read(apiClientProvider).dio.put('/etims/config', data: data);
}

Future<Map<String, dynamic>> testEtimsConnection(WidgetRef ref) async {
  final res = await ref.read(apiClientProvider).dio.post('/etims/test-connection');
  return res.data as Map<String, dynamic>;
}

final etimsSubmissionsProvider =
    FutureProvider.autoDispose<List<EtimsSubmission>>((ref) async {
  final res = await ref.read(apiClientProvider).dio.get('/etims/submissions');
  return (res.data as List)
      .map((e) => EtimsSubmission.fromJson(e as Map<String, dynamic>))
      .toList();
});

Future<void> retrySubmission(WidgetRef ref, int id) async {
  await ref.read(apiClientProvider).dio.post('/etims/submissions/$id/retry');
}
