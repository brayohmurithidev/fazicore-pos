import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/app_database.dart';

class CartLine {
  final LocalProduct product;
  final int qty;
  const CartLine(this.product, this.qty);

  num get lineTotal => product.price * qty;
  CartLine copyWith({int? qty}) => CartLine(product, qty ?? this.qty);
}

class Cart {
  /// Keyed by product id, insertion-ordered.
  final Map<int, CartLine> lines;
  const Cart([this.lines = const {}]);

  List<CartLine> get items => lines.values.toList();
  bool get isEmpty => lines.isEmpty;
  int get itemCount => lines.values.fold(0, (s, l) => s + l.qty);
  num get subtotal => lines.values.fold<num>(0, (s, l) => s + l.lineTotal);
}

final cartProvider = StateNotifierProvider<CartController, Cart>((ref) => CartController());

class CartController extends StateNotifier<Cart> {
  CartController() : super(const Cart());

  void add(LocalProduct p) {
    final lines = Map<int, CartLine>.from(state.lines);
    final existing = lines[p.id];
    lines[p.id] = existing == null ? CartLine(p, 1) : existing.copyWith(qty: existing.qty + 1);
    state = Cart(lines);
  }

  void setQty(int productId, int qty) {
    final lines = Map<int, CartLine>.from(state.lines);
    if (qty <= 0) {
      lines.remove(productId);
    } else if (lines.containsKey(productId)) {
      lines[productId] = lines[productId]!.copyWith(qty: qty);
    }
    state = Cart(lines);
  }

  void remove(int productId) {
    final lines = Map<int, CartLine>.from(state.lines)..remove(productId);
    state = Cart(lines);
  }

  void clear() => state = const Cart();
}
