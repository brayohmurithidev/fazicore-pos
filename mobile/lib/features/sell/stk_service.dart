import '../../core/api_client.dart';

class StkResult {
  final bool success;
  final String? receipt; // M-Pesa receipt number
  final String message;
  const StkResult(this.success, this.receipt, this.message);
}

/// Normalise a Kenyan phone number to 254XXXXXXXXX format.
/// Accepts: 0712345678 | 712345678 | +254712345678 | 254712345678
String normalizeKEPhone(String raw) {
  var p = raw.replaceAll(RegExp(r'[\s\-\+]'), '');
  if (p.startsWith('0') && p.length == 10) return '254${p.substring(1)}';
  if ((p.startsWith('7') || p.startsWith('1')) && p.length == 9) return '254$p';
  return p; // already 254... or unknown — let the backend validate
}

/// Initiate an STK push and poll until the customer pays, fails, or it times
/// out (~60s). Online-only — throws/returns failure if the API is unreachable.
Future<StkResult> pushStkAndWait(
  ApiClient api, {
  required String phone,
  required int amount,
  required String orderRef,
}) async {
  final res = await api.dio.post('/mpesa/stk-push', data: {
    'phone': normalizeKEPhone(phone),
    'amount': amount,
    'order_ref': orderRef,
  });
  final checkoutId = res.data['checkout_request_id'] as String;

  for (var i = 0; i < 20; i++) {
    await Future.delayed(const Duration(seconds: 3));
    final st = await api.dio.get('/mpesa/stk-status/$checkoutId');
    final status = (st.data['status'] ?? '').toString().toLowerCase();
    if (status == 'completed') {
      return StkResult(true, st.data['mpesa_receipt_number'] as String?, 'Payment received');
    }
    if (status == 'failed' || status == 'cancelled' || status == 'timeout') {
      return StkResult(false, null, (st.data['result_desc'] ?? 'Payment $status').toString());
    }
    // pending → keep polling
  }
  return const StkResult(false, null, 'Timed out waiting for payment');
}
