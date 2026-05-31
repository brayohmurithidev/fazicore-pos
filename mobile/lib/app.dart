import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'features/auth/auth_controller.dart';
import 'router.dart';

class FaziPosApp extends ConsumerWidget {
  const FaziPosApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);

    // While we read the stored token, show a splash so the router doesn't flicker.
    if (auth.status == AuthStatus.unknown) {
      return const MaterialApp(
        debugShowCheckedModeBanner: false,
        home: Scaffold(
          backgroundColor: Color(0xFF1e293b),
          body: Center(child: CircularProgressIndicator(color: Color(0xFFf5a020))),
        ),
      );
    }

    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'FaziPOS',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFf5a020),
          primary: const Color(0xFFf5a020),
        ),
        scaffoldBackgroundColor: const Color(0xFFf6f7f8),
      ),
      routerConfig: router,
    );
  }
}
