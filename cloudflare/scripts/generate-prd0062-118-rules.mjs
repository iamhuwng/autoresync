import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  composeGeneratedBookRules,
  FINAL_BOOK_RULE_FRAGMENT_IDS,
} from '../src/upload-worker/book-rules/generated-fragment-composer.ts';

const cloudflareRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(cloudflareRoot, '..');
const fragmentRoot = join(cloudflareRoot, 'src/upload-worker/book-rules/fragments');
const canonicalPath = join(repositoryRoot, 'database.rules.json');
const outputPath = resolve(repositoryRoot, process.argv[2] ?? 'output/prd0062-118-rules-candidate.json');
if (outputPath === canonicalPath) throw new Error('Review the candidate before applying it to canonical rules.');

const parseJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const fragmentFiles = (await readdir(fragmentRoot))
  .filter((name) => name.endsWith('.json'))
  .sort((left, right) => left.localeCompare(right));
const fragments = await Promise.all(fragmentFiles.map(async (name) => ({
  sourcePath: join(fragmentRoot, name),
  fragment: await parseJson(join(fragmentRoot, name)),
})));
const canonical = await parseJson(canonicalPath);
const candidate = composeGeneratedBookRules(fragments, {
  baseRules: canonical.rules,
  requiredFragmentIds: FINAL_BOOK_RULE_FRAGMENT_IDS,
});

await writeFile(outputPath, `${JSON.stringify({ rules: candidate.rules }, null, 2)}\n`, 'utf8');
process.stdout.write(`${candidate.composerVersion} ${candidate.fragmentIds.length} fragments\n`);
