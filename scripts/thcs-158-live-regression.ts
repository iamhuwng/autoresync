import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { signInLiveTeacher } from './lib/ai-worker-live-auth';
import { createRawSourceArtifact } from '../src/services/test-creation/source-fidelity';

const fixture = process.argv.find(arg => arg.startsWith('--source='))?.slice(9);
if (!fixture) throw new Error('Pass --source=<exact original 158-question pasted text path>.');
const source = await readFile(fixture, 'utf8');
const sourceHash = createHash('sha256').update(source).digest('hex');
if (sourceHash !== '6e8c5aad4a42c08b71720461592c51b6e968bf0f991ef3b9e8d31ec8165b14ba') {
  throw new Error('Source does not match the original THCS158 fixture.');
}
const raw = createRawSourceArtifact(source);
const sourceAnswers = raw.answerKeyBlock?.answers ?? {};
const body = raw.normalizedText.slice(0, raw.answerKeyBlock?.anchor.startOffset);
const sourceQuestions = [...body.matchAll(/^Question[ \t]+(\d+)[.):][ \t]*(.*)([\s\S]*?)(?=^Question[ \t]+\d+|^Exercise[ \t]+\d+|$(?![\s\S]))/gm)].map((match, index) => {
  const lines = `${match[2]}\n${match[3]}`.trim().split('\n');
  const optionStart = lines.findIndex(line => /^[A-H][.):]\s/.test(line));
  return { questionNumber: index + 1, sourceLocalNumber: Number(match[1]), questionText: lines.slice(0, optionStart < 0 ? lines.length : optionStart).join('\n').trim(),
    options: lines.filter(line => /^[A-H][.):]\s/.test(line)).map(line => line.replace(/^[A-H][.):]\s*/, '').trim()) };
});
const sourcePassages = [...body.matchAll(/^PASSAGE:\s*\n([\s\S]*?)(?=^Question\s+(\d+))/gm)].map(match => ({
  content: match[1].trim(), firstQuestion: [...body.slice(0, match.index).matchAll(/^Question[ \t]+\d+/gm)].length + 1,
}));
const normalize = (text: string) => text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
const plainOption = (text: string) => normalize(text.replace(/^[A-H][.):]\s*/, ''));
const out = path.resolve('output/thcs-158-canary');
await mkdir(out, { recursive: true });
const log = console.log.bind(console);
const errors: string[] = [];
console.log = () => {};
console.warn = (...args) => errors.push(args.map(arg => arg instanceof Error ? arg.message : String(arg)).join(' '));
console.error = console.warn;
const cached = process.argv.includes('--analyze-existing') || process.argv.includes('--restore-cached');
const restored = process.argv.includes('--restore-cached');
if (!cached) await signInLiveTeacher();
const [{ convertParsedToThcsDraft, parseThcsText, restoreParsedTestFromSource }, { executeAnswerInference }, { executeGeminiWithKeyRotation }] = await Promise.all([
  import('../src/services/test-creation/thcsDocumentParser.service'),
  import('../src/services/test-creation/thcs-answer-inference'),
  import('../src/services/ai/gemini-key-rotation.service'),
]);
const originalFetch = globalThis.fetch;
const requests: Array<{ path: string; status: number; model?: string; durationMs: number }> = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const start = Date.now();
  const response = await originalFetch(input, init);
  if (url.hostname === 'thcs-gemma-deno-canary.iamhuwng.workers.dev') {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    requests.push({ path: url.pathname, status: response.status,
      model: body.model ?? body.request?.model, durationMs: Date.now() - start });
    log(JSON.stringify({ request: requests.at(-1) }));
  }
  return response;
};
log(JSON.stringify({ sourceHash, characters: source.length, sourceQuestions: raw.questionBlocks.length,
  sourceAnswers: Object.keys(sourceAnswers).length, sourcePassages: sourcePassages.length }));
const result = cached
  ? { success: true as const, data: JSON.parse(await readFile(path.join(out, 'parsed.json'), 'utf8')) as import('../src/services/test-creation/thcsDocumentParser.service').ParsedTest }
  : await parseThcsText(source, progress => log(JSON.stringify({ progress })));
