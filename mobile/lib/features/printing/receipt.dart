import 'package:esc_pos_utils_plus/esc_pos_utils_plus.dart';
import 'package:intl/intl.dart';

final _money = NumberFormat('#,##0', 'en_KE');
String _m(num v) => _money.format(v);
final _dt = DateFormat('d MMM yyyy, h:mm a');

class ReceiptLine {
  final String name;
  final int qty;
  final num unitPrice;
  final num lineTotal;
  const ReceiptLine(this.name, this.qty, this.unitPrice, this.lineTotal);
}

class Receipt {
  final String shopName;
  final String address;
  final String phone;
  final String email;
  final String kraPin;
  final String vatNumber;
  final String footer;
  final String? ref;
  final String? cashier;
  final DateTime dateTime;
  final List<ReceiptLine> items;
  final num subtotal;
  final num discount;
  final num total;
  final String paymentMethod;
  final num amountPaid;
  final num change;
  final String? customerName;

  const Receipt({
    required this.shopName,
    this.address = '',
    this.phone = '',
    this.email = '',
    this.kraPin = '',
    this.vatNumber = '',
    this.footer = 'Thank you!',
    this.ref,
    this.cashier,
    required this.dateTime,
    required this.items,
    required this.subtotal,
    this.discount = 0,
    required this.total,
    required this.paymentMethod,
    required this.amountPaid,
    this.change = 0,
    this.customerName,
  });
}

/// Render a receipt to ESC/POS bytes for [paperMm] (58 or 80).
Future<List<int>> buildReceiptBytes(Receipt r, {int paperMm = 80}) async {
  final profile = await CapabilityProfile.load();
  final g = Generator(paperMm == 58 ? PaperSize.mm58 : PaperSize.mm80, profile);
  var bytes = <int>[];

  bytes += g.text(r.shopName,
      styles: const PosStyles(
          align: PosAlign.center, bold: true, height: PosTextSize.size2, width: PosTextSize.size2));
  if (r.address.isNotEmpty) {
    bytes += g.text(r.address, styles: const PosStyles(align: PosAlign.center));
  }
  if (r.phone.isNotEmpty) {
    bytes += g.text('Tel: ${r.phone}', styles: const PosStyles(align: PosAlign.center));
  }
  if (r.email.isNotEmpty) {
    bytes += g.text(r.email, styles: const PosStyles(align: PosAlign.center));
  }
  if (r.kraPin.isNotEmpty) {
    bytes += g.text('PIN: ${r.kraPin}', styles: const PosStyles(align: PosAlign.center));
  }
  if (r.vatNumber.isNotEmpty) {
    bytes += g.text('VAT: ${r.vatNumber}', styles: const PosStyles(align: PosAlign.center));
  }
  bytes += g.hr();
  bytes += g.text(_dt.format(r.dateTime));
  if (r.ref != null && r.ref!.isNotEmpty) bytes += g.text('Receipt: ${r.ref}');
  if (r.cashier != null && r.cashier!.isNotEmpty) bytes += g.text('Served by: ${r.cashier}');
  bytes += g.hr();

  for (final it in r.items) {
    bytes += g.row([
      PosColumn(text: it.name, width: 6),
      PosColumn(text: 'x${it.qty}', width: 2, styles: const PosStyles(align: PosAlign.center)),
      PosColumn(text: _m(it.lineTotal), width: 4, styles: const PosStyles(align: PosAlign.right)),
    ]);
  }

  bytes += g.hr();
  if (r.discount > 0) {
    bytes += g.row([
      PosColumn(text: 'Subtotal', width: 8),
      PosColumn(text: _m(r.subtotal), width: 4, styles: const PosStyles(align: PosAlign.right)),
    ]);
    bytes += g.row([
      PosColumn(text: 'Discount', width: 8),
      PosColumn(text: '-${_m(r.discount)}', width: 4, styles: const PosStyles(align: PosAlign.right)),
    ]);
  }
  bytes += g.row([
    PosColumn(text: 'TOTAL', width: 6, styles: const PosStyles(bold: true, height: PosTextSize.size2)),
    PosColumn(
        text: 'KES ${_m(r.total)}',
        width: 6,
        styles: const PosStyles(align: PosAlign.right, bold: true, height: PosTextSize.size2)),
  ]);
  bytes += g.hr();

  bytes += g.text('Paid: ${_method(r.paymentMethod)}  KES ${_m(r.amountPaid)}');
  if (r.change > 0) bytes += g.text('Change: KES ${_m(r.change)}');
  if (r.customerName != null && r.customerName!.isNotEmpty) {
    bytes += g.text('Customer: ${r.customerName}');
  }

  bytes += g.feed(1);
  if (r.footer.isNotEmpty) {
    bytes += g.text(r.footer, styles: const PosStyles(align: PosAlign.center, bold: true));
  }
  bytes += g.feed(2);
  bytes += g.cut();
  return bytes;
}

String _method(String m) => switch (m) {
      'cash' => 'Cash',
      'mpesa' => 'M-Pesa',
      'credit' => 'Credit',
      'split' => 'Split',
      _ => m,
    };

/// Plain-text rendering of a receipt, for sharing via WhatsApp/email/etc.
String receiptToText(Receipt r) {
  final b = StringBuffer();
  b.writeln(r.shopName);
  if (r.address.isNotEmpty) b.writeln(r.address);
  if (r.phone.isNotEmpty) b.writeln('Tel: ${r.phone}');
  if (r.email.isNotEmpty) b.writeln(r.email);
  if (r.kraPin.isNotEmpty) b.writeln('PIN: ${r.kraPin}');
  if (r.vatNumber.isNotEmpty) b.writeln('VAT: ${r.vatNumber}');
  b.writeln('—————————————');
  b.writeln(_dt.format(r.dateTime));
  if (r.ref != null && r.ref!.isNotEmpty) b.writeln('Receipt: ${r.ref}');
  if (r.cashier != null && r.cashier!.isNotEmpty) b.writeln('Served by: ${r.cashier}');
  b.writeln('—————————————');
  for (final it in r.items) {
    b.writeln('${it.name}  x${it.qty}   KES ${_m(it.lineTotal)}');
  }
  b.writeln('—————————————');
  if (r.discount > 0) b.writeln('Discount: -KES ${_m(r.discount)}');
  b.writeln('TOTAL: KES ${_m(r.total)}');
  b.writeln('Paid: ${_method(r.paymentMethod)}  KES ${_m(r.amountPaid)}');
  if (r.change > 0) b.writeln('Change: KES ${_m(r.change)}');
  if (r.customerName != null && r.customerName!.isNotEmpty) b.writeln('Customer: ${r.customerName}');
  if (r.footer.isNotEmpty) {
    b.writeln('—————————————');
    b.writeln(r.footer);
  }
  return b.toString();
}
