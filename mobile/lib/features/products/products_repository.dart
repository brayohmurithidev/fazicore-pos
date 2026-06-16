import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class ProductVariant {
  final int id;
  final String name;
  final String? sku;
  final num price;
  final Map<String, String> attributes;
  final int stockQuantity;

  ProductVariant({
    required this.id,
    required this.name,
    this.sku,
    required this.price,
    required this.attributes,
    required this.stockQuantity,
  });

  factory ProductVariant.fromJson(Map<String, dynamic> j) => ProductVariant(
        id: j['id'] as int,
        name: j['name'] as String,
        sku: j['sku'] as String?,
        price: (j['price'] ?? 0) as num,
        attributes: ((j['attributes'] as Map?)?.cast<String, dynamic>() ?? {})
            .map((k, v) => MapEntry(k, v.toString())),
        stockQuantity: (j['stock_quantity'] ?? 0) as int,
      );
}

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
  final int variantCount;
  // {"options": {"Size": ["S","M","L"], "Color": ["Red","Blue"]}}
  final Map<String, List<String>> variantOptions;

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
    this.variantCount = 0,
    this.variantOptions = const {},
  });

  bool get isLowStock => trackInventory && stockQuantity <= minStock;
  bool get hasVariants => variantCount > 0;

  factory Product.fromJson(Map<String, dynamic> j) {
    final rawAttrs = j['attributes'] as Map?;
    final rawOptions = rawAttrs?['options'] as Map?;
    final variantOptions = <String, List<String>>{};
    rawOptions?.forEach((k, v) {
      if (v is List) variantOptions[k.toString()] = v.map((e) => e.toString()).toList();
    });
    return Product(
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
      variantCount: (j['variant_count'] ?? 0) as int,
      variantOptions: variantOptions,
    );
  }
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
    'parents_only': true,
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

/// GET /products/{id}/variants — list all variants for a parent product.
Future<List<ProductVariant>> fetchProductVariants(WidgetRef ref, int productId) async {
  final res = await ref.read(apiClientProvider).dio.get('/products/$productId/variants');
  return (res.data as List).map((e) => ProductVariant.fromJson(e as Map<String, dynamic>)).toList();
}

/// POST /products/{id}/variants/generate — generate all attribute combinations.
/// [attributes] is a list of {"name": "Size", "values": ["S","M","L"]} maps.
Future<int> generateVariants(
  WidgetRef ref, {
  required int productId,
  required List<Map<String, dynamic>> attributes,
}) async {
  final res = await ref.read(apiClientProvider).dio.post(
    '/products/$productId/variants/generate',
    data: {'attributes': attributes},
  );
  return (res.data as List).length;
}

/// POST /products/{id}/variants/stock — add stock to multiple variants at once.
Future<void> bulkVariantStock(
  WidgetRef ref, {
  required int productId,
  required List<Map<String, int>> entries,
  String? notes,
}) async {
  await ref.read(apiClientProvider).dio.post(
    '/products/$productId/variants/stock',
    data: {
      'entries': entries,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    },
  );
}
