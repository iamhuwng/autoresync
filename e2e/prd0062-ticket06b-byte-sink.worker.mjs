const EXPECTED_BYTES = 578;
const EXPECTED_SHA256 =
  '0d59c5ed76a5d7efae7056ce242583efe6b32b23cc28590dd36efb1a55082afc';

const hex = (bytes) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': 'http://localhost:5173',
          'access-control-allow-methods': 'PUT, OPTIONS',
          'access-control-allow-headers': [
            'content-type',
            'x-amz-content-sha256',
            'x-amz-meta-book-source-byte-size',
            'x-amz-meta-book-source-sha256',
          ].join(', '),
          'cache-control': 'no-store',
          vary: 'Origin',
        },
      });
    }
    if (request.method !== 'PUT') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const bytes = await request.arrayBuffer();
    const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes));
    const headers = request.headers;
    const matches = bytes.byteLength === EXPECTED_BYTES
      && sha256 === EXPECTED_SHA256
      && headers.get('content-type') === 'application/pdf'
      && headers.get('x-amz-content-sha256') === EXPECTED_SHA256
      && headers.get('x-amz-meta-book-source-byte-size') === String(EXPECTED_BYTES)
      && headers.get('x-amz-meta-book-source-sha256') === EXPECTED_SHA256;

    if (!matches) {
      return Response.json(
        { status: 'fixture_mismatch', bytes: bytes.byteLength, sha256 },
        { status: 400 },
      );
    }

    return new Response(null, {
      status: 200,
      headers: {
        'access-control-allow-origin': 'http://localhost:5173',
        'access-control-expose-headers': 'x-amz-version-id, x-bz-file-id',
        'cache-control': 'no-store',
        'x-amz-version-id': '4_version_qa_1',
        'x-bz-file-id': '4_file_qa_1',
      },
    });
  },
};
