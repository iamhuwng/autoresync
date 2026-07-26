import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number.parseInt(process.env.PRD0062_TICKET06B_SINK_PORT ?? '5186', 10);
const expectedSha256 = process.env.PRD0062_TICKET06B_EXPECTED_SHA256 ?? '';
const expectedBytes = Number.parseInt(
  process.env.PRD0062_TICKET06B_EXPECTED_BYTES ?? '0',
  10,
);

const corsHeaders = {
  'access-control-allow-origin': 'http://localhost:5173',
  'access-control-expose-headers': 'x-amz-version-id, x-bz-file-id',
  'cache-control': 'no-store',
  vary: 'Origin',
};

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      ...corsHeaders,
      'access-control-allow-methods': 'PUT, OPTIONS',
      'access-control-allow-headers': [
        'content-type',
        'x-amz-content-sha256',
        'x-amz-meta-book-source-byte-size',
        'x-amz-meta-book-source-sha256',
      ].join(', '),
    });
    response.end();
    return;
  }

  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.byteLength;
    hash.update(chunk);
  }
  const sha256 = hash.digest('hex');
  const proof = {
    method: request.method,
    bytes,
    sha256,
    contentType: request.headers['content-type'],
    signedSha256: request.headers['x-amz-content-sha256'],
    metadataBytes: request.headers['x-amz-meta-book-source-byte-size'],
    metadataSha256: request.headers['x-amz-meta-book-source-sha256'],
  };
  process.stdout.write(`${JSON.stringify(proof)}\n`);

  if (
    request.method !== 'PUT'
    || bytes !== expectedBytes
    || sha256 !== expectedSha256
    || proof.contentType !== 'application/pdf'
    || proof.signedSha256 !== expectedSha256
    || proof.metadataBytes !== String(expectedBytes)
    || proof.metadataSha256 !== expectedSha256
  ) {
    response.writeHead(400, {
      ...corsHeaders,
      'content-type': 'application/json',
    });
    response.end(JSON.stringify({ status: 'fixture_mismatch' }));
    return;
  }

  response.writeHead(200, {
    ...corsHeaders,
    'content-length': '0',
    'x-amz-version-id': '4_version_qa_1',
    'x-bz-file-id': '4_file_qa_1',
  });
  response.end();
});

server.listen(port, 'localhost', () => {
  process.stdout.write(`ticket06b-byte-sink listening http://localhost:${port}\n`);
});
