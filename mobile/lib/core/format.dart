import 'package:intl/intl.dart';

final _kes = NumberFormat.currency(locale: 'en_KE', symbol: 'KES ', decimalDigits: 0);

String kes(num value) => _kes.format(value);

final _dateTime = DateFormat('d MMM, h:mm a');

/// e.g. "6 Jun, 2:41 PM" — expects a local DateTime.
String dateTimeShort(DateTime value) => _dateTime.format(value);
