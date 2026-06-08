import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../auth/auth_models.dart';

/// GET /users/ — employees in the org.
final orgUsersProvider = FutureProvider.autoDispose<List<AppUser>>((ref) async {
  final res = await ref.read(apiClientProvider).dio.get('/users/');
  return (res.data as List).map((e) => AppUser.fromJson(e as Map<String, dynamic>)).toList();
});

class Branch {
  final int id;
  final String name;
  final String? location;
  final String? phone;
  final String? managerName;
  final bool isActive;

  Branch({
    required this.id,
    required this.name,
    this.location,
    this.phone,
    this.managerName,
    required this.isActive,
  });

  factory Branch.fromJson(Map<String, dynamic> j) => Branch(
        id: j['id'] as int,
        name: (j['name'] ?? '').toString(),
        location: j['location'] as String?,
        phone: j['phone'] as String?,
        managerName: j['manager_name'] as String?,
        isActive: (j['is_active'] ?? true) as bool,
      );
}

/// GET /branches/
final branchesProvider = FutureProvider.autoDispose<List<Branch>>((ref) async {
  final res = await ref.read(apiClientProvider).dio.get('/branches/');
  return (res.data as List).map((e) => Branch.fromJson(e as Map<String, dynamic>)).toList();
});

// ── Create helpers ────────────────────────────────────────────────────────────

Future<void> createCategory(WidgetRef ref, {required String name, String? description}) async {
  await ref.read(apiClientProvider).dio.post('/categories/', data: {
    'name': name,
    if (description != null && description.isNotEmpty) 'description': description,
  });
}

Future<void> createCustomer(WidgetRef ref,
    {required String name, String? phone, String? email, String? address}) async {
  await ref.read(apiClientProvider).dio.post('/customers/', data: {
    'name': name,
    if (phone != null && phone.isNotEmpty) 'phone': phone,
    if (email != null && email.isNotEmpty) 'email': email,
    if (address != null && address.isNotEmpty) 'address': address,
  });
}

Future<void> createBranch(WidgetRef ref,
    {required String name, String? location, String? phone, String? managerName}) async {
  await ref.read(apiClientProvider).dio.post('/branches/', data: {
    'name': name,
    if (location != null && location.isNotEmpty) 'location': location,
    if (phone != null && phone.isNotEmpty) 'phone': phone,
    if (managerName != null && managerName.isNotEmpty) 'manager_name': managerName,
  });
}

Future<void> createUser(WidgetRef ref,
    {required String name, required String pin, required String role, String? email, int? branchId}) async {
  await ref.read(apiClientProvider).dio.post('/users/', data: {
    'name': name,
    'pin': pin,
    'role': role,
    if (email != null && email.isNotEmpty) 'email': email,
    if (branchId != null) 'branch_id': branchId,
  });
}
