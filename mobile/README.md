# FaziPOS Mobile (Flutter · Android)

Phase 1 companion app. The `lib/` source and `pubspec.yaml` are committed; the
Android platform folder is generated locally (not committed) so the repo stays lean.

## First-time setup

Requires the Flutter SDK (https://docs.flutter.dev/get-started/install).

```bash
cd mobile

# Generate the Android platform scaffold around the existing lib/ + pubspec.yaml.
# (Safe: flutter create does not overwrite existing source files.)
flutter create --platforms=android --org com.fazicore .

flutter pub get
```

## Run / build

```bash
# Run on a connected device/emulator against production API (default)
flutter run

# Point at a different API (e.g. local backend)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8001

# Release APK
flutter build apk --release --dart-define=API_BASE_URL=https://fazistore-api.fazilabs.com
```

The default API base URL is `https://fazistore-api.fazilabs.com` (see `lib/core/env.dart`).
Override at build/run time with `--dart-define=API_BASE_URL=...`.

## Structure
```
lib/
  main.dart                     app entry (ProviderScope)
  app.dart                      MaterialApp.router + theme
  router.dart                   go_router + auth redirect
  core/
    env.dart                    API base URL (dart-define)
    secure_store.dart           token + slug storage
    api_client.dart             Dio + JWT/X-Org-Slug interceptors + refresh
    providers.dart              shared Riverpod providers
    format.dart                 KES currency helper
  features/
    auth/    models, repository, controller, login_screen
    dashboard/  repository, dashboard_screen
```

See `PLAN.md` for the full roadmap.
