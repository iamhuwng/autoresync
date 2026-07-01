import { describe, expect, it, vi } from 'vitest';

import { validateListeningPublishReadiness } from './listeningPublishReadiness';
import type { ListeningAuthoringDocumentV1 } from '../types/listeningAuthoring.types';

const createDocument = (
  section: Partial<ListeningAuthoringDocumentV1['audioSections'][number]> = {},
): ListeningAuthoringDocumentV1 => ({
  title: 'Ready Listening Test',
  type: 'IELTS',
  skill: 'Listening',
  duration: 30,
  difficulty: 'Intermediate',
  questionCount: 1,
  isPublic: false,
  isComplete: true,
  displayMode: 'text',
  metadata: {
    description: '',
    instructions: 'Listen and answer.',
    tags: ['IELTS', 'Listening'],
  },
  audioSections: [{
    number: 1,
    name: 'Section 1',
    audioUrl: 'https://cdn.example.com/listening.mp3',
    streamUrl: 'https://cdn.example.com/listening.mp3',
    assetId: 'asset-1',
    startQuestion: 1,
    endQuestion: 10,
    ...section,
  }],
  questions: [{
    number: 1,
    type: 'short-answer',
    question: 'Answer the question.',
    answer: 'A',
    sectionNumber: 1,
    points: 1,
  }],
  settings: {
    allowPause: true,
    showTimer: true,
    shuffleQuestions: false,
    showResults: 'after-submission',
    allowReview: true,
    passingScore: 0,
    allowReplay: false,
  },
});

const response = (
  status: number,
  headers: Record<string, string> = {},
): Response => ({
  status,
  ok: status >= 200 && status < 300,
  headers: {
    get(name: string) {
      return headers[name.toLowerCase()] ?? headers[name] ?? null;
    },
  },
}) as Response;

describe('validateListeningPublishReadiness', () => {
  it('fails closed when a publishable audio section lacks canonical asset identity', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(206, {
      'accept-ranges': 'bytes',
      'content-range': 'bytes 0-0/2048',
    }));

    const result = await validateListeningPublishReadiness(
      createDocument({ assetId: undefined }),
      { fetchImpl },
    );

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual([
      expect.objectContaining({
        sectionNumber: 1,
        field: 'assetId',
        severity: 'blocker',
      }),
    ]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed when delivery ignores byte-range requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, {
      'content-length': '2048',
    }));

    const result = await validateListeningPublishReadiness(createDocument(), { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith('https://cdn.example.com/listening.mp3', {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    });
    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual([
      expect.objectContaining({
        sectionNumber: 1,
        field: 'byteRange',
        guidance: expect.stringContaining('byte-range'),
      }),
    ]);
  });

  it('passes only when canonical audio has reachable seekable range delivery', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(206, {
      'accept-ranges': 'bytes',
      'content-range': 'bytes 0-0/2048',
      'content-length': '1',
    }));

    const result = await validateListeningPublishReadiness(createDocument(), { fetchImpl });

    expect(result).toEqual({
      status: 'ready',
      blockers: [],
      checkedSections: 1,
    });
  });

  it('uses trusted authoring asset probe before browser URL fetch for uploaded temp assets', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('CORS preflight blocked'));
    const probeListeningAuthoringAsset = vi.fn().mockResolvedValue({
      status: 'ready',
      range: {
        requestRange: 'bytes=0-0',
        status: 206,
        acceptRanges: 'bytes',
        contentLength: 1,
        contentRange: 'bytes 0-0/2048',
      },
    });

    const result = await validateListeningPublishReadiness(createDocument(), {
      fetchImpl,
      authoritySections: [{
        number: 1,
        assetId: 'asset-1',
        uploadSessionId: 'session-1',
      }],
      probeListeningAuthoringAsset,
    });

    expect(result).toEqual({
      status: 'ready',
      blockers: [],
      checkedSections: 1,
    });
    expect(probeListeningAuthoringAsset).toHaveBeenCalledWith({
      uploadSessionId: 'session-1',
      assetId: 'asset-1',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('blocks when trusted authoring asset probe cannot read the uploaded object', async () => {
    const result = await validateListeningPublishReadiness(createDocument(), {
      authoritySections: [{
        number: 1,
        assetId: 'asset-1',
        uploadSessionId: 'session-1',
      }],
      probeListeningAuthoringAsset: vi.fn().mockRejectedValue(new Error('asset_not_uploaded')),
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual([
      expect.objectContaining({
        sectionNumber: 1,
        field: 'audioUrl',
        guidance: 'Audio delivery path is not reachable. Re-upload the audio before publishing.',
      }),
    ]);
  });
});
