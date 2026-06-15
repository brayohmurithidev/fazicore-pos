import 'package:flutter_test/flutter_test.dart';
import 'package:fazipos_mobile/features/sell/cart_controller.dart';
import 'package:fazipos_mobile/core/db/app_database.dart';

LocalProduct _product({
  int id = 1,
  String name = 'Test Product',
  double price = 100.0,
}) =>
    LocalProduct(
      id: id,
      name: name,
      price: price,
      unit: 'pcs',
      stockQuantity: 50,
      minStock: 5,
      vatRate: 0,
      isActive: true,
      trackInventory: true,
    );

void main() {
  group('CartLine', () {
    test('lineGross = price × qty', () {
      final line = CartLine(_product(price: 200), 3);
      expect(line.lineGross, 600);
    });

    test('lineDiscount = 0 when no discount', () {
      final line = CartLine(_product(price: 100), 2);
      expect(line.lineDiscount, 0);
      expect(line.lineTotal, 200);
    });

    test('lineDiscount rounds to nearest int', () {
      final line = CartLine(_product(price: 100), 1, 15);
      expect(line.lineDiscount, 15);
      expect(line.lineTotal, 85);
    });

    test('10% discount on 3 × 100 = 30 off', () {
      final line = CartLine(_product(price: 100), 3, 10);
      expect(line.lineDiscount, 30);
      expect(line.lineTotal, 270);
    });
  });

  group('Cart totals', () {
    Cart makeCart(List<CartLine> lines, {num cartPct = 0}) {
      final map = {for (final l in lines) l.product.id: l};
      return Cart(map, cartPct);
    }

    test('empty cart has zero totals', () {
      const cart = Cart();
      expect(cart.grossSubtotal, 0);
      expect(cart.subtotal, 0);
      expect(cart.total, 0);
      expect(cart.discountTotal, 0);
      expect(cart.isEmpty, isTrue);
      expect(cart.itemCount, 0);
    });

    test('grossSubtotal sums line grosses ignoring discounts', () {
      final cart = makeCart([
        CartLine(_product(id: 1, price: 100), 2, 10), // gross 200
        CartLine(_product(id: 2, price: 50), 1),       // gross 50
      ]);
      expect(cart.grossSubtotal, 250);
    });

    test('subtotal sums lineTotals (after item discounts)', () {
      final cart = makeCart([
        CartLine(_product(id: 1, price: 100), 2, 10), // 200 - 20 = 180
        CartLine(_product(id: 2, price: 50), 1),       // 50
      ]);
      expect(cart.subtotal, 230);
    });

    test('cart-level discount applies to subtotal', () {
      final cart = makeCart([
        CartLine(_product(id: 1, price: 100), 1),
        CartLine(_product(id: 2, price: 100), 1),
      ], cartPct: 10); // subtotal 200, 10% off = 20
      expect(cart.cartDiscountAmt, 20);
      expect(cart.total, 180);
    });

    test('discountTotal = item discounts + cart discount', () {
      final cart = makeCart([
        CartLine(_product(id: 1, price: 100), 1, 5), // item discount 5
      ], cartPct: 10); // cart discount on 95 = 9 (rounded)
      expect(cart.discountTotal, cart.itemDiscountTotal + cart.cartDiscountAmt);
    });

    test('itemCount sums quantities across all lines', () {
      final cart = makeCart([
        CartLine(_product(id: 1, price: 10), 3),
        CartLine(_product(id: 2, price: 20), 2),
      ]);
      expect(cart.itemCount, 5);
    });
  });

  group('CartController', () {
    late CartController ctrl;

    setUp(() => ctrl = CartController());

    test('starts empty', () {
      expect(ctrl.state.isEmpty, isTrue);
    });

    test('add creates a line with qty 1', () {
      ctrl.add(_product());
      expect(ctrl.state.lines[1]?.qty, 1);
    });

    test('add twice increments qty', () {
      ctrl.add(_product());
      ctrl.add(_product());
      expect(ctrl.state.lines[1]?.qty, 2);
    });

    test('add different products creates separate lines', () {
      ctrl.add(_product(id: 1));
      ctrl.add(_product(id: 2));
      expect(ctrl.state.lines.length, 2);
    });

    test('setQty updates quantity', () {
      ctrl.add(_product());
      ctrl.setQty(1, 5);
      expect(ctrl.state.lines[1]?.qty, 5);
    });

    test('setQty to 0 removes the line', () {
      ctrl.add(_product());
      ctrl.setQty(1, 0);
      expect(ctrl.state.lines.containsKey(1), isFalse);
    });

    test('setQty negative removes the line', () {
      ctrl.add(_product());
      ctrl.setQty(1, -1);
      expect(ctrl.state.lines.containsKey(1), isFalse);
    });

    test('remove deletes the line', () {
      ctrl.add(_product(id: 1));
      ctrl.add(_product(id: 2));
      ctrl.remove(1);
      expect(ctrl.state.lines.containsKey(1), isFalse);
      expect(ctrl.state.lines.containsKey(2), isTrue);
    });

    test('setItemDiscount clamps to 0–100', () {
      ctrl.add(_product());
      ctrl.setItemDiscount(1, 150);
      expect(ctrl.state.lines[1]?.discountPct, 100);
      ctrl.setItemDiscount(1, -10);
      expect(ctrl.state.lines[1]?.discountPct, 0);
    });

    test('setCartDiscount clamps to 0–100', () {
      ctrl.setCartDiscount(200);
      expect(ctrl.state.cartDiscountPct, 100);
      ctrl.setCartDiscount(-5);
      expect(ctrl.state.cartDiscountPct, 0);
    });

    test('clear empties the cart', () {
      ctrl.add(_product(id: 1));
      ctrl.add(_product(id: 2));
      ctrl.setCartDiscount(10);
      ctrl.clear();
      expect(ctrl.state.isEmpty, isTrue);
      expect(ctrl.state.cartDiscountPct, 0);
    });

    test('cart discount preserved when adding new item', () {
      ctrl.setCartDiscount(15);
      ctrl.add(_product());
      expect(ctrl.state.cartDiscountPct, 15);
    });
  });
}
