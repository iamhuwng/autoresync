import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { AudioResourceEditor } from './AudioResourceEditor';

const { upload, success, error } = vi.hoisted(() => ({ upload: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('../../../services/r2Storage', () => ({ default: { uploadAudioReplacement: upload } }));
vi.mock('../../../hooks/useFeatureTracking', () => ({ useFeatureTracking: () => ({ trackAction: vi.fn() }) }));
vi.mock('../../modern', () => ({
    toast: { success, error, info: vi.fn() },
    Button: ({ children, loading, icon, ...props }: any) => <button {...props}>{icon}{children}</button>,
}));
const resource = { id: 'audio-1', type: 'audio' as const, title: 'Section 1', audioUrl: 'https://audio.example/old.mp3',
    assetId: 'old', uploadSessionId: 'old-session', streamUrl: 'https://audio.example/old.mp3', duration: 20, questionStart: 1, questionEnd: 10 };
beforeEach(() => vi.clearAllMocks());

it('replaces audio through the supplied uploader, retaining canonical metadata and a separate preview', async () => {
    const onUpdate = vi.fn();
    const uploadAudio = vi.fn().mockResolvedValue({ audioUrl: 'https://audio.example/temp.mp3', streamUrl: 'https://audio.example/temp.mp3', assetId: 'new', uploadSessionId: 'new-session' });
    render(<AudioResourceEditor resource={resource} totalQuestions={10} onUpdate={onUpdate} uploadAudio={uploadAudio} previewUrl="https://worker.example/preview" />);
    expect(screen.getByLabelText('Audio preview')).toHaveAttribute('src', 'https://worker.example/preview');
    fireEvent.change(screen.getByLabelText('Audio file'), { target: { files: [new File(['audio'], 'part.mp3', { type: 'audio/mpeg' })] } });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith({ ...resource, audioUrl: 'https://audio.example/temp.mp3', streamUrl: 'https://audio.example/temp.mp3', assetId: 'new', uploadSessionId: 'new-session', duration: 0 });
    expect(upload).not.toHaveBeenCalled();
});

it('preserves saved audio when replacement fails and clears its identity atomically on remove', async () => {
    const onUpdate = vi.fn();
    render(<AudioResourceEditor resource={resource} totalQuestions={10} onUpdate={onUpdate} uploadAudio={vi.fn().mockRejectedValue(new Error('Upload failed'))} />);
    fireEvent.change(screen.getByLabelText('Audio file'), { target: { files: [new File(['audio'], 'part.mp3', { type: 'audio/mpeg' })] } });
    await waitFor(() => expect(error).toHaveBeenCalledWith('Upload failed'));
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Remove'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ ...resource, audioUrl: '', streamUrl: undefined, assetId: undefined, uploadSessionId: undefined, duration: 0 });
});

it('never writes duration metadata in read-only mode or from a stale resource player', () => {
    const onUpdate = vi.fn();
    const { rerender } = render(<AudioResourceEditor resource={{ ...resource, duration: 0 }} totalQuestions={10} onUpdate={onUpdate} readOnly />);
    const player = screen.getByLabelText('Audio preview');
    Object.defineProperty(player, 'duration', { value: 30 });
    fireEvent.loadedMetadata(player);
    expect(onUpdate).not.toHaveBeenCalled();
    rerender(<AudioResourceEditor resource={{ ...resource, id: 'audio-2', duration: 0 }} totalQuestions={10} onUpdate={onUpdate} />);
    fireEvent.loadedMetadata(player);
    expect(onUpdate).not.toHaveBeenCalled();
});

it('keeps the generic uploader when no Listening callback is supplied', async () => {
    const onUpdate = vi.fn();
    upload.mockResolvedValue({ url: 'https://audio.example/replacement.mp3' });
    render(<AudioResourceEditor resource={resource} totalQuestions={10} onUpdate={onUpdate} />);
    const file = new File(['audio'], 'part.mp3', { type: 'audio/mpeg' });
    fireEvent.change(screen.getByLabelText('Audio file'), { target: { files: [file] } });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledWith(file, resource.audioUrl, 'audio', expect.any(Function));
    expect(onUpdate).toHaveBeenCalledWith({ ...resource, audioUrl: 'https://audio.example/replacement.mp3', duration: 0 });
});

it('ignores an upload completion after the editor is unmounted', async () => {
    let complete!: (value: Partial<typeof resource>) => void;
    const pending = new Promise<Partial<typeof resource>>(resolve => { complete = resolve; });
    const onUpdate = vi.fn();
    const { unmount } = render(<AudioResourceEditor resource={resource} totalQuestions={10} onUpdate={onUpdate} uploadAudio={() => pending} />);
    fireEvent.change(screen.getByLabelText('Audio file'), { target: { files: [new File(['audio'], 'part.mp3', { type: 'audio/mpeg' })] } });
    unmount();
    complete({ audioUrl: 'https://audio.example/new.mp3' });
    await pending;
    expect(onUpdate).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
});
