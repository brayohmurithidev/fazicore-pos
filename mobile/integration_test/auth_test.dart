import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:fazipos_mobile/app.dart';

// Runs against the real local backend (bena org, seeded this session):
// flutter test integration_test/auth_test.dart \
//   --dart-define=API_BASE_URL=http://localhost:8001 -d <device-id>
//
// Test cases run in file order and share on-device persisted state
// (secure storage + Drift) on purpose, to also exercise cold-start /
// logout behavior across what would otherwise be separate app launches.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const slug = 'bena';

  Future<void> tapDigits(WidgetTester tester, String digits) async {
    for (final d in digits.split('')) {
      await tester.tap(find.text(d));
      await tester.pump();
    }
  }

  testWidgets('wrong slug shows error and stays on slug step', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: FaziPosApp()));
    await tester.pumpAndSettle();

    // iOS Simulator's Keychain can survive `xcrun simctl uninstall`, so a
    // previous test FILE's session can still be live here when this whole
    // directory is run as one batch (not just this file in isolation) — log
    // out first so the slug step is actually reachable.
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

    await tester.enterText(find.byType(TextField), 'nonexistent-org-xyz-999');
    await tester.pump();
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();

    expect(find.textContaining('Organization not found'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
  });

  testWidgets('valid slug lists all seeded users with roles', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: FaziPosApp()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), slug);
    await tester.pump();
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();

    expect(find.text('Brian Murithi'), findsOneWidget);
    expect(find.text('Test Manager'), findsOneWidget);
    expect(find.text('Test Cashier'), findsOneWidget);
    expect(find.text('Test Stock'), findsOneWidget);
    expect(find.text('admin'), findsOneWidget);
    expect(find.text('manager'), findsOneWidget);
    expect(find.text('cashier'), findsOneWidget);
    expect(find.text('stock'), findsOneWidget);
  });

  testWidgets('wrong PIN shows error and stays on pin step', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: FaziPosApp()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), slug);
    await tester.pump();
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Brian Murithi'));
    await tester.pumpAndSettle();

    await tapDigits(tester, '0000');
    await tester.tap(find.byType(FilledButton));
    // bcrypt's deliberately-slow PIN comparison + zero UI animation during
    // the await means default pumpAndSettle() can decide things are
    // "settled" before the response actually lands — give it real time.
    await tester.pumpAndSettle(const Duration(seconds: 2));

    expect(find.text('Invalid user ID or PIN'), findsOneWidget);
    expect(find.byType(BottomAppBar), findsNothing);
  });

  testWidgets('correct PIN lands on home shell (admin)', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: FaziPosApp()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), slug);
    await tester.pump();
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Brian Murithi'));
    await tester.pumpAndSettle();

    await tapDigits(tester, '1234');
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    expect(find.byType(BottomAppBar), findsOneWidget);
    expect(find.text('Dashboard'), findsOneWidget);
  });

  testWidgets('cold start with a valid stored token skips straight to home shell', (tester) async {
    // A brand-new widget tree = a brand-new AuthController, which reads
    // whatever is in real on-device secure storage / Drift right now (the
    // previous test's tokens), simulating an app relaunch without an actual
    // process restart.
    await tester.pumpWidget(const ProviderScope(child: FaziPosApp()));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    expect(find.byType(BottomAppBar), findsOneWidget);
    expect(find.text('Sign In'), findsNothing);
  });

  testWidgets('logout returns to the login screen', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: FaziPosApp()));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Log out'));
    await tester.pumpAndSettle();

    expect(find.text('Business'), findsOneWidget);
    expect(find.byType(BottomAppBar), findsNothing);
  });
}
