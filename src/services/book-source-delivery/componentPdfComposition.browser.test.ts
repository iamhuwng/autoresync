import { describe, expect, it, vi } from 'vitest';
import {
  composeComponentPdfs,
} from './componentPdfComposition.browser';
import {
  COMPONENT_PDF_COMPOSITION_LIMITS,
  ComponentPdfCompositionError,
  type ComponentPdfCompositionWorkerResponse,
} from './componentPdfComposition.types';

const onePageClaim = (file: File, physicalPageCount = 1) => ({
  schemaVersion: 1 as const,
  trust: 'browser-supplied-untrusted' as const,
  state: 'complete' as const,
  displayFilename: file.name,
  exactByteSize: file.size,
  sha256Hex: 'a'.repeat(64),
  physicalPageCount,
  pdfType: 'application/pdf' as const,
  readability: 'readable' as const,
});

const pdfFile = (name: string): File => {
  const file = new File(['%PDF-1.7'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new TextEncoder().encode('%PDF-1.7').buffer,
  });
  return file;
};

const pdfFileWithSize = (name: string, size: number): File => {
  const file = pdfFile(name);
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

class FakeWorker {
  readonly posted: unknown[] = [];
  readonly terminated = vi.fn();
  private readonly listeners = {
    message: new Set<EventListener>(),
    error: new Set<EventListener>(),
  };

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated();
  }

  addEventListener(type: 'message' | 'error', listener: EventListener): void {
    this.listeners[type].add(listener);
  }

  removeEventListener(type: 'message' | 'error', listener: EventListener): void {
    this.listeners[type].delete(listener);
  }

  emit(message: ComponentPdfCompositionWorkerResponse): void {
    const event = { data: message } as MessageEvent<unknown>;
    this.listeners.message.forEach((listener) => listener(event));
  }

  emitError(): void {
    this.listeners.error.forEach((listener) => listener(new Event('error')));
  }
}

const dependencies = (worker: FakeWorker, claims: Map<File, ReturnType<typeof onePageClaim>>) => ({
  createWorker: () => worker,
  inspectPdf: async (file: File) => claims.get(file)!,
  setTimeout: vi.fn(() => 1),
  clearTimeout: vi.fn(),
});

const emitSuccess = (
  worker: FakeWorker,
  requestId: string,
  files: readonly File[],
  claims: Map<File, ReturnType<typeof onePageClaim>>,
): void => {
  let nextPage = 1;
  worker.emit({
    type: 'success',
    requestId,
    outputBytes: new Uint8Array([1]).buffer,
    byteSize: 1,
    sha256Hex: 'b'.repeat(64),
    mapping: files.map((file, componentIndex) => {
      const pageCount = claims.get(file)!.physicalPageCount;
      const mapping = {
        componentIndex,
        fileName: file.name,
        pageCount,
        startPage: nextPage,
        endPage: nextPage + pageCount - 1,
      };
      nextPage += pageCount;
      return mapping;
    }),
    inputManifest: files.map((file, componentIndex) => ({
      componentIndex,
      sha256Hex: claims.get(file)!.sha256Hex,
      byteSize: file.size,
      pageCount: claims.get(file)!.physicalPageCount,
    })),
  });
};

const composeWithSuccess = async (
  files: readonly File[],
  claims: Map<File, ReturnType<typeof onePageClaim>>,
) => {
  const worker = new FakeWorker();
  const promise = composeComponentPdfs(files, {
    __testDependencies: dependencies(worker, claims),
  });
  await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
  emitSuccess(worker, (worker.posted[0] as { requestId: string }).requestId, files, claims);
  return { result: await promise, worker };
};

