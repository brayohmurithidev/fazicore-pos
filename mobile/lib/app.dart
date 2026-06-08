import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme.dart';
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
        home: _SplashScreen(),
      );
    }

    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'FaziPOS',
      debugShowCheckedModeBanner: false,
      theme: appTheme,
      routerConfig: router,
      // Bump everything up a notch for readability, on top of the user's system
      // text-size preference (clamped so layouts don't break).
      builder: (context, child) {
        final sys = MediaQuery.textScalerOf(context).scale(1.0);
        final scale = (sys * 1.12).clamp(1.0, 1.4);
        return MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        );
      },
    );
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.ink,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                color: AppColors.brand,
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(color: AppColors.brand.withValues(alpha: 0.4), blurRadius: 24, spreadRadius: 2),
                ],
              ),
              child: const Icon(Icons.point_of_sale, color: Colors.white, size: 52),
            ),
            const SizedBox(height: 24),
            const Text.rich(
              TextSpan(children: [
                TextSpan(text: 'FAZI', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: 1)),
                TextSpan(text: 'LABS', style: TextStyle(color: AppColors.brand, fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: 1)),
              ]),
            ),
            const SizedBox(height: 4),
            const Text('POS', style: TextStyle(color: Color(0xFF94a3b8), fontSize: 12, letterSpacing: 6)),
            const SizedBox(height: 40),
            const SizedBox(
              width: 24, height: 24,
              child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.brand),
            ),
          ],
        ),
      ),
    );
  }
}
