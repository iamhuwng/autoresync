import { access } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { observeHosting, isObserved } from './release-evidence.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runGit = (args, cwd = repoRoot) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.error?.message || result.stderr?.trim() || result.status}`);
  return result.stdout.trim();
};

export const prepareHotfix = async ({ source, destination, cwd = repoRoot, hostingObservation }) => {
  if (!source) throw new Error('A verified production source revision is required (--source).');
  if (!destination) throw new Error('A new hotfix worktree path is required (--destination).');
  const resolvedDestination = path.resolve(cwd, destination);
  try { await access(resolvedDestination); throw new Error(`Hotfix destination already exists: ${resolvedDestination}`); } catch (error) { if (error.message.startsWith('Hotfix destination')) throw error; }
  const resolvedSource = runGit(['rev-parse', '--verify', `${source}^{commit}`], cwd);
  const observation = hostingObservation || await observeHosting();
  if (!isObserved(observation) || observation.revision !== resolvedSource || observation.tree !== runGit(['rev-parse', `${resolvedSource}^{tree}`], cwd)) throw new Error('Selected hotfix source does not match independently observed production source.');
  runGit(['worktree', 'add', '--detach', resolvedDestination, resolvedSource], cwd);
  return { source: resolvedSource, destination: resolvedDestination, isolated: true, observed: observation, assessmentCommand: `node "${path.join(repoRoot, 'scripts', 'release-check.mjs')}" --cwd "${resolvedDestination}" --mode hotfix --base ${resolvedSource} --observe-hosting` };
};

const args = process.argv.slice(2);
const value = flag => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await prepareHotfix({ source: value('--source'), destination: value('--destination') }), null, 2)); }
  catch (error) { console.error(`[Hotfix preparation blocked] ${error.message}`); process.exitCode = 1; }
}
