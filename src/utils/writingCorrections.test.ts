import { describe, expect, it } from 'vitest';
import { normalizeCorrectionSelection } from './writingCorrections';

describe('normalizeCorrectionSelection', () => {
    it('preserves a single trailing space after comma punctuation', () => {
        expect(normalizeCorrectionSelection({
            selectedText: 'growth, ',
            from: 10,
            to: 18,
        })).toEqual({
            anchorText: 'growth, ',
            from: 10,
            to: 18,
        });
    });

    it('preserves a single trailing space after period punctuation', () => {
        expect(normalizeCorrectionSelection({
            selectedText: 'rose. ',
            from: 20,
            to: 26,
        })).toEqual({
            anchorText: 'rose. ',
            from: 20,
            to: 26,
        });
    });

    it('still trims trailing spaces that do not prove punctuation spacing', () => {
        expect(normalizeCorrectionSelection({
            selectedText: 'growth ',
            from: 10,
            to: 17,
        })).toEqual({
            anchorText: 'growth',
            from: 10,
            to: 16,
        });
    });
});
