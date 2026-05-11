import type { ReactNode } from 'react';
import { ReadingV2FormattedText } from '../../shared/ReadingV2FormattedText';

export type ReadingV2QuestionBadgeState = 'empty' | 'answered' | 'active';

interface ReadingV2QuestionBadgeProps {
  readonly number: number | string;
  readonly state?: ReadingV2QuestionBadgeState;
  readonly className?: string;
}

export function ReadingV2QuestionBadge({
  number,
  state = 'empty',
  className,
}: ReadingV2QuestionBadgeProps) {
  return (
    <span
      className={['reading-v2-runtime__question-badge', className].filter(Boolean).join(' ')}
      data-state={state}
    >
      {number}
    </span>
  );
}

interface ReadingV2ProgressPillProps {
  readonly answeredCount: number;
  readonly totalCount: number;
}

export function ReadingV2ProgressPill({
  answeredCount,
  totalCount,
}: ReadingV2ProgressPillProps) {
  return (
    <span className="reading-v2-runtime__progress-pill" aria-label="Task group progress">
      {answeredCount} of {totalCount} answered
    </span>
  );
}

interface ReadingV2TaskFrameProps {
  readonly rangeLabel: string;
  readonly instructions: ReactNode;
  readonly children: ReactNode;
}

export function ReadingV2TaskFrame({
  rangeLabel,
  instructions,
  children,
}: ReadingV2TaskFrameProps) {
  return (
    <section className="reading-v2-runtime__question-panel" aria-label="Grouped question panel">
      <header className="reading-v2-runtime__group-header">
        <div>
          <h2>{rangeLabel}</h2>
        </div>
        <div className="reading-v2-runtime__instructions" aria-label="Grouped instructions">
          {instructions}
        </div>
      </header>
      {children}
    </section>
  );
}

export interface ReadingV2ReferenceBankItem {
  readonly id: string;
  readonly label: string;
  readonly text: string;
  readonly used?: boolean;
}

interface ReadingV2ReferenceBankProps {
  readonly title: string;
  readonly ariaLabel: string;
  readonly items: readonly ReadingV2ReferenceBankItem[];
}

export function ReadingV2ReferenceBank({
  title,
  ariaLabel,
  items,
}: ReadingV2ReferenceBankProps) {
  return (
    <section className="reading-v2-runtime__reference-bank" aria-label={ariaLabel}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item.id} data-used={item.used ? 'true' : 'false'}>
                      <strong>{item.label}</strong>
                      {' '}
                      <span><ReadingV2FormattedText text={item.text} /></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface ReadingV2ChoiceOptionProps {
  readonly label: string;
  readonly text: string;
  readonly selected: boolean;
  readonly disabled?: boolean;
  readonly name?: string;
  readonly variant: 'radio' | 'checkbox';
  readonly title?: string;
  readonly onChange: () => void;
}

export function ReadingV2ChoiceOption({
  label,
  text,
  selected,
  disabled = false,
  name,
  variant,
  title,
  onChange,
}: ReadingV2ChoiceOptionProps) {
  return (
    <label
      className="reading-v2-runtime__option"
      data-selected={selected ? 'true' : 'false'}
      title={title}
    >
      <input
        type={variant}
        name={name}
        disabled={disabled}
        checked={selected}
        onChange={onChange}
      />
      <span className="reading-v2-runtime__option-copy">
        <span className="reading-v2-runtime__option-label">{label}</span>
        <span className="reading-v2-runtime__option-text">
          <ReadingV2FormattedText text={text} />
        </span>
      </span>
    </label>
  );
}
