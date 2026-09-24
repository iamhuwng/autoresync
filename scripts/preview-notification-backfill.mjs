#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const usage = `Read-only notification backfill preview from a local JSON export.

Usage:
  node scripts/preview-notification-backfill.mjs --input <export.json> --outage-start <ISO-8601> --outage-end <ISO-8601>

The outage window is required and is half-open [start, end). The export must contain
classIntents, legacyClassActions, and homeworkSubmissions arrays or keyed objects,
canonicalResults keyed by resultId, and notifications keyed by recipient then notice ID.
A legacy homework candidate requires the matching resultId, studentId, homework context,
and resolved homework visibility owner on the canonical result. Existing inbox rows are
read only and excluded by deterministic recipient/event ID.
No network access or writes are performed.`;
const allowedClassKinds = new Set(['join-pending', 'direct-add', 'approve', 'reject']);
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(value);
const validTime = value => Number.isSafeInteger(value) && value > 0;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const rows = value => Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : null;
const hash32 = (value, seed) => {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  return hash;
};
const notificationId = key => {
  const hex = [0, 1, 2, 3].map(seed => hash32(`${key}:${seed}`, seed).toString(16).padStart(8, '0')).join('');
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!['--input', '--outage-start', '--outage-end'].includes(arg) || !args[i + 1]) {
      throw new Error(`Invalid or incomplete argument: ${arg}`);
    }
    options[arg] = args[++i];
  }
  for (const key of ['--input', '--outage-start', '--outage-end']) {
    if (!options[key]) throw new Error(`Missing required argument: ${key}`);
  }
  return {
    input: options['--input'],
    start: parseIsoTime(options['--outage-start'], '--outage-start'),
    end: parseIsoTime(options['--outage-end'], '--outage-end'),
  };
}

function parseIsoTime(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
    throw new Error(`${name} must be an ISO-8601 timestamp with a timezone`);
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${name} is invalid`);
  return time;
}

function inWindow(time, start, end) {
  return validTime(time) && time >= start && time < end;
}

