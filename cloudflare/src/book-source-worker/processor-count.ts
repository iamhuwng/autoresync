import type {
  BookSourceVersionStorageIdentity,
} from '../../../src/types/bookSource.types.ts';
import type {
  SourceProviderPort,
  SourceProviderRequestOptions,
} from '../../../src/services/book-source-delivery/sourceProvider.port.ts';
import { runBookSourceProcessorBeforeDeadline } from './processor-deadline';

const PDF_RANGE_CHUNK_BYTES = 1024 * 1024;
const LARGE_PDF_FALLBACK_THRESHOLD_BYTES = 16 * 1024 * 1024;
const LARGE_PDF_FALLBACK_CHUNK_BYTES = 4 * 1024 * 1024;
const STRUCTURAL_WINDOW_BYTES = 65_536;
const MAX_STRUCTURAL_WINDOWS = 16;
const MAX_STRUCTURAL_XREF_SECTIONS = 8;
const MAX_STRUCTURAL_XREF_BYTES = 256 * 1024;
const MAX_STRUCTURAL_PAGES_NODES = 64;
const MAX_STRUCTURAL_OBJECT_SCAN_BYTES = 65_536;
/** Parser safety only; product byte/page authorization lives at its caller. */
const MAX_SOURCE_PAGES = 2_000;
const STABLE_PROCESSOR_ERRORS = new Set([
  'book_source_original_integrity_invalid',
  'book_source_processor_cancelled',
  'book_source_processor_configuration_invalid',
  'book_source_processor_pdf_invalid',
  'book_source_processor_pdf_page_count_invalid',
  'book_source_processor_pdf_password_required',
  'book_source_processor_range_budget_exceeded',
  'book_source_processor_range_invalid',
  'book_source_processor_timed_out',
]);
const FATAL_STRUCTURAL_ERRORS = new Set([
  'book_source_original_integrity_invalid',
  'book_source_processor_cancelled',
  'book_source_processor_pdf_invalid',
  'book_source_processor_range_budget_exceeded',
  'book_source_processor_range_invalid',
  'book_source_processor_timed_out',
]);

if (!Reflect.has(globalThis, 'DOMMatrix')) {
  class CountOnlyDOMMatrix {
    readonly a = 1;
    readonly b = 0;
    readonly c = 0;
    readonly d = 1;
    readonly e = 0;
    readonly f = 0;

    constructor(initial?: unknown) {
      if (initial !== undefined) throw new Error('book_source_processor_count_geometry_unsupported');
    }
  }
  Reflect.set(globalThis, 'DOMMatrix', CountOnlyDOMMatrix);
}

let cachedPdfjsPromise: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | undefined;
const loadPdfjs = () => {
  cachedPdfjsPromise ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
    import('pdfjs-dist/legacy/build/pdf.mjs'),
  ]).then(([, pdfjs]) => pdfjs);
  return cachedPdfjsPromise;
};

export interface BookSourcePdfCountInput {
  readonly provider: Pick<SourceProviderPort, 'readBounded'>;
  readonly identity: BookSourceVersionStorageIdentity;
  readonly byteSize: number;
  readonly deadlineAt: number;
  readonly maxRangeBytes: number;
  readonly maxRangeRequests: number;
  readonly maxAggregateBytes: number;
  readonly assertNotCancelled: () => Promise<void>;
  readonly signal?: AbortSignal;
  readonly deferCleanup?: (promise: Promise<unknown>) => void;
}

export interface BookSourcePdfCountResult {
  readonly pageCount: number;
  readonly bytesRead: number;
  readonly rangeRequests: number;
}

const normalizePdfFailure = (error: unknown): Error => {
  const source = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  const name = typeof source?.name === 'string' ? source.name : '';
  const code = typeof source?.code === 'string' ? source.code : '';
  if (code === 'aborted') return new Error('book_source_processor_cancelled');
  if (code === 'timeout') return new Error('book_source_processor_timed_out');
  if (code === 'metadata_mismatch' || code === 'provider_drift') {
    return new Error('book_source_original_integrity_invalid');
  }
  if (name === 'PasswordException') return new Error('book_source_processor_pdf_password_required');
  if (name === 'InvalidPDFException' || name === 'MissingPDFException'
    || name === 'FormatError' || name === 'ResponseException') {
    return new Error('book_source_processor_pdf_invalid');
  }
  if (error instanceof Error && STABLE_PROCESSOR_ERRORS.has(error.message)) return error;
  return new Error('book_source_processor_pdf_count_failed');
};

