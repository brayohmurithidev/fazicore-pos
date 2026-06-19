import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:fazipos_mobile/app.dart';

// Stock (Test Stock, PIN 4444). canManageInventory=true, canViewReports=true,
// but canManageProducts=false (auth_models.dart) — so stock gets the full
// 5-tab bottom-nav (not cashier-reduced), but Manage Store should hide
// Categories/Employees/Branches/Attendance specifically.
//
// flutter test integration_test/role_stock_test.dart \
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
    await tester.tap(find.text('Test Stock'));
    await tester.pumpAndSettle();
    for (final d in '4444'.split('')) {
      await tester.tap(find.text(d));
      await tester.pump();
    }
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle(const Duration(seconds: 2));
  }

  testWidgets('stock sees full bottom-nav (not cashier-reduced)', (tester) async {
    await login(tester);

    expect(find.byType(BottomAppBar), findsOneWidget);
    expect(find.text('Dashboard'), findsOneWidget);
    expect(find.text('Sales'), findsOneWidget);
    expect(find.text('Reports'), findsOneWidget);
    expect(find.text('More'), findsOneWidget);
  });

  testWidgets('stock Manage store shows inventory ops, hides product/people admin', (tester) async {
    await login(tester);

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manage store'));
    await tester.pumpAndSettle();

    // canManageInventory → Products + Inventory rows, but not Categories
    // (canManageProducts gates only the Categories row, not the section
    // header or the Products row itself).
    expect(find.text('Products'), findsNWidgets(2)); // section header + row title
    expect(find.text('Categories'), findsNothing);
    expect(find.text('Inventory'), findsOneWidget);

    expect(find.text('Receipt printer'), findsOneWidget);

    // People: Customers only, not Employees/Branches (canManageProducts).
    expect(find.text('Customers'), findsOneWidget);
    expect(find.text('Employees'), findsNothing);
    expect(find.text('Branches'), findsNothing);

    // Operations (canManageInventory). Stock Transfers' >1-branch gate is
    // covered with a controlled before/after in branches_test.dart.
    expect(find.text('Suppliers'), findsOneWidget);
    expect(find.text('Purchase Orders'), findsOneWidget);

    // Compliance & Programs (canViewReports), but not Attendance
    // (canManageProducts). Scroll defensively — fine even when it's already
    // in view.
    await tester.scrollUntilVisible(find.text('eTIMS'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('eTIMS'), findsOneWidget);
    expect(find.text('Loyalty Program'), findsOneWidget);
    expect(find.text('Attendance'), findsNothing);
  });
}