function preview(data, start, end) {
  if (!validTime(start) || !validTime(end) || end <= start) throw new Error('A valid outage start and end are required');
  if (!isRecord(data)) throw new Error('Input export must be a JSON object');
  const classIntents = rows(data.classIntents);
  const legacyClassActions = rows(data.legacyClassActions);
  const submissions = rows(data.homeworkSubmissions);
  if (!classIntents || !legacyClassActions || !submissions || !isRecord(data.canonicalResults)
    || !isRecord(data.notifications)) {
    throw new Error('Input export requires classIntents, legacyClassActions, homeworkSubmissions, canonicalResults, and notifications');
  }
  const summary = {
    window: { start: new Date(start).toISOString(), endExclusive: new Date(end).toISOString() },
    scanned: { classIntents: 0, legacyClassActions: 0, homeworkSubmissions: 0 },
    eligible: { events: 0, recipients: 0, byEventType: {}, byConfidence: {} },
    omitted: { events: 0, byReason: {} },
  };
  const seen = new Set();
  const omit = reason => {
    summary.omitted.events += 1;
    summary.omitted.byReason[reason] = (summary.omitted.byReason[reason] || 0) + 1;
  };
  const inboxState = (recipientId, id) => {
    const inbox = data.notifications[recipientId];
    if (!isRecord(inbox) || !Object.hasOwn(inbox, id) || inbox[id] == null) return 'missing';
    return isRecord(inbox[id]) && inbox[id].id === id ? 'present' : 'conflict';
  };
  const include = (eventType, identity, recipientIds) => {
    if (seen.has(identity)) return omit('duplicate_saved_event');
    seen.add(identity);
    let missing = 0;
    for (const recipientId of recipientIds) {
      const id = eventType.startsWith('class-')
        ? notificationId(`${identity.slice('class:'.length)}:${recipientId}`)
        : notificationId(`homework-submitted:teacher:${identity.slice('homework:'.length)}:${recipientId}`);
      const state = inboxState(recipientId, id);
      if (state === 'conflict') return omit('existing_inbox_id_conflict');
      if (state === 'missing') missing += 1;
    }
    if (missing === 0) return omit('already_notified_all_recipients');
    summary.eligible.events += 1;
    summary.eligible.recipients += missing;
    summary.eligible.byEventType[eventType] = (summary.eligible.byEventType[eventType] || 0) + 1;
    summary.eligible.byConfidence.high = (summary.eligible.byConfidence.high || 0) + 1;
  };

  for (const intent of classIntents) {
    summary.scanned.classIntents += 1;
    if (!isRecord(intent) || !validId(intent.actionId) || !allowedClassKinds.has(intent.kind)
      || !validId(intent.actorUid) || !validId(intent.classId) || !validId(intent.studentId)
      || !validId(intent.teacherId) || !validTime(intent.occurredAt)) {
      omit('class_intent_missing_provable_fields');
      continue;
    }
    if (!inWindow(intent.occurredAt, start, end)) {
      omit('outside_outage_window');
      continue;
    }
    if (intent.state === 'done') {
      omit('already_delivered');
      continue;
    }
    if (!['retry_due', 'retrying', 'failed'].includes(intent.state)) {
      omit('class_intent_delivery_state_unknown');
      continue;
    }
    include(`class-${intent.kind}`, `class:${intent.actionId}`,
      intent.kind === 'join-pending' ? [intent.studentId, intent.teacherId] : [intent.studentId]);
  }

  for (const action of legacyClassActions) {
    summary.scanned.legacyClassActions += 1;
    const kind = isRecord(action) ? action.kind : undefined;
    omit(kind === 'approve' || kind === 'reject'
      ? 'historical_class_approval_rejection_unprovable'
      : 'historical_class_action_without_saved_intent');
  }

  const results = data.canonicalResults;
  for (const submission of submissions) {
    summary.scanned.homeworkSubmissions += 1;
    if (!isRecord(submission)) {
      omit('homework_submission_invalid');
      continue;
    }

    const intent = submission.notificationIntent;
    const delivery = submission.notificationDelivery;
    if (isRecord(intent)) {
      if (intent.schemaVersion !== 1 || intent.eventId !== `homework-submitted:${intent.resultId}`
        || !validId(intent.resultId) || !validId(intent.homeworkId) || !validId(intent.studentId)
        || !validId(intent.teacherId) || !validTime(intent.submittedAt)) {
        omit('homework_intent_missing_provable_fields');
        continue;
      }
      if (submission.status !== 'submitted' && submission.status !== 'graded') {
        omit('homework_submission_not_submitted');
        continue;
      }
      if (submission.resultId !== intent.resultId || submission.homeworkId !== intent.homeworkId
        || submission.studentId !== intent.studentId || submission.submittedAt !== intent.submittedAt) {
        omit('homework_intent_submission_mismatch');
        continue;
      }
      if (!inWindow(intent.submittedAt, start, end)) {
        omit('outside_outage_window');
        continue;
      }
      if (isRecord(delivery) && delivery.state === 'done') {
        omit('already_delivered');
        continue;
      }
      if (!isRecord(delivery) || !['retry_due', 'retrying', 'failed'].includes(delivery.state)) {
        omit('homework_delivery_state_unknown');
        continue;
      }
      include('homework-submitted', `homework:${intent.resultId}`, [intent.teacherId]);
      continue;
    }

    if (submission.status !== 'submitted' && submission.status !== 'graded') {
      omit('homework_submission_not_submitted');
      continue;
    }
    if (isRecord(delivery)) {
      omit(delivery.state === 'done' ? 'already_delivered' : 'legacy_homework_delivery_state_without_intent');
      continue;
    }
    const { resultId, homeworkId, studentId, teacherId, submittedAt } = submission;
    if (!validId(resultId) || !validId(homeworkId) || !validId(studentId) || !validId(teacherId)
      || !validTime(submittedAt)) {
      omit('legacy_homework_submission_missing_provable_fields');
      continue;
    }
    if (!inWindow(submittedAt, start, end)) {
      omit('outside_outage_window');
      continue;
    }
    const result = results[resultId];
    const visibility = isRecord(result) ? result.visibility : null;
    const context = isRecord(result) ? result.context : null;
    if (!isRecord(result) || result.resultId !== resultId || result.studentId !== studentId
      || (result.submittedAt !== undefined && result.submittedAt !== submittedAt)
      || !isRecord(context) || context.type !== 'homework'
      || !isRecord(visibility) || visibility.ownershipResolved !== true
      || visibility.homeworkId !== homeworkId || visibility.visibilityOwnerTeacherId !== teacherId) {
      omit('legacy_homework_canonical_result_mismatch');
      continue;
    }
    include('homework-submitted', `homework:${resultId}`, [teacherId]);
  }
  return summary;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage}\n`);
      return;
    }
    if (options.end <= options.start) throw new Error('--outage-end must be after --outage-start');
    const data = JSON.parse(await readFile(options.input, 'utf8'));
    process.stdout.write(`${JSON.stringify(preview(data, options.start, options.end), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Preview failed'}\n${usage}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

export { preview };
