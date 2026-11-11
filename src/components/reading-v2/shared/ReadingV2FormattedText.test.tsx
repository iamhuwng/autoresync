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

  it('renders combined marks and highlights while leaving code contents literal', () => {
    render(
      <ReadingV2FormattedText
        text={'<u>_**important text**_</u> and `_**literal**_`'}
        highlights={[{ id: 'combined', text: 'important', color: '#fff59d' }]}
      />,
    );

    const highlighted = screen.getByText('important');
    expect(highlighted.closest('strong')).toBeInTheDocument();
    expect(highlighted.closest('em')).toBeInTheDocument();
    expect(highlighted.closest('u')).toBeInTheDocument();
    expect(screen.getByText('_**literal**_').tagName).toBe('CODE');
  });

  it('underlines less-than text without interpreting embedded HTML', () => {
    render(<ReadingV2FormattedText text={'<u>x < 3 and <img src=x onerror=alert(1) /></u>'} />);

    expect(screen.getByText(/x < 3/).closest('u')).toBeInTheDocument();
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });

  it.each([
    { text: '<u>_**important text**_</u> tail', selected: 'tail', preserveLineBreaks: false },
    { text: '<u>_**first**_ tail</u> end', selected: 'tail', preserveLineBreaks: false },
    { text: 'one\ntwo', selected: 'two', preserveLineBreaks: true },
  ])('restores DOM-offset highlights in $text', ({ text, selected, preserveLineBreaks }) => {
    const { container, rerender } = render(<ReadingV2FormattedText text={text} preserveLineBreaks={preserveLineBreaks} />);
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let target = walker.nextNode();
    while (target && !target.textContent?.includes(selected)) target = walker.nextNode();
    expect(target).not.toBeNull();
    const before = document.createRange();
    before.selectNodeContents(container);
    before.setEnd(target!, target!.textContent!.indexOf(selected));
    const startOffset = before.toString().length;
    const visibleText = container.textContent;

    rerender(<ReadingV2FormattedText text={text} preserveLineBreaks={preserveLineBreaks}
      highlights={[{ id: 'persisted', text: selected, color: '#fff59d', startOffset, endOffset: startOffset + selected.length }]} />);

    expect(container.querySelector('mark')?.textContent).toBe(selected);
    expect(container.textContent).toBe(visibleText);
  });
});
