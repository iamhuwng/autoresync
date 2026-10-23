import type {
  BookDocumentByteRange,
  BookDocumentPdfJsSource,
  BookDocumentRoute,
  BookDocumentTransport,
  BookDocumentTransportMetadata,
  BookDocumentTransportResponse,
} from '../book-delivery/bookDocumentTransport.browser';

const asStream = (bytes: Uint8Array): ReadableStream<Uint8Array> => new ReadableStream({
  start(controller) { controller.enqueue(bytes); controller.close(); },
});
const readBlob = async (blob: Blob): Promise<ArrayBuffer> => {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  if (typeof FileReader !== 'undefined') {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('local_pdf_read_failed'));
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
  }
  return new Response(blob).arrayBuffer();
};

export const inspectLocalPdfPageCount = async (file: Blob): Promise<number> => {
  const { PDFDocument } = await import('pdf-lib');
  const document = await PDFDocument.load(await readBlob(file), { updateMetadata: false });
  const pageCount = document.getPageCount();
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new Error('local_pdf_empty');
  return pageCount;
};

const etagFor = (file: Blob): string => {
  let hash = 0xcbf29ce484222325n;
  for (const character of `${file.size}:${'lastModified' in file ? String((file as File).lastModified) : '0'}:${file.type}`) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `"${hash.toString(16).padStart(64, '0')}"`;
};

const rangeBounds = (range: BookDocumentByteRange | undefined, length: number): { start: number; end: number } => {
  if (!range) return { start: 0, end: length - 1 };
  if (range.kind === 'closed') return { start: range.start, end: Math.min(range.end, length - 1) };
  if (range.kind === 'open') return { start: range.start, end: length - 1 };
  return { start: Math.max(0, length - range.suffixLength), end: length - 1 };
};

/** A local-only document transport. It has no route identity, auth, or trusted approval. */
export const createLocalBookPdfTransport = (file: Blob): BookDocumentTransport => {
  const objectUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
  let destroyed = false;
  let activeRequestCount = 0;
  const etag = etagFor(file);
  const metadata = (range: BookDocumentByteRange | undefined): BookDocumentTransportMetadata => {
    const bounds = rangeBounds(range, file.size);
    const ranged = range !== undefined;
    return {
      acceptRanges: 'bytes',
      contentLength: bounds.end - bounds.start + 1,
      contentRange: ranged ? { start: bounds.start, end: bounds.end, total: file.size } : undefined,
      contentType: 'application/pdf',
      etag,
      status: ranged ? 206 : 200,
    };
  };
  const read = async (range: BookDocumentByteRange | undefined): Promise<BookDocumentTransportResponse> => {
    if (destroyed) throw new Error('local_pdf_transport_destroyed');
    const info = metadata(range);
    const bounds = rangeBounds(range, file.size);
    activeRequestCount += 1;
    try {
      const bytes = new Uint8Array(await readBlob(file.slice(bounds.start, bounds.end + 1)));
      return { ...info, body: asStream(bytes), release: () => undefined };
    } finally {
      activeRequestCount -= 1;
    }
  };
  return {
    head: async (range) => metadata(range),
    get: read,
    ...(objectUrl ? { getPdfJsSource: async (): Promise<BookDocumentPdfJsSource> => ({ url: objectUrl, httpHeaders: {} }) } : {}),
    switchRoute: (_route: BookDocumentRoute) => undefined,
    destroy: () => { destroyed = true; if (objectUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(objectUrl); },
    get activeRequestCount() { return activeRequestCount; },
  };
};

/** Combines component PDFs locally for preview; no server identity or approval is created. */
export const createLocalComponentPdfTransport = async (
  files: Readonly<Record<string, Blob>>,
  selections: readonly { readonly sourceKey: string; readonly pages: readonly number[] }[],
): Promise<BookDocumentTransport> => {
  if (Object.keys(files).length === 0) throw new Error('local_component_pdf_missing');
  const selected = selections.length > 0 ? selections : Object.keys(files).map((sourceKey) => ({ sourceKey, pages: [] }));
  const bySource = new Map<string, number[]>();
  selected.forEach(({ sourceKey, pages }) => {
    const current = bySource.get(sourceKey) ?? [];
    pages.forEach((page) => { if (!current.includes(page)) current.push(page); });
    bySource.set(sourceKey, current);
  });
  const output = await (async () => {
    const { PDFDocument } = await import('pdf-lib');
    const document = await PDFDocument.create();
    for (const [sourceKey, selectedPages] of bySource) {
      const file = files[sourceKey];
      if (!file) throw new Error('local_component_pdf_source_missing');
      const input = await PDFDocument.load(await readBlob(file), { updateMetadata: false });
      const pages = selectedPages.length > 0 ? selectedPages : input.getPageIndices().map((page) => page + 1);
      const indexes = pages.map((page) => page - 1);
      if (indexes.some((page) => page < 0 || page >= input.getPageCount())) throw new Error('local_component_pdf_page_out_of_range');
      const copied = await document.copyPages(input, indexes);
      copied.forEach((page) => document.addPage(page));
    }
    return document.save();
  })();
  return createLocalBookPdfTransport(new Blob([new Uint8Array(output)], { type: 'application/pdf' }));
};

/*
 * Kept as a narrow compatibility helper for callers that only have ordered files.
 * New local authoring preview passes source-qualified selections above.
 */
export const createLocalComponentPdfTransportFromFiles = async (files: readonly Blob[]): Promise<BookDocumentTransport> => {
  if (files.length === 0) throw new Error('local_component_pdf_missing');
  return createLocalComponentPdfTransport(
    Object.fromEntries(files.map((file, index) => [`component-${index + 1}`, file])),
    [],
  );
};
