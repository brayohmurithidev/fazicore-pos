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
}
