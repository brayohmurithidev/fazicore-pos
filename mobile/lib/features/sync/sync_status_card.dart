import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import 'connectivity.dart';
import 'sync_engine.dart';

class SyncStatusCard extends ConsumerWidget {
  const SyncStatusCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sync = ref.watch(syncControllerProvider);
    final online = ref.watch(isOnlineProvider);

    final lastSync = sync.productsLastSync;
    return Card(
      margin: const EdgeInsets.all(16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(online ? Icons.cloud_done_outlined : Icons.cloud_off_outlined,
                    size: 20, color: online ? Colors.grey.shade600 : AppColors.warning),
                const SizedBox(width: 8),
                Text(online ? 'Online' : 'Offline',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                const Spacer(),
                if (sync.isSyncing)
                  const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                else
                  TextButton.icon(
                    icon: const Icon(Icons.sync, size: 18),
                    label: const Text('Sync now'),
                    onPressed: online
                        ? () => ref.read(syncControllerProvider.notifier).syncNow()
                        : null,
                  ),
              ],
            ),
            const SizedBox(height: 8),
            _line('Pending sales', sync.pendingCount > 0 ? '${sync.pendingCount}' : 'None',
                highlight: sync.pendingCount > 0),
            _line('Last synced', lastSync != null ? dateTimeShort(lastSync) : 'Never'),
            if (sync.lastError != null) ...[
              const SizedBox(height: 8),
              Text(sync.lastError!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _line(String label, String value, {bool highlight = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(color: Colors.grey)),
            Text(value,
                style: TextStyle(
                  fontWeight: highlight ? FontWeight.w700 : FontWeight.w500,
                  color: highlight ? AppColors.warning : null,
                )),
          ],
        ),
      );
}