const sameContentIdentity = (
  left: BookSourceVersionStorageIdentity | undefined,
  right: BookSourceVersionStorageIdentity,
): boolean => left?.bookId === right.bookId
  && left.sourceVersionId === right.sourceVersionId
  && left.storageLocationId === right.storageLocationId
  && left.providerKind === right.providerKind
  && left.privateBucketId === right.privateBucketId
  && left.providerObjectKey === right.providerObjectKey
  && left.providerFileId === right.providerFileId
  && left.providerFileVersionId === right.providerFileVersionId
  && left.byteSize === right.byteSize
  && left.checksum.algorithm === right.checksum.algorithm
  && left.checksum.value === right.checksum.value;

const readProviderRange = async (
  input: BookSourcePdfCountInput,
  begin: number,
  length: number,
  signal: AbortSignal,
  remainingMs: number,
) => {
  const options: SourceProviderRequestOptions = {
    signal,
    timeoutMs: remainingMs,
    deadlineAt: input.deadlineAt,
  };
  const result = await input.provider.readBounded({
    identity: input.identity,
    range: { offset: begin, length },
  }, options);
  if (!sameContentIdentity(result.contentIdentity, input.identity)
    || result.totalByteSize !== input.byteSize
    || result.offset !== begin
    || result.bytes.byteLength !== length) {
    throw new Error('book_source_original_integrity_invalid');
  }
  return result.bytes;
};

const bytesToLatin1 = (bytes: Uint8Array): string => {
  let result = '';
  const chunk = 16_384;
  for (let offset = 0; offset < bytes.byteLength; offset += chunk) {
    const slice = bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunk));
    result += String.fromCharCode(...slice);
  }
  return result;
};

const extractBalancedDict = (text: string, startIndex: number): { readonly dict: string; readonly endIndex: number } | null => {
  const open = text.indexOf('<<', startIndex);
  if (open < 0) return null;
  let depth = 0;
  let inString = 0;
  let inComment = false;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inComment) {
      if (ch === '\n' || ch === '\r') inComment = false;
      continue;
    }
    if (inString > 0) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === '(') inString += 1;
      else if (ch === ')') inString -= 1;
      continue;
    }
    if (ch === '%') {
      inComment = true;
      continue;
    }
    if (ch === '(') {
      inString = 1;
      continue;
    }
    if (ch === '<' && text[i + 1] === '<') {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === '>' && text[i + 1] === '>') {
      depth -= 1;
      i += 1;
      if (depth === 0) {
        return { dict: text.slice(open, i + 1), endIndex: i + 1 };
      }
    }
  }
  return null;
};

interface PdfIndirectRef {
  readonly num: number;
  readonly gen: number;
}

const parseRefMatch = (dict: string, key: string): PdfIndirectRef | null => {
  const match = new RegExp(`/${key}\\s+(\\d+)\\s+(\\d+)\\s+R\\b`, 'u').exec(dict);
  if (!match) return null;
  const num = Number(match[1]);
  const gen = Number(match[2]);
  if (!Number.isSafeInteger(num) || num <= 0 || !Number.isSafeInteger(gen) || gen < 0) return null;
  return { num, gen };
};

const parseDirectInt = (dict: string, key: string): number | null => {
  const match = new RegExp(`/${key}\\s+(\\d+)(?!\\s+\\d+\\s+R\\b)\\b`, 'u').exec(dict);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
};

const parseKidsArray = (dict: string): readonly PdfIndirectRef[] | null => {
  const match = /\/Kids\s*\[([^\[\]]*)\]/u.exec(dict);
  if (!match) return null;
  const body = match[1]!.trim();
  if (!body) return [];
  const refs: PdfIndirectRef[] = [];
  let cursor = 0;
  const pattern = /(\d+)\s+(\d+)\s+R/gu;
  for (const entry of body.matchAll(pattern)) {
    const gap = body.slice(cursor, entry.index).trim();
    if (gap.length > 0) return null;
    const num = Number(entry[1]);
    const gen = Number(entry[2]);
    if (!Number.isSafeInteger(num) || num <= 0 || !Number.isSafeInteger(gen) || gen < 0) return null;
    refs.push({ num, gen });
    cursor = entry.index + entry[0].length;
  }
  if (body.slice(cursor).trim().length > 0) return null;
  return refs;
};

