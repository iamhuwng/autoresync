#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const OWNED_SUCCESSOR_PATHS = new Set([
  'documentation/tasks/PRD0062/readiness/102-course-class-placement-contract.md',
  'documentation/tasks/PRD0062/supporting/102-course-class-placement-contract.json',
  'documentation/tasks/PRD0062/evidence/stage-0-baseline-health-and-102-readiness-2026-08-04.json',
  'scripts/validate-prd0062-102-readiness.mjs',
  'scripts/__tests__/validate-prd0062-102-readiness.test.mjs',
  'src/services/book-delivery/courseBookPlacement.service.ts',
  'src/services/book-delivery/courseBookPlacement.service.test.ts',
  'documentation/tasks/PRD0062/evidence/102-course-placement-local-2026-08-05.json',
]);
const CLASSIFICATIONS = new Set(['PASS', 'PRE_EXISTING', 'TICKET_OWNED', 'INTEGRATION_OWNED']);
const requiredArrays = ['authority', 'owners', 'handoffs', 'stateMatrix', 'failureClasses', 'proofClasses', 'fixtures', 'codeEvidence', 'baselineIssues'];
const requiredIdentityPins = ['bookId', 'unitStableKey', 'unitVersionId', 'sourceVersionId', 'activityId', 'activityVersionId', 'bindingRevision'];
const git = (repo, args) => {
  try { return { ok: true, value: execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }; }
  catch (error) { return { ok: false, status: error.status ?? null }; }
};
const unique = (items) => new Set(items).size === items.length;
const result = (status, head, baselineHead, diagnostics) => ({ schemaVersion: 1, status, head, baselineHead, diagnostics });

