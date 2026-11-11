import { Fragment, type ReactNode } from 'react';

export interface ReadingV2TextHighlight {
  readonly id: string;
  readonly text: string;
  readonly color: string;
  readonly startOffset?: number;
  readonly endOffset?: number;
}

export interface ReadingV2InlineToken {
  readonly kind: 'text' | 'strong' | 'em' | 'underline' | 'code';
  readonly text: string;
}

interface ReadingV2FormattedTextProps {
  readonly text: string;
  readonly highlights?: readonly ReadingV2TextHighlight[];
  readonly preserveLineBreaks?: boolean;
}

const INLINE_MARK_PATTERN = /(<u>[^\n]+?<\/u>|<ins>[^\n]+?<\/ins>|`[^`\n]+`|\*\*[^*\n]+?\*\*|__[^_\n]+?__|\*[^*\n]+?\*|_[^_\n]+?_)/g;

const inlineTokenFromMarkedText = (value: string): ReadingV2InlineToken => {
  if (value.startsWith('**') && value.endsWith('**')) {
    return { kind: 'strong', text: value.slice(2, -2) };
  }
  if (value.startsWith('__') && value.endsWith('__')) {
    return { kind: 'underline', text: value.slice(2, -2) };
  }
  if (value.startsWith('*') && value.endsWith('*')) {
    return { kind: 'em', text: value.slice(1, -1) };
  }
  if (value.startsWith('_') && value.endsWith('_')) {
    return { kind: 'em', text: value.slice(1, -1) };
  }
  if (value.startsWith('`') && value.endsWith('`')) {
    return { kind: 'code', text: value.slice(1, -1) };
  }
  if (value.startsWith('<u>') && value.endsWith('</u>')) {
    return { kind: 'underline', text: value.slice(3, -4) };
  }
  if (value.startsWith('<ins>') && value.endsWith('</ins>')) {
    return { kind: 'underline', text: value.slice(5, -6) };
  }

  return { kind: 'text', text: value };
};

export const parseReadingV2InlineMarkdown = (text: string): readonly ReadingV2InlineToken[] => {
  const tokens: ReadingV2InlineToken[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_MARK_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) {
      tokens.push({ kind: 'text', text: text.slice(cursor, match.index) });
    }
    tokens.push(inlineTokenFromMarkedText(match[0]));
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    tokens.push({ kind: 'text', text: text.slice(cursor) });
  }

  return tokens.length > 0 ? tokens : [{ kind: 'text', text }];
};

// Persisted offsets count DOM text; nested markup and rendered <br> add no characters.
const renderedTokenLength = (token: ReadingV2InlineToken, preserveLineBreaks: boolean): number =>
  token.kind === 'text' || token.kind === 'code'
    ? (preserveLineBreaks ? token.text.replaceAll('\n', '') : token.text).length
    : parseReadingV2InlineMarkdown(token.text).reduce((length, nested) => length + renderedTokenLength(nested, preserveLineBreaks), 0);

const renderPlainText = (
  text: string,
  highlights: readonly ReadingV2TextHighlight[],
  keyPrefix: string,
  textOffset = 0,
): ReactNode => {
  if (highlights.length === 0) {
    return text;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const nextMatch = highlights
      .map((highlight) => {
        if (typeof highlight.startOffset === 'number' && typeof highlight.endOffset === 'number') {
          const absoluteStart = Math.max(highlight.startOffset, textOffset + cursor, textOffset);
          const absoluteEnd = Math.min(highlight.endOffset, textOffset + text.length);
          if (absoluteEnd <= absoluteStart) return null;
          const index = absoluteStart - textOffset;
          return { highlight, index, end: absoluteEnd - textOffset, text: text.slice(index, absoluteEnd - textOffset) };
        }

        const index = text.indexOf(highlight.text, cursor);
        return index >= 0 ? { highlight, index, end: index + highlight.text.length, text: highlight.text } : null;
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((a, b) => a.index - b.index)[0];

    if (!nextMatch) {
      nodes.push(text.slice(cursor));
      break;
    }

    if (nextMatch.index > cursor) {
      nodes.push(text.slice(cursor, nextMatch.index));
    }

    nodes.push(
      <mark
        className="reading-v2-runtime__highlight"
        key={`${keyPrefix}-${nextMatch.highlight.id}-${nextMatch.index}`}
        style={{ backgroundColor: nextMatch.highlight.color }}
      >
        {nextMatch.text}
      </mark>,
    );
    cursor = nextMatch.end;
  }

  return nodes;
};

const renderToken = (
  token: ReadingV2InlineToken,
  index: number,
  highlights: readonly ReadingV2TextHighlight[],
  preserveLineBreaks: boolean,
  textOffset: number,
): ReactNode => {
  const nestedTokens = token.kind === 'text' || token.kind === 'code'
    ? null
    : parseReadingV2InlineMarkdown(token.text);
  let nestedTextOffset = textOffset;
  const content = nestedTokens
    ? nestedTokens.map((nestedToken, nestedIndex) => {
      const rendered = renderToken(nestedToken, nestedIndex, highlights, preserveLineBreaks, nestedTextOffset);
      nestedTextOffset += renderedTokenLength(nestedToken, preserveLineBreaks);
      return rendered;
    })
    : preserveLineBreaks
    ? token.text.split('\n').map((line, lineIndex) => {
      const lineOffset = textOffset + token.text.split('\n').slice(0, lineIndex).reduce((total, value) => total + value.length, 0);
      return (
        <Fragment key={lineIndex}>
          {lineIndex > 0 ? <br /> : null}
          {renderPlainText(line, highlights, `formatted-${index}-${lineIndex}`, lineOffset)}
        </Fragment>
      );
    })
    : renderPlainText(token.text, highlights, `formatted-${index}`, textOffset);

  if (token.kind === 'strong') {
    return <strong key={`strong-${index}`}>{content}</strong>;
  }
  if (token.kind === 'em') {
    return <em key={`em-${index}`}>{content}</em>;
  }
  if (token.kind === 'underline') {
    return <u key={`underline-${index}`}>{content}</u>;
  }
  if (token.kind === 'code') {
    return <code key={`code-${index}`}>{content}</code>;
  }

  return <Fragment key={`text-${index}`}>{content}</Fragment>;
};

export function ReadingV2FormattedText({
  text,
  highlights = [],
  preserveLineBreaks = false,
}: ReadingV2FormattedTextProps) {
  let textOffset = 0;
  return (
    <>
      {parseReadingV2InlineMarkdown(text).map((token, index) => {
        const rendered = renderToken(token, index, highlights, preserveLineBreaks, textOffset);
        textOffset += renderedTokenLength(token, preserveLineBreaks);
        return rendered;
      })}
    </>
  );
}