const isPageTypeDict = (dict: string): boolean => /\/Type\s*\/Page(?![A-Za-z0-9_])/u.test(dict);
const isPagesTypeDict = (dict: string): boolean => /\/Type\s*\/Pages(?![A-Za-z0-9_])/u.test(dict);

interface CachedWindow {
  readonly begin: number;
  readonly end: number;
  readonly bytes: Uint8Array;
}

const tryCountClassicPdfPages = async (
  input: BookSourcePdfCountInput,
  windowBytes: number,
  fetchBounded: (begin: number, length: number) => Promise<Uint8Array>,
): Promise<number | null> => {
  const windows: CachedWindow[] = [];

  const readSpan = async (
    begin: number,
    length: number,
    minCachedBytes = length,
  ): Promise<Uint8Array> => {
    const clampedBegin = Math.max(0, Math.min(begin, input.byteSize));
    const clampedEnd = Math.min(input.byteSize, clampedBegin + length);
    const clampedLength = clampedEnd - clampedBegin;
    if (clampedLength <= 0) return new Uint8Array(0);
    const requiredCachedEnd = Math.min(clampedEnd, clampedBegin + Math.max(1, minCachedBytes));
    for (const win of windows) {
      if (clampedBegin >= win.begin && requiredCachedEnd <= win.end) {
        return win.bytes.subarray(clampedBegin - win.begin, Math.min(clampedEnd, win.end) - win.begin);
      }
    }
    const fetchLength = Math.min(windowBytes, input.byteSize - clampedBegin);
    const bytes = await fetchBounded(clampedBegin, fetchLength);
    if (windows.length >= MAX_STRUCTURAL_WINDOWS) windows.shift();
    windows.push({ begin: clampedBegin, end: clampedBegin + bytes.byteLength, bytes });
    return bytes.subarray(0, Math.min(clampedLength, bytes.byteLength));
  };

  const readMultiWindowSpan = async (begin: number, maxLength: number): Promise<Uint8Array> => {
    const targetEnd = Math.min(input.byteSize, begin + maxLength);
    if (targetEnd <= begin) return new Uint8Array(0);
    const first = await readSpan(begin, Math.min(windowBytes, targetEnd - begin));
    if (begin + first.byteLength >= targetEnd) return first;
    const parts: Uint8Array[] = [first];
    let cursor = begin + first.byteLength;
    while (cursor < targetEnd) {
      const next = await readSpan(cursor, Math.min(windowBytes, targetEnd - cursor));
      if (next.byteLength === 0) break;
      parts.push(next);
      cursor += next.byteLength;
    }
    const combined = new Uint8Array(cursor - begin);
    let offset = 0;
    for (const part of parts) {
      combined.set(part, offset);
      offset += part.byteLength;
    }
    return combined;
  };

  // 1. Validate PDF header in the first 1024 bytes.
  const head = await readSpan(0, Math.min(windowBytes, input.byteSize));
  const headText = bytesToLatin1(head.subarray(0, Math.min(1024, head.byteLength)));
  if (!/%PDF-(?:1\.[0-7]|2\.0)/u.test(headText)) {
    throw new Error('book_source_processor_pdf_invalid');
  }

  // 2. Read tail window and locate the final startxref offset.
  const tailBegin = Math.max(0, input.byteSize - windowBytes);
  const tail = await readSpan(tailBegin, input.byteSize - tailBegin);
  const tailText = bytesToLatin1(tail);
  const startxrefMatches = [...tailText.matchAll(/startxref\s+(\d+)\s+%%EOF/gu)];
  const lastStartxref = startxrefMatches.at(-1);
  if (!lastStartxref) return null;
  let currentXrefOffset: number | null = Number(lastStartxref[1]);
  if (!Number.isSafeInteger(currentXrefOffset) || currentXrefOffset <= 0 || currentXrefOffset >= input.byteSize) {
    return null;
  }

  // 3. Walk classic xref + trailer chain (newest-first via /Prev).
  const xrefOffsets = new Map<number, number | null>();
  const visitedXref = new Set<number>();
  let rootRef: PdfIndirectRef | null = null;

  for (let section = 0; section < MAX_STRUCTURAL_XREF_SECTIONS && currentXrefOffset !== null; section += 1) {
    if (visitedXref.has(currentXrefOffset)) return null;
    visitedXref.add(currentXrefOffset);

    let xrefChunk = await readSpan(currentXrefOffset, windowBytes, 4096);
    let xrefText = bytesToLatin1(xrefChunk);
    const trimmedStart = xrefText.search(/\S/u);
    if (trimmedStart < 0 || !/^xref(?:\s|$)/u.test(xrefText.slice(trimmedStart))) {
      return null;
    }
    let trailerPos = xrefText.indexOf('trailer', trimmedStart + 4);
    let trailerDictResult = trailerPos >= 0 ? extractBalancedDict(xrefText, trailerPos + 7) : null;
    if (!trailerDictResult && currentXrefOffset + xrefChunk.byteLength < input.byteSize) {
      xrefChunk = await readMultiWindowSpan(currentXrefOffset, MAX_STRUCTURAL_XREF_BYTES);
      xrefText = bytesToLatin1(xrefChunk);
      trailerPos = xrefText.indexOf('trailer', trimmedStart + 4);
      trailerDictResult = trailerPos >= 0 ? extractBalancedDict(xrefText, trailerPos + 7) : null;
    }
    if (trailerPos < 0 || !trailerDictResult) return null;

    const trailerDict = trailerDictResult.dict;
    if (/\/Encrypt\b/u.test(trailerDict) || /\/XRefStm\b/u.test(trailerDict)) {
      return null;
    }
    if (!rootRef) {
      rootRef = parseRefMatch(trailerDict, 'Root');
    }

    // Parse classic xref subsections between 'xref' and 'trailer'.
    const tableBody = xrefText.slice(trimmedStart + 4, trailerPos);
    const lines = tableBody.split(/\r\n|\r|\n/u);
    let lineIndex = 0;
    let parsedAnySubsection = false;
    while (lineIndex < lines.length) {
      const headerLine = lines[lineIndex]!.trim();
      lineIndex += 1;
      if (!headerLine) continue;
      const headerMatch = /^(\d+)\s+(\d+)$/u.exec(headerLine);
      if (!headerMatch) return null;
      const startObj = Number(headerMatch[1]);
      const count = Number(headerMatch[2]);
      if (!Number.isSafeInteger(startObj) || !Number.isSafeInteger(count) || count < 0 || count > 200_000) {
        return null;
      }
      parsedAnySubsection = true;
      let parsedEntries = 0;
      while (parsedEntries < count && lineIndex < lines.length) {
        const entryLine = lines[lineIndex]!.trim();
        lineIndex += 1;
        if (!entryLine) continue;
        const entryMatch = /^(\d{10})\s+(\d{5})\s+([nf])$/u.exec(entryLine);
        if (!entryMatch) return null;
        const objNum = startObj + parsedEntries;
        if (!xrefOffsets.has(objNum)) {
          const offset = Number(entryMatch[1]);
          xrefOffsets.set(objNum, entryMatch[3] === 'n' && offset > 0 && offset < input.byteSize ? offset : null);
        }
        parsedEntries += 1;
      }
      if (parsedEntries !== count) return null;
    }
    if (!parsedAnySubsection) return null;

    const prevOffset = parseDirectInt(trailerDict, 'Prev');
    if (prevOffset !== null) {
      if (prevOffset <= 0 || prevOffset >= input.byteSize) return null;
      currentXrefOffset = prevOffset;
    } else {
      currentXrefOffset = null;
    }
  }
  if (currentXrefOffset !== null || !rootRef) return null;

  const readObjectDict = async (ref: PdfIndirectRef): Promise<string | null> => {
    const offset = xrefOffsets.get(ref.num);
    if (offset === undefined || offset === null) return null;
    const scanLength = Math.min(MAX_STRUCTURAL_OBJECT_SCAN_BYTES, windowBytes);
    const headerPattern = new RegExp(`^\\s*${ref.num}\\s+${ref.gen}\\s+obj\\b`, 'u');
    const tryParse = (span: Uint8Array): string | null => {
      const text = bytesToLatin1(span);
      const headerMatch = headerPattern.exec(text);
      if (!headerMatch) return null;
      const dictResult = extractBalancedDict(text, headerMatch[0].length);
      return dictResult ? dictResult.dict : null;
    };
    const cachedSpan = await readSpan(offset, scanLength, 2048);
    const parsed = tryParse(cachedSpan);
    if (parsed !== null || cachedSpan.byteLength >= scanLength || offset + cachedSpan.byteLength >= input.byteSize) {
      return parsed;
    }
    return tryParse(await readSpan(offset, scanLength, scanLength));
  };

  // 4. Read Catalog and verify no XFA dynamic page tree.
  const catalogDict = await readObjectDict(rootRef);
  if (!catalogDict || !/\/Type\s*\/Catalog\b/u.test(catalogDict) || /\/XFA\b/u.test(catalogDict)) {
    return null;
  }
  const pagesRootRef = parseRefMatch(catalogDict, 'Pages');
  if (!pagesRootRef) return null;

  // 5. Walk /Pages tree without reading every leaf /Page dict in flat trees.
  const visitedNodes = new Set<string>();
  let visitedCount = 0;

  const verifyLeafPage = async (kid: PdfIndirectRef, parent: PdfIndirectRef): Promise<boolean> => {
    const pageDict = await readObjectDict(kid);
    if (!pageDict || !isPageTypeDict(pageDict)) return false;
    const parentRef = parseRefMatch(pageDict, 'Parent');
    return parentRef !== null && parentRef.num === parent.num && parentRef.gen === parent.gen;
  };

  const countPagesNode = async (
    nodeRef: PdfIndirectRef,
    expectedParent: PdfIndirectRef | null,
  ): Promise<number | null> => {
    const nodeKey = `${nodeRef.num}:${nodeRef.gen}`;
    if (visitedNodes.has(nodeKey)) return null;
    visitedNodes.add(nodeKey);
    visitedCount += 1;
    if (visitedCount > MAX_STRUCTURAL_PAGES_NODES) return null;

    const dict = await readObjectDict(nodeRef);
    if (!dict || !isPagesTypeDict(dict)) return null;
    if (expectedParent !== null) {
      const parentRef = parseRefMatch(dict, 'Parent');
      if (!parentRef || parentRef.num !== expectedParent.num || parentRef.gen !== expectedParent.gen) {
        return null;
      }
    }
    const declaredCount = parseDirectInt(dict, 'Count');
    if (declaredCount === null || declaredCount < 1 || declaredCount > MAX_SOURCE_PAGES) return null;
    const kids = parseKidsArray(dict);
    if (!kids || kids.length === 0 || kids.length > declaredCount) return null;

    const uniqueKids = new Set<string>();
    for (const kid of kids) {
      const key = `${kid.num}:${kid.gen}`;
      if (uniqueKids.has(key) || visitedNodes.has(key)) return null;
      uniqueKids.add(key);
      const kidOffset = xrefOffsets.get(kid.num);
      if (kidOffset === undefined || kidOffset === null) return null;
    }

    // Flat leaf-parent /Pages node: verify all kids exist in xref and spot-check first & last leaf /Page.
    if (kids.length === declaredCount) {
      if (!(await verifyLeafPage(kids[0]!, nodeRef))) return null;
      if (kids.length > 1 && !(await verifyLeafPage(kids[kids.length - 1]!, nodeRef))) return null;
      return declaredCount;
    }

    // Balanced/nested /Pages tree: recurse across child nodes.
    let total = 0;
    for (const kid of kids) {
      const kidDict = await readObjectDict(kid);
      if (!kidDict) return null;
      if (isPageTypeDict(kidDict)) {
        const parentRef = parseRefMatch(kidDict, 'Parent');
        if (!parentRef || parentRef.num !== nodeRef.num || parentRef.gen !== nodeRef.gen) return null;
        total += 1;
      } else if (isPagesTypeDict(kidDict)) {
        const subCount = await countPagesNode(kid, nodeRef);
        if (subCount === null) return null;
        total += subCount;
      } else {
        return null;
      }
      if (total > MAX_SOURCE_PAGES) return null;
    }
    return total === declaredCount ? total : null;
  };

  return countPagesNode(pagesRootRef, null);
};

