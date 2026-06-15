import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class AttendanceRecord {
  final int id;
  final int userId;
  final int? branchId;
  final DateTime clockIn;
  final DateTime? clockOut;
  final String date;
  final String? userName;
  final num? openingFloat;
  final num? closingCash;
  final String? shiftNotes;

  AttendanceRecord({
    required this.id,
    required this.userId,
    this.branchId,
    required this.clockIn,
    this.clockOut,
    required this.date,
    this.userName,
    this.openingFloat,
    this.closingCash,
    this.shiftNotes,
  });

  bool get isActive => clockOut == null;

  Duration? get duration {
    if (clockOut == null) return null;
    return clockOut!.difference(clockIn);
  }

  factory AttendanceRecord.fromJson(Map<String, dynamic> j) => AttendanceRecord(
        id: j['id'] as int,
        userId: j['user_id'] as int,
        branchId: j['branch_id'] as int?,
        clockIn: DateTime.parse(j['clock_in'] as String),
        clockOut:
            j['clock_out'] != null ? DateTime.parse(j['clock_out'] as String) : null,
        date: (j['date'] ?? '').toString(),
        userName: j['user_name'] as String?,
        openingFloat: j['opening_float'] as num?,
        closingCash: j['closing_cash'] as num?,
        shiftNotes: j['shift_notes'] as String?,
      );
}

final attendanceProvider =
    FutureProvider.autoDispose.family<List<AttendanceRecord>, String>((ref, date) async {
  final res = await ref
      .read(apiClientProvider)
      .dio
      .get('/attendance/', queryParameters: {'for_date': date});
  return (res.data as List)
      .map((e) => AttendanceRecord.fromJson(e as Map<String, dynamic>))
      .toList();
});
