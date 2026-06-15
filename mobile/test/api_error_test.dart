import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fazipos_mobile/core/api_client.dart';

DioException _dioError({
  int? statusCode,
  dynamic data,
  DioExceptionType type = DioExceptionType.badResponse,
  String? message,
}) =>
    DioException(
      requestOptions: RequestOptions(path: '/test'),
      response: statusCode != null
          ? Response(
              requestOptions: RequestOptions(path: '/test'),
              statusCode: statusCode,
              data: data,
            )
          : null,
      type: type,
      message: message,
    );

void main() {
  group('apiError()', () {
    test('extracts string detail from response body', () {
      final e = _dioError(statusCode: 400, data: {'detail': 'Product not found'});
      expect(apiError(e), 'Product not found');
    });

    test('extracts detail from 422 validation error', () {
      final e = _dioError(statusCode: 422, data: {'detail': 'Invalid phone number'});
      expect(apiError(e), 'Invalid phone number');
    });

    test('returns connection message on connectionError', () {
      final e = _dioError(type: DioExceptionType.connectionError);
      expect(apiError(e), contains('Cannot reach the server'));
    });

    test('returns connection message on connectionTimeout', () {
      final e = _dioError(type: DioExceptionType.connectionTimeout);
      expect(apiError(e), contains('Cannot reach the server'));
    });

    test('falls back to dio message when no detail', () {
      final e = _dioError(statusCode: 500, data: {}, message: 'Internal Server Error');
      expect(apiError(e), 'Internal Server Error');
    });

    test('falls back to toString for non-Dio errors', () {
      expect(apiError(Exception('unexpected')), contains('unexpected'));
    });

    test('handles null detail gracefully', () {
      final e = _dioError(statusCode: 400, data: {'detail': null}, message: 'Bad Request');
      expect(apiError(e), isNotEmpty);
    });
  });
}
