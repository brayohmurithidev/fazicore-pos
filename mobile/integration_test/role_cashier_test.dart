import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:integration_test/integration_test.dart';

import 'package:fazipos_mobile/app.dart';

// Cashier (Test Cashier, PIN 2222) — most restricted role. canManageInventory
// /canManageProducts/canViewReports are all false (auth_models.dart), so
// home_shell.dart's reduced 3-tab nav applies and manage_store_screen.dart
// should render only "Printer & receipt" + "Customers".
//
// flutter test integration_test/role_cashier_test.dart \
//   --dart-define=API_BASE_URL=http://localhost:8001 -d <device-id>
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<void> login(WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: FaziPosApp()));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    if (find.byType(BottomAppBar).evaluate().isNotEmpty) {
      // Bounded pumps, not pumpAndSettle: a background sync retry can keep
      // scheduling frames indefinitely after enough accumulated backend
      // state, which would make pumpAndSettle() hang forever here.
      await tester.tap(find.text('More'));
      await tester.pump(const Duration(seconds: 1));
      await tester.tap(find.text('Log out'));
      await tester.pump(const Duration(seconds: 1));
      await tester.pump(const Duration(seconds: 1));
    }

    await tester.enterText(find.byType(TextField), 'bena');
    await tester.pump();
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Test Cashier'));
    await tester.pumpAndSettle();
    for (final d in '2222'.split('')) {
      await tester.tap(find.text(d));
      await tester.pump();
    }
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle(const Duration(seconds: 2));
  }

  testWidgets('cashier sees reduced bottom-nav (Sales + More only, no Dashboard/Reports)', (tester) async {
    await login(tester);

    expect(find.byType(BottomAppBar), findsOneWidget);
    expect(find.text('Sales'), findsOneWidget);
    expect(find.text('More'), findsOneWidget);
    expect(find.text('Dashboard'), findsNothing);
    expect(find.text('Reports'), findsNothing);
  });

  testWidgets('cashier Manage store shows only Printer & receipt and Customers', (tester) async {
    await login(tester);

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manage store'));
    await tester.pumpAndSettle();

    expect(find.text('Receipt printer'), findsOneWidget);
    expect(find.text('Customers'), findsOneWidget);

    // Everything gated behind canManageInventory/canManageProducts/canViewReports.
    expect(find.text('Products'), findsNothing);
    expect(find.text('Categories'), findsNothing);
    expect(find.text('Inventory'), findsNothing);
    expect(find.text('Employees'), findsNothing);
    expect(find.text('Branches'), findsNothing);
    expect(find.text('Suppliers'), findsNothing);
    expect(find.text('Purchase Orders'), findsNothing);
    expect(find.text('Stock Transfers'), findsNothing);
    expect(find.text('eTIMS'), findsNothing);
    expect(find.text('Loyalty Program'), findsNothing);
    expect(find.text('Attendance'), findsNothing);
  });

  testWidgets('GAP: cashier reaching /users directly (no UI link) still sees real employee data', (tester) async {
    // router.dart's redirect only checks authentication, never role — the
    // restriction above is UI-only (no "Employees" row rendered). Simulate
    // a deep link / future stray button by pushing the route directly, the
    // same way ManageStoreScreen's row would: context.push('/users').
    await login(tester);

    final context = tester.element(find.byType(BottomAppBar));
    GoRouter.of(context).push('/users');
    await tester.pumpAndSettle(const Duration(seconds: 2));

    // GET /users/ on the backend (app/api/v1/users.py) only requires
    // get_current_active_user, not an admin/manager role — so this is not
    // just a client-side gap, the data is genuinely served to a cashier.
    expect(find.text('Test Manager'), findsOneWidget);
  });
}
