import 'package:dio/dio.dart';
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

class Category {
  final int id;
  final String name;
  final int productCount;
  Category(this.id, this.name, [this.productCount = 0]);
  factory Category.fromJson(Map<String, dynamic> j) =>
      Category(j['id'] as int, (j['name'] ?? '').toString(), (j['product_count'] ?? 0) as int);
}

/// GET /categories/ — for the product form's category picker.
final categoriesProvider = FutureProvider.autoDispose<List<Category>>((ref) async {
  final api = ref.read(apiClientProvider);
  final res = await api.dio.get('/categories/');
  return (res.data as List).map((e) => Category.fromJson(e as Map<String, dynamic>)).toList();
});

/// Create (POST) or update (PATCH) a product. Returns the saved product id.
Future<int> saveProduct(WidgetRef ref, {int? id, required Map<String, dynamic> data}) async {
  final api = ref.read(apiClientProvider);
  final res = id == null
      ? await api.dio.post('/products/', data: data)
      : await api.dio.patch('/products/$id', data: data);
  return res.data['id'] as int;
}

Future<void> deleteProduct(WidgetRef ref, int id) async {
  await ref.read(apiClientProvider).dio.delete('/products/$id');
}

/// Upload a product photo (multipart) → POST /uploads/product-image/{id}.
Future<void> uploadProductImage(WidgetRef ref, int productId, String filePath) async {
  final api = ref.read(apiClientProvider);
  final form = FormData.fromMap({
    'file': await MultipartFile.fromFile(filePath, filename: filePath.split('/').last),
  });
  await api.dio.post('/uploads/product-image/$productId', data: form);
}
