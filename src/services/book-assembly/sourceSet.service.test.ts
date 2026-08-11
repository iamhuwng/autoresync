import { describe, expect, it } from 'vitest';
import type { BookSourceVersionAuthority, SourceSetCandidate } from '../../types/bookAssembly.types';
import { validateSourceSetCandidate } from './sourceSet.service';

const authority = (overrides: Record<string, { bookId: string; physicalPageCount: number; verifiedUsable: boolean }> = {}): BookSourceVersionAuthority => ({
  getSourceVersion: (sourceVersionId) => {
    const value = overrides[sourceVersionId] ?? {
      bookId: 'book-1', physicalPageCount: 10, verifiedUsable: true,
    };
    return { sourceVersionId, ...value };
  },
});

describe('validateSourceSetCandidate', () => {
  it('accepts normal full-PDF and component-PDF Source Sets only through trusted authority', () => {
    const full: SourceSetCandidate = {
      sourceStrategy: 'full_pdf',
      sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1 }],
    };
    const components: SourceSetCandidate = {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'component-a', sourceVersionId: 'component-a-v1', sourceOrder: 1, ownerNodeKey: 'section-1' },
        { sourceKey: 'component-b', sourceVersionId: 'component-b-v1', sourceOrder: 2, ownerNodeKey: 'section-1' },
      ],
    };
    expect(validateSourceSetCandidate(full, { bookId: 'book-1', sourceVersionAuthority: authority() }).valid).toBe(true);
    expect(validateSourceSetCandidate(components, { bookId: 'book-1', sourceVersionAuthority: authority() }).valid).toBe(true);
  });

  it('fails closed for identity, usability, uniqueness, strategy shape, and forbidden owners', () => {
    const result = validateSourceSetCandidate({
      sourceStrategy: 'full_pdf',
      sources: [
        { sourceKey: 'full', sourceVersionId: 'same-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
        { sourceKey: 'full', sourceVersionId: 'same-v1', sourceOrder: 1 },
      ],
    }, {
      bookId: 'book-1',
      sourceVersionAuthority: authority({
        'same-v1': { bookId: 'book-2', physicalPageCount: 10, verifiedUsable: false },
      }),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      'invalid-value', 'forbidden-field', 'duplicate-key', 'duplicate-order',
      'source-book-mismatch', 'unverified-source-version',
    ]));
    expect(validateSourceSetCandidate({ sourceStrategy: 'component_pdfs', sources: [{ sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1 }] }, {
      bookId: 'book-1', sourceVersionAuthority: authority(),
    }).errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'invalid-owner' })]));
  });
});
