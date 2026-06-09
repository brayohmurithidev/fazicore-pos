import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api_client.dart';
import '../../core/features.dart';
import '../../core/theme.dart';
import '../../core/widgets/app_select.dart';
import '../../core/widgets/barcode_scanner_page.dart';
import '../manage/manage_repository.dart';
import '../manage/plan_provider.dart';
import '../sync/sync_engine.dart';
import 'products_repository.dart';

/// Sentinel value for the inline "+ New category" option.
const _kNewCategory = -999;

class ProductFormScreen extends ConsumerStatefulWidget {
  final Product? product; // null = create
  const ProductFormScreen({super.key, this.product});

  @override
  ConsumerState<ProductFormScreen> createState() => _ProductFormScreenState();
}

class _ProductFormScreenState extends ConsumerState<ProductFormScreen> {
  late final _name = TextEditingController(text: widget.product?.name ?? '');
  late final _price = TextEditingController(text: widget.product?.price.toStringAsFixed(0) ?? '');
  late final _cost = TextEditingController(text: widget.product?.cost?.toStringAsFixed(0) ?? '');
  late final _sku = TextEditingController(text: widget.product?.sku ?? '');
  late final _barcode = TextEditingController(text: widget.product?.barcode ?? '');
  late final _stock = TextEditingController();
  late int? _categoryId = widget.product?.categoryId;
  XFile? _pickedImage; // newly chosen photo, uploaded on save
  bool _saving = false;
  String? _error;

  bool get _isEdit => widget.product != null;

