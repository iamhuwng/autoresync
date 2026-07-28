import { usePersonalTimer, type PersonalTimerStorage, type PersonalTimerChannelFactory } from '../../hooks/book-runtime/usePersonalTimer';
import './PersonalTimer.css';

export interface PersonalTimerProps {
  readonly timerKey: string;
  readonly storage?: PersonalTimerStorage;
  readonly monotonicNow?: () => number;
  readonly wallNow?: () => number;
  readonly tabId?: string;
  readonly channelFactory?: PersonalTimerChannelFactory;
}

const RADIUS = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const PersonalTimer = ({
  timerKey,
  storage,
  monotonicNow,
  wallNow,
  tabId,
  channelFactory,
}: PersonalTimerProps) => {
  const timer = usePersonalTimer({ timerKey, storage, monotonicNow, wallNow, tabId, channelFactory });
  const titleId = `personal-timer-title-${timerKey}`;
  const descriptionId = `personal-timer-description-${timerKey}`;
  const progress = (timer.elapsedMs % 60_000) / 60_000;

  if (!timer.isVisible) {
    return (
      <div className="personal-timer personal-timer--hidden" data-testid="personal-timer">
        <button
          aria-label="Show personal timer"
          data-testid="personal-timer-show"
          disabled={!timer.isHydrated}
          onClick={timer.show}
          type="button"
        >
          Show personal timer
        </button>
      </div>
    );
  }

  return (
    <section aria-labelledby={titleId} className="personal-timer" data-testid="personal-timer">
      <div className="personal-timer__heading">
        <div>
          <p className="personal-timer__eyebrow">Optional focus aid</p>
          <h2 id={titleId}>Personal timer</h2>
          <p id={descriptionId}>Personal only. Unrelated to assignment deadlines and results.</p>
        </div>
        <svg
          aria-labelledby={`${titleId} ${descriptionId}`}
          className="personal-timer__dial"
          height="84"
          role="img"
          viewBox="0 0 84 84"
          width="84"
        >
          <circle className="personal-timer__track" cx="42" cy="42" fill="none" r={RADIUS} />
          <circle
            className="personal-timer__progress"
            cx="42"
            cy="42"
            fill="none"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            transform="rotate(-90 42 42)"
          />
        </svg>
      </div>
      <p aria-live="polite" className="personal-timer__elapsed" data-testid="personal-timer-elapsed">
        {timer.elapsedLabel}
      </p>
      <p className="personal-timer__state" role="status">
        {timer.isRunning ? 'Running' : timer.elapsedMs > 0 ? 'Paused' : 'Not running'}
      </p>
      <div className="personal-timer__controls">
        <button
          data-testid={timer.isRunning ? 'personal-timer-pause' : 'personal-timer-start'}
          disabled={!timer.isHydrated}
          onClick={timer.isRunning ? timer.pause : timer.start}
          type="button"
        >
          {timer.isRunning ? 'Pause' : timer.elapsedMs > 0 ? 'Resume' : 'Start timer'}
        </button>
        <button data-testid="personal-timer-reset" disabled={!timer.isHydrated} onClick={timer.reset} type="button">
          Reset
        </button>
        <button data-testid="personal-timer-hide" disabled={!timer.isHydrated} onClick={timer.hide} type="button">
          Hide
        </button>
      </div>
      <p className="personal-timer__policy">Backgrounding or reloading pauses it; elapsed time stays local to this Student session.</p>
    </section>
  );
};

export default PersonalTimer;