export const countBookSourcePdfPagesFromProvider = async (
  input: BookSourcePdfCountInput,
): Promise<BookSourcePdfCountResult> => {
  const defaultChunkCap = input.byteSize > LARGE_PDF_FALLBACK_THRESHOLD_BYTES
    ? LARGE_PDF_FALLBACK_CHUNK_BYTES
    : PDF_RANGE_CHUNK_BYTES;
  const rangeChunkBytes = Math.min(defaultChunkCap, input.maxRangeBytes);
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1
    || input.identity.byteSize !== input.byteSize
    || !Number.isSafeInteger(rangeChunkBytes) || rangeChunkBytes < 65_536
    || !Number.isSafeInteger(input.maxRangeRequests) || input.maxRangeRequests < 1
    || !Number.isSafeInteger(input.maxAggregateBytes) || input.maxAggregateBytes < Math.min(STRUCTURAL_WINDOW_BYTES, input.maxRangeBytes)) {
    throw new Error('book_source_processor_configuration_invalid');
  }
  if (input.signal?.aborted) throw new Error('book_source_processor_cancelled');
  await runBookSourceProcessorBeforeDeadline(input.deadlineAt, input.assertNotCancelled);

  let rangeRequests = 0;
  let bytesRead = 0;
  let aggregateReserved = 0;
  let aborted = false;
  const requestController = new AbortController();
  const pending = new Set<Promise<void>>();
  let rejectRangeFailure: ((reason: unknown) => void) | undefined;
  const onAbort = () => {
    aborted = true;
    requestController.abort();
    rejectRangeFailure?.(new Error('book_source_processor_cancelled'));
  };
  if (input.signal?.aborted) onAbort();
  else input.signal?.addEventListener('abort', onAbort, { once: true });

  const fetchBounded = async (begin: number, length: number): Promise<Uint8Array> => {
    if (aborted || input.signal?.aborted) {
      throw new Error('book_source_processor_cancelled');
    }
    const end = begin + length;
    if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end)
      || begin < 0 || end <= begin || end > input.byteSize || length > rangeChunkBytes) {
      throw new Error('book_source_processor_range_invalid');
    }
    rangeRequests += 1;
    aggregateReserved += length;
    if (rangeRequests > input.maxRangeRequests || aggregateReserved > input.maxAggregateBytes) {
      throw new Error('book_source_processor_range_budget_exceeded');
    }

    await runBookSourceProcessorBeforeDeadline(input.deadlineAt, input.assertNotCancelled);
    const bytes = await runBookSourceProcessorBeforeDeadline(
      input.deadlineAt,
      async (remainingMs) => {
        const readPromise = readProviderRange(
          input,
          begin,
          length,
          requestController.signal,
          remainingMs,
        );
        const tracked = readPromise.then(() => undefined, () => undefined);
        pending.add(tracked);
        void tracked.finally(() => pending.delete(tracked));
        return readPromise;
      },
    );
    await runBookSourceProcessorBeforeDeadline(input.deadlineAt, input.assertNotCancelled);
    bytesRead += bytes.byteLength;
    return bytes;
  };

  let loadingTask: { readonly promise: Promise<{ readonly numPages: number; destroy(): Promise<void> }>; destroy(): Promise<void> } | undefined;
  let rangeTransport: { abort(): void } | undefined;

  try {
    // Fast-path: bounded classic-xref structural page counter (reads ~2-3 x 64 KiB windows
    // instead of scanning every leaf /Page object across a large flat-/Pages PDF).
    const structuralWindowBytes = Math.min(STRUCTURAL_WINDOW_BYTES, rangeChunkBytes);
    try {
      const fastPageCount = await tryCountClassicPdfPages(input, structuralWindowBytes, fetchBounded);
      if (fastPageCount !== null) {
        if (!Number.isSafeInteger(fastPageCount) || fastPageCount < 1 || fastPageCount > MAX_SOURCE_PAGES) {
          throw new Error('book_source_processor_pdf_page_count_invalid');
        }
        await runBookSourceProcessorBeforeDeadline(input.deadlineAt, input.assertNotCancelled);
        return { pageCount: fastPageCount, bytesRead, rangeRequests };
      }
    } catch (structuralError) {
      const normalized = normalizePdfFailure(structuralError);
      if (FATAL_STRUCTURAL_ERRORS.has(normalized.message)) {
        throw normalized;
      }
      // Non-fatal structural parsing ambiguity: fall back to PDF.js.
    }

    const { PDFDataRangeTransport, getDocument } = await runBookSourceProcessorBeforeDeadline(
      input.deadlineAt,
      async () => loadPdfjs(),
    );
    const rangeFailure = new Promise<never>((_, reject) => { rejectRangeFailure = reject; });
    if (aborted || input.signal?.aborted) {
      throw new Error('book_source_processor_cancelled');
    }

    class PrivateProviderRangeTransport extends PDFDataRangeTransport {
      requestDataRange(begin: number, end: number): void {
        const length = end - begin;
        if (aborted || input.signal?.aborted) {
          rejectRangeFailure?.(new Error('book_source_processor_cancelled'));
          return;
        }
        if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end)
          || begin < 0 || end <= begin || end > input.byteSize || length > rangeChunkBytes) {
          rejectRangeFailure?.(new Error('book_source_processor_range_invalid'));
          return;
        }
        rangeRequests += 1;
        aggregateReserved += length;
        if (rangeRequests > input.maxRangeRequests || aggregateReserved > input.maxAggregateBytes) {
          rejectRangeFailure?.(new Error('book_source_processor_range_budget_exceeded'));
          return;
        }

        const operation = (async () => {
          await runBookSourceProcessorBeforeDeadline(input.deadlineAt, input.assertNotCancelled);
          const bytes = await runBookSourceProcessorBeforeDeadline(
            input.deadlineAt,
            async (remainingMs) => readProviderRange(
              input,
              begin,
              length,
              requestController.signal,
              remainingMs,
            ),
          );
          await runBookSourceProcessorBeforeDeadline(input.deadlineAt, input.assertNotCancelled);
          bytesRead += bytes.byteLength;
          // PDF.js takes ownership of this TypedArray. Record metrics first and
          // never touch it after delivery.
          this.onDataRange(begin, bytes);
        })();
        pending.add(operation);
        void operation.then(
          () => pending.delete(operation),
          (error) => {
            pending.delete(operation);
            rejectRangeFailure?.(error);
          },
        );
      }

      abort(): void {
        aborted = true;
        requestController.abort();
      }
    }

    const range = new PrivateProviderRangeTransport(input.byteSize, null);
    rangeTransport = range;
    range.transportReady();
    loadingTask = getDocument({
      range,
      length: input.byteSize,
      rangeChunkSize: rangeChunkBytes,
      disableStream: true,
      disableAutoFetch: true,
      disableFontFace: true,
      enableXfa: false,
      isEvalSupported: false,
      isImageDecoderSupported: false,
      isOffscreenCanvasSupported: false,
      stopAtErrors: true,
      useWasm: false,
      useWorkerFetch: false,
    });
    const document = await runBookSourceProcessorBeforeDeadline(
      input.deadlineAt,
      async () => Promise.race([loadingTask!.promise, rangeFailure]),
    );
    if (!Number.isSafeInteger(document.numPages) || document.numPages < 1
      || document.numPages > MAX_SOURCE_PAGES) {
      throw new Error('book_source_processor_pdf_page_count_invalid');
    }
    await runBookSourceProcessorBeforeDeadline(input.deadlineAt, input.assertNotCancelled);
    const result = { pageCount: document.numPages, bytesRead, rangeRequests };
    await runBookSourceProcessorBeforeDeadline(input.deadlineAt, async () => document.destroy());
    return result;
  } catch (error) {
    throw normalizePdfFailure(error);
  } finally {
    aborted = true;
    requestController.abort();
    rangeTransport?.abort();
    input.signal?.removeEventListener('abort', onAbort);
    const cleanup = Promise.allSettled([
      ...(loadingTask ? [Promise.resolve().then(() => loadingTask!.destroy())] : []),
      ...pending,
    ]);
    let cleanupFinished = false;
    await runBookSourceProcessorBeforeDeadline(
      input.deadlineAt,
      async () => cleanup.then(() => { cleanupFinished = true; }),
    ).catch(() => undefined);
    if (!cleanupFinished) {
      if (!input.deferCleanup) throw new Error('book_source_processor_cleanup_unavailable');
      input.deferCleanup(cleanup);
    }
  }
};
