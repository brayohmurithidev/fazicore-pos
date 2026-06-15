import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import 'attendance_repository.dart';

class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  DateTime _date = DateTime.now();

  String get _dateKey => DateFormat('yyyy-MM-dd').format(_date);

  void _prev() => setState(() => _date = _date.subtract(const Duration(days: 1)));
  void _next() {
    final tomorrow = _date.add(const Duration(days: 1));
    if (tomorrow.isAfter(DateTime.now())) return;
    setState(() => _date = tomorrow);
  }

  String _formatDuration(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.remainder(60);
    if (h == 0) return '${m}m';
    return '${h}h ${m}m';
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(attendanceProvider(_dateKey));

    return Scaffold(
      appBar: AppBar(title: const Text('Attendance')),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(attendanceProvider(_dateKey).future),
        child: Column(
          children: [
            // Date navigator
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    onPressed: _prev,
                    icon: const Icon(Icons.chevron_left),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    DateFormat('EEEE, d MMM yyyy').format(_date),
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    onPressed: _date.add(const Duration(days: 1)).isAfter(DateTime.now())
                        ? null
                        : _next,
                    icon: const Icon(Icons.chevron_right),
                  ),
                ],
              ),
            ),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => ListView(
                  children: [
                    const SizedBox(height: 120),
                    Center(child: Text(apiError(e), textAlign: TextAlign.center)),
                    const SizedBox(height: 12),
                    Center(
                      child: FilledButton(
                        onPressed: () => ref.refresh(attendanceProvider(_dateKey)),
                        child: const Text('Retry'),
                      ),
                    ),
                  ],
                ),
                data: (records) {
                  final active = records.where((r) => r.isActive).toList();
                  final completed = records.where((r) => !r.isActive).toList();

                  final totalDuration = completed.fold<Duration>(
                    Duration.zero,
                    (sum, r) => sum + (r.duration ?? Duration.zero),
                  );
                  final avgDuration = completed.isEmpty
                      ? null
                      : Duration(
                          milliseconds: totalDuration.inMilliseconds ~/ completed.length);

                  return ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      // Summary row
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Row(
                            children: [
                              _StatCell(
                                label: 'Total shifts',
                                value: records.length.toString(),
                              ),
                              _StatCell(
                                label: 'Active now',
                                value: active.length.toString(),
                                highlight: active.isNotEmpty,
                              ),
                              _StatCell(
                                label: 'Avg duration',
                                value: avgDuration != null
                                    ? _formatDuration(avgDuration)
                                    : '—',
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      if (active.isNotEmpty) ...[
                        const Text('Active Shifts',
                            style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                                color: Colors.grey)),
                        const SizedBox(height: 8),
                        for (final r in active) _ShiftCard(record: r, isActive: true),
                        const SizedBox(height: 16),
                      ],

                      if (completed.isNotEmpty) ...[
                        const Text('Completed Shifts',
                            style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                                color: Colors.grey)),
                        const SizedBox(height: 8),
                        for (final r in completed)
                          _ShiftCard(record: r, isActive: false),
                      ],

                      if (records.isEmpty)
                        const Padding(
                          padding: EdgeInsets.only(top: 80),
                          child: Center(
                            child: Column(
                              children: [
                                Icon(Icons.schedule_outlined,
                                    size: 48, color: Colors.grey),
                                SizedBox(height: 8),
                                Text('No shifts recorded',
                                    style: TextStyle(color: Colors.grey)),
                              ],
                            ),
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatCell extends StatelessWidget {
  final String label;
  final String value;
  final bool highlight;
  const _StatCell({required this.label, required this.value, this.highlight = false});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: highlight ? Colors.green : null,
            ),
          ),
          Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
        ],
      ),
    );
  }
}

class _ShiftCard extends StatelessWidget {
  final AttendanceRecord record;
  final bool isActive;
  const _ShiftCard({required this.record, required this.isActive});

  String _formatTime(DateTime dt) => DateFormat('h:mm a').format(dt);

  String _formatDur(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.remainder(60);
    if (h == 0) return '${m}m';
    return '${h}h ${m}m';
  }

  @override
  Widget build(BuildContext context) {
    final duration = record.duration;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (isActive)
                  Container(
                    width: 8,
                    height: 8,
                    margin: const EdgeInsets.only(right: 8),
                    decoration: const BoxDecoration(
                      color: Colors.green,
                      shape: BoxShape.circle,
                    ),
                  ),
                Expanded(
                  child: Text(
                    record.userName ?? 'User #${record.userId}',
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                  ),
                ),
                if (isActive)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.green.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text('Active',
                        style: TextStyle(
                            color: Colors.green,
                            fontSize: 12,
                            fontWeight: FontWeight.w600)),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.login, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text(_formatTime(record.clockIn),
                    style: const TextStyle(fontSize: 13)),
                if (record.clockOut != null) ...[
                  const Text(' → ',
                      style: TextStyle(color: Colors.grey, fontSize: 13)),
                  const Icon(Icons.logout, size: 14, color: Colors.grey),
                  const SizedBox(width: 4),
                  Text(_formatTime(record.clockOut!),
                      style: const TextStyle(fontSize: 13)),
                ],
                if (duration != null) ...[
                  const Spacer(),
                  Text(_formatDur(duration),
                      style: const TextStyle(
                          color: Colors.grey, fontSize: 13)),
                ],
              ],
            ),
            if (record.openingFloat != null || record.closingCash != null) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  if (record.openingFloat != null)
                    Text('Float: ${kes(record.openingFloat!)}',
                        style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  if (record.openingFloat != null && record.closingCash != null)
                    const Text(' · ',
                        style: TextStyle(fontSize: 12, color: Colors.grey)),
                  if (record.closingCash != null)
                    Text('Close: ${kes(record.closingCash!)}',
                        style: const TextStyle(fontSize: 12, color: Colors.grey)),
                ],
              ),
            ],
            if (record.shiftNotes != null && record.shiftNotes!.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(record.shiftNotes!,
                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis),
            ],
          ],
        ),
      ),
    );
  }
}
