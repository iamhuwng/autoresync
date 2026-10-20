import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { createLocalBookPdfTransport, inspectLocalPdfPageCount, createLocalComponentPdfTransport } from './localBookPdfTransport';

describe('local Book PDF transport', () => {
  it('serves Blob metadata and byte ranges without a route or token', async () => {
    const transport = createLocalBookPdfTransport(new Blob(['%PDF-local'], { type: 'application/pdf' }));
    await expect(transport.head()).resolves.toMatchObject({ status: 200, contentType: 'application/pdf', contentLength: 10 });
    const response = await transport.get({ kind: 'closed', start: 0, end: 3 });
    expect(response).toMatchObject({ status: 206, contentLength: 4, contentRange: { start: 0, end: 3, total: 10 } });
    const reader = response.body.getReader();
    const chunk = await reader.read();
    expect(new TextDecoder().decode(chunk.value)).toBe('%PDF');
    transport.destroy();
    await expect(transport.get()).rejects.toThrow('local_pdf_transport_destroyed');
  });

  it('inspects real local page counts and composes only mapped component pages', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    document.addPage();
    const file = new Blob([await document.save()], { type: 'application/pdf' });
    await expect(inspectLocalPdfPageCount(file)).resolves.toBe(2);
    const transport = await createLocalComponentPdfTransport(
      { first: file },
      [{ sourceKey: 'first', pages: [2] }],
    );
    const metadata = await transport.head();
    expect(metadata.contentType).toBe('application/pdf');
    expect(metadata.contentLength).toBeGreaterThan(0);
    transport.destroy();
  });
});