export const inspectReadiness = ({ repo, contractPath }) => {
  const diagnostics = [];
  if (!existsSync(contractPath)) return result('INVALID_INPUT', null, null, ['contract_missing']);
  let contract;
  try { contract = JSON.parse(readFileSync(contractPath, 'utf8')); } catch { return result('INVALID_INPUT', null, null, ['contract_invalid_json']); }
  if (!contract || typeof contract !== 'object' || Array.isArray(contract) || contract.schemaVersion !== 1 || contract.ticket !== '#102') diagnostics.push('schema_invalid');
  for (const key of requiredArrays) if (!Array.isArray(contract[key]) || contract[key].length === 0) diagnostics.push(`missing_${key}`);
  if (!/^[0-9a-f]{40}$/u.test(contract.baselineHead ?? '')) diagnostics.push('baseline_head_invalid');
  const headResult = git(repo, ['rev-parse', 'HEAD']); const head = headResult.ok ? headResult.value : null;
  if (!head) diagnostics.push('head_unavailable');
  if (head && contract.baselineHead) {
    const ancestry = git(repo, ['merge-base', '--is-ancestor', contract.baselineHead, head]);
    if (!ancestry.ok) diagnostics.push('baseline_head_stale');
    const changed = git(repo, ['diff', '--name-only', `${contract.baselineHead}..${head}`]);
    if (!changed.ok) diagnostics.push('baseline_diff_unavailable');
    else for (const changedPath of changed.value.split(/\r?\n/u).filter(Boolean)) if (!OWNED_SUCCESSOR_PATHS.has(changedPath)) diagnostics.push(`baseline_head_stale:${changedPath}`);
  }
  const identity = contract.identity ?? {};
  if (identity.placementId !== 'courseMaterialId' || !Array.isArray(identity.contexts) || identity.contexts.join(',') !== 'course,class-course' || !Array.isArray(identity.requiredPins) || !requiredIdentityPins.every((pin) => identity.requiredPins.includes(pin)) || !String(identity.copyIdentity ?? '').includes('copyId')) diagnostics.push('identity_contract_incomplete');
  for (const key of ['legacyMode', 'newBookRule', 'migration', 'rollback']) if (!String(contract.compatibility?.[key] ?? '').trim()) diagnostics.push(`compatibility_missing:${key}`);
  if (!String(contract.authorityModel?.owner ?? '').trim() || !String(contract.authorityModel?.enrolment ?? '').trim()) diagnostics.push('authority_missing');
  const adapter = contract.courseAuthorityAdapter;
  const requiredFacts = ['course', 'module', 'material', 'enrollment', 'moduleRelease', 'publication'];
  if (!adapter || adapter.version !== 1 || !Number.isSafeInteger(adapter.boundedReads) || adapter.boundedReads < 6 || !Array.isArray(adapter.facts)
    || !requiredFacts.every((id) => adapter.facts.some((fact) => fact?.id === id && typeof fact.path === 'string' && Array.isArray(fact.fields) && fact.fields.length > 0 && typeof fact.writer === 'string' && fact.writer.length > 0))
    || !Array.isArray(adapter.immutable) || !Array.isArray(adapter.mutable) || !adapter.invalidation || !['archive', 'unenrolmentOrExpiry', 'moduleLock', 'revoke', 'rollback'].every((key) => typeof adapter.invalidation[key] === 'string' && adapter.invalidation[key].length > 0)
    || !String(adapter.compatibility ?? '').trim() || !String(adapter.classBoundary ?? '').includes('#103') || !adapter.handoffs?.['#104'] || !adapter.handoffs?.['#118']
    || !Array.isArray(contract.canonicalStorage) || !contract.canonicalStorage.includes('course_materials/{courseMaterialId}') || contract.canonicalStorage.some((entry) => String(entry).includes('modules/{moduleId}/materials/{courseMaterialId}'))
    || !adapter.rulesFragment || !Array.isArray(adapter.rulesFragment.directChildren) || adapter.rulesFragment.directChildren.join(',') !== 'enrollments/{courseId}/{studentId},releases/{courseId}/{moduleId}/{studentId}' || Object.hasOwn(adapter.rulesFragment, 'indexes') || adapter.rulesFragment.browserWrites !== 'deny'
    || !Array.isArray(adapter.fixtures) || adapter.fixtures.length < 7) diagnostics.push('course_authority_adapter_incomplete');
  if (!String(adapter?.facts?.find((fact) => fact?.id === 'material')?.writer ?? '').includes('CourseBookPlacementRepository.create/revoke')
    || !String(adapter?.legacyMaterialLinkCompatibility ?? '').includes('materialLinkManager')) diagnostics.push('course_authority_writer_incomplete');
  const publication = adapter?.facts?.find((fact) => fact?.id === 'publication');
  if (publication?.path !== 'book_assembly_publications/books/{bookId}' || !String(publication?.writer ?? '').includes('BookAssemblyPublicationRepository.readScope(bookId)')
    || !['current.publicationId', 'current.manifestVersionId', 'current.publicationRevision', 'versions/{manifestVersionId}.ownerId', 'versions/{manifestVersionId}.bookId', 'versions/{manifestVersionId}.lifecycle'].every((field) => publication?.fields?.includes(field))
    || !(contract.codeEvidence ?? []).some((item) => item?.path === 'cloudflare/src/upload-worker/book-assembly/publication-repository.ts' && item?.symbol === 'readScope(bookId')) diagnostics.push('publication_authority_incomplete');
  const port = adapter?.enrollmentAuthorityPort;
  if (!port || port.owner !== '#102 direct-Course vertical; contributes through #59 Worker composition' || port.symbol !== 'CourseEnrollmentAuthorityPort.transitionDirectCourseEnrollment'
    || port.canonicalKey !== 'directCourseEnrollmentKey(courseId,studentId): course:${courseId}:student:${studentId}; collision-safe validated IDs'
    || !Array.isArray(port.atomicWrites) || port.atomicWrites.join(',') !== 'course_enrollments/{directCourseEnrollmentKey(courseId,studentId)}'
    || !String(port.directCourseOnly ?? '').includes('#103') || !['create', 'expiry', 'removal', 'migration', 'rollback', 'recovery'].every((key) => String(port[key] ?? '').trim()) || !String(port.browserWrites ?? '').startsWith('deny')
    || adapter?.facts?.find((fact) => fact?.id === 'enrollment')?.path !== 'course_enrollments/{directCourseEnrollmentKey(courseId,studentId)}'
    || !String(adapter?.facts?.find((fact) => fact?.id === 'enrollment')?.writer ?? '').includes(port.symbol)) diagnostics.push('enrollment_authority_port_incomplete');
  const ownerTickets = (contract.owners ?? []).map((item) => item?.ticket).filter(Boolean);
  if (!unique(ownerTickets) || ownerTickets.length < 7 || !ownerTickets.includes('#102')) diagnostics.push('ownership_missing_or_duplicate');
  const consumers = (contract.handoffs ?? []).map((item) => item?.consumer).filter(Boolean);
  if (!unique(consumers) || !['#103', '#104', '#107', '#118', '#130', '#134'].every((ticket) => consumers.includes(ticket)) || (contract.handoffs ?? []).some((item) => !String(item?.receives ?? '').trim())) diagnostics.push('handoff_missing_or_duplicate');
  if (!unique(contract.stateMatrix ?? []) || (contract.stateMatrix ?? []).length < 8 || !unique(contract.failureClasses ?? []) || (contract.failureClasses ?? []).length < 7 || !unique(contract.proofClasses ?? []) || !['static-contract', 'unit-fixture', 'rules-emulator', 'browser-student', 'deployed-canary'].every((kind) => contract.proofClasses?.includes(kind))) diagnostics.push('matrix_or_proof_incomplete');
  for (const fixture of contract.fixtures ?? []) if (typeof fixture !== 'string' || !git(repo, ['cat-file', '-e', `HEAD:${fixture}`]).ok) diagnostics.push(`fixture_missing:${fixture}`);
  for (const evidence of contract.codeEvidence ?? []) {
    if (!evidence || typeof evidence.path !== 'string' || typeof evidence.symbol !== 'string') { diagnostics.push('code_evidence_invalid'); continue; }
    const source = git(repo, ['show', `HEAD:${evidence.path}`]);
    if (!source.ok) diagnostics.push(`path_missing:${evidence.path}`);
    else if (!source.value.includes(evidence.symbol)) diagnostics.push(`symbol_missing:${evidence.path}:${evidence.symbol}`);
  }
  const issueIds = (contract.baselineIssues ?? []).map((item) => item?.id).filter(Boolean);
  if (!unique(issueIds)) diagnostics.push('baseline_issue_duplicate');
  for (const issue of contract.baselineIssues ?? []) if (!issue || !CLASSIFICATIONS.has(issue.classification) || !String(issue.owner ?? '').trim() || !String(issue.trace ?? '').trim()) diagnostics.push(`baseline_issue_invalid:${issue?.id ?? 'unknown'}`);
  return result(diagnostics.length ? 'BLOCKED' : 'PASS', head, contract.baselineHead ?? null, diagnostics.sort());
};

const parseArgs = (argv) => { const options = {}; for (let i = 0; i < argv.length; i += 2) { if (!['--repo', '--contract', '--output'].includes(argv[i]) || !argv[i + 1]) return null; options[argv[i].slice(2)] = argv[i + 1]; } return options.repo && options.contract ? options : null; };
export const main = (argv, cwd = process.cwd()) => {
  const options = parseArgs(argv); if (!options) { process.stdout.write(`${JSON.stringify(result('INVALID_INPUT', null, null, ['usage_requires_repo_and_contract']))}\n`); return 1; }
  const inspected = inspectReadiness({ repo: path.resolve(cwd, options.repo), contractPath: path.resolve(cwd, options.contract) });
  if (options.output) writeFileSync(path.resolve(cwd, options.output), `${JSON.stringify(inspected, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(inspected)}\n`); return inspected.status === 'PASS' ? 0 : 1;
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
