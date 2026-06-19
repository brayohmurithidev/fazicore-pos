import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:fazipos_mobile/app.dart';

// Admin. Exercises inventory_screen.dart against the real "Test Prod"
// product seeded during this session's web-app testing.
//
// flutter test integration_test/inventory_test.dart \
//   --dart-define=API_BASE_URL=http://localhost:8001 -d <device-id>
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const targetProduct = 'Test Prod';

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

  Future<void> openInventory(WidgetTester tester) async {
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manage store'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Inventory'));
    await tester.pumpAndSettle();
  }

  int qtyFor(WidgetTester tester, String productName) {
    final tile = find.ancestor(of: find.text(productName), matching: find.byType(ListTile)).first;
    final texts = tester.widgetList<Text>(find.descendant(of: tile, matching: find.byType(Text)));
    final raw = texts.map((t) => t.data ?? '').firstWhere((d) => RegExp(r'^\d+$').hasMatch(d));
    return int.parse(raw);
  }

  testWidgets('inventory list renders seeded products with a low-stock toggle', (tester) async {
    await login(tester);
    await openInventory(tester);

    expect(find.text(targetProduct), findsOneWidget);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    // Either the list narrows or shows the empty state — either way no crash.
    expect(find.byType(CircularProgressIndicator), findsNothing);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(find.text(targetProduct), findsOneWidget);
  });

  testWidgets('adjust dialog rejects zero/non-numeric delta, accepts a valid one', (tester) async {
    await login(tester);
    await openInventory(tester);

    final before = qtyFor(tester, targetProduct);

    await tester.tap(find.text(targetProduct));
    await tester.pumpAndSettle();
    expect(find.text('Quantity change'), findsOneWidget);

    // Zero is rejected.
    await tester.enterText(find.byType(TextField).first, '0');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    expect(find.text('Enter a non-zero quantity (use - to remove)'), findsOneWidget);
    expect(find.text('Quantity change'), findsOneWidget); // dialog still open

    // Non-numeric is rejected too.
    await tester.enterText(find.byType(TextField).first, 'abc');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    expect(find.text('Quantity change'), findsOneWidget);

    // A valid positive delta is accepted and persists.
    await tester.enterText(find.byType(TextField).first, '5');
    await tester.enterText(find.byType(TextField).last, 'QA restock');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle(const Duration(seconds: 1));

    expect(find.text('Quantity change'), findsNothing); // dialog closed
    final after = qtyFor(tester, targetProduct);
    expect(after, before + 5);
  });
}
