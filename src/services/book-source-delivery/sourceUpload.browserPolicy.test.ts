import { describe, expect, it } from 'vitest';
import { createBookSourcePreviewCsp } from './sourceUpload.browserPolicy';

describe('Book Source production-preview browser policy', () => {
  it('permits exact configured control and B2 origins without wildcarding either capability', () => {
    const policy = createBookSourcePreviewCsp({
      VITE_BOOK_SOURCE_CONTROL_WORKER_URL: 'https://book-source-control.example',
      VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN: 'https://s3.us-west-004.backblazeb2.com',
    });
    expect(policy).toContain('https://book-source-control.example');
    expect(policy).toContain('https://s3.us-west-004.backblazeb2.com');
    expect(policy).toContain('https://*.firebasedatabase.app');
    expect(policy).toContain('wss://*.firebasedatabase.app');
    expect(policy).not.toContain('*.workers.dev');
    expect(policy).not.toContain('*.backblazeb2.com');
  });

  it.each([
    [{
      VITE_BOOK_SOURCE_CONTROL_WORKER_URL: 'https://control.example/path',
      VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN: 'https://s3.example',
    }],
    [{
      VITE_BOOK_SOURCE_CONTROL_WORKER_URL: 'https://control.example',
      VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN: 'http://s3.example',
    }],
    [{
      VITE_BOOK_SOURCE_CONTROL_WORKER_URL: 'https://control.example',
    }],
  ])('fails closed for incomplete or non-origin configuration', (env) => {
    expect(() => createBookSourcePreviewCsp(env)).toThrow();
  });
});
