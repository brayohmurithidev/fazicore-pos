import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:fazipos_mobile/app.dart';

void main() {
  testWidgets('App boots and shows splash while auth resolves', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: FaziPosApp()));

    // On first frame auth status is `unknown`, so the splash spinner is shown.
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
