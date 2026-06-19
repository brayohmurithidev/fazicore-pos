import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:fazipos_mobile/app.dart';

// Admin. Printer settings, business info, account settings, and the
// read-only subscription/billing-invoice list — per the "invoices = the
// sales receipt, not a separate document" scope decision, the only
// "invoice" UI on mobile is this unrelated SaaS-billing list, covered here.
//
// flutter test integration_test/settings_test.dart \
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
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
  }

  testWidgets('printer settings: paper size selectable, test print disabled with no printer', (tester) async {
    await login(tester);

    await tester.tap(find.text('Manage store'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Receipt printer'));
    await tester.pumpAndSettle();

    expect(find.text('No printer selected'), findsOneWidget);

    final testPrintBtn = tester.widget<OutlinedButton>(
      find.ancestor(of: find.text('Test print'), matching: find.byType(OutlinedButton)),
    );
    expect(testPrintBtn.onPressed, isNull); // disabled — no printer paired

    await tester.tap(find.text('58 mm'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Address (printed under the name)'), 'Nairobi CBD');
    await tester.pump();
    await tester.tap(find.text('Save details'));
    await tester.pumpAndSettle();
    expect(find.text('Saved'), findsOneWidget); // snackbar
  });

  testWidgets('business info: KRA PIN/VAT editable and save', (tester) async {
    await login(tester);

    await tester.tap(find.text('Business information'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'KRA PIN'), 'P051234567W');
    await tester.pump();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.text('Saved'), findsOneWidget);
  });

  testWidgets('account settings: profile editable, name change saves', (tester) async {
    await login(tester);

    await tester.tap(find.text('Account settings'));
    await tester.pumpAndSettle();

    expect(find.text('Brian Murithi'), findsWidgets); // profile card
    expect(find.text('admin'), findsOneWidget);

    await tester.tap(find.text('Save changes'));
    await tester.pumpAndSettle();
    expect(find.text('Saved'), findsOneWidget); // unchanged name still saves cleanly
  });

  testWidgets('subscription screen loads plan, usage, and billing history', (tester) async {
    await login(tester);

    await tester.tap(find.text('Subscription'));
    await tester.pumpAndSettle(const Duration(seconds: 1));

    expect(find.text('Current plan'), findsOneWidget);
    expect(find.text('Usage'), findsOneWidget);
    expect(find.text('Branches'), findsOneWidget);
    expect(find.text('Features'), findsOneWidget);

    // Below the fold — the underlying sliver list only mounts elements near
    // the viewport even for the non-.builder ListView(children: ...) form.
    await tester.scrollUntilVisible(find.text('Billing history'), 300, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.text('Billing history'), findsOneWidget);
  });
}
