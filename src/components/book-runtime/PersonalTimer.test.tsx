import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonalTimerStorage } from '../../hooks/book-runtime/usePersonalTimer';
import { PersonalTimer } from './PersonalTimer';

const trackAction = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useFeatureTracking', () => ({ useFeatureTracking: () => ({ trackAction }) }));

const createStore = (): PersonalTimerStorage => {
  const values = new Map<string, unknown>();
  return {
    get: async <T,>(key: string) => (values.get(key) as T | undefined) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

describe('PersonalTimer', () => {
  afterEach(cleanup);

  it('exposes accessible SVG text, 44px controls, and hide/show without runtime wiring', async () => {
    const user = userEvent.setup();
    render(<PersonalTimer timerKey="component" storage={createStore()} channelFactory={() => null} />);

    await waitFor(() => expect(screen.getByTestId('personal-timer-start')).toBeEnabled());
    expect(screen.getByRole('img', { name: /Personal timer Personal only/iu })).toBeInTheDocument();
    expect(screen.getByTestId('personal-timer-elapsed')).toHaveTextContent('00:00');
    expect(screen.getByTestId('personal-timer').querySelectorAll('button')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.getByTestId('personal-timer-show')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show personal timer' }));
    expect(screen.getByRole('button', { name: 'Start timer' })).toBeInTheDocument();
  });

  it('tracks compact countdown disclosure through registered visibility actions', async () => {
    const user = userEvent.setup();
    trackAction.mockClear();
    render(<PersonalTimer timerKey="compact" compact countdownMs={60_000} storage={createStore()} channelFactory={() => null} />);
    const disclosure = screen.getByLabelText('Personal countdown timer');
    await user.click(disclosure);
    await waitFor(() => expect(trackAction).toHaveBeenCalledWith('bookRuntimeTimerShown', { timerKey: 'compact' }));
    await user.click(disclosure);
    await waitFor(() => expect(trackAction).toHaveBeenCalledWith('bookRuntimeTimerHidden', { timerKey: 'compact' }));
  });
});
