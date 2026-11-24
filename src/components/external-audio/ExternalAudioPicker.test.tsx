import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { createExternalAudioClient } from '@/services/externalAudioClient';
import { ExternalAudioPicker } from './ExternalAudioPicker';

vi.mock('@/components/modern/ToastNotification', () => ({ toast: { error: vi.fn() } }));

it('selects a file card on click, highlights it, and auto-loads audio preview without crossOrigin', async () => {
    const file = { objectKey: 'teacher/dialogue.wav', providerVersionId: 'selected-version', contentType: 'audio/wav', sizeBytes: 32000 };
    const url = 'https://s3.us-west-004.backblazeb2.com/bucket/teacher/dialogue.wav?versionId=selected-version&X-Amz-Signature=fixture';
    const fetchImpl = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ files: [file], nextCursor: null }))
        .mockResolvedValueOnce(Response.json(file))
        .mockResolvedValueOnce(Response.json({ file, url, expiresAt: Date.now() + 120_000 }));
    const client = createExternalAudioClient('http://localhost:8787', async () => 'id-token', fetchImpl);
    const inspect = vi.fn();
    const track = vi.fn();
    const { unmount } = render(<ExternalAudioPicker client={client}
        connection={{ id: 'connection-1', prefix: 'teacher/', bucketName: 'bucket', state: 'active', health: 'healthy', checkedAt: 100 }}
        onInspect={inspect} track={track} />);
    const card = await screen.findByRole('button', { name: /teacher\/dialogue\.wav/i });
    fireEvent.click(card);
    const player = await screen.findByLabelText('Audio preview');
    expect(player).toHaveAttribute('src', url);
    expect(player).not.toHaveAttribute('crossorigin');
    expect(card).toHaveAttribute('aria-pressed', 'true');
    expect(card).toHaveClass('is-selected');
    expect(inspect.mock.calls).toEqual([[null], [file]]);
    expect(track.mock.calls).toEqual([['externalAudioInspect'], ['externalAudioPreview']]);
    unmount();
    expect(screen.queryByLabelText('Audio preview')).not.toBeInTheDocument();
});
