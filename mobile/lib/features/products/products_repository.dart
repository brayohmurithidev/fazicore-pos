import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class Product {
  final int id;
  final String name;
  final String? sku;
  final String? barcode;
  final num price;
  final num? cost;
  final int? categoryId;
  final String? categoryName;
  final String? imageUrl;
  final String unit;
  final int minStock;
  final bool isActive;
  final bool trackInventory;
  final int stockQuantity;

  Product({
    required this.id,
    required this.name,
    this.sku,
    this.barcode,
    required this.price,
    this.cost,
    this.categoryId,
    this.categoryName,
    this.imageUrl,
    required this.unit,
    required this.minStock,
    required this.isActive,
    required this.trackInventory,
    required this.stockQuantity,
  });

  bool get isLowStock => trackInventory && stockQuantity <= minStock;

  factory Product.fromJson(Map<String, dynamic> j) => Product(
        id: j['id'] as int,
        name: j['name'] as String,
        sku: j['sku'] as String?,
        barcode: j['barcode'] as String?,
        price: (j['price'] ?? 0) as num,
        cost: j['cost'] as num?,
        categoryId: j['category_id'] as int?,
        categoryName: j['category_name'] as String?,
        imageUrl: j['image_url'] as String?,
        unit: (j['unit'] ?? 'pcs').toString(),
        minStock: (j['min_stock'] ?? 0) as int,
        isActive: (j['is_active'] ?? true) as bool,
        trackInventory: (j['track_inventory'] ?? true) as bool,
        stockQuantity: (j['stock_quantity'] ?? 0) as int,
      );
}

/// Current search term for the products list (debounced in the screen).
final productSearchProvider = StateProvider.autoDispose<String>((_) => '');

/// GET /products/?q=<term>&limit=200
final productsProvider = FutureProvider.autoDispose<List<Product>>((ref) async {
  final api = ref.read(apiClientProvider);
  final q = ref.watch(productSearchProvider).trim();
  final res = await api.dio.get('/products/', queryParameters: {
    if (q.isNotEmpty) 'q': q,
    'limit': 200,
  });
  return (res.data as List)
      .map((e) => Product.fromJson(e as Map<String, dynamic>))
      .toList();
});
