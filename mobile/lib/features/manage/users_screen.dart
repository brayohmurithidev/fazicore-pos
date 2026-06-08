import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'employee_form_screen.dart';
import 'manage_repository.dart';
import 'plan_provider.dart';

class UsersScreen extends ConsumerWidget {
  const UsersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(orgUsersProvider);
    final plan = ref.watch(planProvider).valueOrNull;
    final canAdd = plan?.canAddUser ?? true;
    return Scaffold(
      appBar: AppBar(title: const Text('Employees')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          if (!canAdd) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content: Text('User limit reached for your plan. Upgrade on the web admin.')));
            return;
          }
          Navigator.of(context).push(MaterialPageRoute(builder: (_) => const EmployeeFormScreen()));
        },
        icon: const Icon(Icons.add),
        label: const Text('Add employee'),
        backgroundColor: canAdd ? null : Colors.grey,
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(orgUsersProvider.future),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(children: [const SizedBox(height: 120), Center(child: Text(apiError(e)))]),
          data: (users) {
            if (users.isEmpty) {
              return ListView(children: const [
                SizedBox(height: 120),
                Center(child: Text('No employees', style: TextStyle(color: Colors.grey))),
              ]);
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: users.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) {
                final u = users[i];
                final sub = [
                  u.role,
                  if (u.branchName != null) u.branchName!,
                ].join(' · ');
                return Card(
                  margin: EdgeInsets.zero,
                  child: ListTile(
                    leading: CircleAvatar(child: Text(u.name.isNotEmpty ? u.name[0].toUpperCase() : '?')),
                    title: Text(u.name),
                    subtitle: Text(sub),
                    trailing: u.email != null
                        ? Text(u.email!, style: const TextStyle(color: Colors.grey, fontSize: 12))
                        : null,
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
