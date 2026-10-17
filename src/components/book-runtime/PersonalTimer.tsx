import { usePersonalTimer, type PersonalTimerStorage, type PersonalTimerChannelFactory } from '../../hooks/book-runtime/usePersonalTimer';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import './PersonalTimer.css';

export interface PersonalTimerProps {
  readonly timerKey: string;
  readonly storage?: PersonalTimerStorage;
  readonly monotonicNow?: () => number;
  readonly wallNow?: () => number;
  readonly tabId?: string;
  readonly channelFactory?: PersonalTimerChannelFactory;
  readonly countdownMs?: number;
  readonly compact?: boolean;
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
  countdownMs,
  compact = false,
}: PersonalTimerProps) => {
  const timer = usePersonalTimer({ timerKey, storage, monotonicNow, wallNow, tabId, channelFactory, durationMs: countdownMs });
  const { trackAction } = useFeatureTracking(FEATURE_IDS.testTaking);
  const titleId = `personal-timer-title-${timerKey}`;
  const descriptionId = `personal-timer-description-${timerKey}`;
  const progress = (timer.elapsedMs % 60_000) / 60_000;
  if (compact && countdownMs !== undefined) {
    const remaining = Math.max(0, countdownMs - timer.elapsedMs);
    const seconds = Math.ceil(remaining / 1000);
    const label = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    const finished = remaining === 0;
    return <details className="book-runtime-shell__timer" data-testid="personal-timer" onToggle={(event) => trackAction(event.currentTarget.open ? 'bookRuntimeTimerShown' : 'bookRuntimeTimerHidden', { timerKey })}><summary aria-label="Personal countdown timer">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M9 2h6M12 8v5l3 2" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
      <span data-testid="personal-timer-elapsed">{label}</span></summary>
      <div><p>Optional personal timer · {finished ? 'Finished' : timer.isRunning ? 'Running' : 'Paused'}</p>
        <button type="button" data-testid={timer.isRunning ? 'personal-timer-pause' : 'personal-timer-start'} disabled={!timer.isHydrated || finished} onClick={timer.isRunning ? () => { trackAction('bookRuntimeTimerPaused', { timerKey }); timer.pause(); } : () => { trackAction(timer.elapsedMs ? 'bookRuntimeTimerResumed' : 'bookRuntimeTimerStarted', { timerKey }); timer.start(); }}>{timer.isRunning ? 'Pause' : timer.elapsedMs ? 'Resume' : 'Start timer'}</button>
        <button type="button" disabled={!timer.isHydrated || finished} onClick={() => { trackAction('bookRuntimeTimerFinished', { timerKey }); timer.finish(); }}>Finish timer</button>
        <button type="button" data-testid="personal-timer-reset" disabled={!timer.isHydrated} onClick={() => { trackAction('bookRuntimeTimerReset', { timerKey }); timer.reset(); }}>Reset</button>
        <p>Never submits work or changes deadlines. Backgrounding pauses the timer.</p></div>
    </details>;
  }

  if (!timer.isVisible) {
    return (
      <div className="personal-timer personal-timer--hidden" data-testid="personal-timer">
        <button
          aria-label="Show personal timer"
          data-testid="personal-timer-show"
          disabled={!timer.isHydrated}
          onClick={() => { trackAction('bookRuntimeTimerShown', { timerKey }); timer.show(); }}
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
          onClick={timer.isRunning ? () => { trackAction('bookRuntimeTimerPaused', { timerKey }); timer.pause(); } : () => { trackAction(timer.elapsedMs ? 'bookRuntimeTimerResumed' : 'bookRuntimeTimerStarted', { timerKey }); timer.start(); }}
          type="button"
        >
          {timer.isRunning ? 'Pause' : timer.elapsedMs > 0 ? 'Resume' : 'Start timer'}
        </button>
        <button data-testid="personal-timer-reset" disabled={!timer.isHydrated} onClick={() => { trackAction('bookRuntimeTimerReset', { timerKey }); timer.reset(); }} type="button">
          Reset
        </button>
        <button data-testid="personal-timer-hide" disabled={!timer.isHydrated} onClick={() => { trackAction('bookRuntimeTimerHidden', { timerKey }); timer.hide(); }} type="button">
          Hide
        </button>
      </div>
      <p className="personal-timer__policy">Backgrounding or reloading pauses it; elapsed time stays local to this Student session.</p>
    </section>
  );
};

export default PersonalTimer;
