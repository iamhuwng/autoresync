import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useTestCreation } from './useTestCreation';
import r2StorageService from '../services/r2Storage';
import { saveTestToFirebase } from '../services/testStorage';

vi.mock('./useAuth', () => ({ useAuth: () => ({ user: { uid: 'teacher' } }) }));
vi.mock('./useParsingProgress', () => ({
  useParsingProgress: () => [
    { stage: 'converting', progress: 0, message: '', hasCheckpoint: false, isParsing: false },
    { startParsing: vi.fn(), complete: vi.fn(), setStage: vi.fn(), setProgress: vi.fn(), setMessage: vi.fn() },
  ],
}));
vi.mock('../services/test-creation', () => ({
  testCreationService: {
    parseDocument: vi.fn().mockResolvedValue({
      success: true,
      validationResult: {
        mergedQuestions: [{ questionNumber: 1, questionText: 'Label the diagram', type: 'diagram-labeling', answer: 'A', passageId: 'p1', confidence: 90, uncertain: false }],
        discrepancies: [],
      },
    }),
  },
}));
vi.mock('../services/r2Storage', () => ({ default: { uploadImage: vi.fn() } }));
vi.mock('../services/testStorage', () => ({ saveTestToFirebase: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

it('uploads a durable diagram URL and passes it to test storage', async () => {
  vi.mocked(r2StorageService.uploadImage).mockResolvedValue({ url: 'https://example.com/diagram.png' } as any);
  vi.mocked(saveTestToFirebase).mockResolvedValue({ success: true, testId: 'test-1' });
  const { result } = renderHook(() => useTestCreation());

  await act(async () => {
    await result.current[1].startParsing({ type: 'text', data: 'Passage', format: 'academic' });
  });
  const file = new File(['diagram'], 'diagram.png', { type: 'image/png' });
  await act(async () => {
    await result.current[1].uploadDiagramImage(1, file);
  });

  expect(r2StorageService.uploadImage).toHaveBeenCalledWith(file);
  expect(result.current[0].questions[0].diagramImage).toBe('https://example.com/diagram.png');
  expect(result.current[0].completenessChecks.find(check => check.id === 'images')?.status).toBe('complete');

  await act(async () => {
    await result.current[1].publishTest();
  });
  expect(vi.mocked(saveTestToFirebase).mock.calls[0][2][0].imageUrl).toBe('https://example.com/diagram.png');
});
