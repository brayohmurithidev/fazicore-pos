import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'suppliers_repository.dart';

class SuppliersScreen extends ConsumerWidget {
  const SuppliersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(suppliersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Suppliers')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openForm(context, ref, null),
        icon: const Icon(Icons.add),
        label: const Text('Add supplier'),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(suppliersProvider.future),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              Center(child: Text(apiError(e), textAlign: TextAlign.center)),
              const SizedBox(height: 12),
              Center(
                child: FilledButton(
                  onPressed: () => ref.invalidate(suppliersProvider),
                  child: const Text('Retry'),
                ),
              ),
            ],
          ),
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  Center(
                    child: Column(
                      children: [
                        Icon(Icons.local_shipping_outlined, size: 48, color: Colors.grey),
                        SizedBox(height: 8),
                        Text('No suppliers yet', style: TextStyle(color: Colors.grey)),
                      ],
                    ),
                  ),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) {
                final s = items[i];
                return Dismissible(
                  key: ValueKey(s.id),
                  direction: DismissDirection.endToStart,
                  background: Container(
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.only(right: 20),
                    color: Theme.of(context).colorScheme.error,
                    child: Icon(Icons.delete_outline,
                        color: Theme.of(context).colorScheme.onError),
                  ),
                  confirmDismiss: (_) async {
                    return await showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: const Text('Delete supplier?'),
                        content: Text('Delete "${s.name}"? This cannot be undone.'),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(ctx, false),
                            child: const Text('Cancel'),
                          ),
                          FilledButton(
                            style: FilledButton.styleFrom(
                              backgroundColor: Theme.of(context).colorScheme.error,
                            ),
                            onPressed: () => Navigator.pop(ctx, true),
                            child: const Text('Delete'),
                          ),
                        ],
                      ),
                    );
                  },
                  onDismissed: (_) async {
                    try {
                      await deleteSupplier(ref, s.id);
                      ref.invalidate(suppliersProvider);
                    } catch (e) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(apiError(e))),
                        );
                      }
                      ref.invalidate(suppliersProvider);
                    }
                  },
                  child: Card(
                    margin: EdgeInsets.zero,
                    child: ListTile(
                      leading: CircleAvatar(
                        child: Text(s.name.isNotEmpty ? s.name[0].toUpperCase() : '?'),
                      ),
                      title: Text(s.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text(
                        [s.phone, s.email].where((v) => v != null && v.isNotEmpty).join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (!s.isActive)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: Theme.of(context).colorScheme.errorContainer,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                'Inactive',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Theme.of(context).colorScheme.onErrorContainer,
                                ),
                              ),
                            ),
                          const SizedBox(width: 4),
                          const Icon(Icons.chevron_right, color: Colors.grey),
                        ],
                      ),
                      onTap: () => _openForm(context, ref, s),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  void _openForm(BuildContext context, WidgetRef ref, Supplier? existing) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _SupplierForm(existing: existing, ref: ref),
    );
  }
}

class _SupplierForm extends StatefulWidget {
  final Supplier? existing;
  final WidgetRef ref;
  const _SupplierForm({this.existing, required this.ref});

  @override
  State<_SupplierForm> createState() => _SupplierFormState();
}

class _SupplierFormState extends State<_SupplierForm> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.existing?.name);
  late final _contact = TextEditingController(text: widget.existing?.contactName);
  late final _phone = TextEditingController(text: widget.existing?.phone);
  late final _email = TextEditingController(text: widget.existing?.email);
  late final _address = TextEditingController(text: widget.existing?.address);
  late final _notes = TextEditingController(text: widget.existing?.notes);
  bool _loading = false;

  @override
  void dispose() {
    _name.dispose();
    _contact.dispose();
    _phone.dispose();
    _email.dispose();
    _address.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      if (widget.existing == null) {
        await createSupplier(
          widget.ref,
          name: _name.text.trim(),
          contactName: _contact.text.trim(),
          phone: _phone.text.trim(),
          email: _email.text.trim(),
          address: _address.text.trim(),
          notes: _notes.text.trim(),
        );
      } else {
        await updateSupplier(widget.ref, widget.existing!.id, {
          'name': _name.text.trim(),
          if (_contact.text.isNotEmpty) 'contact_name': _contact.text.trim(),
          if (_phone.text.isNotEmpty) 'phone': _phone.text.trim(),
          if (_email.text.isNotEmpty) 'email': _email.text.trim(),
          if (_address.text.isNotEmpty) 'address': _address.text.trim(),
          if (_notes.text.isNotEmpty) 'notes': _notes.text.trim(),
        });
      }
      widget.ref.invalidate(suppliersProvider);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.existing == null ? 'Add supplier' : 'Edit supplier',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Name *'),
              textCapitalization: TextCapitalization.words,
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Name is required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _contact,
              decoration: const InputDecoration(labelText: 'Contact person'),
              textCapitalization: TextCapitalization.words,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phone,
              decoration: const InputDecoration(labelText: 'Phone'),
              keyboardType: TextInputType.phone,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _email,
              decoration: const InputDecoration(labelText: 'Email'),
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _address,
              decoration: const InputDecoration(labelText: 'Address'),
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _notes,
              decoration: const InputDecoration(labelText: 'Notes'),
              maxLines: 2,
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(widget.existing == null ? 'Create supplier' : 'Save changes'),
            ),
          ],
        ),
      ),
    );
  }
}
