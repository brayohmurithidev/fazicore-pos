import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Emits true when the device has any network interface, false when fully offline.
final connectivityProvider = StreamProvider<bool>((ref) {
  final conn = Connectivity();
  return conn.onConnectivityChanged.map(_isOnline);
});

/// Synchronous best-effort online flag (defaults to true until the stream emits).
final isOnlineProvider = Provider<bool>((ref) {
  return ref.watch(connectivityProvider).maybeWhen(
        data: (online) => online,
        orElse: () => true,
      );
});

bool _isOnline(List<ConnectivityResult> results) =>
    results.any((r) => r != ConnectivityResult.none);
