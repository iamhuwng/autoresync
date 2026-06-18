import type { AriaRole, ReactNode } from 'react';
import './AssessmentStatusState.css';

export type AssessmentStatusStateVariant = 'loading' | 'error' | 'empty';

type AssessmentStatusStateAction = {
  readonly label: string;
  readonly onClick: () => void;
};

type AssessmentStatusStateElement = 'div' | 'main';
type AssessmentStatusStateTitleLevel = 1 | 2 | 3 | 4;
type AssessmentStatusStateTitleElement = `h${AssessmentStatusStateTitleLevel}`;
type AssessmentStatusStateAlign = 'start' | 'center';

export interface AssessmentStatusStateProps {
  readonly variant: AssessmentStatusStateVariant;
  readonly title: string;
  readonly titleLevel?: AssessmentStatusStateTitleLevel;
  readonly message?: ReactNode;
  readonly action?: AssessmentStatusStateAction;
  readonly secondaryAction?: AssessmentStatusStateAction;
  readonly as?: AssessmentStatusStateElement;
  readonly align?: AssessmentStatusStateAlign;
  readonly role?: AriaRole;
  readonly ariaLabel?: string;
  readonly ariaBusy?: boolean;
  readonly className?: string;
}

const DEFAULT_ROLE_BY_VARIANT: Record<AssessmentStatusStateVariant, AriaRole | undefined> = {
  loading: 'status',
  error: 'alert',
  empty: undefined,
};

export function AssessmentStatusState({
  variant,
  title,
  titleLevel = 1,
  message,
  action,
  secondaryAction,
  as: Element = 'div',
  align = 'start',
  role = DEFAULT_ROLE_BY_VARIANT[variant],
  ariaLabel,
  ariaBusy = variant === 'loading',
  className,
}: AssessmentStatusStateProps) {
  const TitleElement = `h${titleLevel}` as AssessmentStatusStateTitleElement;
  const classNames = [
    'assessment-status-state',
    `assessment-status-state--${variant}`,
    `assessment-status-state--align-${align}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <Element
      className={classNames}
      role={role}
      aria-label={ariaLabel}
      aria-busy={ariaBusy || undefined}
    >
      <div className="assessment-status-state__card">
        <div className="assessment-status-state__indicator" aria-hidden="true" />
        <div className="assessment-status-state__content">
          <TitleElement className="assessment-status-state__title">{title}</TitleElement>
          {message ? (
            <div className="assessment-status-state__message">{message}</div>
          ) : null}
          {(action || secondaryAction) ? (
            <div className="assessment-status-state__actions">
              {action ? (
                <button
                  type="button"
                  className="assessment-status-state__button assessment-status-state__button--primary"
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              ) : null}
              {secondaryAction ? (
                <button
                  type="button"
                  className="assessment-status-state__button assessment-status-state__button--secondary"
                  onClick={secondaryAction.onClick}
                >
                  {secondaryAction.label}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Element>
  );
}

export default AssessmentStatusState;
