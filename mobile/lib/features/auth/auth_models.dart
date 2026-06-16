class AppUser {
  final int id;
  final int orgId;
  final String name;
  final String? email;
  final String role;
  final int? branchId;
  final String? branchName;
  final String? avatar;

  AppUser({
    required this.id,
    required this.orgId,
    required this.name,
    this.email,
    required this.role,
    this.branchId,
    this.branchName,
    this.avatar,
  });

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: j['id'] as int,
        orgId: j['org_id'] as int,
        name: j['name'] as String,
        email: j['email'] as String?,
        role: j['role'].toString(),
        branchId: j['branch_id'] as int?,
        branchName: j['branch_name'] as String?,
        avatar: j['avatar'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'org_id': orgId,
        'name': name,
        'email': email,
        'role': role,
        'branch_id': branchId,
        'branch_name': branchName,
        'avatar': avatar,
      };

  bool get isAdmin => role == 'admin';
  bool get isManager => role == 'manager';
  bool get isStock => role == 'stock';
  bool get isCashier => role == 'cashier';

  /// Can add/receive stock and manage variants.
  bool get canManageInventory => isAdmin || isManager || isStock;

  /// Can create/edit/delete products, categories, users, branches.
  bool get canManageProducts => isAdmin || isManager;

  /// Can view dashboard, reports, and full management screens.
  bool get canViewReports => isAdmin || isManager || isStock;
}
