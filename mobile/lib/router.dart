import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/customers/customer_detail_screen.dart';
import 'features/customers/customers_screen.dart';
import 'features/inventory/inventory_screen.dart';
import 'features/printing/printer_settings_screen.dart';
import 'features/products/products_screen.dart';
import 'features/sales/sale_detail_screen.dart';
import 'features/shell/home_shell.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      if (auth.status == AuthStatus.unknown) return null; // splash handled by builder
      final loggedIn = auth.status == AuthStatus.loggedIn;
      final atLogin = state.matchedLocation == '/login';
      if (!loggedIn) return atLogin ? null : '/login';
      if (loggedIn && atLogin) return '/';
      return null;
    },
    refreshListenable: _AuthListenable(ref),
    routes: [
      GoRoute(path: '/', builder: (_, __) => const HomeShell()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(
        path: '/sales/:id',
        builder: (_, state) =>
            SaleDetailScreen(orderId: int.parse(state.pathParameters['id']!)),
      ),
      GoRoute(path: '/products', builder: (_, __) => const ProductsScreen()),
      GoRoute(path: '/inventory', builder: (_, __) => const InventoryScreen()),
      GoRoute(path: '/printer', builder: (_, __) => const PrinterSettingsScreen()),
      GoRoute(path: '/customers', builder: (_, __) => const CustomersScreen()),
      GoRoute(
        path: '/customers/:id',
        builder: (_, state) =>
            CustomerDetailScreen(customerId: int.parse(state.pathParameters['id']!)),
      ),
    ],
  );
});

/// Bridges Riverpod auth state changes to go_router refreshes.
class _AuthListenable extends ChangeNotifier {
  _AuthListenable(Ref ref) {
    ref.listen(authControllerProvider, (_, __) => notifyListeners());
  }
}
