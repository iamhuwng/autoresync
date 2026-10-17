import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  composeComponentPdfBytes,
  createComponentPdfCompositionWorkerMessageHandler,
} from './componentPdfComposition.worker';
import {
  COMPONENT_PDF_COMPOSITION_LIMITS,
  ComponentPdfCompositionError,
} from './componentPdfComposition.types';

const makePdf = async (name: string, pageCount: number): Promise<File> => {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) document.addPage();
  const bytes = await document.save();
  const file = new File([bytes], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => bytes.slice().buffer,
  });
  return file;
};

const malformedPdf = (name: string): File => {
  const file = new File(['%PDF-1.7'], name);
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new TextEncoder().encode('%PDF-1.7').buffer,
  });
  return file;
};

const digest = new Uint8Array(32).buffer;

const sizedBytes = (byteSize: number): Uint8Array => {
  const bytes = new Uint8Array([1]);
  Object.defineProperty(bytes, 'byteLength', { value: byteSize });
  return bytes;
};

const fakeCompositionDependencies = (outputBytes: Uint8Array) => ({
  createPdf: async () => ({ addPage: () => undefined, save: async () => outputBytes }),
  loadPdf: async () => ({ getPageCount: () => 1, getPageIndices: () => [0] }),
  copyPages: async () => [{}],
  digestSha256: async () => digest,
});

describe('componentPdfComposition.worker', () => {
  it('uses pdf-lib copyPages in input order and returns one-based offsets plus a digest', async () => {
    const first = await makePdf('first.pdf', 2);
    const second = await makePdf('second.pdf', 1);
    const result = await composeComponentPdfBytes([first, second], {
      __testDependencies: { digestSha256: async () => digest },
    });

    expect(result.mapping).toEqual([
      { componentIndex: 0, fileName: 'first.pdf', pageCount: 2, startPage: 1, endPage: 2 },
      { componentIndex: 1, fileName: 'second.pdf', pageCount: 1, startPage: 3, endPage: 3 },
    ]);
    expect(result.sha256Hex).toBe('00'.repeat(32));
    expect(result.inputManifest).toEqual([
      { componentIndex: 0, sha256Hex: '00'.repeat(32), byteSize: first.size, pageCount: 2 },
      { componentIndex: 1, sha256Hex: '00'.repeat(32), byteSize: second.size, pageCount: 1 },
    ]);
    const composed = await PDFDocument.load(result.bytes);
    expect(composed.getPageCount()).toBe(3);
  });

  it('composes identical in-memory PDFs to identical bytes and SHA-256', async () => {
    const first = await makePdf('first.pdf', 2);
    const second = await makePdf('second.pdf', 1);

    const initial = await composeComponentPdfBytes([first, second]);
    const repeated = await composeComponentPdfBytes([first, second]);

    expect(Array.from(repeated.bytes)).toEqual(Array.from(initial.bytes));
    expect(repeated.sha256Hex).toBe(initial.sha256Hex);
    expect(repeated.mapping).toEqual(initial.mapping);
    expect(repeated.inputManifest).toEqual(initial.inputManifest);
  });

  it('rejects malformed and encrypted inputs before producing output', async () => {
    const malformed = malformedPdf('malformed.pdf');
    await expect(composeComponentPdfBytes([malformed], {
      __testDependencies: {
        loadPdf: async () => { throw new Error('Invalid PDF structure'); },
      },
    })).rejects.toMatchObject({ code: 'invalid_pdf' });

    await expect(composeComponentPdfBytes([malformed], {
      __testDependencies: {
        loadPdf: async () => { throw new Error('Input document is encrypted'); },
      },
    })).rejects.toMatchObject(new ComponentPdfCompositionError('encrypted_pdf'));
  });

  it('accepts the 100 MiB output boundary', async () => {
    const file = malformedPdf('output-boundary.pdf');
    const result = await composeComponentPdfBytes([file], {
      __testDependencies: fakeCompositionDependencies(
        sizedBytes(COMPONENT_PDF_COMPOSITION_LIMITS.maxOutputBytes),
      ),
    });
    expect(result.bytes.byteLength).toBe(COMPONENT_PDF_COMPOSITION_LIMITS.maxOutputBytes);
  });

  it('rejects output one byte over the 100 MiB cap', async () => {
    const file = malformedPdf('output-cap.pdf');
    await expect(composeComponentPdfBytes([file], {
      __testDependencies: {
        ...fakeCompositionDependencies(sizedBytes(COMPONENT_PDF_COMPOSITION_LIMITS.maxOutputBytes + 1)),
      },
    })).rejects.toMatchObject({ code: 'output_too_large' });
  });

  it('repeats composition with identical bytes, input manifest, and output hash', async () => {
    const file = malformedPdf('deterministic.pdf');
    const dependencies = fakeCompositionDependencies(new Uint8Array([37, 80, 68, 70, 45, 49]));
    const first = await composeComponentPdfBytes([file], { __testDependencies: dependencies });
    const second = await composeComponentPdfBytes([file], { __testDependencies: dependencies });

    expect(Array.from(second.bytes)).toEqual(Array.from(first.bytes));
    expect(second.sha256Hex).toBe(first.sha256Hex);
    expect(second.inputManifest).toEqual(first.inputManifest);
  });

  it('cancels a running message job and does not emit a success response', async () => {
    const responses: unknown[] = [];
    const file = malformedPdf('pending.pdf');
    let resolveLoad: ((value: { getPageCount: () => number; getPageIndices: () => number[] }) => void) | undefined;
    const pendingLoad = new Promise<{ getPageCount: () => number; getPageIndices: () => number[] }>((resolve) => {
      resolveLoad = resolve;
    });
    const handler = createComponentPdfCompositionWorkerMessageHandler(
      (response) => responses.push(response),
      {
        loadPdf: async () => pendingLoad,
        digestSha256: async () => digest,
      },
    );

    handler({ data: { type: 'compose', requestId: 'cancel-me', files: [file] } } as MessageEvent<unknown>);
    handler({ data: { type: 'cancel', requestId: 'cancel-me' } } as MessageEvent<unknown>);
    resolveLoad?.({ getPageCount: () => 1, getPageIndices: () => [0] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(responses).toEqual([]);
    void pendingLoad;
  });
});