  @override
  void dispose() {
    for (final c in [_name, _price, _cost, _sku, _barcode, _stock]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Prompt for a new category, create it, then select it.
  Future<void> _createCategoryInline() async {
    final ctrl = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('New category'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(labelText: 'Category name', border: OutlineInputBorder()),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, ctrl.text.trim()), child: const Text('Add')),
        ],
      ),
    );
    if (name == null || name.isEmpty) return;
    try {
      final id = await createCategory(ref, name: name);
      ref.invalidate(categoriesProvider);
      if (mounted) setState(() => _categoryId = id);
    } catch (e) {
      if (mounted) setState(() => _error = apiError(e));
    }
  }

  Future<void> _pickImage() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;
    final picked = await ImagePicker().pickImage(
      source: source,
      maxWidth: 1600,
      imageQuality: 90,
    );
    if (picked == null) return;

    // Crop / rotate / square-up the photo for clean product thumbnails.
    final cropped = await ImageCropper().cropImage(
      sourcePath: picked.path,
      aspectRatio: const CropAspectRatio(ratioX: 1, ratioY: 1),
      compressFormat: ImageCompressFormat.jpg,
      compressQuality: 85,
      uiSettings: [
        AndroidUiSettings(
          toolbarTitle: 'Edit photo',
          toolbarColor: AppColors.brand,
          toolbarWidgetColor: Colors.white,
          activeControlsWidgetColor: AppColors.brand,
          lockAspectRatio: false,
          hideBottomControls: false,
        ),
        IOSUiSettings(title: 'Edit photo', aspectRatioLockEnabled: false),
      ],
    );
    final finalPath = cropped?.path ?? picked.path;
    if (mounted) setState(() => _pickedImage = XFile(finalPath));
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    final price = num.tryParse(_price.text.trim());
    if (name.isEmpty) {
      setState(() => _error = 'Enter a product name');
      return;
    }
    if (price == null || price <= 0) {
      setState(() => _error = 'Enter a valid price');
      return;
    }
    setState(() { _saving = true; _error = null; });

    final data = <String, dynamic>{
      'name': name,
      'price': price,
      if (_cost.text.trim().isNotEmpty) 'cost': num.tryParse(_cost.text.trim()),
      'category_id': _categoryId,
      if (_sku.text.trim().isNotEmpty) 'sku': _sku.text.trim(),
      if (_barcode.text.trim().isNotEmpty) 'barcode': _barcode.text.trim(),
      if (!_isEdit && _stock.text.trim().isNotEmpty) 'initial_stock': int.tryParse(_stock.text.trim()) ?? 0,
    };

    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final id = await saveProduct(ref, id: widget.product?.id, data: data);
      // Upload the photo (if any) once we have a product id.
      if (_pickedImage != null) {
        try {
          await uploadProductImage(ref, id, _pickedImage!.path);
        } catch (_) {
          // Don't fail the whole save on an image hiccup.
          messenger.showSnackBar(const SnackBar(content: Text('Product saved, but the photo upload failed')));
        }
      }
      ref.invalidate(productsProvider);
      ref.read(syncControllerProvider.notifier).syncNow(); // refresh local cache
      navigator.pop(true);
      messenger.showSnackBar(SnackBar(content: Text(_isEdit ? 'Product updated' : 'Product added')));
    } catch (e) {
      if (mounted) setState(() { _saving = false; _error = apiError(e); });
    }
  }

  Future<void> _confirmDelete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete product?'),
        content: Text('Remove "${widget.product!.name}"? This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() { _saving = true; _error = null; });
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await deleteProduct(ref, widget.product!.id);
      ref.invalidate(productsProvider);
      ref.read(syncControllerProvider.notifier).syncNow();
      navigator.pop(true);
      messenger.showSnackBar(const SnackBar(content: Text('Product deleted')));
    } catch (e) {
      if (mounted) setState(() { _saving = false; _error = apiError(e); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(categoriesProvider).valueOrNull ?? const [];
    final canImage = planAllows(ref, Feat.productImages);
    return Scaffold(
      appBar: AppBar(title: Text(_isEdit ? 'Edit product' : 'Add product')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (canImage) ...[
            _PhotoPicker(
              picked: _pickedImage,
              existingUrl: widget.product?.imageUrl,
              onTap: _pickImage,
            ),
            const SizedBox(height: 16),
          ],
          _field(_name, 'Product name'),
          _field(_price, 'Selling price', number: true, prefix: 'KES '),
          _field(_cost, 'Capital price (cost)', number: true, prefix: 'KES '),
          AppSelect<int>(
            label: 'Category',
            hint: 'Choose category',
            value: _categoryId,
            searchable: categories.length > 8,
            options: [
              const SelectOption('No category', null),
              ...categories.map((c) => SelectOption(c.name, c.id)),
              const SelectOption('+ New category', _kNewCategory,
                  leading: Icon(Icons.add, color: AppColors.brand)),
            ],
            onChanged: (v) {
              if (v == _kNewCategory) {
                _createCategoryInline();
              } else {
                setState(() => _categoryId = v);
              }
            },
          ),
          const SizedBox(height: 12),
          _field(_sku, 'SKU (optional)'),
          _field(_barcode, 'Barcode (optional)', scan: true),
          if (!_isEdit) _field(_stock, 'Initial stock (optional)', number: true),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 16),
          FilledButton(
            style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(_isEdit ? 'Save changes' : 'Add product'),
          ),
          if (_isEdit) ...[
            const SizedBox(height: 8),
            TextButton.icon(
              icon: Icon(Icons.delete_outline, color: Theme.of(context).colorScheme.error),
              label: Text('Delete product', style: TextStyle(color: Theme.of(context).colorScheme.error)),
              onPressed: _saving ? null : _confirmDelete,
            ),
          ],
        ],
      ),
    );
  }

  Widget _field(TextEditingController c, String label, {bool number = false, String? prefix, bool scan = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: c,
        keyboardType: number ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.text,
        inputFormatters: number ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))] : null,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          isDense: true,
          prefixText: prefix,
          suffixIcon: scan
              ? IconButton(
                  icon: const Icon(Icons.qr_code_scanner),
                  onPressed: () async {
                    final code = await scanBarcode(context);
                    if (code != null) setState(() => c.text = code);
                  },
                )
              : null,
        ),
      ),
    );
  }
}

class _PhotoPicker extends StatelessWidget {
  final XFile? picked;
  final String? existingUrl;
  final VoidCallback onTap;
  const _PhotoPicker({required this.picked, required this.existingUrl, required this.onTap});

  @override
  Widget build(BuildContext context) {
    Widget content;
    if (picked != null) {
      content = Image.file(File(picked!.path), fit: BoxFit.cover);
    } else if (existingUrl != null && existingUrl!.startsWith('http')) {
      content = Image.network(existingUrl!, fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => _placeholder());
    } else {
      content = _placeholder();
    }
    return Center(
      child: GestureDetector(
        onTap: onTap,
        child: Column(
          children: [
            Container(
              width: 120,
              height: 120,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.black.withValues(alpha: 0.08)),
              ),
              child: content,
            ),
            const SizedBox(height: 8),
            Text(
              picked != null || (existingUrl != null && existingUrl!.isNotEmpty)
                  ? 'Change photo'
                  : 'Add photo',
              style: const TextStyle(color: AppColors.brand, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }

  Widget _placeholder() => Icon(Icons.add_a_photo_outlined, color: Colors.grey.shade400, size: 36);
}
