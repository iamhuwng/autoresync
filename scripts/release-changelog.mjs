import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, unlinkSync, writeFileSync, renameSync, rmSync, openSync, closeSync } from 'node:fs';
import crypto from 'node:crypto';
import { classifyPaths, repoRoot } from './release-check.mjs';
import { readDraft, saveDraft, selectDescription, listReleases, resolveStoreDir } from './lib/releaseChangelog.mjs';
import { readChangeRecords, masterPath } from './lib/changeRecords.mjs';
import { isHostingArchive, readHostingArchive, readHostingArchiveOutcomes } from './release-archive.mjs';

export const HOSTING_TARGET = 'firebase:temp-a1437:hosting:kahut1';

const writeDocument = (file, content) => {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try { writeFileSync(temporary, content, { flag: 'wx' }); renameSync(temporary, file); }
  finally { rmSync(temporary, { force: true }); }
};
const cell = value => String(value).replace(/[\r\n|]/gu, ' ').replace(/[<>]/gu, '');

export async function reconcileHostingChangelog(archive, { cwd = repoRoot, exec, write = writeDocument } = {}) {
  if (!isHostingArchive(archive)) throw new Error('Changelog reconciliation requires a native retained archive, not supplied receipt JSON');
  const lock = path.join(cwd, 'documentation/architecture/.changelog-reconcile.lock');
  let descriptor;
  try { descriptor = openSync(lock, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Changelog reconciliation is locked: ${lock}. Retry after the owner finishes; inspect its PID before removing a stale lock.`);
    throw error;
  }
  try {
    writeFileSync(descriptor, `${process.pid}\n`);
    const outcomes = readHostingArchiveOutcomes(archive, { exec });
    const records = readChangeRecords(cwd), changed = [];
    let master = readFileSync(path.join(cwd, masterPath), 'utf8');
    for (const target of archive.intent.request.targets) for (const id of target.changeIds || []) {
      const record = records.get(id);
      if (!record) throw new Error(`Cannot reconcile missing ${id}; preserve the operation and restore its change record`);
      const file = path.join(cwd, record.path), original = readFileSync(file, 'utf8');
      let content = original;
      for (const receipt of outcomes) {
        const outcome = receipt.outcome.outcomes.find(outcome => outcome.id === target.id);
        if (!outcome) continue;
        const marker = `<!-- release-operation:${archive.id}:${receipt.evidenceRef.split('#')[1]} -->`;
        if (content.includes(marker)) continue;
        if (!content.includes('## Recorded release outcomes')) content += '\n\n## Recorded release outcomes\n';
        content += `\n${marker}\n\n- Recorded: ${receipt.recordedAt}; operation: \`${archive.id}\`.\n- Source: \`${archive.intent.source.revision}\`; target: \`${cell(target.id)}\`; action: ${cell(target.operation)}.\n- Publication: **${outcome.publication}**; verification: **${outcome.verification}**; provider: \`${cell(outcome.providerIdentity || 'unconfirmed')}\`.\n- Retained evidence: [operation outcome](${receipt.evidenceRef}).\n- This is a scoped historical observation; it does not establish current activation or completion of excluded services. Earlier implementation notes remain dated history.\n`;
      }
      if (content !== original) { write(file, content); changed.push(record.path); }
      if (outcomes.some(receipt => receipt.outcome.outcomes.some(outcome => outcome.id === target.id))) {
        const link = `[Release outcomes](changelog/${path.posix.basename(record.path)}#recorded-release-outcomes)`;
        master = master.split('\n').map(line => line.includes(`\`${id}\``) && !line.includes(link)
          ? line.replace(/\|\s*$/u, ` ${link}. |`) : line).join('\n');
      }
    }
    const masterFile = path.join(cwd, masterPath);
    if (master !== readFileSync(masterFile, 'utf8')) { write(masterFile, master); changed.push(masterPath); }
    return { id: archive.id, outcomes: outcomes.length, changed,
      note: 'Documentation only; no publication, provider verification, commit or push performed.' };
  } finally { closeSync(descriptor); rmSync(lock); }
}

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

export function prepareDeploymentChangelog(base, cwd = repoRoot, storeDir, changes) {
  const target = { ...hostingTarget(base, cwd), ...changes };
  let description = generateChangelog(base, cwd);
  if (target.changeIds?.length) {
    const records = readChangeRecords(cwd, target.binding.sourceRevision);
    const lines = target.changeIds.map(id => {
      if (!records.has(id)) throw new Error(`Unknown change record ${id}`);
      return `${id}: ${records.get(id).summary}`;
    });
    description = `Hosting kahut1 reviewed changes\n${base} -> ${target.binding.sourceRevision}\n\n${lines.join('\n')}`;
    if (description.length > 1000) description = `${description.slice(0, 930)}\nSummary truncated; complete associations are in the retained target intent.`;
  }
  const selected = selectDescription({ description, targets: [target] }, storeDir);
  return { description: selected.description, targets: [{ ...selected.targets[0], operation: 'deploy' }],
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
      if (flag === '--check') options.check = true;
      else if (flag === '--migrate-hosting-draft') options.migrate = true;
      else if (['--add', '--plan', '--reconcile'].includes(flag) && args[index + 1]) options[flag.slice(2)] = args[++index];
      else throw new Error('Usage: node scripts/release-changelog.mjs [--check | --reconcile <operation-uuid> | --plan request.json] [--add "description"]');
    }
    if (options.check) {
      console.log(`Master Changelog: ${readChangeRecords(repoRoot).size} unique indexed CL records.`);
      process.exit(0);
    } else if (options.reconcile) {
      console.log(JSON.stringify(await reconcileHostingChangelog(await readHostingArchive({ id: options.reconcile }))));
      process.exit(0);
    } else if (options.migrate) {
      const draft = migrateHostingDraft();
      console.log(`[NOT LIVE] Moved existing draft ${draft.id} to ${resolveStoreDir()}`);
    } else if (options.plan) {
      const plan = JSON.parse(readFileSync(path.resolve(options.plan), 'utf8'));
      const targets = plan.targets.map(({ id, binding, changeIds }) => ({ id, binding, ...(changeIds === undefined ? {} : { changeIds }) }));
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
