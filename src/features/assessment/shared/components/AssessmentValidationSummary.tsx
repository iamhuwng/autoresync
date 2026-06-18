import type { AriaRole, ReactNode } from 'react';
import './AssessmentValidationSummary.css';

export type AssessmentValidationSummaryStatus = 'ready' | 'blocked';

type AssessmentValidationSummaryHeadingLevel = 2 | 3 | 4;
type AssessmentValidationSummaryHeadingElement = `h${AssessmentValidationSummaryHeadingLevel}`;

export interface AssessmentValidationSummaryProps {
  readonly title: string;
  readonly status: AssessmentValidationSummaryStatus;
  readonly summary: ReactNode;
  readonly messages?: readonly ReactNode[];
  readonly issueCount: number;
  readonly issueLabel?: string;
  readonly headingLevel?: AssessmentValidationSummaryHeadingLevel;
  readonly ariaLabel?: string;
  readonly role?: AriaRole;
  readonly className?: string;
}

export function AssessmentValidationSummary({
  title,
  status,
  summary,
  messages = [],
  issueCount,
  issueLabel = 'Issues',
  headingLevel = 3,
  ariaLabel = title,
  role = 'status',
  className,
}: AssessmentValidationSummaryProps) {
  const HeadingElement = `h${headingLevel}` as AssessmentValidationSummaryHeadingElement;
  const classNames = [
    'assessment-validation-summary',
    `assessment-validation-summary--${status}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <section
      className={classNames}
      data-status={status}
      role={role}
      aria-label={ariaLabel}
    >
      <HeadingElement className="assessment-validation-summary__title">{title}</HeadingElement>
      <div className="assessment-validation-summary__message">{summary}</div>
      {messages.map((message, index) => (
        <div className="assessment-validation-summary__message" key={index}>
          {message}
        </div>
      ))}
      <p className="assessment-validation-summary__count">{issueLabel}: {issueCount}</p>
    </section>
  );
}

export default AssessmentValidationSummary;
