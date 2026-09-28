import assert from 'node:assert/strict';
import { signInLiveTeacher } from './lib/ai-worker-live-auth';

const canary = 'https://thcs-gemma-deno-canary.iamhuwng.workers.dev';
const auth = await signInLiveTeacher();
let stage = 'load-app-services';
const [{ getActiveKeyIds }, { GroqProvider }] = await Promise.all([
  import('../src/services/api-keys.service'),
  import('../src/services/ai/groq.provider'),
]);

stage = 'list-active-groq-slots';
const keys = await getActiveKeyIds('groq');
assert(keys.length > 0, 'Expected at least one active Groq key slot');

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const providerRequestUrls: string[] = [];
let rejectedKeyDuringRotation = false;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  providerRequestUrls.push(url);
  return originalFetch(input, init);
};
console.warn = (...args: unknown[]) => {
  const message = args.map(String).join(' ');
  if (/\[Groq\] Marked key #\d+ \([^)]*\) as exhausted: Key rejected/.test(message)) {
    rejectedKeyDuringRotation = true;
  }
};

const provider = new GroqProvider();
let checks: Record<string, boolean>;
let exitCode = 0;
try {
  stage = 'writing-grade-contract';
  const grade = await provider.gradeWritingAnswer(
    'The student are happy because the story were interesting.',
    ['The students are happy because the story was interesting.'],
    'Rewrite the sentence using correct subject-verb agreement.',
  );

  stage = 'alternative-answer-contract';
  const suggestions = await provider.suggestAlternativeAnswers(
    'Although it was raining, we went for a walk.',
    ['Despite the rain, we went for a walk.'],
    'writing',
    { keyword: 'despite' },
  );

  stage = 'structured-json-contract';
  const structured = await provider.generateStructuredJson(
    'Return a JSON object with integer score from 0 to 100 and one short evidence string. Assess: “The students are happy because the story were interesting.” Correct answer: “The students are happy because the story was interesting.”',
    { preferredKeyIndex: 0, model: 'qwen/qwen3.8-27b', maxOutputTokens: 256 },
  );

  stage = 'writing-suggestion-batch-contract';
  const batch = await provider.generateWritingSuggestionBatch({
    taskPrompt: 'Write about whether students should read books every day.',
    essay: {
      taskNumber: 2,
      paragraphs: [{ paragraphIndex: 0, sentences: [
        { sentenceIndex: 0, text: 'Students should reads books every day because it improve their vocabulary.' },
        { sentenceIndex: 1, text: 'This habit also help them understand different ideas.' },
      ] }],
    },
    scope: 'grammar-correction',
    maxFindings: 2,
    priorFindingsLedger: [],
  }, { preferredKeyIndex: 0, model: 'qwen/qwen3.8-27b', maxOutputTokens: 512 });

  checks = {
    grading: grade.success && Number.isFinite(grade.data?.score) && typeof grade.data?.feedback === 'string',
    suggestions: suggestions.success && Array.isArray(suggestions.data),
    structured: structured.success && typeof structured.data === 'object' && structured.data !== null,
    writingSuggestionBatch: batch.success && Array.isArray(batch.data?.findings) && typeof batch.data?.hasMorePotential === 'boolean',
  };
  assert(Object.values(checks).every(Boolean), 'One or more Groq application contracts failed');
  assert(providerRequestUrls.length > 0, 'Expected real provider requests');
  assert(providerRequestUrls.every((url) => url.startsWith(`${canary}/ai/groq`)), 'Provider request bypassed the Worker canary');

  console.log(JSON.stringify({
    worker: 'approved-canary',
    model: 'qwen/qwen3.8-27b',
    activeGroqSlots: keys.length,
    checks,
    requestsViaWorker: providerRequestUrls.length,
    directProviderFallback: false,
    rejectedKeyRotated: rejectedKeyDuringRotation,
  }));
} catch {
  console.log(JSON.stringify({ stage, checks: 'failed', providerRequestsViaWorker: providerRequestUrls.length }));
  exitCode = 1;
} finally {
  console.warn = originalWarn;
  globalThis.fetch = originalFetch;
  await auth.signOut();
}
process.exit(exitCode);
