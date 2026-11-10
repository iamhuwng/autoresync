import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assess, collectSourceState, repoRoot, STATUS } from './release-check.mjs';
import { isObserved, observeHosting } from './release-evidence.mjs';

const git = (cwd, args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`git ${args[0]}: ${result.error?.message || result.stderr?.trim() || result.status}`);
  return result.stdout.trim();
};

// Advisory clues explain the diff; the shared assessor remains the release gate.
export function describeImpact(files, patch) {
  const changes = patch.split(/\r?\n/u).filter(line => /^[+-](?![+-])/u.test(line)).join('\n');
  const signals = [];
  const add = (category, reason) => signals.push({ category, reason });
  if (files.some(file => /^(?:\.github\/workflows\/|scripts\/(?:integration-check|release-(?:archive|check|evidence|verification)|deploy-live)\.mjs$)/u.test(file)
      || /(?:^|\/)(?:auth|permissions?|security|.*\.rules(?:\.json)?)(?:[./]|$)/iu.test(file))
    || /\b(?:authorization|permission|signIn|signOut|claims|authToken|privateKey|signedUrl|allow\s+(?:read|write))\b/iu.test(changes)) {
    add('security-sensitive', 'Changed permission/authentication paths or security-related expressions.');
  }
  if (files.some(file => /(?:migrat|backfill|reconcil)/iu.test(file))
    || /\b(?:setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction|remove|push|update|set)\s*\(/u.test(changes)) {
    add('stateful', 'Changed migration/reconciliation paths or persistence operations; establish data and recovery effects.');
  }
  if (files.some(file => /(?:^|\/)(?:services|schemas?|contracts?|types)(?:\/|\.)/iu.test(file))
    || /\b(?:fetch|https?|payload|endpoint|request|response|interface|schema|firebase|worker)\b/iu.test(changes)) {
    add('contractual', 'Changed service/schema paths or endpoint/payload-related expressions.');
  }
  const stylesOnly = files.length > 0 && files.every(file => /\.css$/u.test(file));
  const externalStyleChange = /@import|@font-face|url\s*\(|expression\s*\(|behavior\s*:/iu.test(changes);
  const documentary = files.length > 0 && files.every(file => /^(?:documentation\/.*\.(?:md|txt)|[^/]+\.md)$/u.test(file));
  const presentationCandidate = stylesOnly && Boolean(changes) && !externalStyleChange && !signals.length;
  if (presentationCandidate) add('presentation', 'Only stylesheet changes, with no changed external resource directives; inspect layout and affected controls.');
  else if (documentary) add('documentation', 'Only documentation paths changed; review any changed operational instructions.');
  else if (files.length) add('functional', externalStyleChange
    ? 'Stylesheet changes include external resources or executable directives.'
    : 'Behavior/build/tooling impact is possible; code changes are not classified as presentation from their extension.');
  return { advisory: true, presentationCandidate, signals,
    limitation: 'Content clues are conservative review prompts, not semantic proof, test coverage or compatibility approval.' };
}

function integrationState(cwd, ref, revision, baseline) {
  try {
    const integrationRevision = git(cwd, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
    const containsCandidate = git(cwd, ['rev-list', `${integrationRevision}..${revision}`]) === '';
    const divergence = baseline ? git(cwd, ['rev-list', '--left-right', '--count', `${baseline}...${revision}`]).split(/\s+/u).map(Number) : null;
    return { ref, revision: integrationRevision, containsCandidate,
      liveOnlyCommits: divergence?.[0] ?? null, candidateOnlyCommits: divergence?.[1] ?? null,
      remoteFreshness: 'NOT_OBSERVED', requiredCI: 'NOT_OBSERVED',
      note: 'Ancestry describes integration history; it does not establish releasability or deployed backend state.' };
  } catch (error) {
    return { ref, revision: null, containsCandidate: false, error: error.message,
      remoteFreshness: 'NOT_OBSERVED', requiredCI: 'NOT_OBSERVED' };
  }
}

export async function planRelease({ cwd = repoRoot, base, offline = false,
  integrationRef = 'refs/heads/main', envFile = process.env.LUYENTAP_PRODUCTION_ENV_FILE
    || path.join(os.homedir(), '.luyentap', 'env', '.env.production'),
  compatibilityReviewPath, hostingObservation } = {}) {
  const blockers = [];
  let observed = null;
  if (hostingObservation && (!isObserved(hostingObservation) || !hostingObservation.manifest || hostingObservation.sourceKnown === false)) {
    throw new Error('Planner requires native Hosting observation with a verified source manifest, not supplied evidence assertions or source-unknown provider metadata.');
  }
  if (offline && hostingObservation) throw new Error('Offline planning cannot include a live observation.');
  if (offline && !base) throw new Error('Offline planning requires an explicit --base; it cannot establish live state.');
  if (!offline) {
    try { observed = hostingObservation || await observeHosting(); }
    catch (error) { blockers.push(`Live baseline unavailable: ${error.message}`); }
  } else blockers.push('Offline comparison: live baseline and deployed assets are unverified.');
  const revision = git(cwd, ['rev-parse', 'HEAD']);
  const selectedBase = base || observed?.revision;
  let assessment = null, impact = null, suggestedTests = [], envFingerprint = null;
  try { envFingerprint = crypto.createHash('sha256').update(await readFile(path.resolve(cwd, envFile))).digest('hex'); }
  catch (error) {
    if (error.code !== 'ENOENT') blockers.push(`Production environment could not be read: ${error.code || error.message}`);
  }
  if (selectedBase) {
    try {
      assessment = await assess({ cwd, base: selectedBase, mode: 'release', hostingObservation: observed,
        productionEnvFingerprint: envFingerprint, compatibilityReviewPath });
      const patch = git(cwd, ['diff', '--no-ext-diff', '--no-renames', '--unified=0', assessment.source.baseRevision, '--']);
      impact = describeImpact(assessment.source.files, patch);
      const tracked = new Set(git(cwd, ['ls-files', '-z']).split('\0'));
      for (const file of assessment.source.files) {
        const candidates = /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file) ? [file]
          : [file.replace(/\.([cm]?[jt]sx?)$/u, '.test.$1'),
            file.replace(/^scripts\/([^/]+)\.mjs$/u, 'scripts/__tests__/$1.test.mjs')];
        for (const candidate of candidates) if (tracked.has(candidate) && /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(candidate)) {
          try { await readFile(path.join(cwd, candidate)); suggestedTests.push(candidate); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
      }
      suggestedTests = [...new Set(suggestedTests)].sort();
      blockers.push(...assessment.findings.filter(finding => ![STATUS.PASS, STATUS.NOT_APPLICABLE].includes(finding.status))
        .map(finding => `[${finding.status}] ${finding.message}`));
    } catch (error) { blockers.push(`Candidate assessment unavailable: ${error.message}`); }
  } else blockers.push('No verified live source is available; supply --base only for an explicitly unverified comparison.');
  const integration = integrationState(cwd, integrationRef, revision, assessment?.source.baseRevision);
  if (assessment) try {
    assert.equal((await collectSourceState(cwd, assessment.source.baseRevision)).fingerprint,
      assessment.source.fingerprint, 'Candidate changed during planning; rerun against a stable source.');
  } catch (error) { blockers.push(error.message); }
  const qualified = assessment && observed && [STATUS.PASS, STATUS.NOT_APPLICABLE].includes(assessment.decision) && !blockers.length;
  const selection = !assessment ? 'SOURCE_EVIDENCE_REQUIRED' : assessment.source.dirty ? 'CLEAN_CANDIDATE_REQUIRED'
    : !qualified ? 'QUALIFICATION_REQUIRED' : !integration.containsCandidate ? 'INTEGRATION_REQUIRED' : 'NORMAL_CANDIDATE';
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), readOnly: true,
    authorization: 'NOT_AUTHORIZED', execution: 'NOT_EXECUTED', deploymentReady: false, selection,
    source: assessment?.source || { revision },
    live: observed ? { revision: observed.revision, tree: observed.tree, fingerprint: observed.fingerprint,
      observedAt: observed.observedAt, evidenceRef: observed.evidenceRef, verifiedAssets: observed.manifest.files.length } : null,
    integration, impact, assessment,
    verification: { execution: 'NOT_RUN', suggestedTests,
      limitation: 'Changed and collocated test paths are suggestions only. Review imports, callers, negative cases and affected browser flows before selecting the executable verification plan.' },
    blockers,
    nextActions: ['Resolve the shared assessment findings on this exact candidate.',
      'Verify the stable LuyenTap integration check on the exact proposed integration commit and inspect current GitHub protection.',
      'Confirm any changed service against its own provider; Hosting history does not identify deployed Worker/rules versions.',
      'Obtain the existing explicit release authorization after technical qualification.'] };
}

export const formatPlan = plan => [
  `Release plan: ${plan.selection}`, `Candidate: ${plan.source.revision}${plan.source.dirty ? ' (DIRTY)' : ''}`,
  `Live: ${plan.live ? `${plan.live.revision} (${plan.live.verifiedAssets} assets verified)` : 'UNVERIFIED'}`,
  `Integration: ${plan.integration.ref} @ ${plan.integration.revision || 'unavailable'} (local ref; remote/CI not checked)`,
  `Impact: ${plan.impact?.signals.map(signal => signal.category).join(', ') || 'unclassified'} (advisory)`,
  `Services: ${plan.assessment?.source.services.join(', ') || 'unverified/none identified'}`,
  ...plan.blockers.map(blocker => `- ${blocker}`),
  `Suggested test files: ${plan.verification.suggestedTests.length}; selection adequacy and execution are unverified.`,
  ...plan.nextActions.map(action => `Next: ${action}`),
  'Read-only: no build, tests, approval, Git writes or deployment performed.',
].join('\n');

export async function main(argv = process.argv.slice(2)) {
  const options = {};
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--json') json = true;
    else if (flag === '--offline') options.offline = true;
    else {
      const key = { '--cwd': 'cwd', '--base': 'base', '--integration-ref': 'integrationRef',
        '--env-file': 'envFile', '--compatibility-review': 'compatibilityReviewPath' }[flag];
      if (!key || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`Unknown or incomplete argument ${flag}`);
      options[key] = argv[++index];
    }
  }
  const result = await planRelease(options);
  console.log(json ? JSON.stringify(result, null, 2) : formatPlan(result));
  return result.selection === 'NORMAL_CANDIDATE' ? 0 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(`[Release plan failed] ${error.message}`); process.exitCode = 1; }
}
