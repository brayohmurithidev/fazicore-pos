import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';

import '../../core/providers.dart';
import 'receipt.dart';

const _kMac = 'printer_mac';
const _kName = 'printer_name';
const _kPaper = 'printer_paper';
const _kAddress = 'printer_address';
const _kFooter = 'printer_footer';
const _kKraPin = 'biz_kra_pin';
const _kVat = 'biz_vat_number';

class PrinterSettings {
  final String? mac;
  final String? name;
  // Business identity — synced from GET /org/info (cached), read-only here.
  final String shopName;
  final String phone;
  final String email;
  // Manual extras.
  final String address;
  final String footer;
  final String kraPin;
  final String vatNumber;
  final int paper; // 58 or 80

  const PrinterSettings({
    this.mac,
    this.name,
    this.shopName = 'FaziPOS',
    this.phone = '',
    this.email = '',
    this.address = '',
    this.footer = 'Thank you!',
    this.kraPin = '',
    this.vatNumber = '',
    this.paper = 80,
  });

  bool get isConfigured => mac != null && mac!.isNotEmpty;

  PrinterSettings copyWith({
    String? mac,
    String? name,
    String? shopName,
    String? phone,
    String? email,
    String? address,
    String? footer,
    String? kraPin,
    String? vatNumber,
    int? paper,
  }) =>
      PrinterSettings(
        mac: mac ?? this.mac,
        name: name ?? this.name,
        shopName: shopName ?? this.shopName,
        phone: phone ?? this.phone,
        email: email ?? this.email,
        address: address ?? this.address,
        footer: footer ?? this.footer,
        kraPin: kraPin ?? this.kraPin,
        vatNumber: vatNumber ?? this.vatNumber,
        paper: paper ?? this.paper,
      );
}

final printerProvider =
    StateNotifierProvider<PrinterController, PrinterSettings>((ref) => PrinterController(ref));

class PrinterController extends StateNotifier<PrinterSettings> {
  final Ref ref;
  PrinterController(this.ref) : super(const PrinterSettings()) {
    _load();
  }

  /// Re-read settings from the cache. Call after a sync so freshly-pulled org
  /// info shows up on the receipt.
  Future<void> reload() => _load();

  Future<void> _load() async {
    final db = ref.read(appDatabaseProvider);
    final mac = await db.getMeta(_kMac);
    final name = await db.getMeta(_kName);
    final paper = await db.getMeta(_kPaper);
    final footer = await db.getMeta(_kFooter);
    // Business identity comes from the cached org profile (GET /org/info).
    final orgName = await db.getMeta('org_name');
    state = PrinterSettings(
      mac: mac,
      name: name,
      shopName: (orgName == null || orgName.isEmpty) ? 'FaziPOS' : orgName,
      phone: await db.getMeta('org_phone') ?? '',
      email: await db.getMeta('org_email') ?? '',
      address: await db.getMeta(_kAddress) ?? '',
      footer: (footer == null || footer.isEmpty) ? 'Thank you!' : footer,
      kraPin: await db.getMeta(_kKraPin) ?? '',
      vatNumber: await db.getMeta(_kVat) ?? '',
      paper: int.tryParse(paper ?? '') ?? 80,
    );
  }

  Future<void> setTaxInfo({String? kraPin, String? vatNumber}) async {
    final db = ref.read(appDatabaseProvider);
    if (kraPin != null) await db.setMeta(_kKraPin, kraPin);
    if (vatNumber != null) await db.setMeta(_kVat, vatNumber);
    state = state.copyWith(kraPin: kraPin, vatNumber: vatNumber);
  }

  Future<void> selectPrinter({required String mac, required String name}) async {
    final db = ref.read(appDatabaseProvider);
    await db.setMeta(_kMac, mac);
    await db.setMeta(_kName, name);
    state = state.copyWith(mac: mac, name: name);
  }

  Future<void> setShopDetails({String? address, String? footer}) async {
    final db = ref.read(appDatabaseProvider);
    if (address != null) await db.setMeta(_kAddress, address);
    if (footer != null) await db.setMeta(_kFooter, footer);
    state = state.copyWith(address: address, footer: footer);
  }

  Future<void> setPaper(int mm) async {
    await ref.read(appDatabaseProvider).setMeta(_kPaper, '$mm');
    state = state.copyWith(paper: mm);
  }

  /// Request the Android 12+ runtime Bluetooth permissions. On older versions
  /// these resolve to granted automatically.
  Future<void> _ensureBtPermission() async {
    final statuses = await [Permission.bluetoothConnect, Permission.bluetoothScan].request();
    final ok = statuses.values.every((s) => s.isGranted || s.isLimited);
    if (ok) return;
    final permanently = statuses.values.any((s) => s.isPermanentlyDenied);
    throw permanently
        ? 'Bluetooth permission is blocked. Enable it for FaziPOS in system settings.'
        : 'Bluetooth permission denied.';
  }

  /// Paired devices, or throws a human-readable message if BT is unavailable.
  Future<List<BluetoothInfo>> pairedDevices() async {
    await _ensureBtPermission();
    if (!await PrintBluetoothThermal.bluetoothEnabled) {
      throw 'Bluetooth is off. Turn it on and pair your printer first.';
    }
    return PrintBluetoothThermal.pairedBluetooths;
  }

  Future<void> _ensureConnected() async {
    final mac = state.mac;
    if (mac == null) throw 'No printer selected.';
    await _ensureBtPermission();
    if (await PrintBluetoothThermal.connectionStatus) return;
    final ok = await PrintBluetoothThermal.connect(macPrinterAddress: mac);
    if (!ok) throw 'Could not connect to ${state.name ?? mac}.';
  }

  /// Print a receipt. Returns null on success, or an error message.
  Future<String?> printReceipt(Receipt receipt) async {
    try {
      await _ensureConnected();
      final bytes = await buildReceiptBytes(receipt, paperMm: state.paper);
      final ok = await PrintBluetoothThermal.writeBytes(bytes);
      return ok ? null : 'Print failed — check the printer.';
    } catch (e) {
      return e.toString();
    }
  }

  Future<String?> testPrint() => printReceipt(Receipt(
        shopName: state.shopName,
        address: state.address,
        phone: state.phone,
        email: state.email,
        kraPin: state.kraPin,
        vatNumber: state.vatNumber,
        footer: state.footer,
        ref: 'TEST',
        dateTime: DateTime.now(),
        items: const [ReceiptLine('Test item', 1, 100, 100)],
        subtotal: 100,
        total: 100,
        paymentMethod: 'cash',
        amountPaid: 100,
      ));
}
