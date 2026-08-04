import { CourseBookCommandError, type CourseBookCommandSelection } from './command.ts';
import {
  createProductionCourseBookCommand,
  readCourseBookSelectionCatalog,
  resolveCurrentCourseBook,
} from './production.ts';

const MAX_BODY_BYTES = 64 * 1024;

const json = async (request: Request): Promise<Record<string, unknown>> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new CourseBookCommandError('content_type_required');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new CourseBookCommandError('body_too_large', 413);
  }
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new CourseBookCommandError('invalid_json'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CourseBookCommandError('invalid_request');
  }
  return value as Record<string, unknown>;
};

const exact = (value: Record<string, unknown>, keys: readonly string[]): void => {
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) {
    throw new CourseBookCommandError('invalid_request');
  }
};

const selection = (value: unknown): CourseBookCommandSelection => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CourseBookCommandError('invalid_request');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (!keys.every((key) => ['bookId', 'scope', 'completionAggregationPolicy'].includes(key))
    || !keys.includes('bookId') || !keys.includes('scope')) throw new CourseBookCommandError('invalid_request');
  if (typeof record.bookId !== 'string' || !record.scope || typeof record.scope !== 'object' || Array.isArray(record.scope)) {
    throw new CourseBookCommandError('invalid_request');
  }
  const scope = record.scope as Record<string, unknown>;
  exact(scope, ['kind', 'nodeKeys', 'placementIds']);
  if (!Array.isArray(scope.nodeKeys) || !scope.nodeKeys.every((item) => typeof item === 'string')
    || !Array.isArray(scope.placementIds) || !scope.placementIds.every((item) => typeof item === 'string')
    || (scope.kind !== 'subtree' && scope.kind !== 'placements')) {
    throw new CourseBookCommandError('invalid_request');
  }
  const policy = record.completionAggregationPolicy;
  if (policy !== undefined && policy !== 'all-activities'
    && policy !== 'all-activities-with-derived-homework-credit') throw new CourseBookCommandError('invalid_request');
  const base = {
    bookId: record.bookId,
    ...(policy === undefined ? {} : { completionAggregationPolicy: policy }),
  };
  return scope.kind === 'subtree'
    ? { ...base, scope: { kind: 'subtree', nodeKeys: scope.nodeKeys, placementIds: [] } }
    : { ...base, scope: { kind: 'placements', nodeKeys: [], placementIds: scope.placementIds } };
};

type Input = { request: Request; env: Record<string, unknown>; uid: string; courseMaterialId?: string; bookId?: string };

const respond = async (run: () => Promise<unknown>) => {
  try { return { body: await run(), init: { status: 200 } }; }
  catch (error) {
    if (error instanceof CourseBookCommandError) {
      return { body: { code: error.code }, init: { status: error.status } };
    }
    return { body: { code: error instanceof Error ? error.message : 'course_book_failed' }, init: { status: 409 } };
  }
};

export const createCourseBookPlacementWorkerHandlers = (options: {
  commandFor?: (env: Record<string, unknown>) => ReturnType<typeof createProductionCourseBookCommand>;
  resolveCurrent?: typeof resolveCurrentCourseBook;
  readCatalog?: typeof readCourseBookSelectionCatalog;
} = {}) => {
  const commandFor = options.commandFor ?? createProductionCourseBookCommand;
  const resolveCurrent = options.resolveCurrent ?? resolveCurrentCourseBook;
  const readCatalog = options.readCatalog ?? readCourseBookSelectionCatalog;
  return {
    catalog: (input: Input) => respond(async () => {
      if (!input.bookId) throw new CourseBookCommandError('course_book_catalog_invalid');
      return readCatalog(input.env, input.uid, input.bookId);
    }),
    place: (input: Input) => respond(async () => {
      const value = await json(input.request);
      exact(value, ['operationId', 'courseId', 'moduleId', 'courseMaterialId', 'selection']);
      return commandFor(input.env).place({
        actorUid: input.uid, operationId: String(value.operationId), courseId: String(value.courseId),
        moduleId: String(value.moduleId), courseMaterialId: String(value.courseMaterialId),
        selection: selection(value.selection),
      });
    }),
    prepare: (input: Input) => respond(async () => {
      const value = await json(input.request);
      exact(value, ['operationId', 'courseMaterialId', 'legacyEnrollmentId']);
      return commandFor(input.env).prepare({
        actorUid: input.uid, operationId: String(value.operationId),
        courseMaterialId: String(value.courseMaterialId), legacyEnrollmentId: String(value.legacyEnrollmentId),
      });
    }),
    revoke: (input: Input) => respond(async () => {
      const value = await json(input.request);
      exact(value, ['operationId', 'courseMaterialId']);
      return commandFor(input.env).revoke({
        actorUid: input.uid, operationId: String(value.operationId), courseMaterialId: String(value.courseMaterialId),
      });
    }),
    current: (input: Input) => respond(async () => {
      if (!input.courseMaterialId) throw new CourseBookCommandError('course_book_material_invalid');
      return resolveCurrent(input.env, input.uid, input.courseMaterialId);
    }),
  };
};