describe('componentPdfComposition.browser', () => {
  it('preserves input order, validates cumulative one-based offsets, and returns a new PDF File', async () => {
    const first = pdfFile('first.pdf');
    const second = pdfFile('second.pdf');
    const worker = new FakeWorker();
    const claims = new Map([
      [first, onePageClaim(first, 2)],
      [second, onePageClaim(second, 3)],
    ]);
    const promise = composeComponentPdfs([first, second], {
      outputFilename: 'book.pdf',
      __testDependencies: dependencies(worker, claims),
    });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    const request = worker.posted[0] as { requestId: string; files: readonly File[] };
    worker.emit({
      type: 'success',
      requestId: 'stale-request',
      outputBytes: new Uint8Array([1]).buffer,
      byteSize: 1,
      sha256Hex: 'b'.repeat(64),
      mapping: [],
    });
    worker.emit({
      type: 'success',
      requestId: request.requestId,
      outputBytes: new Uint8Array([1, 2, 3]).buffer,
      byteSize: 3,
      sha256Hex: 'b'.repeat(64),
       mapping: [
         { componentIndex: 0, fileName: 'first.pdf', pageCount: 2, startPage: 1, endPage: 2 },
         { componentIndex: 1, fileName: 'second.pdf', pageCount: 3, startPage: 3, endPage: 5 },
       ],
       inputManifest: [
         { componentIndex: 0, sha256Hex: 'a'.repeat(64), byteSize: first.size, pageCount: 2 },
         { componentIndex: 1, sha256Hex: 'a'.repeat(64), byteSize: second.size, pageCount: 3 },
       ],
     });

    const result = await promise;
    expect(request.files).toEqual([first, second]);
    expect(result.file).not.toBe(first);
    expect(result.file.name).toBe('book.pdf');
    expect(result.file.type).toBe('application/pdf');
    expect(result.file.size).toBe(3);
    expect(result.mapping.map(({ startPage, endPage }) => [startPage, endPage])).toEqual([[1, 2], [3, 5]]);
    expect(result.inputManifest).toEqual([
      { componentIndex: 0, sha256Hex: 'a'.repeat(64), byteSize: first.size, pageCount: 2 },
      { componentIndex: 1, sha256Hex: 'a'.repeat(64), byteSize: second.size, pageCount: 3 },
    ]);
    expect(worker.terminated).toHaveBeenCalledTimes(1);
  });

  it('accepts exactly 20 components and binds the result to their ordered input manifest', async () => {
    const files = Array.from({ length: COMPONENT_PDF_COMPOSITION_LIMITS.maxComponents }, (_, index) => pdfFile(`${index}.pdf`));
    const claims = new Map(files.map((file) => [file, onePageClaim(file)]));
    const { result } = await composeWithSuccess(files, claims);

    expect(result.inputManifest.map(({ componentIndex }) => componentIndex)).toEqual(files.map((_, index) => index));
  });

  it('rejects 21 components during preflight', async () => {
    const files = Array.from({ length: COMPONENT_PDF_COMPOSITION_LIMITS.maxComponents + 1 }, (_, index) => pdfFile(`${index}.pdf`));
    await expect(composeComponentPdfs(files)).rejects.toMatchObject({ code: 'too_many_components' });
  });

  it('accepts the 50 MiB aggregate boundary and rejects one byte over it', async () => {
    const boundary = pdfFileWithSize('boundary.pdf', COMPONENT_PDF_COMPOSITION_LIMITS.maxAggregateBytes);
    const claims = new Map([[boundary, onePageClaim(boundary)]]);
    await expect(composeWithSuccess([boundary], claims)).resolves.toBeDefined();

    const over = pdfFileWithSize('over.pdf', COMPONENT_PDF_COMPOSITION_LIMITS.maxAggregateBytes + 1);
    await expect(composeComponentPdfs([over])).rejects.toMatchObject({ code: 'aggregate_too_large' });
  });

  it('accepts 500 pages and rejects 501 before creating a worker', async () => {
    const boundary = pdfFile('page-boundary.pdf');
    const claims = new Map([[boundary, onePageClaim(boundary, COMPONENT_PDF_COMPOSITION_LIMITS.maxPages)]]);
    const { result } = await composeWithSuccess([boundary], claims);
    expect(result.mapping[0]?.endPage).toBe(COMPONENT_PDF_COMPOSITION_LIMITS.maxPages);

    const file = pdfFile('large-page-count.pdf');
    const createWorker = vi.fn(() => new FakeWorker());
    await expect(composeComponentPdfs([file], {
      __testDependencies: {
        createWorker,
        inspectPdf: async () => onePageClaim(file, 501),
      },
    })).rejects.toMatchObject({ code: 'too_many_pages' });
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('rejects a success response bound to a different input sequence', async () => {
    const first = pdfFile('first.pdf');
    const second = pdfFile('second.pdf');
    const worker = new FakeWorker();
    const claims = new Map([
      [first, onePageClaim(first)],
      [second, onePageClaim(second, 2)],
    ]);
    const promise = composeComponentPdfs([first, second], {
      __testDependencies: dependencies(worker, claims),
    });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    const requestId = (worker.posted[0] as { requestId: string }).requestId;
    worker.emit({
      type: 'success',
      requestId,
      outputBytes: new Uint8Array([1]).buffer,
      byteSize: 1,
      sha256Hex: 'b'.repeat(64),
      mapping: [
        { componentIndex: 0, fileName: first.name, pageCount: 1, startPage: 1, endPage: 1 },
        { componentIndex: 1, fileName: second.name, pageCount: 2, startPage: 2, endPage: 3 },
      ],
      inputManifest: [
        { componentIndex: 0, sha256Hex: 'c'.repeat(64), byteSize: first.size, pageCount: 1 },
        { componentIndex: 1, sha256Hex: 'a'.repeat(64), byteSize: second.size, pageCount: 2 },
      ],
    });

    await expect(promise).rejects.toMatchObject({ code: 'worker_protocol_error' });
    expect(worker.terminated).toHaveBeenCalledTimes(1);
  });

  it('rejects an already-aborted signal before inspection, timers, or worker creation', async () => {
    const file = pdfFile('already-cancelled.pdf');
    const worker = new FakeWorker();
    const controller = new AbortController();
    controller.abort();
    const testDependencies = {
      ...dependencies(worker, new Map([[file, onePageClaim(file)]])),
      createWorker: vi.fn(() => worker),
      inspectPdf: vi.fn(async () => onePageClaim(file)),
    };

    await expect(composeComponentPdfs([file], {
      signal: controller.signal,
      __testDependencies: testDependencies,
    })).rejects.toMatchObject({ code: 'cancelled' });
    expect(testDependencies.inspectPdf).not.toHaveBeenCalled();
    expect(testDependencies.setTimeout).not.toHaveBeenCalled();
    expect(testDependencies.createWorker).not.toHaveBeenCalled();
  });

  it('posts cancel and terminates on caller cancellation', async () => {
    const file = pdfFile('cancel.pdf');
    const worker = new FakeWorker();
    const controller = new AbortController();
    const promise = composeComponentPdfs([file], {
      signal: controller.signal,
      __testDependencies: dependencies(worker, new Map([[file, onePageClaim(file)]])),
    });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    controller.abort();

    await expect(promise).rejects.toMatchObject(new ComponentPdfCompositionError('cancelled'));
    expect(worker.posted).toHaveLength(2);
    expect(worker.posted[1]).toMatchObject({ type: 'cancel' });
    expect(worker.terminated).toHaveBeenCalledTimes(1);
  });

  it('uses the 60-second timeout to cancel and terminate a stalled worker', async () => {
    const file = pdfFile('timeout.pdf');
    const worker = new FakeWorker();
    let timeout: (() => void) | undefined;
    const promise = composeComponentPdfs([file], {
      __testDependencies: {
        ...dependencies(worker, new Map([[file, onePageClaim(file)]])),
        setTimeout: (handler) => {
          timeout = handler;
          return 1;
        },
      },
    });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    timeout?.();

    await expect(promise).rejects.toMatchObject({ code: 'timeout' });
    expect(worker.posted[1]).toMatchObject({ type: 'cancel' });
    expect(worker.terminated).toHaveBeenCalledTimes(1);
  });

  it('terminates on worker errors and invalid response messages', async () => {
    const file = pdfFile('error.pdf');
    const worker = new FakeWorker();
    const promise = composeComponentPdfs([file], {
      __testDependencies: dependencies(worker, new Map([[file, onePageClaim(file)]])),
    });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    const request = worker.posted[0] as { requestId: string };
    worker.emit({ type: 'error', requestId: request.requestId, code: 'invalid_pdf' });
    await expect(promise).rejects.toMatchObject({ code: 'invalid_pdf' });
    expect(worker.terminated).toHaveBeenCalledTimes(1);

    const secondWorker = new FakeWorker();
    const second = composeComponentPdfs([file], {
      __testDependencies: dependencies(secondWorker, new Map([[file, onePageClaim(file)]])),
    });
    await vi.waitFor(() => expect(secondWorker.posted).toHaveLength(1));
    const secondRequest = secondWorker.posted[0] as { requestId: string };
    secondWorker.emit({
      type: 'success',
      requestId: secondRequest.requestId,
      outputBytes: new Uint8Array([1]).buffer,
      byteSize: 2,
      sha256Hex: 'c'.repeat(64),
      mapping: [],
    });
    await expect(second).rejects.toMatchObject({ code: 'worker_protocol_error' });
    expect(secondWorker.terminated).toHaveBeenCalledTimes(1);
  });
});
