import type { ReactNode } from 'react';
import { ReadingV2FormattedText } from './ReadingV2FormattedText';

const VOCABULARY_LABELS = ['TRUE', 'FALSE', 'YES', 'NO', 'NOT GIVEN'] as const;
const WORD_LIMIT_PHRASE_PATTERN =
  /(NO MORE THAN (?:ONE|TWO|THREE|FOUR|FIVE|\d+) WORDS?(?: AND\/OR A NUMBER)?|(?:ONE|TWO|THREE|FOUR|FIVE|\d+) WORDS? AND\/OR A NUMBER|ONE WORD ONLY|TWO WORDS ONLY|THREE WORDS ONLY)/g;
const BOX_TARGET_PATTERN = /\b(box(?:es)? \d+(?:-\d+)?)\b/gi;
const LABEL_RANGE_PATTERN = /\b([A-Z](?:-[A-Z])?|[ivxlcdm]+(?:-[ivxlcdm]+)?)\b/g;

interface InstructionRule {
  readonly label: string;
  readonly text: string;
}

type InstructionSegment =
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'rules'; readonly rules: readonly InstructionRule[] };

const getVocabularyLabel = (line: string): string | undefined =>
  VOCABULARY_LABELS.find((candidate) => line.startsWith(`${candidate} `));

const toInstructionSegments = (text: string): readonly InstructionSegment[] => {
  const segments: InstructionSegment[] = [];
  let pendingRules: InstructionRule[] = [];

  const flushRules = () => {
    if (pendingRules.length === 0) {
      return;
    }
    segments.push({ kind: 'rules', rules: pendingRules });
    pendingRules = [];
  };

  text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .forEach((paragraph) => {
      paragraph
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          const label = getVocabularyLabel(line);

          if (label) {
            pendingRules.push({
              label,
              text: line.slice(label.length).trim(),
            });
            return;
          }

          flushRules();
          segments.push({ kind: 'paragraph', text: line });
        });
    });

  flushRules();
  return segments;
};

interface ReadingV2InstructionTextProps {
  readonly text: string;
}

const renderWithStrongMatches = (
  text: string,
  pattern: RegExp,
  keyPrefix: string,
) => {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  pattern.lastIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(<ReadingV2FormattedText key={`${keyPrefix}-text-${cursor}`} text={text.slice(cursor, match.index)} />);
    }

    nodes.push(<strong key={`${keyPrefix}-strong-${match.index}`}>{match[0]}</strong>);
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push(<ReadingV2FormattedText key={`${keyPrefix}-text-${cursor}`} text={text.slice(cursor)} />);
  }

  return nodes.length > 0 ? nodes : <ReadingV2FormattedText text={text} />;
};

const renderInstructionLine = (line: string, key: string) => {
  WORD_LIMIT_PHRASE_PATTERN.lastIndex = 0;
  if (/^Choose\b/.test(line) && WORD_LIMIT_PHRASE_PATTERN.test(line)) {
    return renderWithStrongMatches(line, WORD_LIMIT_PHRASE_PATTERN, key);
  }

  if (/^Write\b/.test(line)) {
    const withBoxTargets = renderWithStrongMatches(line, BOX_TARGET_PATTERN, `${key}-boxes`);
    return <em>{withBoxTargets}</em>;
  }

  if (/^NB\b/.test(line)) {
    return (
      <>
        <strong>NB</strong>
        <em>{line.slice(2)}</em>
      </>
    );
  }

  if (/correct (?:letter|letters|number)/i.test(line)) {
    return renderWithStrongMatches(line, LABEL_RANGE_PATTERN, `${key}-labels`);
  }

  return <ReadingV2FormattedText text={line} />;
};

export function ReadingV2InstructionText({ text }: ReadingV2InstructionTextProps) {
  return (
    <>
      {toInstructionSegments(text).map((segment, index) => {
        if (segment.kind === 'rules') {
          return (
            <dl className="reading-v2-runtime__instruction-rules" key={`rules-${index}`}>
              {segment.rules.map((rule) => (
                <div key={`${rule.label}-${rule.text}`} className="reading-v2-runtime__instruction-rule">
                  <dt>{rule.label}</dt>
                  <dd>{rule.text}</dd>
                </div>
              ))}
            </dl>
          );
        }

        return (
          <p className="reading-v2-runtime__instruction-line" key={`line-${index}-${segment.text.slice(0, 20)}`}>
            {renderInstructionLine(segment.text, `instruction-${index}`)}
          </p>
        );
      })}
    </>
  );
}
