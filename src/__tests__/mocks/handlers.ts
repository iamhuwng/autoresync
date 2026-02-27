import { http, HttpResponse } from 'msw';

// Mock Gemini API responses
export const handlers = [
  // Gemini API - Success
  http.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent', () => {
    return HttpResponse.json({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              passages: [{
                id: 'p1',
                title: 'Test Passage',
                content: 'Mock passage content',
                type: 'text',
                questionStart: 1,
                questionEnd: 3,
                wordCount: 50,
              }],
              questions: [{
                questionNumber: 1,
                questionText: 'What is the answer?',
                type: 'multiple-choice',
                options: ['A', 'B', 'C', 'D'],
                answer: 'A',
                passageId: 'p1',
                confidence: 95,
              }],
              answerKey: {
                '1': 'A',
              },
              confidence: 90,
            }),
          }],
        },
      }],
    });
  }),

  // Groq API - Success
  http.post('https://api.groq.com/openai/v1/chat/completions', () => {
    return HttpResponse.json({
      choices: [{
        message: {
          content: JSON.stringify({
            passages: [],
            questions: [{
              questionNumber: 1,
              questionText: 'Groq test question?',
              type: 'completion',
              answer: 'test',
              confidence: 85,
            }],
            answerKey: {},
            confidence: 85,
          }),
        },
      }],
    });
  }),

  // Gemini API - Rate limit error
  http.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent*rate-limit', () => {
    return HttpResponse.json(
      { error: { message: '429: Rate limit exceeded' } },
      { status: 429 }
    );
  }),

  // Gemini API - Server error
  http.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent*error', () => {
    return HttpResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }),
];
