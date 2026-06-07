import 'package:flutter/material.dart';

import '../theme.dart';

class SelectOption<T> {
  final String label;
  final T? value;
  final Widget? leading;
  const SelectOption(this.label, this.value, {this.leading});
}

/// A themed select field that opens a bottom-sheet picker instead of the native
/// dropdown overlay. Consistent with our text inputs; searchable for long lists.
class AppSelect<T> extends StatelessWidget {
  final String? label;
  final String hint;
  final T? value;
  final List<SelectOption<T>> options;
  final ValueChanged<T?> onChanged;
  final bool searchable;
  final bool dense;

  const AppSelect({
    super.key,
    this.label,
    this.hint = 'Select',
    required this.value,
    required this.options,
    required this.onChanged,
    this.searchable = false,
    this.dense = true,
  });

  SelectOption<T>? get _current {
    for (final o in options) {
      if (o.value == value) return o;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final current = _current;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () async {
        final picked = await _showSheet(context);
        if (picked != null) onChanged(picked.value);
      },
      child: InputDecorator(
        isEmpty: false, // we render the value/hint ourselves; keep the label floated
        decoration: InputDecoration(
          labelText: label,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          isDense: dense,
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        ),
        child: Row(
          children: [
            if (current?.leading != null) ...[current!.leading!, const SizedBox(width: 8)],
            Expanded(
              child: Text(
                current?.label ?? hint,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: current == null ? Colors.grey : null),
              ),
            ),
            const Icon(Icons.keyboard_arrow_down, color: Colors.grey),
          ],
        ),
      ),
    );
  }

  Future<SelectOption<T>?> _showSheet(BuildContext context) {
    return showModalBottomSheet<SelectOption<T>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _SelectSheet<T>(
        title: label ?? hint,
        options: options,
        selected: value,
        searchable: searchable,
      ),
    );
  }
}

class _SelectSheet<T> extends StatefulWidget {
  final String title;
  final List<SelectOption<T>> options;
  final T? selected;
  final bool searchable;
  const _SelectSheet({
    required this.title,
    required this.options,
    required this.selected,
    required this.searchable,
  });

  @override
  State<_SelectSheet<T>> createState() => _SelectSheetState<T>();
}

class _SelectSheetState<T> extends State<_SelectSheet<T>> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final filtered = _q.isEmpty
        ? widget.options
        : widget.options.where((o) => o.label.toLowerCase().contains(_q.toLowerCase())).toList();
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(widget.title, style: Theme.of(context).textTheme.titleMedium),
            ),
          ),
          if (widget.searchable)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: TextField(
                autofocus: true,
                onChanged: (v) => setState(() => _q = v),
                decoration: InputDecoration(
                  hintText: 'Search',
                  prefixIcon: const Icon(Icons.search),
                  isDense: true,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
          Flexible(
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: filtered.length,
              itemBuilder: (_, i) {
                final o = filtered[i];
                final sel = o.value == widget.selected;
                return ListTile(
                  leading: o.leading,
                  title: Text(o.label),
                  trailing: sel ? const Icon(Icons.check, color: AppColors.brand) : null,
                  selected: sel,
                  onTap: () => Navigator.of(context).pop(o),
                );
              },
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
