import { ClassBookPlacementService } from '../../../../src/services/book-delivery/classBookPlacement.service.ts';
import { ClassBookRolloutGate } from '../../../../src/services/book-delivery/classBookRolloutGate.ts';
import { classBookContextId, classBookFingerprint, type ClassBookPlacementRepository,
  type ClassBookCopyIdentity, type ClassBookPlacement, type ClassBookSourcePlacement,
  type ClassBookLockAuthority } from '../../../../src/services/book-delivery/classBookPlacement.types.ts';
import type { ClassBookCommandClaims, ClassBookCommandKind, ClassBookCommandReceipt } from './command-types.ts';

export interface ClassBookCommandPorts {
  readonly readValue: (path: string) => Promise<unknown>;
  readonly readCopy: (classId: string, copyId: string) => Promise<ClassBookCopyIdentity | null>;
  readonly readCurrent: (contextId: string) => Promise<ClassBookPlacement | null>;
  readonly readLock: (classId: string, placementId: string) => Promise<ClassBookLockAuthority | null>;
  readonly readReceipt: (operationId: string) => Promise<ClassBookCommandReceipt | null>;
  readonly loadSource: (courseId: string, materialId: string, actorUid: string) => Promise<ClassBookSourcePlacement>;
  readonly commit: (receipt: ClassBookCommandReceipt, claims: ClassBookCommandClaims) => Promise<void>;
  readonly now?: () => string;
}

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const hash = async (value: unknown): Promise<string> => [...new Uint8Array(await crypto.subtle.digest(
  'SHA-256', new TextEncoder().encode(classBookFingerprint(value)),
))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const ID = /^[A-Za-z0-9_-]{1,160}$/u;
const requiredKeys: Record<ClassBookCommandKind, readonly string[]> = {
  copy: ['operationId', 'classId', 'copyId', 'classCourseId', 'sourceCourseId', 'sourceCourseMaterialId'],
  place: ['operationId', 'classId', 'copyId', 'classPlacementId', 'classCourseMaterialId', 'title'],
  sync: ['operationId', 'classId', 'copyId', 'classPlacementId', 'classCourseMaterialId', 'expectedPlacementRevision'],
  lock: ['operationId', 'classId', 'classPlacementId', 'state', 'expectedRevision'],
};

export const createClassBookPlacementCommand = (ports: ClassBookCommandPorts) => async (
  kind: ClassBookCommandKind, actorUid: string, body: Record<string, unknown>,
): Promise<ClassBookCommandReceipt['outcome']> => {
  const keys = requiredKeys[kind];
  if (!ID.test(actorUid) || Object.keys(body).length !== keys.length || keys.some((key) => !(key in body))) {
    throw new Error('class_book_request_invalid');
  }
  for (const key of keys.filter((key) => !['title', 'state', 'expectedRevision', 'expectedPlacementRevision'].includes(key))) {
    if (typeof body[key] !== 'string' || !ID.test(body[key] as string)) throw new Error('class_book_identity_invalid');
  }
  if ((kind === 'lock' && (!Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number) < 0))
    || (kind === 'sync' && (!Number.isSafeInteger(body.expectedPlacementRevision)
      || (body.expectedPlacementRevision as number) < 0))) {
    throw new Error(kind === 'lock' ? 'class_book_lock_revision_invalid' : 'class_book_placement_revision_invalid');
  }
  if (kind === 'lock' && body.state !== 'locked' && body.state !== 'unlocked') {
    throw new Error('class_book_lock_state_invalid');
  }
  const operationId = body.operationId as string;
  const classId = body.classId as string;
  const [classRaw, flagsRaw, rollbackRaw] = await Promise.all([
    ports.readValue(`classes/${classId}`), ports.readValue('system_flags'), ports.readValue('class_book_authority/rollback'),
  ]);
  const classRow = object(classRaw);
  if (classRow.createdBy !== actorUid || classRow.status !== 'active') throw new Error('class_book_owner_denied');
  if (object(flagsRaw).restore_in_progress === true || object(rollbackRaw).denyNewWrites === true) {
    throw new Error('class_book_writes_unavailable');
  }
  const inputFingerprint = await hash({ kind, actorUid, body });
  const prior = await ports.readReceipt(operationId);
  if (prior) {
    if (prior.schemaVersion !== 1 || prior.kind !== kind || prior.actorUid !== actorUid
      || prior.classId !== classId || prior.inputFingerprint !== inputFingerprint) throw new Error('class_book_operation_conflict');
    return structuredClone(prior.outcome);
  }
  const copyId = body.copyId as string;
  const classPlacementId = body.classPlacementId as string;
  const courseMaterialId = body.classCourseMaterialId as string;
  const contextId = kind === 'place' || kind === 'sync' ? classBookContextId(classId, copyId, courseMaterialId) : undefined;
  let copy = kind === 'lock' ? null : await ports.readCopy(classId, copyId);
  let current = contextId ? await ports.readCurrent(contextId) : null;
  let lock = kind === 'copy' ? null : await ports.readLock(classId, classPlacementId);
  const repository: ClassBookPlacementRepository = {
    readCopy: () => copy, readCurrent: () => current, readVersion: () => null, readBinding: () => null,
    createCopy: (next) => { if (copy) return 'conflict'; copy = next; return 'created'; },
    createPlacement: (next) => { if (current) return 'conflict'; current = next; return 'created'; },
    appendPlacement: (next) => { current = next; return 'created'; },
  };
  const authority = {
    readClass: () => ({ classId, ownerId: actorUid, status: 'active' as const }),
    readMembership: () => null, readLock: () => lock,
    writeLock: (next: ClassBookLockAuthority) => { lock = next; return 'written' as const; },
  };
  const service = new ClassBookPlacementService(repository, authority, new ClassBookRolloutGate({ enabled: true }));
  const common = { operationId, actorId: actorUid, classId, now: ports.now?.() ?? new Date().toISOString() };
  let outcome: ClassBookCommandReceipt['outcome'];
  let expectedRevision = 0;
  if (kind === 'copy') {
    await ports.loadSource(body.sourceCourseId as string, body.sourceCourseMaterialId as string, actorUid);
    outcome = service.createCopy({ ...common, copyId, classCourseId: body.classCourseId as string,
      sourceCourseId: body.sourceCourseId as string, sourceCourseMaterialId: body.sourceCourseMaterialId as string });
  } else if (kind === 'lock') {
    expectedRevision = body.expectedRevision as number;
    outcome = service.setLock({ ...common, classPlacementId, expectedRevision, state: body.state as 'locked' | 'unlocked' });
  } else {
    if (!copy) throw new Error('class_book_copy_unavailable');
    const source = await ports.loadSource(copy.sourceCourseId, copy.sourceCourseMaterialId, actorUid);
    const input = { ...common, copyId, classPlacementId, classCourseMaterialId: courseMaterialId, source };
    if (kind === 'place') outcome = service.place({ ...input, title: body.title as string });
    else {
      expectedRevision = body.expectedPlacementRevision as number;
      outcome = service.sync({ ...input, expectedPlacementRevision: expectedRevision });
    }
  }
  const payloadFingerprint = await hash(outcome);
  const receipt: ClassBookCommandReceipt = {
    schemaVersion: 1, operationId, kind, actorUid, classId, inputFingerprint, payloadFingerprint, outcome,
  };
  await ports.commit(receipt, {
    service: 'class_book_authority', classBookOperation: kind, actorUid, classId, operationId,
    inputFingerprint, payloadFingerprint, expectedRevision, nextRevision: expectedRevision + 1,
    ...(kind === 'copy' ? { copyId } : kind === 'lock' ? { classPlacementId }
      : { copyId, classPlacementId, contextId, courseMaterialId }),
  });
  return structuredClone(outcome);
};
