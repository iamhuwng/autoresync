import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { expect, it, vi } from 'vitest';
import { ResourceManager } from './ResourceManager';

vi.mock('../../PassageEditorPanel', () => ({ default: () => null }));
vi.mock('./AudioResourceEditor', () => ({
  AudioResourceEditor: ({ readOnly, resource, previewUrl }: any) => <><audio aria-label="Audio preview" src={previewUrl ?? resource.audioUrl} /><button disabled={readOnly}>Replace audio</button></>,
}));
vi.mock('./ImageResourceEditor', () => ({
  ImageResourceEditor: ({ readOnly }: { readOnly: boolean }) => <button disabled={readOnly}>Edit image</button>,
}));

it('allows Listening audio editing and question-image edits', () => {
  const update = vi.fn();
  render(<ResourceManager skill="Listening" totalQuestions={1} onUpdateResources={update} resources={[
    { id: 'audio-1', type: 'audio', title: 'Section 1', audioUrl: 'https://audio.example/a.mp3' },
    { id: 'image-1-0', type: 'image', title: 'Questions image', images: ['https://images.example/a.png'] },
  ]} />);
  expect(screen.queryByRole('button', { name: '+ Text' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '+ Audio' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Delete Section 1' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Replace audio' })).toBeEnabled();
  fireEvent.click(screen.getByText('Questions image'));
  expect(screen.getByRole('button', { name: 'Edit image' })).toBeEnabled();
  expect(update).not.toHaveBeenCalled();
});

it('renders a signed preview without changing the saved resource URL', () => {
  const resource = { id: 'audio-1', type: 'audio' as const, title: 'Section 1', assetId: 'asset-original', audioUrl: 'https://audio.example/permanent.mp3' };
  const { rerender } = render(<ResourceManager skill="Listening" totalQuestions={1} onUpdateResources={vi.fn()}
    audioPreviewUrls={{ 'asset-original': 'https://worker.example/listening-content?token=preview' }} resources={[resource]} />);
  expect(screen.getByLabelText('Audio preview')).toHaveAttribute('src', 'https://worker.example/listening-content?token=preview');
  expect(resource.audioUrl).toBe('https://audio.example/permanent.mp3');
  rerender(<ResourceManager skill="Listening" totalQuestions={1} onUpdateResources={vi.fn()}
    audioPreviewUrls={{ 'asset-original': 'https://worker.example/listening-content?token=preview' }} resources={[{ ...resource, assetId: 'replacement', audioUrl: 'https://audio.example/new.mp3' }]} />);
  expect(screen.getByLabelText('Audio preview')).toHaveAttribute('src', 'https://audio.example/new.mp3');
});
