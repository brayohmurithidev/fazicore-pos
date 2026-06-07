import 'package:flutter/material.dart';

/// Minimal palette: one brand accent, one warning tone. Everything else comes
/// from the Material color scheme (neutrals) or [ColorScheme.error] for danger.
class AppColors {
  AppColors._();

  /// The single brand accent — also the ColorScheme primary. Use sparingly,
  /// for interactive/primary affordances only.
  static const brand = Color(0xFFf5a020);

  /// The one semantic "attention" tone: low stock, credit owed, pending sync.
  static const warning = Color(0xFFb45309);

  /// Dark surface for the login/splash brand screen.
  static const ink = Color(0xFF1e293b);
}

final appTheme = ThemeData(
  useMaterial3: true,
  fontFamily: 'Rubik',
  colorScheme: ColorScheme.fromSeed(
    seedColor: AppColors.brand,
    primary: AppColors.brand,
    surface: Colors.white,
  ),
  scaffoldBackgroundColor: const Color(0xFFf7f7f8),
  // Flat, untinted cards — removes the M3 seed tint that made things feel busy.
  cardTheme: CardThemeData(
    elevation: 0,
    color: Colors.white,
    surfaceTintColor: Colors.transparent,
    margin: EdgeInsets.zero,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(12),
      side: BorderSide(color: Colors.black.withValues(alpha: 0.07)),
    ),
  ),
  appBarTheme: const AppBarTheme(
    backgroundColor: Colors.white,
    foregroundColor: AppColors.ink,
    surfaceTintColor: Colors.transparent,
    elevation: 0,
    scrolledUnderElevation: 0.5,
    centerTitle: false,
  ),
  navigationBarTheme: const NavigationBarThemeData(
    backgroundColor: Colors.white,
    surfaceTintColor: Colors.transparent,
    elevation: 1,
  ),
  // Outlined buttons: ink text (more prominent than orange-on-white) with a
  // brand-coloured border + subtle tint so they still read as actionable.
  outlinedButtonTheme: OutlinedButtonThemeData(
    style: OutlinedButton.styleFrom(
      foregroundColor: AppColors.ink,
      backgroundColor: AppColors.brand.withValues(alpha: 0.06),
      side: const BorderSide(color: AppColors.brand, width: 1.4),
      textStyle: const TextStyle(fontWeight: FontWeight.w600),
    ),
  ),
);
