import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:fazipos_mobile/app.dart';

// Manager (Test Manager, PIN 3333). Per auth_models.dart, `isAdmin` is never
// referenced anywhere outside that file — manager satisfies
// canManageInventory/canManageProducts/canViewReports identically to admin,
// so the Manage Store menu is expected to be byte-for-byte the same set of
// rows as role_admin_test.dart. This test exists to make that parity an
// explicit, checked fact rather than an assumption.
//
// flutter test integration_test/role_manager_test.dart \
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
    await tester.tap(find.text('Test Manager'));
    await tester.pumpAndSettle();
    for (final d in '3333'.split('')) {
      await tester.tap(find.text(d));
      await tester.pump();
    }
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle(const Duration(seconds: 2));
  }

  testWidgets('manager sees full bottom-nav (Dashboard + Sales + Reports + More)', (tester) async {
    await login(tester);

    expect(find.byType(BottomAppBar), findsOneWidget);
    expect(find.text('Dashboard'), findsOneWidget);
    expect(find.text('Sales'), findsOneWidget);
    expect(find.text('Reports'), findsOneWidget);
    expect(find.text('More'), findsOneWidget);
  });

  testWidgets('manager Manage store shows every section and row (parity with admin)', (tester) async {
    await login(tester);

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manage store'));
    await tester.pumpAndSettle();

    expect(find.text('Products'), findsNWidgets(2)); // section header + row title
    expect(find.text('Categories'), findsOneWidget);
    expect(find.text('Inventory'), findsOneWidget);
    expect(find.text('Receipt printer'), findsOneWidget);
    expect(find.text('Customers'), findsOneWidget);
    expect(find.text('Employees'), findsOneWidget);
    expect(find.text('Branches'), findsOneWidget);
    expect(find.text('Suppliers'), findsOneWidget);
    expect(find.text('Purchase Orders'), findsOneWidget);
    // Stock Transfers' >1-branch gate is covered with a controlled
    // before/after in branches_test.dart. Below-the-fold rows need a scroll
    // once Stock Transfers pushes the list past the viewport's mount range.
    await tester.scrollUntilVisible(find.text('eTIMS'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('eTIMS'), findsOneWidget);
    expect(find.text('Loyalty Program'), findsOneWidget);
    expect(find.text('Attendance'), findsOneWidget);
  });
}
