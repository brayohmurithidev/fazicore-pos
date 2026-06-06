import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_controller.dart';
import '../sync/sync_status_card.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        children: [
          const SyncStatusCard(),
          ListTile(
            leading: const Icon(Icons.warehouse_outlined),
            title: const Text('Inventory'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/inventory'),
          ),
          ListTile(
            leading: const Icon(Icons.people_outline),
            title: const Text('Customers'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/customers'),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout, color: Color(0xFFdc2626)),
            title: const Text('Sign out', style: TextStyle(color: Color(0xFFdc2626))),
            onTap: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
    );
  }
}
