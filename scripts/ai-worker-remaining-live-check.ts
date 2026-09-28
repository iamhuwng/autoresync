import assert from 'node:assert/strict';
import { signInLiveTeacher } from './lib/ai-worker-live-auth';

const auth = await signInLiveTeacher();
const { signOut } = await import('firebase/auth');
const originalFetch = globalThis.fetch;
const requests: { host: string; path: string; status: number }[] = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  assert(!['generativelanguage.googleapis.com', 'api.groq.com'].includes(url.hostname), 'Provider traffic must use the secured Worker.');
  const response = await originalFetch(input, init);
  requests.push({ host: url.hostname, path: url.pathname, status: response.status });
  return response;
};

try {
  const { hybridGeminiProvider } = await import('../src/services/ai/providers/hybrid.gemini.provider');
  const hybrid = await hybridGeminiProvider.extractSections(`Passage: Bees use a dance to show food direction.\n\nQuestions 1-2\n1. Bees communicate through a dance.\n2. The dance shows the direction of food.`);
  assert(hybrid.success, hybrid.success ? undefined : hybrid.error);
  assert(hybrid.data.passages.length > 0);
  assert(hybrid.data.questions.length > 0);

  const { executeGeminiWithKeyRotation } = await import('../src/services/ai/gemini-key-rotation.service');
  const current = {
    testCount: 3,
    averageScore: 72,
    strongestSkills: ['Reading'],
    weakestSkills: ['Grammar'],
    recurringGaps: ['subject-verb agreement (2 low-performance items)'],
  };
  const prompt = {
    current,
    previous: null,
    positives: ['Your current strongest area is Reading.'],
    regressions: [],
    repetitions: ['Subject-verb agreement has repeated across recent work.'],
    deterministicNarrative: {
      summary: 'Reading is steadier while grammar still needs practice.',
      progression: 'Reading is your strongest area.',
      regression: 'No clear decline appears in this window.',
      repetition: 'Subject-verb agreement has repeated in missed items.',
      advice: 'Review each correction and practise the same pattern again.',
    },
  };
  const progressive = await executeGeminiWithKeyRotation<{ summary: string; advice: string }>({
    callerName: 'ProgressiveFeedbackLiveContract',
    attempt: async ({ key, GoogleGenerativeAI }) => {
      const model = new GoogleGenerativeAI(key).getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: 'application/json' },
      });
      const result = await model.generateContent(
        `You are an academic progress coach for a secondary-school student preparing for increasingly demanding English assessments.
Write in a warm, observant, deeply human coaching voice.
The student should feel understood, not processed.
Write as one natural paragraph for the summary field.
Do not write like a report.
Do not use rigid labels or robotic transitions.
Do not just name skill or task types without explaining what is actually going wrong or improving.
Use the patterns in the recent results to explain what seems to be getting stronger, what is slipping, and what is repeating enough to risk fossilizing into a habit.
When a weakness is mentioned, phrase it clearly in learning terms, not as a bare category name.
When a repeated mistake is mentioned, make it clear that it may become a bad habit if left uncorrected.
Offer guidance that feels calm, specific, and study-oriented.
Do not mention AI, models, data windows, or exam names.
Focus on patterns, changes, repeated mistakes, and the next best learning actions.
The tone should guide the student toward stronger foundations, better accuracy, and more stable performance under test conditions.
Return ONLY valid JSON with keys summary, progression, regression, repetition, advice.\n\n${JSON.stringify(prompt)}`,
      );
      const text = result.response.text();
      if (!text) return { status: 'continue' };
      const parsed = JSON.parse(text);
      if (!parsed.summary || !parsed.advice) return { status: 'continue' };
      return { status: 'success', value: parsed };
    },
  });
  assert(progressive.success, progressive.error);
  assert(progressive.value?.summary.trim());
  assert(progressive.value?.advice.trim());
  const inferenceRequests = requests.filter((request) => request.path === '/ai/gemini');
  assert(
    inferenceRequests.length >= 2
      && inferenceRequests.every((request) => request.host === 'thcs-gemma-deno-canary.iamhuwng.workers.dev')
      && inferenceRequests.some((request) => request.status === 200),
    JSON.stringify(inferenceRequests),
  );
  console.log(JSON.stringify({
    hybrid: { passages: hybrid.data.passages.length, questions: hybrid.data.questions.length },
    progressive: { hasSummary: true, hasAdvice: true },
    requests: inferenceRequests.map(({ path, status }) => ({ path, status })),
  }));
} finally {
  globalThis.fetch = originalFetch;
  await signOut(auth);
}
process.exit(0);
