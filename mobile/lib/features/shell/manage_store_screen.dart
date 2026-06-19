import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_controller.dart';
import '../manage/manage_repository.dart';
import '../sell/catalog_providers.dart';

class ManageStoreScreen extends ConsumerWidget {
  const ManageStoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final canManageInventory = user?.canManageInventory ?? false;
    final canManageProducts = user?.canManageProducts ?? false;
    final canViewReports = user?.canViewReports ?? false;
    final isAdmin = user?.isAdmin ?? false;

    final products = ref.watch(cachedProductsProvider).valueOrNull;
    final categories = ref.watch(cachedCategoriesProvider).valueOrNull;
    final customers = ref.watch(cachedCustomersProvider).valueOrNull;
    final users = ref.watch(orgUsersProvider).valueOrNull;
    final branches = ref.watch(branchesProvider).valueOrNull;

    return Scaffold(
      appBar: AppBar(title: const Text('Manage store')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (canManageInventory) ...[
            _section('Products'),
            _group([
              _Row(
                icon: Icons.inventory_2_outlined,
                title: 'Products',
                trailing: products == null ? null : '${products.length} items',
                onTap: () => context.push('/products'),
              ),
              if (canManageProducts)
                _Row(
                  icon: Icons.category_outlined,
                  title: 'Categories',
                  trailing: categories == null ? null : '${categories.length}',
                  onTap: () => context.push('/categories'),
                ),
              _Row(
                icon: Icons.warehouse_outlined,
                title: 'Inventory',
                onTap: () => context.push('/inventory'),
              ),
            ]),
            const SizedBox(height: 20),
          ],
          _section('Printer & receipt'),
          _group([
            _Row(
              icon: Icons.print_outlined,
              title: 'Receipt printer',
              onTap: () => context.push('/printer'),
            ),
          ]),
          const SizedBox(height: 20),
          if (isAdmin) ...[
            _section('Payments'),
            _group([
              _Row(
                icon: Icons.phone_iphone_outlined,
                title: 'M-Pesa Daraja API',
                onTap: () => context.push('/mpesa-settings'),
              ),
            ]),
            const SizedBox(height: 20),
          ],
          _section('People'),
          _group([
            _Row(
              icon: Icons.people_outline,
              title: 'Customers',
              trailing: customers == null ? null : '${customers.length}',
              onTap: () => context.push('/customers'),
            ),
            if (canManageProducts) ...[
              _Row(
                icon: Icons.badge_outlined,
                title: 'Employees',
                trailing: users == null ? null : '${users.length}',
                onTap: () => context.push('/users'),
              ),
              _Row(
                icon: Icons.store_outlined,
                title: 'Branches',
                trailing: branches == null ? null : '${branches.length}',
                onTap: () => context.push('/branches'),
              ),
            ],
          ]),
          if (canManageInventory) ...[
            const SizedBox(height: 20),
            _section('Operations'),
            _group([
              _Row(
                icon: Icons.local_shipping_outlined,
                title: 'Suppliers',
                onTap: () => context.push('/suppliers'),
              ),
              _Row(
                icon: Icons.receipt_long_outlined,
                title: 'Purchase Orders',
                onTap: () => context.push('/purchase-orders'),
              ),
              if ((branches?.length ?? 0) > 1)
                _Row(
                  icon: Icons.swap_horiz,
                  title: 'Stock Transfers',
                  onTap: () => context.push('/stock-transfers'),
                ),
            ]),
          ],
          if (canViewReports) ...[
            const SizedBox(height: 20),
            _section('Compliance & Programs'),
            _group([
              _Row(
                icon: Icons.receipt_outlined,
                title: 'eTIMS',
                onTap: () => context.push('/etims'),
              ),
              _Row(
                icon: Icons.card_giftcard_outlined,
                title: 'Loyalty Program',
                onTap: () => context.push('/loyalty'),
              ),
              if (canManageProducts)
                _Row(
                  icon: Icons.schedule_outlined,
                  title: 'Attendance',
                  onTap: () => context.push('/attendance'),
                ),
            ]),
          ],
        ],
      ),
    );
  }

  Widget _section(String t) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 8),
        child: Text(t, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Colors.grey)),
      );

  Widget _group(List<Widget> rows) => Card(
        child: Column(
          children: [
            for (var i = 0; i < rows.length; i++) ...[
              rows[i],
              if (i != rows.length - 1) const Divider(height: 1, indent: 56),
            ],
          ],
        ),
      );
}

class _Row extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? trailing;
  final VoidCallback onTap;
  const _Row({required this.icon, required this.title, this.trailing, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon),
      title: Text(title),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (trailing != null)
            Text(trailing!, style: const TextStyle(color: Colors.grey)),
          const SizedBox(width: 4),
          const Icon(Icons.chevron_right, color: Colors.grey),
        ],
      ),
      onTap: onTap,
    );
  }
}