if (!result.success) throw new Error(result.error);
const parsed = result.data;
if (restored && !restoreParsedTestFromSource(parsed, source, Object.fromEntries(Object.entries(sourceAnswers).map(([number, answer]) => [number, String(answer)])))) {
  const actual = parsed.sections.flatMap(section => section.questions);
  const firstMismatch = raw.questionBlocks.findIndex((block, index) => {
    const q = actual[index];
    return q?.questionNumber !== block.questionNumber ||
      JSON.stringify(block.options.map(plainOption)) !== JSON.stringify((q?.options ?? []).map(plainOption));
  });
  throw new Error(`Saved output cannot be safely aligned to source: first mismatch at occurrence ${firstMismatch + 1}.`);
}
const questions = parsed.sections.flatMap(section => section.questions);
const draft = convertParsedToThcsDraft(parsed);
const draftQuestions = draft.sections.flatMap(section => section.questions);
const missingNumbers = sourceQuestions.filter((q, index) => !questions[index]).map(q => q.questionNumber);
const localNumberChanges = sourceQuestions.filter((q, index) => q.sourceLocalNumber !== questions[index]?.questionNumber).map(q => q.questionNumber);
const stemChanges = sourceQuestions.filter((q, index) => normalize(q.questionText) !== normalize(questions[index]?.text ?? '')).map(q => q.questionNumber);
const optionChanges = sourceQuestions.filter((q, index) => JSON.stringify(q.options.map(plainOption)) !== JSON.stringify((questions[index]?.options ?? []).map(plainOption))).map(q => q.questionNumber);
const answerChanges = sourceQuestions.filter((q, index) =>
  questions[index]?.correctAnswer !== sourceAnswers[q.questionNumber] ||
  draftQuestions[index]?.correctAnswer !== sourceAnswers[q.questionNumber]).map(q => q.questionNumber);
const passageChanges = sourcePassages.filter(p => !parsed.sections.some(s =>
  questions.slice(0, p.firstQuestion).at(-1) === s.questions[0] && normalize(s.passageText ?? '') === normalize(p.content))).map(p => p.firstQuestion);
const report: Record<string, unknown> = {
  at: new Date().toISOString(), source: path.resolve(fixture), sourceHash,
  sourceQuestions: sourceQuestions.length, parsedQuestions: questions.length, draftQuestions: draftQuestions.length,
  sourceAnswers: Object.keys(sourceAnswers).length, parsedAnswers: Object.keys(parsed.answerKey).length,
  sourcePassages: sourcePassages.length, parsedPassages: parsed.sections.filter(s => s.passageText).length,
  missingNumbers, localNumberChanges,
  stemChanges, optionChanges, answerChanges, passageChanges,
  sections: parsed.sections.map(s => ({ name: s.name, type: s.detectedType, questions: s.questions.length,
    first: s.questions[0]?.questionNumber, last: s.questions.at(-1)?.questionNumber, passageCharacters: s.passageText?.length ?? 0 })),
  pipeline: parsed._pipelineDebug, warnings: parsed.warnings,
};
if (process.argv.includes('--infer') && !cached) {
  const inferred = await executeAnswerInference(parsed.sections, async (systemInstruction, prompt) => {
    const rotation = await executeGeminiWithKeyRotation<string>({ callerName: 'THCS158LiveInference',
      attempt: async ({ key, GoogleGenerativeAI }) => {
        const response = await new GoogleGenerativeAI(key).getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction }).generateContent(prompt);
        const text = response.response.text();
        return text ? { status: 'success', value: text } : { status: 'continue' };
      } });
    return rotation.success ? rotation.value ?? null : null;
  });
  report.inference = { attempted: inferred.totalAttempted, returned: inferred.totalInferred,
    matchingSource: inferred.answers.filter(a => sourceAnswers[a.questionNumber] === a.answer).length,
    disagreements: inferred.answers.filter(a => sourceAnswers[a.questionNumber] !== a.answer),
    missingNumbers: sourceQuestions.filter(q => !inferred.answers.some(a => a.questionNumber === q.questionNumber)).map(q => q.questionNumber) };
}
if (cached) {
  const prior = JSON.parse(await readFile(path.join(out, 'report.json'), 'utf8'));
  report.requests = prior.requests;
  report.errors = prior.errors;
  if (!restored) report.inference = prior.inference;
} else {
  report.requests = requests;
  report.errors = errors;
}
const prefix = restored ? 'corrected-' : cached ? '' : 'live-corrected-';
await writeFile(path.join(out, `${prefix}parsed.json`), JSON.stringify(parsed, null, 2));
await writeFile(path.join(out, `${prefix}draft.json`), JSON.stringify(draft, null, 2));
await writeFile(path.join(out, `${prefix}report.json`), JSON.stringify(report, null, 2));
log(JSON.stringify({ report: path.join(out, `${prefix}report.json`), sourceQuestions: report.sourceQuestions,
  parsedQuestions: report.parsedQuestions, stemChanges: stemChanges.length, optionChanges: optionChanges.length,
  answerChanges: answerChanges.length, passageChanges: passageChanges.length,
  localNumberChanges: localNumberChanges.length }));
globalThis.fetch = originalFetch;
process.exit(missingNumbers.length || stemChanges.length || optionChanges.length || answerChanges.length || passageChanges.length || questions.length !== 158 ? 1 : 0);
