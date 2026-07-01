import { describe, expect, it } from 'vitest';

import type { ListeningAuthoringDocumentV1 } from '../types/listeningAuthoring.types';
import { validateListeningPublish } from './listeningAuthoringValidation';

const createDocument = (
  overrides: Partial<ListeningAuthoringDocumentV1> = {},
): ListeningAuthoringDocumentV1 => ({
  title: 'Image mode listening test',
  type: 'IELTS',
  skill: 'Listening',
  duration: 30,
  difficulty: 'Intermediate',
  questionCount: 2,
  isPublic: false,
  isComplete: true,
  displayMode: 'image',
  metadata: {
    description: '',
    instructions: '',
    tags: [],
  },
  audioSections: [{
    number: 1,
    name: 'Section 1',
    audioUrl: 'https://cdn.example.com/audio.mp3',
    startQuestion: 1,
    endQuestion: 2,
  }],
  questionImages: [{
    sectionNumber: 1,
    imageUrl: 'https://cdn.example.com/page-1.png',
    questionRange: { start: 1, end: 2 },
  }],
  questions: [
    {
      number: 1,
      type: 'short-answer',
      question: '',
      answer: 'fish',
      sectionNumber: 1,
      points: 1,
    },
    {
      number: 2,
      type: 'short-answer',
      question: '',
      answer: 'roof',
      sectionNumber: 1,
      points: 1,
    },
  ],
  settings: {
    allowPause: true,
    showTimer: true,
    shuffleQuestions: false,
    showResults: 'after-submission',
    allowReview: true,
    passingScore: 0,
    allowReplay: false,
  },
  ...overrides,
});

describe('listening authoring validation', () => {
  it('accepts image-mode questions whose prompts are covered by question images', () => {
    expect(validateListeningPublish(createDocument())).toEqual([]);
  });

  it('blocks image-mode questions without text or image coverage', () => {
    expect(validateListeningPublish(createDocument({ questionImages: [] }))).toEqual([
      {
        questionNumber: 1,
        field: 'questionImage',
        severity: 'blocker',
        guidance: 'Publish requires question image coverage or a typed prompt for every question.',
      },
      {
        questionNumber: 2,
        field: 'questionImage',
        severity: 'blocker',
        guidance: 'Publish requires question image coverage or a typed prompt for every question.',
      },
    ]);
  });
});
