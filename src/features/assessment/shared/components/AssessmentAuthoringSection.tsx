import { useId, type ReactNode } from 'react';
import './AssessmentAuthoringSection.css';

type AssessmentAuthoringSectionHeadingLevel = 2 | 3 | 4;
type AssessmentAuthoringSectionHeadingElement = `h${AssessmentAuthoringSectionHeadingLevel}`;

export interface AssessmentAuthoringSectionProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly status?: ReactNode;
  readonly action?: ReactNode;
  readonly headingLevel?: AssessmentAuthoringSectionHeadingLevel;
  readonly children: ReactNode;
  readonly className?: string;
  readonly ariaLabel?: string;
}

export function AssessmentAuthoringSection({
  title,
  description,
  status,
  action,
  headingLevel = 2,
  children,
  className,
  ariaLabel,
}: AssessmentAuthoringSectionProps) {
  const titleId = useId();
  const HeadingElement = `h${headingLevel}` as AssessmentAuthoringSectionHeadingElement;
  const classNames = ['assessment-authoring-section', className].filter(Boolean).join(' ');
  const labellingProps = ariaLabel ? { 'aria-label': ariaLabel } : { 'aria-labelledby': titleId };

  return (
    <section className={classNames} {...labellingProps}>
      <header className="assessment-authoring-section__header">
        <div className="assessment-authoring-section__heading">
          <HeadingElement id={titleId} className="assessment-authoring-section__title">
            {title}
          </HeadingElement>
          {description && (
            <div className="assessment-authoring-section__description">{description}</div>
          )}
        </div>
        {(status || action) && (
          <div className="assessment-authoring-section__aside">
            {status && <div className="assessment-authoring-section__status">{status}</div>}
            {action && <div className="assessment-authoring-section__action">{action}</div>}
          </div>
        )}
      </header>
      <div className="assessment-authoring-section__content">{children}</div>
    </section>
  );
}

export default AssessmentAuthoringSection;
