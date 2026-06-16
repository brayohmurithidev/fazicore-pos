# Product Variants

Variants let a single parent product (e.g. "Ankara Dress") have child SKUs that differ by one or more attributes (Size, Color, Material, etc.). Each child is tracked and sold independently with its own stock, price, and barcode.

## Data model

Variants reuse the `products` table — no extra table is needed.

| Column | Parent | Child (variant) |
|---|---|---|
| `parent_product_id` | `NULL` | FK → parent `id` |
| `attributes` | `{"options": {"Size": ["S","M","L"], "Color": ["Red","Blue"]}}` | `{"Size": "M", "Color": "Red"}` |
| `name` | "Ankara Dress" | "Ankara Dress - M / Red" |
| `sku` | "DRESS-001" | "DRESS-001-M-RED" |

Stock, price, VAT, category, and inventory records all live on the child row. The parent row's `attributes.options` is a template that drives the picker UI; it has no stock of its own.

## Backend API

Base path: `GET /api/v1/products/`

All product responses include:

```json
{
  "is_variant": false,
  "variant_count": 2,
  "variants": [
    { "id": 42, "name": "Ankara Dress - M / Red", "attributes": {"Size": "M", "Color": "Red"},
      "price": 1500.0, "sku": "DRESS-001-M-RED", "stock_quantity": 5, "is_active": true }
  ]
}
```

Child variants are excluded from `GET /products/` by default. Pass `?parents_only=true` (or let the frontend filter `is_variant == true`) to keep the list clean.

### Variant endpoints

```
GET    /products/{id}/variants            List all variants for a parent
POST   /products/{id}/variants            Create one variant manually
POST   /products/{id}/variants/generate   Generate the full attribute matrix at once
POST   /products/{id}/variants/stock      Bulk add stock across multiple variants
DELETE /products/{id}/variants/{vid}      Delete a specific variant
```

#### Manual create — `POST /{id}/variants`

```json
{
  "attributes": { "Size": "XL", "Color": "Blue" },
  "sku": "DRESS-001-XL-BLUE",
  "price": 1600.0,
  "initial_stock": 10
}
```

Omitted `price`/`cost`/`sku` fall back to the parent's values. `sku` is auto-generated as `{parent_sku}-XL-BLUE` if not provided.

#### Generate matrix — `POST /{id}/variants/generate`

```json
{
  "attributes": [
    { "name": "Size",  "values": ["S", "M", "L", "XL"] },
    { "name": "Color", "values": ["Red", "Blue"] }
  ]
}
```

Produces 8 variants (Cartesian product). Combinations that already exist are skipped — safe to call again after adding a new colour. The parent's `attributes.options` is updated with the full template.

#### Bulk stock entry — `POST /{id}/variants/stock`

```json
{
  "entries": [
    { "variant_id": 42, "qty": 10 },
    { "variant_id": 43, "qty": 5 }
  ],
  "notes": "June shipment"
}
```

Adds (not sets) stock to each variant via `TransactionType.PURCHASE`. Entries with `qty: 0` are silently skipped. Returns 204. All variant_ids must belong to the given parent or the request fails with 404.

### Name and SKU derivation

| Input | Result |
|---|---|
| Parent name `"Ankara Dress"`, attrs `{Size: M, Color: Red}` | `"Ankara Dress - M / Red"` (keys sorted alphabetically) |
| Parent SKU `"DRESS-001"`, attrs `{Size: M, Color: Red}` | `"DRESS-001-COLOR-SIZE"` → `"DRESS-001-M-RED"` |

### Inventory

Each variant has its own inventory rows. `stock_quantity` on `ProductVariantOut` is computed at query time by summing inventory rows for the branch in scope (or all branches for admins).

## Web frontend (`InventoryPage`)

**Defining variants** — open the product detail pane → scroll to the *Variants* section → enter attribute names and values → click **Generate**. The generate call builds all combinations server-side; the UI refreshes with the new list showing stock and price per variant.

Individual variants can be added manually or deleted from the same section. The product list shows a `{n}v` badge (indigo) next to variant-parent names.

**Bulk stock entry** — once variants exist, a **Stock Entry** button (green, next to Generate) opens `VariantStockGrid` inline:

- **2-attribute products** (e.g. Size × Color): renders a matrix — rows are the first attribute, columns are the second. Current stock is shown colour-coded (red/amber/green) above each input cell. Missing combinations (no variant for that pair) show `—`.
- **1 or 3+ attributes**: renders a flat list with one row per variant.

Inputs represent qty *to add*, not an absolute set — safe to submit multiple times across a shipment. The Save button is disabled until at least one input is non-zero and shows a running count (`Save (5)`) before submission. On success, both the variant list and the parent product card refresh via TanStack Query invalidation.

**Selling** — the POS product grid filters out `is_variant == true` rows so only parent products appear. Clicking a tile with `variantCount > 0` opens `VariantPickerModal` instead of adding directly to cart.

The modal uses cascading attribute selection:

1. Each attribute key is rendered as a row of chip buttons.
2. `getAvailableValues(key)` filters the variant list against already-selected keys — only reachable combinations are shown.
3. Out-of-stock combinations are disabled with `line-through` styling.
4. On confirm the modal synthesises a `Product` object from the selected variant and calls `addToCart()`.

Relevant files:
- `frontend/src/pages/inventory/InventoryPage.tsx` — `ProductVariantsSection` + `VariantStockGrid` components
- `frontend/src/pages/pos/POSPage.tsx` — `VariantPickerModal` component
- `frontend/src/lib/queries.ts` — `useProductVariants`, `useGenerateVariants`, `useCreateVariant`, `useDeleteVariant`, `useBulkVariantStock` hooks

## Mobile app (`sell_screen.dart`)

The mobile app avoids Drift schema changes by storing variant metadata as a JSON blob in `SyncMeta` under the key `variant_meta`.

### Sync (`sync_engine.dart → _pullProducts`)

1. All product pages are fetched and accumulated.
2. Child variants (`parent_product_id != null`) are filtered **out** of the Drift `local_products` table — only parents are cached there.
3. Variant metadata is written to `SyncMeta`:

```json
{
  "has_variants": [101, 205],
  "variants": {
    "101": [
      { "id": 42, "name": "Ankara Dress - M / Red", "attributes": {"Size":"M","Color":"Red"},
        "price": 1500.0, "stock_quantity": 5 }
    ]
  }
}
```

### Sell screen

`variantMetaProvider` (`catalog_providers.dart`) reads `variant_meta` from `SyncMeta` and exposes:

```dart
class _VariantMeta {
  final Set<int> hasVariants;              // parent product IDs that have variants
  final Map<int, List<Map>> variants;      // parent ID → list of variant maps
}
```

Both `_ProductGrid` and `_ProductList` check `variantMeta.hasVariants.contains(p.id)` and render a small `v` chip badge on matching tiles.

Tapping any product calls `_onProductTap`. If the product has variants, `_VariantPickerSheet` is shown as a `DraggableScrollableSheet`; otherwise the product is added to cart directly.

### `_VariantPickerSheet`

- `_keysFor()` — collects all attribute keys from the variant list.
- `_valuesFor(key)` — filters variants by already-selected attributes and returns distinct values for `key`. This is the cascading logic: selecting Size=M automatically narrows Color choices to only those in stock in M.
- `_inStock(key, val)` — checks that at least one variant matching the trial selection has `stock_quantity > 0`.
- Out-of-stock values: `TextDecoration.lineThrough`, `Colors.grey.shade300`, non-tappable.
- `_chosenVariant` — resolves to the specific variant map once all keys are selected.
- `_confirm()` — constructs a `LocalProduct` from the chosen variant and calls `cartProvider.notifier.add()`.

## Constraints and edge cases

- **No nested variants.** `_get_parent_or_404` returns HTTP 400 if the target product is itself a variant.
- **Duplicate generation is idempotent.** `generate_variants` compares the attribute tuples of existing children and skips already-created combinations.
- **Deleting a variant** hard-deletes the row. If the variant has been referenced in historical orders those order lines keep the product_id but the product will no longer resolve — this is the same behaviour as deleting any product. Soft-delete (setting `is_active = false`) via `PATCH /{id}` is preferred for variants that have sales history.
- **Mobile sync order matters.** The sell screen reads `variantMetaProvider` lazily; if sync has not run yet, `variantMeta` is `null` and all products are treated as simple (no picker). A sync from the *More* tab is required after the first login.
- **Stock shown in picker** is from the last sync snapshot, not live. Prompt the cashier to sync before a busy shift to avoid stale stock numbers.
