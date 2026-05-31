import 'package:intl/intl.dart';

final _kes = NumberFormat.currency(locale: 'en_KE', symbol: 'KES ', decimalDigits: 0);

String kes(num value) => _kes.format(value);
