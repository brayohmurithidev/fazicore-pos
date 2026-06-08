import 'package:flutter/material.dart';

/// A simple numeric keypad (1-9, 0, backspace) for PIN/amount entry.
class DigitKeypad extends StatelessWidget {
  final ValueChanged<String> onKey;
  final VoidCallback onBackspace;
  final Color? foreground;
  const DigitKeypad({super.key, required this.onKey, required this.onBackspace, this.foreground});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final row in const [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', '⌫']])
          Row(
            children: [
              for (final k in row)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(6),
                    child: k.isEmpty
                        ? const SizedBox(height: 56)
                        : Material(
                            color: Colors.transparent,
                            shape: const CircleBorder(),
                            clipBehavior: Clip.antiAlias,
                            child: InkWell(
                              onTap: () => k == '⌫' ? onBackspace() : onKey(k),
                              child: SizedBox(
                                height: 56,
                                child: Center(
                                  child: k == '⌫'
                                      ? Icon(Icons.backspace_outlined, color: foreground)
                                      : Text(k, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w500, color: foreground)),
                                ),
                              ),
                            ),
                          ),
                  ),
                ),
            ],
          ),
      ],
    );
  }
}
