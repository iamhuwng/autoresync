import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameCanonicalIdentity, verifiedProof } from '../cloudflare/homework-result-authority.ts';

// This is an explicit operator permission repair for the owner's reported records,
// not a historical authorship verifier or a general teacher receipt-issuance API.
export const repairScope = Object.freeze({
  teacherId: 'AkwZW3CT4AUvkMpJfgg9FwUh3ug2', email: 'hungnguyenzim@gmail.com',
  homeworkId: 'homework-07dd8c7c-3359-4a89-87cf-8f0f8bd374ae', testId: '-P5WswHMOHKqBj3s4bFU',
  results: Object.freeze({ '-P5XSYK6Yo54qRPhEC8_': 'YjuP6dwbtdRVX7NRL8Pjtv3zfqu1',
    '-P5XAvrl9IVAEjYRMGXo': 'HYL03Bh5kuWFwPQYelyjhc3qVZA2' }),
});
const project = 'temp-a1437';
const database = 'https://temp-a1437-default-rtdb.firebaseio.com';
const cutoff = '2026-10-02T02:22:09.862Z';
const resultLeaves = ['resultId', 'studentId', 'testId', 'testType', 'testSkill', 'isGuest', 'submittedAt', 'createdAt',
  'writingData/submissionId', 'context/type', 'context/source/type', 'context/source/id', 'context/source/submissionId',
  'context/assignment/homeworkId', 'sessionCode', 'classId', 'courseId', 'moduleId', 'context/sessionCode',
  'context/classId', 'context/courseId', 'context/source/classId', 'context/source/courseId'];
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const fields = value => Object.fromEntries(Object.entries(value ?? {}).map(([key, item]) => [key,
  item.stringValue ?? (item.integerValue !== undefined ? Number(item.integerValue)
    : item.booleanValue ?? (item.nullValue !== undefined ? null : item.mapValue ? fields(item.mapValue.fields)
      : item.arrayValue ? (item.arrayValue.values ?? []).map(child => fields({ child }).child) : undefined))]));

export function validateRepairSnapshot(snapshot) {
  const { assignment, writing, attempt, result, teacher, studentRole, restore, ruleset } = snapshot;
  const studentId = repairScope.results[result.resultId];
  assert(studentId && result.studentId === studentId, 'Result is outside the approved repair scope');
  assert.equal(teacher.role, 'teacher');
  assert.equal(teacher.email, repairScope.email);
  assert.equal(studentRole, 'student');
  assert.notEqual(restore, true, 'Restore guard is active');
  assert.equal(assignment.id, repairScope.homeworkId);
  assert.equal(assignment.createdBy, repairScope.teacherId);
  assert.equal(assignment.target.type, 'students');
  assert(assignment.target.studentIds.includes(studentId));
  assert.equal(assignment.materialId, repairScope.testId);
  assert.equal(assignment.materialSkill, 'writing');
  assert.equal(assignment.contentRef.contentKind, 'ielts_writing');
  assert.equal(assignment.contentRef.contentId, repairScope.testId);
  assert.equal(writing.id, result.resultId);
  assert.equal(writing.studentId, studentId);
  assert.equal(writing.submittedAt, result.submittedAt);
  assert.equal(writing.testMeta.testId, repairScope.testId);
  assert.equal(writing.context.type, 'homework');
  assert.equal(writing.context.homeworkId, repairScope.homeworkId);
  assert.equal(writing.context.assigningTeacherId, repairScope.teacherId);
  assert(!writing.context.externalImport);
  assert.equal(attempt.id, writing.context.homeworkSubmissionId);
  assert.equal(attempt.homeworkId, repairScope.homeworkId);
  assert.equal(attempt.studentId, studentId);
  assert.equal(attempt.teacherId, repairScope.teacherId);
  assert.equal(attempt.resultId, result.resultId);
  assert(['submitted', 'graded'].includes(attempt.status));
  assert(!attempt.administrativeImport);
  assert(Number.isSafeInteger(attempt.submittedAt) && attempt.submittedAt >= writing.submittedAt);
  assert(/^projects\/temp-a1437\/rulesets\/[^/]+$/u.test(ruleset));
  const receipt = { schemaVersion: 2, resultId: result.resultId, studentId, ownerTeacherId: repairScope.teacherId,
    contextType: 'homework', homeworkId: repairScope.homeworkId, homeworkSubmissionId: attempt.id,
    testId: repairScope.testId, writingSubmittedAt: writing.submittedAt, homeworkSubmittedAt: attempt.submittedAt,
    submittedAt: writing.submittedAt, sourceRulesetName: ruleset, sourceRulesCutoff: cutoff };
  assert(verifiedProof(receipt) && sameCanonicalIdentity(result, receipt), 'Canonical result identity mismatch');
  return receipt;
}

