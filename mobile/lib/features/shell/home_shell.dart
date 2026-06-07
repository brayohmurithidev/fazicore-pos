import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../dashboard/dashboard_screen.dart';
import '../reports/reports_screen.dart';
import '../sales/sales_screen.dart';
import '../sell/sell_screen.dart';
import '../sync/connectivity.dart';
import '../sync/sync_engine.dart';
import 'more_screen.dart';

/// Bottom-nav container for the companion's main tabs.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> with WidgetsBindingObserver {
  int _index = 0;

  static const _tabs = [
    SellScreen(),
    DashboardScreen(),
    SalesScreen(),
    ReportsScreen(),
    MoreScreen(),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Initial sync once we're logged in (the shell only mounts post-login).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(syncControllerProvider.notifier).syncNow();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Pull the latest catalog/customers (and flush any queued sales) each time
    // the app returns to the foreground, so edits made elsewhere show up.
    if (state == AppLifecycleState.resumed) {
      ref.read(syncControllerProvider.notifier).syncNow();
    }
  }

  @override
  Widget build(BuildContext context) {
    // Re-sync whenever the device regains connectivity.
    ref.listen(connectivityProvider, (prev, next) {
      final wasOffline = prev?.valueOrNull == false;
      final isOnline = next.valueOrNull == true;
      if (wasOffline && isOnline) {
        ref.read(syncControllerProvider.notifier).syncNow();
      }
    });

    final onSell = _index == 0;
    return Scaffold(
      body: IndexedStack(index: _index, children: _tabs),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      floatingActionButton: SizedBox(
        width: 64,
        height: 64,
        child: FloatingActionButton(
          onPressed: () => setState(() => _index = 0),
          backgroundColor: AppColors.brand,
          foregroundColor: Colors.white,
          elevation: onSell ? 6 : 3,
          shape: const CircleBorder(),
          child: const Icon(Icons.point_of_sale, size: 28),
        ),
      ),
      bottomNavigationBar: BottomAppBar(
        height: 64,
        color: Colors.white,
        surfaceTintColor: Colors.transparent,
        shape: const CircularNotchedRectangle(),
        notchMargin: 8,
        padding: EdgeInsets.zero,
        child: Row(
          children: [
            _NavItem(icon: Icons.dashboard_outlined, activeIcon: Icons.dashboard, label: 'Dashboard', index: 1, current: _index, onTap: _select),
            _NavItem(icon: Icons.receipt_long_outlined, activeIcon: Icons.receipt_long, label: 'Sales', index: 2, current: _index, onTap: _select),
            const SizedBox(width: 64), // notch gap for the Sell FAB
            _NavItem(icon: Icons.bar_chart_outlined, activeIcon: Icons.bar_chart, label: 'Reports', index: 3, current: _index, onTap: _select),
            _NavItem(icon: Icons.more_horiz, activeIcon: Icons.more_horiz, label: 'More', index: 4, current: _index, onTap: _select),
          ],
        ),
      ),
    );
  }

  void _select(int i) => setState(() => _index = i);
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final int index;
  final int current;
  final ValueChanged<int> onTap;
  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.index,
    required this.current,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final selected = current == index;
    final color = selected ? AppColors.brand : Colors.grey.shade500;
    return Expanded(
      child: InkWell(
        onTap: () => onTap(index),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(selected ? activeIcon : icon, color: color, size: 22),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }
}
