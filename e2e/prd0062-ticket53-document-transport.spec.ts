import { expect, test, type Page } from '@playwright/test';

const etag = `"${'c'.repeat(64)}"`;
const documentUrl = 'https://worker.example/v1/book-delivery/document/opaque-ticket53';
const fullBytes = new TextEncoder().encode('%PDF-ticket53');
const totalBytes = fullBytes.byteLength;

const rangeFor = (value: string | undefined) => {
  if (!value) return { status: 200, body: fullBytes, headers: {} };
  if (value === 'bytes=0-3') {
    return {
      status: 206,
      body: fullBytes.slice(0, 4),
      headers: { 'content-range': `bytes 0-3/${totalBytes}` },
    };
  }
  if (value === 'bytes=4-') {
    return {
      status: 206,
      body: fullBytes.slice(4),
      headers: { 'content-range': `bytes 4-${totalBytes - 1}/${totalBytes}` },
    };
  }
  if (value === 'bytes=-4') {
    return {
      status: 206,
      body: fullBytes.slice(totalBytes - 4),
      headers: { 'content-range': `bytes ${totalBytes - 4}-${totalBytes - 1}/${totalBytes}` },
    };
  }
  return {
    status: 416,
    body: new Uint8Array(),
    headers: { 'content-range': `bytes */${totalBytes}` },
  };
};

const runFixture = async (page: Page, port: 5173 | 5174) => {
  const requests: Array<{
    authorization: string | null;
    method: string;
    range: string | null;
    url: string;
  }> = [];
  let firstRangeExpired = true;

  await page.route(documentUrl, async (route) => {
    const request = route.request();
    const authorization = request.headers().authorization ?? null;
    const range = request.headers().range;
    requests.push({
      authorization,
      method: request.method(),
      range: range ?? null,
      url: request.url(),
    });
    if (
      firstRangeExpired
      && request.method() === 'GET'
      && range === 'bytes=0-3'
      && authorization === 'Bearer token-1'
    ) {
      firstRangeExpired = false;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'unauthorized' }),
        headers: {
          'access-control-allow-origin': `http://localhost:${port}`,
          'cache-control': 'no-store',
        },
      });
      return;
    }

    const resolved = request.method() === 'HEAD'
      ? { status: 200, body: new Uint8Array(), headers: {} }
      : rangeFor(range);
    await route.fulfill({
      status: resolved.status,
      body: Buffer.from(resolved.body),
      headers: {
        'accept-ranges': 'bytes',
        'access-control-allow-origin': `http://localhost:${port}`,
        'access-control-expose-headers': 'accept-ranges, content-length, content-range, content-type, etag',
        'cache-control': 'private, no-store',
        'content-length': String(resolved.body.byteLength || totalBytes),
        'content-type': 'application/pdf',
        etag,
        ...resolved.headers,
      },
    });
  });

  await page.goto(`http://localhost:${port}/`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  const result = await page.evaluate(async ({ documentUrl: url, expectedEtag }) => {
    const module = await import('/src/services/book-delivery/bookDocumentTransport.browser.ts');
    const tokenCalls: boolean[] = [];
    const read = async (body: ReadableStream<Uint8Array>) => {
      const reader = body.getReader();
      let length = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.byteLength;
      }
      return length;
    };
    const plain = (value: {
      contentLength: number;
      contentRange?: { start: number; end: number; total: number };
      status: number;
    }) => ({
      contentLength: value.contentLength,
      contentRange: value.contentRange ?? null,
      status: value.status,
    });
    const transport = module.createBookDocumentTransport({
      route: {
        url,
        sourceVersionId: 'source-v1',
        expectedByteLength: 13,
        expectedEtag,
        physicalPageNumber: 1,
      },
      getIdToken: async (forceRefresh = false) => {
        tokenCalls.push(forceRefresh);
        return forceRefresh ? 'token-2' : 'token-1';
      },
    });

    const head = await transport.head();
    const closed = await transport.get({ kind: 'closed', start: 0, end: 3 });
    const closedBytes = await read(closed.body);
    const open = await transport.get({ kind: 'open', start: 4 });
    await open.body.getReader().cancel('ticket53-cancel');
    const suffix = await transport.get({ kind: 'suffix', suffixLength: 4 });
    const suffixBytes = await read(suffix.body);

    return {
      activeRequestCount: transport.activeRequestCount,
      closed: plain(closed),
      closedBytes,
      head: plain(head),
      href: location.href,
      open: plain(open),
      storageLeak:
        JSON.stringify(localStorage)
        + JSON.stringify(sessionStorage),
      suffix: plain(suffix),
      suffixBytes,
      tokenCalls,
    };
  }, { documentUrl, expectedEtag: etag });

  expect(result.href).toBe(`http://localhost:${port}/`);
  expect(result.head).toEqual({ contentLength: totalBytes, contentRange: null, status: 200 });
  expect(result.closed).toEqual({
    contentLength: 4,
    contentRange: { start: 0, end: 3, total: totalBytes },
    status: 206,
  });
  expect(result.open).toEqual({
    contentLength: totalBytes - 4,
    contentRange: { start: 4, end: totalBytes - 1, total: totalBytes },
    status: 206,
  });
  expect(result.suffix).toEqual({
    contentLength: 4,
    contentRange: { start: totalBytes - 4, end: totalBytes - 1, total: totalBytes },
    status: 206,
  });
  expect(result.closedBytes).toBe(4);
  expect(result.suffixBytes).toBe(4);
  expect(result.activeRequestCount).toBe(0);
  expect(result.tokenCalls).toEqual([false, false, true, false, false]);
  expect(result.storageLeak).not.toMatch(/token-|opaque-ticket53|%PDF/u);
  expect(requests).toEqual([
    { authorization: 'Bearer token-1', method: 'HEAD', range: null, url: documentUrl },
    { authorization: 'Bearer token-1', method: 'GET', range: 'bytes=0-3', url: documentUrl },
    { authorization: 'Bearer token-2', method: 'GET', range: 'bytes=0-3', url: documentUrl },
    { authorization: 'Bearer token-1', method: 'GET', range: 'bytes=4-', url: documentUrl },
    { authorization: 'Bearer token-1', method: 'GET', range: 'bytes=-4', url: documentUrl },
  ]);
  for (const request of requests) {
    expect(request.url).not.toMatch(/[?#]|backblaze|X-Amz|token/u);
  }
};

for (const port of [5173, 5174] as const) {
  test(`ticket 53 browser transport fixture on localhost:${port}`, async ({ page }) => {
    await runFixture(page, port);
  });
}
