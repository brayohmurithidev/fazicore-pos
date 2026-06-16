import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../auth/auth_controller.dart';
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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
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
    if (state == AppLifecycleState.resumed) {
      ref.read(syncControllerProvider.notifier).syncNow();
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(connectivityProvider, (prev, next) {
      final wasOffline = prev?.valueOrNull == false;
      final isOnline = next.valueOrNull == true;
      if (wasOffline && isOnline) ref.read(syncControllerProvider.notifier).syncNow();
    });

    final user = ref.watch(authControllerProvider).user;
    final isCashier = user?.isCashier ?? false;

    // Cashiers only need: Sell (FAB) · Sales · More
    // Everyone else: Sell (FAB) · Dashboard · Sales · Reports · More
    final tabs = isCashier
        ? const [SellScreen(), SalesScreen(), MoreScreen()]
        : const [SellScreen(), DashboardScreen(), SalesScreen(), ReportsScreen(), MoreScreen()];

    // Clamp index in case the tab count shrank on role change
    final safeIndex = _index.clamp(0, tabs.length - 1);
    if (safeIndex != _index) WidgetsBinding.instance.addPostFrameCallback((_) => setState(() => _index = safeIndex));

    final onSell = safeIndex == 0;

    return Scaffold(
      body: IndexedStack(index: safeIndex, children: tabs),
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
          children: isCashier
              ? [
                  _NavItem(icon: Icons.receipt_long_outlined, activeIcon: Icons.receipt_long, label: 'Sales',   index: 1, current: safeIndex, onTap: _select),
                  const SizedBox(width: 64),
                  _NavItem(icon: Icons.more_horiz,            activeIcon: Icons.more_horiz,   label: 'More',    index: 2, current: safeIndex, onTap: _select),
                ]
              : [
                  _NavItem(icon: Icons.dashboard_outlined,    activeIcon: Icons.dashboard,     label: 'Dashboard', index: 1, current: safeIndex, onTap: _select),
                  _NavItem(icon: Icons.receipt_long_outlined, activeIcon: Icons.receipt_long,  label: 'Sales',     index: 2, current: safeIndex, onTap: _select),
                  const SizedBox(width: 64),
                  _NavItem(icon: Icons.bar_chart_outlined,    activeIcon: Icons.bar_chart,     label: 'Reports',   index: 3, current: safeIndex, onTap: _select),
                  _NavItem(icon: Icons.more_horiz,            activeIcon: Icons.more_horiz,    label: 'More',      index: 4, current: safeIndex, onTap: _select),
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