async function main() {
  const args = process.argv.slice(2);
  assert(args.length === 0 || args.length === 2 && args[0] === '--apply', 'Use no arguments to prepare, or --apply <plan.json>');
  const require = createRequire(import.meta.url);
  const auth = require('../node_modules/firebase-tools/lib/auth.js');
  const account = auth.getGlobalDefaultAccount();
  assert.equal(account?.user.email, 'iamhuwng@gmail.com', 'Unexpected operator account');
  const credentials = await auth.getAccessToken(account.tokens.refresh_token,
    ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase']);
  const headers = { Authorization: `Bearer ${credentials.access_token}` };
  const operator = process.env.LUYENTAP_REPAIR_GOOGLE_TOKEN ? null : spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'gcloud auth print-access-token --account=iamhuwng@gmail.com --project=temp-a1437 --quiet'],
  { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  const databaseToken = process.env.LUYENTAP_REPAIR_GOOGLE_TOKEN || (operator.status === 0 && operator.stdout.trim());
  assert(databaseToken, 'Google operator authentication unavailable');
  const databaseHeaders = { Authorization: `Bearer ${databaseToken}` };
  const identityResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: databaseHeaders, redirect: 'error', signal: AbortSignal.timeout(20000) });
  assert(identityResponse.ok, 'Cannot verify the database operator identity');
  assert.equal((await identityResponse.json()).email, account.user.email, 'Database operator identity mismatch');
  async function get(url) {
    const response = await fetch(url, { headers: url.startsWith(database) ? databaseHeaders : headers,
      redirect: 'error', signal: AbortSignal.timeout(20000) });
    assert(response.ok, `Repair GET failed at ${new URL(url).hostname}: ${response.status}`);
    return { value: await response.json() };
  }
  const dbGet = async node => (await get(`${database}/${node}.json`)).value;
  async function document(collection, id, mask) {
    assert(typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(id), 'Invalid source document identifier');
    const query = new URLSearchParams(mask.map(field => ['mask.fieldPaths', field]));
    const item = (await get(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}?${query}`)).value;
    assert.equal(item.name, `projects/${project}/databases/(default)/documents/${collection}/${id}`);
    assert(Date.parse(item.createTime) > Date.parse(cutoff), 'Pre-cutoff source is outside this repair');
    return { ...fields(item.fields), _createTime: item.createTime, _updateTime: item.updateTime };
  }
  const release = (await get(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`)).value;
  const assignment = await document('homework_assignments', repairScope.homeworkId,
    ['id', 'createdBy', 'target', 'contentRef', 'materialId', 'materialSkill']);
  const teacher = { role: await dbGet(`users/${repairScope.teacherId}/role`), email: await dbGet(`users/${repairScope.teacherId}/email`) };
  const restore = await dbGet('system_flags/restore_in_progress');
  const snapshots = [];
  for (const [resultId, studentId] of Object.entries(repairScope.results)) {
    const writing = await document('writing_submissions', resultId, ['id', 'studentId', 'submittedAt', 'context', 'testMeta.testId']);
    const attempt = await document('homework_submissions', writing.context.homeworkSubmissionId,
      ['id', 'homeworkId', 'studentId', 'teacherId', 'resultId', 'submittedAt', 'status', 'administrativeImport']);
    const result = {};
    for (let index = 0; index < resultLeaves.length; index += 3) {
      await Promise.all(resultLeaves.slice(index, index + 3).map(async leaf => {
        const segments = leaf.split('/');
        let parent = result;
        for (const segment of segments.slice(0, -1)) parent = parent[segment] ??= {};
        parent[segments.at(-1)] = await dbGet(`test_results/${resultId}/${leaf}`);
      }));
    }
    const snapshot = { assignment, writing, attempt, result, teacher, restore, ruleset: release.rulesetName,
      studentRole: await dbGet(`users/${studentId}/role`) };
    snapshots.push({ snapshot, receipt: validateRepairSnapshot(snapshot) });
  }
  const fingerprint = hash(snapshots);
  const receiptRoot = path.resolve('tmp/release-receipts');
  await mkdir(receiptRoot, { recursive: true });
  if (!args.length) {
    const target = path.join(receiptRoot, `teacher-writing-repair-plan-${Date.now()}.json`);
    await writeFile(target, JSON.stringify({ mode: 'operator-permission-repair', scope: repairScope, fingerprint,
      snapshots, preparedAt: new Date().toISOString() }, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(`Prepared exact two-record repair: ${target}`);
    return;
  }
  const plan = JSON.parse(await readFile(args[1], 'utf8'));
  assert.equal(plan.mode, 'operator-permission-repair');
  assert.equal(plan.fingerprint, fingerprint, 'Live sources changed since preparation');
  const age = Date.now() - Date.parse(plan.preparedAt);
  assert(age >= 0 && age < 3600000, 'Repair plan expired or future-dated');
  const outcomes = [];
  for (const { receipt } of snapshots) {
    const existing = await dbGet(`result_notification_authority/${receipt.resultId}`);
    assert(existing === null || canonical(existing) === canonical(receipt), 'An existing receipt conflicts with the planned repair');
  }
  const audit = path.join(receiptRoot, `teacher-writing-repair-applied-${Date.now()}.json`);
  const auditRecord = { mode: 'operator-permission-repair', operator: account.user.email,
    plan: path.resolve(args[1]), fingerprint, outcomes, startedAt: new Date().toISOString() };
  await writeFile(audit, JSON.stringify(auditRecord, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(`Repair intent audit: ${audit}`);
  for (const { receipt } of snapshots) {
    assert.notEqual(await dbGet('system_flags/restore_in_progress'), true, 'Restore guard became active');
    assert.equal(await dbGet(`users/${repairScope.teacherId}/role`), 'teacher');
    assert.equal(await dbGet(`users/${receipt.studentId}/role`), 'student');
    const currentWriting = await document('writing_submissions', receipt.resultId, ['id', 'studentId', 'submittedAt', 'context', 'testMeta.testId']);
    const currentAttempt = await document('homework_submissions', receipt.homeworkSubmissionId,
      ['id', 'homeworkId', 'studentId', 'teacherId', 'resultId', 'submittedAt', 'status', 'administrativeImport']);
    const original = snapshots.find(item => item.receipt.resultId === receipt.resultId).snapshot;
    assert.equal(hash(currentWriting), hash(original.writing), 'Writing source changed during repair');
    assert.equal(hash(currentAttempt), hash(original.attempt), 'Homework source changed during repair');
    for (const leaf of resultLeaves) {
      const expected = leaf.split('/').reduce((value, key) => value?.[key], original.result) ?? null;
      assert.deepEqual(await dbGet(`test_results/${receipt.resultId}/${leaf}`), expected, 'Canonical identity changed during repair');
    }
    const target = `${database}/result_notification_authority/${receipt.resultId}.json`;
    const outcome = { resultId: receipt.resultId, receipt: 'unconfirmed' };
    outcomes.push(outcome);
    await writeFile(audit, JSON.stringify(auditRecord, null, 2));
    const response = await fetch(target, { method: 'PUT', headers: { ...databaseHeaders, 'Content-Type': 'application/json',
      'If-Match': 'null_etag' }, body: JSON.stringify(receipt), redirect: 'error', signal: AbortSignal.timeout(20000) });
    assert(response.ok || response.status === 412, `Receipt repair failed: ${response.status}`);
    assert.equal(canonical((await get(target)).value), canonical(receipt), 'Receipt collision or readback mismatch');
    outcome.receipt = response.status === 412 ? 'already-matched' : 'created';
    await writeFile(audit, JSON.stringify(auditRecord, null, 2));
  }
  await writeFile(audit, JSON.stringify({ ...auditRecord, completedAt: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ audit, outcomes }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
