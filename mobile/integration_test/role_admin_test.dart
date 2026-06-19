import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:fazipos_mobile/app.dart';

// Admin (Brian, PIN 1234) — full access.
//
// flutter test integration_test/role_admin_test.dart \
//   --dart-define=API_BASE_URL=http://localhost:8001 -d <device-id>
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<void> login(WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: FaziPosApp()));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    // iOS Simulator's Keychain can outlive `xcrun simctl uninstall`, and a
    // prior test case in this same file may already be logged in — force a
    // clean slate so this always ends up authenticated as the *intended*
    // user, not whoever's session happened to survive.
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
    await tester.tap(find.text('Brian Murithi'));
    await tester.pumpAndSettle();
    for (final d in '1234'.split('')) {
      await tester.tap(find.text(d));
      await tester.pump();
    }
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle(const Duration(seconds: 2));
  }

  testWidgets('admin sees full bottom-nav (Dashboard + Sales + Reports + More)', (tester) async {
    await login(tester);

    expect(find.byType(BottomAppBar), findsOneWidget);
    expect(find.text('Dashboard'), findsOneWidget);
    expect(find.text('Sales'), findsOneWidget);
    expect(find.text('Reports'), findsOneWidget);
    expect(find.text('More'), findsOneWidget);
  });

  testWidgets('admin Manage store shows every section and row', (tester) async {
    await login(tester);

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manage store'));
    await tester.pumpAndSettle();

    // Products section (canManageInventory + canManageProducts)
    expect(find.text('Products'), findsNWidgets(2)); // section header + row title
    expect(find.text('Categories'), findsOneWidget);
    expect(find.text('Inventory'), findsOneWidget);

    // Printer & receipt (always)
    expect(find.text('Receipt printer'), findsOneWidget);

    // People (canManageProducts → Employees + Branches too)
    expect(find.text('Customers'), findsOneWidget);
    expect(find.text('Employees'), findsOneWidget);
    expect(find.text('Branches'), findsOneWidget);

    // Operations (canManageInventory). Stock Transfers' >1-branch gate is
    // covered with a controlled before/after in branches_test.dart — not
    // asserted here since branch count is real, persistent backend state
    // that other test files intentionally mutate.
    expect(find.text('Suppliers'), findsOneWidget);
    expect(find.text('Purchase Orders'), findsOneWidget);

    // Compliance & Programs (canViewReports, + canManageProducts for
    // Attendance) — below the fold once Stock Transfers/extra rows push the
    // list past the viewport's mount range, so scroll first.
    await tester.scrollUntilVisible(find.text('eTIMS'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('eTIMS'), findsOneWidget);
    expect(find.text('Loyalty Program'), findsOneWidget);
    expect(find.text('Attendance'), findsOneWidget);
  });

  testWidgets('cold start with a stale-but-valid token recovers the admin profile', (tester) async {
    // Re-pump without logging out first: simulates relaunching with a token
    // still in secure storage but nothing in the freshly-rebuilt Drift cache
    // — exactly the gap fixed in auth_controller.dart's _init() (fetches
    // GET /users/me when the local cache is empty instead of running with a
    // null user and every permission silently defaulting to false).
    await login(tester);
    await tester.pumpWidget(const ProviderScope(child: FaziPosApp()));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    expect(find.byType(BottomAppBar), findsOneWidget);
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manage store'));
    await tester.pumpAndSettle();

    // Must show the full admin menu, not the empty-user fallback.
    expect(find.text('Products'), findsNWidgets(2)); // section header + row title
    expect(find.text('Employees'), findsOneWidget);
  });
}
