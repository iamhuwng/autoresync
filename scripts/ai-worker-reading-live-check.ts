import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { signInLiveTeacher } from './lib/ai-worker-live-auth';

const log = console.log.bind(console);
console.log = () => {};
const auth = await signInLiveTeacher();
const { signOut } = await import('firebase/auth');
const originalFetch = globalThis.fetch;
const requests: { path: string; status: number }[] = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  assert(!['generativelanguage.googleapis.com', 'api.groq.com'].includes(url.hostname), 'Provider traffic must use the secured Worker.');
  const response = await originalFetch(input, init);
  if (url.hostname === 'thcs-gemma-deno-canary.iamhuwng.workers.dev') {
    requests.push({ path: url.pathname, status: response.status });
  }
  return response;
};
try {
  const { generateReadingV2AutoImportCandidate } = await import('../src/services/reading-v2/readingV2AutoImport.service');
  const { normalizeReadingV2ImportCandidate } = await import('../src/services/reading-v2/readingV2ImportNormalization.service');
  const { assertValidReadingV2CanonicalDocument } = await import('../src/services/reading-v2/readingV2ContractGuards.service');
  const { validateReadingV2Draft } = await import('../src/services/reading-v2/readingV2Validation.service');
  const source = await readFile('documentation/samples/Cam 10 reading Test 3.md', 'utf8');
  const result = await generateReadingV2AutoImportCandidate({
    rawTestText: source,
    sourceName: 'Cam 10 reading Test 3.md',
  });
  assert(result.success, result.success ? undefined : result.error);
  assert.equal(result.provider, 'gemini');
  assert.equal(result.passageCount, 3);
  assert.equal(result.questionCount, 40);
  const { document } = normalizeReadingV2ImportCandidate(result.candidate);
  assertValidReadingV2CanonicalDocument(document);
  const numbers = Object.values(document.interactions)
    .map((interaction) => interaction.reviewLabel.displayNumber).sort((a, b) => a! - b!);
  assert.deepEqual(numbers, Array.from({ length: 40 }, (_, index) => index + 1));
  const passages = Object.values(document.stimuli).flatMap((stimulus) =>
    stimulus.content.kind === 'passage-content'
      ? [stimulus.content.paragraphs.map((paragraph) => paragraph.text).join('\n')]
      : []);
  assert.equal(passages.length, 3);
  assert(passages.every((passage) => passage.length > 4_000), 'Passage prose must survive source rehydration.');
  const validation = validateReadingV2Draft(document);
  assert(validation.blockingIssues.length > 0, 'Source without answers must remain blocked from publishing.');
  assert(Object.values(document.interactions).every((interaction) =>
    !interaction.scoringRule.acceptableAnswers?.length), 'Do not invent answers absent from source.');
  assert(requests.some((request) => request.path === '/ai/gemini' && request.status === 200));
  const report = {
    check: 'reading-v2-live-canary',
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    provider: result.provider,
    model: result.model,
    passages: passages.map((passage) => passage.length),
    questions: result.questionCount,
    reviewStatus: result.reviewStatus,
    publishBlockers: validation.blockingIssues.length,
    diagnosticCodes: [...new Set(result.diagnostics.map((diagnostic) => diagnostic.code))],
    requests,
  };
  await mkdir('output/ai-worker-canary', { recursive: true });
  await writeFile('output/ai-worker-canary/reading.json', JSON.stringify(report, null, 2));
  log(JSON.stringify(report));
} finally {
  globalThis.fetch = originalFetch;
  console.log = log;
  await signOut(auth);
}
process.exit(0);
