import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/env.dart';
import '../auth/auth_controller.dart';
import '../printing/printer_service.dart';
import '../sync/sync_status_card.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final biz = ref.watch(printerProvider); // business name/phone/email (cached from /org/info)
    final user = ref.watch(authControllerProvider).user;
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Account'),
        automaticallyImplyLeading: false, // top-level tab — no back button
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                children: [
                  // Profile header — user account + business name.
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 32,
                        backgroundColor: scheme.primary.withValues(alpha: 0.15),
                        child: Text(
                          (user?.name.isNotEmpty == true)
                              ? user!.name[0].toUpperCase()
                              : (biz.shopName.isNotEmpty ? biz.shopName[0].toUpperCase() : '?'),
                          style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: scheme.primary),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (user != null) ...[
                              Text(user.name,
                                  maxLines: 1, overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                              Text(
                                '${user.role[0].toUpperCase()}${user.role.substring(1)}${user.branchName != null ? '  ·  ${user.branchName}' : ''}',
                                style: const TextStyle(color: Colors.grey, fontSize: 13),
                              ),
                              if (biz.shopName.isNotEmpty && biz.shopName != 'FaziPOS')
                                Text(biz.shopName,
                                    maxLines: 1, overflow: TextOverflow.ellipsis,
                                    style: TextStyle(color: scheme.primary, fontWeight: FontWeight.w600, fontSize: 13)),
                            ] else ...[
                              Text(biz.shopName,
                                  maxLines: 1, overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                              if (biz.phone.isNotEmpty)
                                Text(biz.phone, style: const TextStyle(color: Colors.grey)),
                              if (biz.email.isNotEmpty)
                                Text(biz.email, maxLines: 1, overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(color: Colors.grey)),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const SyncStatusCard(),
                  const SizedBox(height: 8),
                  Card(
                    child: Column(
                      children: [
                        _tile(context, Icons.person_outline, 'Account settings', '/account-settings'),
                        _div(),
                        _tile(context, Icons.storefront_outlined, 'Manage store', '/manage'),
                        _div(),
                        _tile(context, Icons.business_outlined, 'Business information', '/business'),
                        _div(),
                        _tile(context, Icons.workspace_premium_outlined, 'Subscription', '/subscription'),
                        _div(),
                        _tile(context, Icons.help_outline, 'Help & support', '/help'),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            // Pinned to the bottom.
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('FaziPOS  v${Env.appVersion}${user?.name != null ? '  ·  ${user!.name}' : ''}',
                      style: const TextStyle(color: Colors.grey, fontSize: 12)),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: scheme.error,
                        backgroundColor: scheme.error.withValues(alpha: 0.04),
                        side: BorderSide(color: scheme.error),
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        // Explicit textStyle prevents lerp crash when auth-state
                        // change triggers a screen transition while the button is
                        // animating between inherited and non-inherited TextStyles.
                        textStyle: Theme.of(context).textTheme.labelLarge,
                      ),
                      icon: const Icon(Icons.logout),
                      label: const Text('Log out'),
                      onPressed: () => ref.read(authControllerProvider.notifier).logout(),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tile(BuildContext context, IconData icon, String title, String route) => ListTile(
        leading: Icon(icon),
        title: Text(title),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push(route),
      );

  Widget _div() => const Divider(height: 1, indent: 56);
}
