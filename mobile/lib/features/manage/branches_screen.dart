import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'branch_form_screen.dart';
import 'manage_repository.dart';
import 'plan_provider.dart';

class BranchesScreen extends ConsumerWidget {
  const BranchesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(branchesProvider);
    final plan = ref.watch(planProvider).valueOrNull;
    final canAdd = plan?.canAddBranch ?? true;
    return Scaffold(
      appBar: AppBar(title: const Text('Branches')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          if (!canAdd) {
            final why = (plan != null && !plan.has('multi_branch'))
                ? 'Multi-branch isn\'t included in your plan.'
                : 'Branch limit reached for your plan.';
            ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('$why Upgrade on the web admin.')));
            return;
          }
          Navigator.of(context).push(MaterialPageRoute(builder: (_) => const BranchFormScreen()));
        },
        icon: const Icon(Icons.add),
        label: const Text('Add branch'),
        backgroundColor: canAdd ? null : Colors.grey,
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(branchesProvider.future),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(children: [const SizedBox(height: 120), Center(child: Text(apiError(e)))]),
          data: (branches) {
            if (branches.isEmpty) {
              return ListView(children: const [
                SizedBox(height: 120),
                Center(child: Text('No branches', style: TextStyle(color: Colors.grey))),
              ]);
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: branches.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) {
                final b = branches[i];
                final sub = [
                  if (b.location != null && b.location!.isNotEmpty) b.location!,
                  if (b.phone != null && b.phone!.isNotEmpty) b.phone!,
                  if (b.managerName != null && b.managerName!.isNotEmpty) 'Mgr: ${b.managerName}',
                ].join(' · ');
                return Card(
                  margin: EdgeInsets.zero,
                  child: ListTile(
                    leading: const Icon(Icons.store_outlined),
                    title: Text(b.name),
                    subtitle: sub.isEmpty ? null : Text(sub),
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
