class Env {
  /// Override at build/run time: --dart-define=API_BASE_URL=https://...
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://fazistore-api.fazilabs.com',
  );

  static String get apiV1 => '$apiBaseUrl/api/v1';

  /// Keep in step with pubspec.yaml `version:`.
  static const appVersion = '0.1.0';
}
