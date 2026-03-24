import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AIMaintenanceBanner from './AIMaintenanceBanner';
import { useAIStatus } from '../../hooks/useAIStatus';

vi.mock('../../hooks/useAIStatus', () => ({
  useAIStatus: vi.fn(),
}));

const mockRefresh = vi.fn(() => Promise.resolve());

function buildStatus(overrides: Record<string, unknown> = {}) {
  return [
    {
      available: false,
      maintenance: true,
      reason: 'AI system is currently in maintenance because all configured AI API keys are exhausted or cooling down.',
      loaded: true,
      details: {
        available: false,
        geminiAvailable: false,
        groqAvailable: false,
        totalKeys: 2,
        benchedKeys: 2,
        shortestCooldownRemaining: 45,
        checkedAt: Date.now(),
      },
      ...overrides,
    },
    { refresh: mockRefresh },
  ] as const;
}

describe('AIMaintenanceBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the maintenance message when AI is unavailable', () => {
    vi.mocked(useAIStatus).mockReturnValue(buildStatus() as any);

    render(<AIMaintenanceBanner />);

    expect(screen.getByText('AI System In Maintenance')).toBeInTheDocument();
    expect(screen.getByText(/all configured ai api keys/i)).toBeInTheDocument();
    expect(screen.getByText(/estimated recovery: ~45 seconds/i)).toBeInTheDocument();
  });

  it('reappears after a dismissed outage clears and later returns', () => {
    vi.mocked(useAIStatus).mockReturnValue(buildStatus() as any);
    const { rerender } = render(<AIMaintenanceBanner />);

    fireEvent.click(screen.getByLabelText('Dismiss banner'));
    expect(screen.queryByText('AI System In Maintenance')).not.toBeInTheDocument();

    vi.mocked(useAIStatus).mockReturnValue(
      buildStatus({ maintenance: false, available: true, reason: undefined }) as any,
    );
    rerender(<AIMaintenanceBanner />);

    vi.mocked(useAIStatus).mockReturnValue(buildStatus() as any);
    rerender(<AIMaintenanceBanner />);

    expect(screen.getByText('AI System In Maintenance')).toBeInTheDocument();
  });

  it('calls refresh when the retry button is clicked', async () => {
    vi.mocked(useAIStatus).mockReturnValue(buildStatus() as any);

    render(<AIMaintenanceBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });
});
