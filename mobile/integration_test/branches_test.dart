import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:fazipos_mobile/app.dart';

// Admin. Adds a 2nd branch to the org (irreversible via this test — bena
// will have 2 branches from here on for the rest of this QA pass), then
// confirms manage_store_screen.dart's `(branches?.length ?? 0) > 1` gate
// flips "Stock Transfers" from hidden to visible, exactly as relied on by
// the earlier role test files (which all ran while the org had 1 branch).
//
// flutter test integration_test/branches_test.dart \
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
    await tester.tap(find.text('Brian Murithi'));
    await tester.pumpAndSettle();
    for (final d in '1234'.split('')) {
      await tester.tap(find.text(d));
      await tester.pump();
    }
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle(const Duration(seconds: 2));
  }

  Future<void> openBranches(WidgetTester tester) async {
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manage store'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Branches'));
    await tester.pumpAndSettle();
  }

  testWidgets('branches list loads with Main Branch visible', (tester) async {
    await login(tester);
    await openBranches(tester);

    expect(find.text('Main Branch'), findsOneWidget);
  });

  testWidgets('add a branch — appears in list, flips Stock Transfers visibility', (tester) async {
    await login(tester);
    await openBranches(tester);

    // Idempotent against the real, persistent backend: only create the
    // branch the first time this suite ever runs against bena. A rerun
    // would otherwise hit the plan's branch limit (2) on the 2nd attempt
    // and the form would never open.
    if (find.text('Mobile QA Branch').evaluate().isEmpty) {
      await tester.tap(find.widgetWithText(FloatingActionButton, 'Add branch'));
      await tester.pumpAndSettle();

      final fields = find.byType(TextField);
      await tester.enterText(fields.at(0), 'Mobile QA Branch');
      await tester.enterText(fields.at(1), 'Mombasa');
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Add branch'));
      await tester.pumpAndSettle(const Duration(seconds: 2));
    }

    expect(find.text('Mobile QA Branch'), findsOneWidget);

    // Back out to Manage Store and confirm the >1-branch gate flipped.
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Stock Transfers'), findsOneWidget);
  });
}
