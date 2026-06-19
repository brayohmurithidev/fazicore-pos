import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/app_database.dart';

class CartLine {
  final LocalProduct product;
  final int qty;
  final num discountPct; // 0–100, per-item percentage discount
  const CartLine(this.product, this.qty, [this.discountPct = 0]);

  num get lineGross => product.price * qty;
  num get lineDiscount => discountPct > 0 ? (lineGross * discountPct / 100).round() : 0;
  num get lineTotal => lineGross - lineDiscount; // net of the item discount

  CartLine copyWith({int? qty, num? discountPct}) =>
      CartLine(product, qty ?? this.qty, discountPct ?? this.discountPct);
}

class Cart {
  /// Keyed by product id, insertion-ordered.
  final Map<int, CartLine> lines;
  final num cartDiscountPct; // 0–100, applied to the post-item-discount subtotal
  const Cart([this.lines = const {}, this.cartDiscountPct = 0]);

  List<CartLine> get items => lines.values.toList();
  bool get isEmpty => lines.isEmpty;
  int get itemCount => lines.values.fold(0, (s, l) => s + l.qty);

  /// Gross of all lines, before any discount.
  num get grossSubtotal => lines.values.fold<num>(0, (s, l) => s + l.lineGross);

  /// Sum of per-item discounts.
  num get itemDiscountTotal => lines.values.fold<num>(0, (s, l) => s + l.lineDiscount);

  /// Net after per-item discounts (matches the backend `subtotal`).
  num get subtotal => lines.values.fold<num>(0, (s, l) => s + l.lineTotal);

  /// Cart-level discount amount (percentage of [subtotal]).
  num get cartDiscountAmt => cartDiscountPct > 0 ? (subtotal * cartDiscountPct / 100).round() : 0;

  /// Final payable amount.
  num get total => subtotal - cartDiscountAmt;

  /// Every discount combined (item + cart), for display.
  num get discountTotal => itemDiscountTotal + cartDiscountAmt;
}

final cartProvider = StateNotifierProvider<CartController, Cart>((ref) => CartController());

class CartController extends StateNotifier<Cart> {
  CartController() : super(const Cart());

  /// Caps at on-hand stock for tracked products; untracked products
  /// (services, etc.) have no ceiling.
  int _cap(LocalProduct p, int wanted) =>
      p.trackInventory ? wanted.clamp(0, p.stockQuantity) : wanted;

  void add(LocalProduct p) {
    final lines = Map<int, CartLine>.from(state.lines);
    final existing = lines[p.id];
    final wanted = (existing?.qty ?? 0) + 1;
    final qty = _cap(p, wanted);
    if (qty == (existing?.qty ?? 0)) return; // already at stock ceiling
    lines[p.id] = existing == null ? CartLine(p, qty) : existing.copyWith(qty: qty);
    state = Cart(lines, state.cartDiscountPct);
  }

  void addWithQty(LocalProduct p, int qty) {
    if (qty <= 0) return;
    final lines = Map<int, CartLine>.from(state.lines);
    final existing = lines[p.id];
    final wanted = (existing?.qty ?? 0) + qty;
    final capped = _cap(p, wanted);
    if (capped == (existing?.qty ?? 0)) return;
    lines[p.id] = existing == null ? CartLine(p, capped) : existing.copyWith(qty: capped);
    state = Cart(lines, state.cartDiscountPct);
  }

  void setQty(int productId, int qty) {
    final lines = Map<int, CartLine>.from(state.lines);
    if (qty <= 0) {
      lines.remove(productId);
    } else if (lines.containsKey(productId)) {
      final line = lines[productId]!;
      lines[productId] = line.copyWith(qty: _cap(line.product, qty));
    }
    state = Cart(lines, state.cartDiscountPct);
  }

  /// Set a per-item percentage discount (0–100).
  void setItemDiscount(int productId, num pct) {
    final lines = Map<int, CartLine>.from(state.lines);
    if (lines.containsKey(productId)) {
      lines[productId] = lines[productId]!.copyWith(discountPct: pct.clamp(0, 100));
      state = Cart(lines, state.cartDiscountPct);
    }
  }

  /// Set the cart-level percentage discount (0–100).
  void setCartDiscount(num pct) => state = Cart(state.lines, pct.clamp(0, 100));

  void remove(int productId) {
    final lines = Map<int, CartLine>.from(state.lines)..remove(productId);
    state = Cart(lines, state.cartDiscountPct);
  }

  void clear() => state = const Cart();
}
