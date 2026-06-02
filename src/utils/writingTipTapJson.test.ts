import { describe, expect, it } from 'vitest';
import { convertTextToTipTapJson } from './writingTipTapJson';

describe('convertTextToTipTapJson', () => {
    it('keeps single newlines as separate TipTap paragraphs', () => {
        expect(convertTextToTipTapJson('Line A\nLine B')).toEqual({
            type: 'doc',
            content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Line A' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Line B' }] },
            ],
        });
    });

    it('keeps blank lines as empty TipTap paragraphs', () => {
        expect(convertTextToTipTapJson('Line A\n\nLine B')).toEqual({
            type: 'doc',
            content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Line A' }] },
                { type: 'paragraph', content: [] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Line B' }] },
            ],
        });
    });

    it('preserves leading and trailing spaces exactly', () => {
        expect(convertTextToTipTapJson('    Indented line\nLine with trailing spaces    ')).toEqual({
            type: 'doc',
            content: [
                { type: 'paragraph', content: [{ type: 'text', text: '    Indented line' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Line with trailing spaces    ' }] },
            ],
        });
    });

    it('keeps every repeated blank line', () => {
        expect(convertTextToTipTapJson('Line A\n\n\nLine B')).toEqual({
            type: 'doc',
            content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Line A' }] },
                { type: 'paragraph', content: [] },
                { type: 'paragraph', content: [] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Line B' }] },
            ],
        });
    });

    it('keeps raw annotation offsets aligned after text conversion', () => {
        const essayText = 'Intro line\n\n    product A    rose\nFinal line';
        const anchorText = 'product A    rose';
        const startOffset = essayText.indexOf(anchorText);
        const endOffset = startOffset + anchorText.length;
        const converted = convertTextToTipTapJson(essayText);
        const flattened = converted.content
            .map((paragraph) => paragraph.content.map((node) => node.text).join(''))
            .join('\n');

        expect(flattened).toBe(essayText);
        expect(flattened.slice(startOffset, endOffset)).toBe(anchorText);
    });
});
