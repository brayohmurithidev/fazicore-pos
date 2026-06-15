import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class Supplier {
  final int id;
  final String name;
  final String? contactName;
  final String? phone;
  final String? email;
  final String? address;
  final String? notes;
  final bool isActive;

  Supplier({
    required this.id,
    required this.name,
    this.contactName,
    this.phone,
    this.email,
    this.address,
    this.notes,
    required this.isActive,
  });

  factory Supplier.fromJson(Map<String, dynamic> j) => Supplier(
        id: j['id'] as int,
        name: (j['name'] ?? '').toString(),
        contactName: j['contact_name'] as String?,
        phone: j['phone'] as String?,
        email: j['email'] as String?,
        address: j['address'] as String?,
        notes: j['notes'] as String?,
        isActive: (j['is_active'] ?? true) as bool,
      );
}

final suppliersProvider = FutureProvider.autoDispose<List<Supplier>>((ref) async {
  final res = await ref.read(apiClientProvider).dio.get('/suppliers/');
  return (res.data as List).map((e) => Supplier.fromJson(e as Map<String, dynamic>)).toList();
});

Future<void> createSupplier(
  WidgetRef ref, {
  required String name,
  String? contactName,
  String? phone,
  String? email,
  String? address,
  String? notes,
}) async {
  await ref.read(apiClientProvider).dio.post('/suppliers/', data: {
    'name': name,
    if (contactName != null && contactName.isNotEmpty) 'contact_name': contactName,
    if (phone != null && phone.isNotEmpty) 'phone': phone,
    if (email != null && email.isNotEmpty) 'email': email,
    if (address != null && address.isNotEmpty) 'address': address,
    if (notes != null && notes.isNotEmpty) 'notes': notes,
  });
}

Future<void> updateSupplier(WidgetRef ref, int id, Map<String, dynamic> data) async {
  await ref.read(apiClientProvider).dio.patch('/suppliers/$id', data: data);
}

Future<void> deleteSupplier(WidgetRef ref, int id) async {
  await ref.read(apiClientProvider).dio.delete('/suppliers/$id');
}
