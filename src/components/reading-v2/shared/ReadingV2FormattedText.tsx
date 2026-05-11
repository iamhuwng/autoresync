import { Fragment, type ReactNode } from 'react';

export interface ReadingV2TextHighlight {
  readonly id: string;
  readonly text: string;
  readonly color: string;
}

export interface ReadingV2InlineToken {
  readonly kind: 'text' | 'strong' | 'em' | 'underline' | 'code';
  readonly text: string;
}

interface ReadingV2FormattedTextProps {
  readonly text: string;
  readonly highlights?: readonly ReadingV2TextHighlight[];
}

const INLINE_MARK_PATTERN = /(<u>[^<\n]+?<\/u>|<ins>[^<\n]+?<\/ins>|`[^`\n]+`|\*\*[^*\n]+?\*\*|__[^_\n]+?__|\*[^*\n]+?\*|_[^_\n]+?_)/g;

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

const renderPlainText = (
  text: string,
  highlights: readonly ReadingV2TextHighlight[],
  keyPrefix: string,
): ReactNode => {
  if (highlights.length === 0) {
    return text;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const nextMatch = highlights
      .map((highlight) => ({
        highlight,
        index: text.indexOf(highlight.text, cursor),
      }))
      .filter((candidate) => candidate.index >= 0)
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
        {nextMatch.highlight.text}
      </mark>,
    );
    cursor = nextMatch.index + nextMatch.highlight.text.length;
  }

  return nodes;
};

const renderToken = (
  token: ReadingV2InlineToken,
  index: number,
  highlights: readonly ReadingV2TextHighlight[],
): ReactNode => {
  const content = renderPlainText(token.text, highlights, `formatted-${index}`);

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
}: ReadingV2FormattedTextProps) {
  return (
    <>
      {parseReadingV2InlineMarkdown(text).map((token, index) => renderToken(token, index, highlights))}
    </>
  );
}
