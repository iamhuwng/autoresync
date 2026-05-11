import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseReadingV2InlineMarkdown, ReadingV2FormattedText } from './ReadingV2FormattedText';

describe('ReadingV2FormattedText', () => {
  it('parses safe inline markdown marks without HTML injection', () => {
    expect(parseReadingV2InlineMarkdown('A **bold** and *italic* __underlined__ `code` item')).toEqual([
      { kind: 'text', text: 'A ' },
      { kind: 'strong', text: 'bold' },
      { kind: 'text', text: ' and ' },
      { kind: 'em', text: 'italic' },
      { kind: 'text', text: ' ' },
      { kind: 'underline', text: 'underlined' },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'code' },
      { kind: 'text', text: ' item' },
    ]);

    render(<ReadingV2FormattedText text={'Keep **bold** and <u>underlined</u> <img src=x onerror=alert(1) />'} />);

    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('underlined').tagName).toBe('U');
    expect(screen.getByText(/<img src=x/i)).toBeInTheDocument();
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });

  it('keeps highlight marks inside formatted text', () => {
    render(
      <ReadingV2FormattedText
        text="This is **important text**."
        highlights={[{ id: 'h1', text: 'important', color: '#fff59d' }]}
      />,
    );

    expect(screen.getByText('important').tagName).toBe('MARK');
    expect(screen.getByText('important').closest('strong')).toBeInTheDocument();
  });
});
