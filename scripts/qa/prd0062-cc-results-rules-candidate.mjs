import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const fragment = JSON.parse(readFileSync('cloudflare/src/upload-worker/book-rules/fragments/29.json', 'utf8'));
const baselineBytes = readFileSync('database.rules.json');
const baseline = JSON.parse(baselineBytes);
const candidate = structuredClone(baseline);
for (const op of fragment.operations) {
  let node = candidate.rules;
  for (const segment of op.path.split('/')) node = node[segment] ??= {};
  node[op.rule] = op.rule === '.indexOn' ? [op.expression] : op.expression;
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const outside = rules => { const copy = structuredClone(rules); delete copy.rules.book_result_read_models; return sha(JSON.stringify(copy)); };
const directory = 'output/prd0062-cc-results-rules';
mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}/before.rules.json`, baselineBytes);
const candidateBytes = `${JSON.stringify(candidate, null, 2)}\n`;
writeFileSync(`${directory}/candidate.rules.json`, candidateBytes);
writeFileSync(`${directory}/hashes.json`, JSON.stringify({ before: sha(baselineBytes), candidate: sha(candidateBytes), outsideBefore: outside(baseline), outsideCandidate: outside(candidate) }, null, 2));
