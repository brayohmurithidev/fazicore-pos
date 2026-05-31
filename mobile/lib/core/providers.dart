import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'secure_store.dart';

final secureStoreProvider = Provider<SecureStore>((ref) => SecureStore());

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(ref.read(secureStoreProvider)),
);
