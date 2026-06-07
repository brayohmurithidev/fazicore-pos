import 'package:flutter/material.dart';

/// Official M-Pesa wordmark badge. Use wherever the M-Pesa payment method is
/// shown, in place of the plain "M-Pesa" text, per Safaricom brand guidance.
class MpesaLogo extends StatelessWidget {
  final double height;
  const MpesaLogo({super.key, this.height = 18});

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/safaricom/mpesa-logo.png',
      height: height,
      fit: BoxFit.contain,
      // Graceful fallback if the asset ever fails to load.
      errorBuilder: (_, __, ___) => Text(
        'M-PESA',
        style: TextStyle(
          fontSize: height * 0.7,
          fontWeight: FontWeight.w800,
          color: const Color(0xFF43B02A), // M-Pesa green
        ),
      ),
    );
  }
}
