import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { expect, it, vi } from 'vitest';
import { ResourceManager } from './ResourceManager';

vi.mock('../../PassageEditorPanel', () => ({ default: () => null }));
vi.mock('./AudioResourceEditor', () => ({
  AudioResourceEditor: ({ readOnly, resource }: any) => <><audio aria-label="Audio preview" src={resource.audioUrl} /><button disabled={readOnly}>Replace audio</button></>,
}));
vi.mock('./ImageResourceEditor', () => ({
  ImageResourceEditor: ({ readOnly }: { readOnly: boolean }) => <button disabled={readOnly}>Edit image</button>,
}));

it('keeps deferred Listening audio controls disabled while allowing question-image edits', () => {
  const update = vi.fn();
  render(<ResourceManager skill="Listening" totalQuestions={1} audioReadOnly onUpdateResources={update} resources={[
    { id: 'audio-1', type: 'audio', title: 'Section 1', audioUrl: 'https://audio.example/a.mp3' },
    { id: 'image-1-0', type: 'image', title: 'Questions image', images: ['https://images.example/a.png'] },
  ]} />);
  expect(screen.queryByRole('button', { name: '+ Text' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '+ Audio' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Delete Section 1' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Replace audio' })).toBeDisabled();
  fireEvent.click(screen.getByText('Questions image'));
  expect(screen.getByRole('button', { name: 'Edit image' })).toBeEnabled();
  expect(update).not.toHaveBeenCalled();
});

it('renders a signed preview without changing the saved resource URL', () => {
  const resource = { id: 'audio-1', type: 'audio' as const, title: 'Section 1', audioUrl: 'https://audio.example/permanent.mp3' };
  render(<ResourceManager skill="Listening" totalQuestions={1} audioReadOnly onUpdateResources={vi.fn()}
    audioPreviewUrls={{ 'audio-1': 'https://worker.example/listening-content?token=preview' }} resources={[resource]} />);
  expect(screen.getByLabelText('Audio preview')).toHaveAttribute('src', 'https://worker.example/listening-content?token=preview');
  expect(resource.audioUrl).toBe('https://audio.example/permanent.mp3');
});
