import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:fazipos_mobile/app.dart';

// Cashier (Test Cashier, PIN 2222) — the role that actually runs this flow
// day to day. Sells different variants of the seeded "Test Prod" (Sizes:
// S/M/L/XL/XXL) per payment method to avoid any single variant's stock
// running low across the file. "QA Test Customer" (254700111222) was
// created via the API beforehand since bena had zero customers and the
// credit tab requires picking an *existing* one (no inline create on
// mobile, unlike the web app's credit_customer_phone flow).
//
// flutter test integration_test/sell_checkout_receipt_test.dart \
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
    await tester.pumpAndSettle(const Duration(seconds: 3)); // let the post-login sync settle
  }

  /// Sells one unit of the given "Test Prod" size variant, landing on the
  /// checkout screen's Cash tab (tab 0, the default).
  Future<void> addVariantAndGoToCheckout(WidgetTester tester, String size) async {
    await tester.tap(find.text('Test Prod'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(size));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Add 1 to cart'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('1 item'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Charge'));
    await tester.pumpAndSettle();

    expect(find.text('Payment'), findsOneWidget); // on CheckoutScreen
  }

  testWidgets('cash checkout: under-total blocked, exact amount completes the sale', (tester) async {
    await login(tester);
    await addVariantAndGoToCheckout(tester, 'M');

    // Enter less than the total (1 → KES 1) and try to complete — blocked.
    await tester.tap(find.text('1'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Complete sale'));
    await tester.pumpAndSettle();
    expect(find.text('Cash received is less than the total'), findsOneWidget);

    // EXACT AMOUNT fills the full total and clears the blocker.
    await tester.tap(find.text('EXACT AMOUNT'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Complete sale'));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    expect(find.text('Sale complete'), findsOneWidget);
    expect(find.text('Cash'), findsOneWidget);
    expect(find.text('Share'), findsOneWidget); // present; not tapped (native share sheet)

    await tester.tap(find.text('New sale'));
    await tester.pumpAndSettle();
  });

  testWidgets('M-Pesa manual reference code completes the sale', (tester) async {
    await login(tester);
    await addVariantAndGoToCheckout(tester, 'S');

    await tester.tap(find.text('Non-cash'));
    await tester.pumpAndSettle();
    expect(find.text('M-Pesa'), findsWidgets); // method chip, already selected by default

    await tester.enterText(find.widgetWithText(TextField, 'M-Pesa reference code (from till/paybill SMS)'), 'QA12345');
    await tester.pump();
    await tester.tap(find.textContaining('Complete sale'));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    expect(find.text('Sale complete'), findsOneWidget);
    // Pure 'mpesa' method renders the M-Pesa logo image, not a text label.
    expect(find.byType(Image), findsOneWidget);

    await tester.tap(find.text('New sale'));
    await tester.pumpAndSettle();
  });

  testWidgets('credit checkout requires a customer, then completes', (tester) async {
    await login(tester);
    await addVariantAndGoToCheckout(tester, 'XL');

    await tester.tap(find.text('Non-cash'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Credit'));
    await tester.pumpAndSettle();

    // Blocked without a customer.
    await tester.tap(find.textContaining('Complete sale'));
    await tester.pumpAndSettle();
    expect(find.text('Select a customer for credit sales'), findsOneWidget);

    await tester.tap(find.text('Select customer'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('QA Test Customer').last);
    await tester.pumpAndSettle();

    await tester.tap(find.textContaining('Complete sale'));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    expect(find.text('Sale complete'), findsOneWidget);
    expect(find.text('Credit'), findsOneWidget);

    await tester.tap(find.text('New sale'));
    await tester.pumpAndSettle();
  });
}
