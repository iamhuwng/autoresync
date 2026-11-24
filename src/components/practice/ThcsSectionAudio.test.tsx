import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { AuthorizedDeliveryConfig } from '../../skills/listening/components/AudioPlayer';
import { ThcsSectionAudio } from './ThcsSectionAudio';

const { renderPlayer } = vi.hoisted(() => ({ renderPlayer: vi.fn() }));
vi.mock('../../skills/listening/components/AudioPlayer', () => ({ AudioPlayer: renderPlayer }));

it('keeps the player handoff stable on host renders and renews with the latest scoped handle', async () => {
    renderPlayer.mockReturnValue(null);
    const initial = { url: 'https://fixture.invalid/initial', expiresAt: 10_000, refreshAfter: 5_000, refreshHandle: 'initial' };
    const renewed = { ...initial, url: 'https://fixture.invalid/renewed', refreshHandle: 'renewed' };
    const client = { playThcs: vi.fn().mockResolvedValueOnce(initial).mockResolvedValue(renewed) };
    const scope = { testId: 'test', versionId: 'version', sectionId: 'section', assetId: 'asset' };
    const props = { client, scope, sectionNumber: 1, plays: 0, position: 0, onPosition: vi.fn(),
        onComplete: vi.fn(), track: vi.fn() };
    const { rerender } = render(<ThcsSectionAudio {...props} />);
    await waitFor(() => expect(renderPlayer).toHaveBeenCalled());
    const current = () => renderPlayer.mock.lastCall?.[0] as { authorizedDelivery: AuthorizedDeliveryConfig; onError: () => void };
    const original = current();

    rerender(<ThcsSectionAudio {...props} position={4} onComplete={vi.fn()} />);
    expect(current().authorizedDelivery).toBe(original.authorizedDelivery);
    expect(current().onError).toBe(original.onError);
    const refresh = current().authorizedDelivery.refreshSource!;
    const context = { sectionNumber: 1, masterRevision: null };
    await expect(refresh(context)).resolves.toEqual(renewed);
    await expect(refresh(context)).resolves.toEqual(renewed);
    expect(client.playThcs).toHaveBeenCalledTimes(3);
    expect(client.playThcs).toHaveBeenNthCalledWith(2, scope, undefined, 'initial');
    expect(client.playThcs).toHaveBeenNthCalledWith(3, scope, undefined, 'renewed');
    act(() => current().onError());
    const retry = screen.getByRole('button', { name: 'Retry section audio' });
    fireEvent.click(retry);
    await waitFor(() => expect(client.playThcs).toHaveBeenNthCalledWith(4, scope, expect.any(AbortSignal)));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});
