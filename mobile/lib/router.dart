import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'features/attendance/attendance_screen.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/customers/customer_detail_screen.dart';
import 'features/customers/customers_screen.dart';
import 'features/etims/etims_screen.dart';
import 'features/inventory/inventory_screen.dart';
import 'features/loyalty/loyalty_screen.dart';
import 'features/manage/branches_screen.dart';
import 'features/manage/business_info_screen.dart';
import 'features/manage/categories_screen.dart';
import 'features/manage/mpesa_settings_screen.dart';
import 'features/manage/subscription_screen.dart';
import 'features/manage/users_screen.dart';
import 'features/printing/printer_settings_screen.dart';
import 'features/products/products_screen.dart';
import 'features/purchase_orders/purchase_order_create_screen.dart';
import 'features/purchase_orders/purchase_order_detail_screen.dart';
import 'features/purchase_orders/purchase_orders_screen.dart';
import 'features/sales/sale_detail_screen.dart';
import 'features/shell/account_settings_screen.dart';
import 'features/shell/help_screen.dart';
import 'features/shell/home_shell.dart';
import 'features/shell/manage_store_screen.dart';
import 'features/stock_transfers/stock_transfer_detail_screen.dart';
import 'features/stock_transfers/stock_transfers_screen.dart';
import 'features/suppliers/suppliers_screen.dart';

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
      GoRoute(path: '/manage', builder: (_, __) => const ManageStoreScreen()),
      GoRoute(path: '/account-settings', builder: (_, __) => const AccountSettingsScreen()),
      GoRoute(path: '/help', builder: (_, __) => const HelpScreen()),
      GoRoute(path: '/products', builder: (_, __) => const ProductsScreen()),
      GoRoute(path: '/categories', builder: (_, __) => const CategoriesScreen()),
      GoRoute(path: '/users', builder: (_, __) => const UsersScreen()),
      GoRoute(path: '/branches', builder: (_, __) => const BranchesScreen()),
      GoRoute(path: '/business', builder: (_, __) => const BusinessInfoScreen()),
      GoRoute(path: '/subscription', builder: (_, __) => const SubscriptionScreen()),
      GoRoute(path: '/inventory', builder: (_, __) => const InventoryScreen()),
      GoRoute(path: '/printer', builder: (_, __) => const PrinterSettingsScreen()),
      GoRoute(path: '/mpesa-settings', builder: (_, __) => const MpesaSettingsScreen()),
      GoRoute(path: '/customers', builder: (_, __) => const CustomersScreen()),
      GoRoute(
        path: '/customers/:id',
        builder: (_, state) =>
            CustomerDetailScreen(customerId: int.parse(state.pathParameters['id']!)),
      ),
      GoRoute(path: '/suppliers', builder: (_, __) => const SuppliersScreen()),
      GoRoute(path: '/purchase-orders', builder: (_, __) => const PurchaseOrdersScreen()),
      GoRoute(path: '/purchase-orders/create', builder: (_, __) => const PurchaseOrderCreateScreen()),
      GoRoute(
        path: '/purchase-orders/:id',
        builder: (_, state) =>
            PurchaseOrderDetailScreen(orderId: int.parse(state.pathParameters['id']!)),
      ),
      GoRoute(path: '/stock-transfers', builder: (_, __) => const StockTransfersScreen()),
      GoRoute(
        path: '/stock-transfers/:id',
        builder: (_, state) =>
            StockTransferDetailScreen(transferId: int.parse(state.pathParameters['id']!)),
      ),
      GoRoute(path: '/etims', builder: (_, __) => const EtimsScreen()),
      GoRoute(path: '/loyalty', builder: (_, __) => const LoyaltyScreen()),
      GoRoute(path: '/attendance', builder: (_, __) => const AttendanceScreen()),
    ],
  );
});

/// Bridges Riverpod auth state changes to go_router refreshes.
class _AuthListenable extends ChangeNotifier {
  _AuthListenable(Ref ref) {
    ref.listen(authControllerProvider, (_, __) => notifyListeners());
  }
}
