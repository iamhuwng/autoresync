import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, unlinkSync } from 'node:fs';
import crypto from 'node:crypto';
import { classifyPaths, repoRoot } from './release-check.mjs';
import { readDraft, saveDraft, selectDescription, listReleases, resolveStoreDir } from './lib/releaseChangelog.mjs';

export const HOSTING_TARGET = 'firebase:temp-a1437:hosting:kahut1';

const git = (cwd, args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(`Cannot generate changelog: ${result.error?.message || result.stderr?.trim() || 'Git failed'}`);
  }
  return result.stdout.trim();
};

export async function readLiveRevision(fetchImpl = fetch) {
  const response = await fetchImpl('https://kahut1.web.app/.well-known/luyentap-release.json', {
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Cannot read live release manifest: HTTP ${response.status}`);
  const manifest = await response.json();
  if (manifest.schemaVersion !== 1 || manifest.environment !== 'production'
    || manifest.project !== 'temp-a1437' || manifest.site !== 'kahut1'
    || !/^[a-f0-9]{40}$/u.test(manifest.revision || '')) {
    throw new Error('Live release manifest does not identify the production Hosting source.');
  }
  return manifest.revision;
}

export function generateChangelog(base, cwd = repoRoot) {
  if (!/^[a-f0-9]{40}$/u.test(base || '')) throw new Error('A full live source revision is required.');
  git(cwd, ['cat-file', '-e', `${base}^{commit}`]);
  const revision = git(cwd, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const files = git(cwd, ['diff', '--no-renames', '--name-only', '-z', base, revision, '--'])
    .split('\0').filter(file => file && classifyPaths([file]).includes('hosting'));
  const header = `Hosting kahut1 source changes\n${base} -> ${revision}\n`;
  if (!files.length) return `${header}\nNo Hosting source-file changes (redeploy).`;
  const commits = git(cwd, ['log', '--left-right', '--no-merges', '--format=%m %h %s', `${base}...${revision}`, '--', ...files])
    .split('\n').filter(Boolean);
  let summary = `${header}\n> included; < removed from source\n`;
  for (let index = 0; index < commits.length; index += 1) {
    const remaining = `\n... ${commits.length - index} more commits; see Git range above.`;
    if (summary.length + commits[index].length + remaining.length > 1000) return `${summary}${remaining}`;
    summary += `${commits[index]}\n`;
  }
  return commits.length ? summary.trimEnd() : `${header}\nHosting source files changed; compare the Git revisions above.`;
}

const sourceFingerprint = (base, cwd) => {
  if (!/^[a-f0-9]{40}$/u.test(base || '')) throw new Error('A full live source revision is required.');
  const paths = [...new Set([
    ...git(cwd, ['diff', '--no-renames', '--name-only', '-z', base, '--']).split('\0'),
    ...git(cwd, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
  ])].filter(file => file && classifyPaths([file]).includes('hosting')).sort();
  const hash = crypto.createHash('sha256').update(base);
  for (const file of paths) {
    hash.update(JSON.stringify(file));
    try { hash.update(crypto.createHash('sha256').update(readFileSync(path.join(cwd, file))).digest()); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      hash.update('deleted');
    }
  }
  return hash.digest('hex');
};

export const hostingTarget = (base, cwd = repoRoot) => ({ id: HOSTING_TARGET,
  binding: { sourceRevision: git(cwd, ['rev-parse', '--verify', 'HEAD^{commit}']), sourceFingerprint: sourceFingerprint(base, cwd) } });

export function addManualChangelog(base, text, cwd = repoRoot, storeDir) {
  return saveDraft({ description: text, targets: [hostingTarget(base, cwd)] }, storeDir);
}

export function prepareDeploymentChangelog(base, cwd = repoRoot, storeDir) {
  const target = hostingTarget(base, cwd);
  const selected = selectDescription({ description: generateChangelog(base, cwd), targets: [target] }, storeDir);
  return { description: selected.description, targets: [{ ...target, operation: 'deploy' }],
    evidenceRefs: ['https://kahut1.web.app/.well-known/luyentap-release.json'] };
}

export function previewChangelog(base, cwd = repoRoot, storeDir) {
  const plan = prepareDeploymentChangelog(base, cwd, storeDir);
  const selected = selectDescription({ description: plan.description, targets: plan.targets.map(({ id, binding }) => ({ id, binding })) }, storeDir);
  const dirty = Boolean(git(cwd, ['--no-optional-locks', 'status', '--porcelain']));
  const context = [
    `[NOT LIVE] ${dirty ? 'Provisional selection for current working files' : 'Next guarded Hosting deployment would use'}: ${selected.matching ? 'pending manual description' : 'generated Git notes'}`,
    selected.reason,
    dirty
      ? 'Uncommitted changes block npm run deploy:hosting. Recheck after committing; a matching manual note is retained only if the current website file contents stay unchanged.'
      : 'Working tree is clean. This is a committed candidate; the other release checks still apply.',
    !selected.matching ? 'Generated notes describe committed HEAD only; uncommitted edits are not summarized.' : '',
  ].filter(line => line !== '').join('\n');
  return `${context}\n\n${plan.description}\n\nRead-only preview. LIVE means confirmed publication, not satisfaction or verification. Other targets require an explicit release plan; direct provider operations require retrospective evidence.`;
}

export function migrateHostingDraft(cwd = repoRoot, storeDir) {
  if (readDraft(storeDir)) throw new Error('A shared pending entry already exists; preserve it before migration.');
  const legacyPath = path.resolve(cwd, git(cwd, ['rev-parse', '--git-common-dir']), 'hosting-changelog.json');
  const previous = JSON.parse(readFileSync(legacyPath, 'utf8'));
  if (previous.status !== 'not-live' || typeof previous.text !== 'string') throw new Error('Only an existing pending Hosting entry can be moved.');
  const draft = saveDraft({ description: previous.text, targets: [{ id: HOSTING_TARGET,
    binding: { sourceRevision: previous.revision, sourceFingerprint: previous.fingerprint } }] }, storeDir);
  unlinkSync(legacyPath);
  return draft;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const options = {};
    for (let index = 0; index < args.length; index += 1) {
      const flag = args[index];
      if (flag === '--migrate-hosting-draft') options.migrate = true;
      else if (['--add', '--plan'].includes(flag) && args[index + 1]) options[flag.slice(2)] = args[++index];
      else throw new Error('Usage: npm run changelog [-- --plan request.json] [--add "description"]');
    }
    if (options.migrate) {
      const draft = migrateHostingDraft();
      console.log(`[NOT LIVE] Moved existing draft ${draft.id} to ${resolveStoreDir()}`);
    } else if (options.plan) {
      const plan = JSON.parse(readFileSync(path.resolve(options.plan), 'utf8'));
      const targets = plan.targets.map(({ id, binding }) => ({ id, binding }));
      const result = options.add ? saveDraft({ description: options.add, targets }) : selectDescription({ description: plan.description, targets });
      console.log(`[NOT LIVE] ${result.reason || 'Saved scoped pending entry.'}\n${result.description}\nTargets: ${targets.map(target => target.id).join(', ')}`);
      console.log('Plan preview does not prove a clean or qualified candidate. Use the existing release assessment.');
    } else if (options.add) {
      const entry = addManualChangelog(await readLiveRevision(), options.add);
      console.log(`[NOT LIVE]\n${entry.description}\nSaved one pending Hosting entry, including current uncommitted Hosting edits.`);
    } else {
      console.log(previewChangelog(await readLiveRevision()));
    }
    const draft = readDraft();
    if (draft) console.log(`Pending: ${draft.targets.map(target => target.id).join(', ')}`);
    for (const release of listReleases().slice(0, 10)) console.log(`${release.id} [${release.origin}]: ${release.description}\n${release.targets.map(target => `${target.id}=${target.publication} (verification ${target.verification})`).join('; ')}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
