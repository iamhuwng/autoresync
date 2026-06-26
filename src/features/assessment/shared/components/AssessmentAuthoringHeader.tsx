import { useId, type ReactNode } from 'react';
import './AssessmentAuthoringHeader.css';

type AssessmentAuthoringHeaderHeadingLevel = 2 | 3 | 4;
type AssessmentAuthoringHeaderHeadingElement = `h${AssessmentAuthoringHeaderHeadingLevel}`;
type AssessmentAuthoringHeaderStackAt = 'mobile' | 'always';

export interface AssessmentAuthoringHeaderProps {
  readonly title: ReactNode;
  readonly eyebrow?: ReactNode;
  readonly description?: ReactNode;
  readonly status?: ReactNode;
  readonly action?: ReactNode;
  readonly headingLevel?: AssessmentAuthoringHeaderHeadingLevel;
  readonly children?: ReactNode;
  readonly ariaLabel?: string;
  readonly stackAt?: AssessmentAuthoringHeaderStackAt;
  readonly className?: string;
}

export function AssessmentAuthoringHeader({
  title,
  eyebrow,
  description,
  status,
  action,
  headingLevel = 2,
  children,
  ariaLabel,
  stackAt = 'mobile',
  className,
}: AssessmentAuthoringHeaderProps) {
  const titleId = useId();
  const HeadingElement = `h${headingLevel}` as AssessmentAuthoringHeaderHeadingElement;
  const classNames = [
    'assessment-authoring-header',
    `assessment-authoring-header--stack-${stackAt}`,
    className,
  ].filter(Boolean).join(' ');
  const labellingProps = ariaLabel ? { 'aria-label': ariaLabel } : { 'aria-labelledby': titleId };

  return (
    <section className={classNames} {...labellingProps}>
      <div className="assessment-authoring-header__row">
        <div className="assessment-authoring-header__heading">
          {eyebrow !== undefined && eyebrow !== null ? (
            <div className="assessment-authoring-header__eyebrow">{eyebrow}</div>
          ) : null}
          <HeadingElement id={titleId} className="assessment-authoring-header__title">
            {title}
          </HeadingElement>
          {description !== undefined && description !== null ? (
            <div className="assessment-authoring-header__description">{description}</div>
          ) : null}
        </div>
        {(status !== undefined && status !== null) || (action !== undefined && action !== null) ? (
          <div className="assessment-authoring-header__aside">
            {status !== undefined && status !== null ? (
              <div className="assessment-authoring-header__status">{status}</div>
            ) : null}
            {action !== undefined && action !== null ? (
              <div className="assessment-authoring-header__action">{action}</div>
            ) : null}
          </div>
        ) : null}
      </div>
      {children !== undefined && children !== null ? (
        <div className="assessment-authoring-header__content">{children}</div>
      ) : null}
    </section>
  );
}

export default AssessmentAuthoringHeader;
