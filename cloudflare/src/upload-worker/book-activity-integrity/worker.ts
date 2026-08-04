import {
  BookIntegrityCaptureError,
  createTrustedBookIntegrityCaptureService,
  isBookIntegritySignalRequest,
} from '../../../../src/services/book-activity/bookIntegrityCapture.service.ts';
import {
  BOOK_INTEGRITY_MAX_REQUEST_BYTES,
  type BookIntegrityAttemptAuthority,
  type BookIntegrityCaptureTarget,
  type BookIntegrityRepository,
} from '../../../../src/services/book-activity/bookIntegrityCapture.types.ts';
import type {
  BookRouteHandler,
  BookRouteHandlerInput,
} from '../book-route-handlers.ts';
import {
  FirebaseRestBookIntegrityRepository,
  type FirebaseBookIntegrityRepositoryEnv,
} from './repository.ts';
import {
  FirebaseRestBookIntegrityReportRepository,
  BookIntegrityReportRepositoryError,
} from './report-repository.ts';
import { isBookIntegrityReport } from '../../../../src/services/book-activity/bookIntegrityReport.service.ts';
import type {
  BookIntegrityReportRepository,
} from '../../../../src/services/book-activity/bookIntegrityReport.types.ts';

const json = (body: unknown, status = 200): Response => Response.json(body, {
  status,
  headers: {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  },
});

const readBoundedJson = async (request: Request): Promise<unknown> => {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > BOOK_INTEGRITY_MAX_REQUEST_BYTES) {
    throw new BookIntegrityCaptureError('integrity_request_malformed', 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > BOOK_INTEGRITY_MAX_REQUEST_BYTES) {
    throw new BookIntegrityCaptureError('integrity_request_malformed', 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new BookIntegrityCaptureError('integrity_request_malformed', 400);
  }
};

export interface BookIntegrityWorkerEnv extends FirebaseBookIntegrityRepositoryEnv {
  readonly BOOK_INTEGRITY_ROUTES_ENABLED?: string;
  readonly BOOK_INTEGRITY_REPORT_ROUTES_ENABLED?: string;
  readonly BOOK_INTEGRITY_LINKAGE_ENABLED?: string;
}

export interface BookIntegrityWorkerOptions {
  readonly resolveAttemptAuthority: (input: {
    readonly actorUid: string;
    readonly target: BookIntegrityCaptureTarget;
    readonly env: BookIntegrityWorkerEnv;
  }) => Promise<BookIntegrityAttemptAuthority | null>;
  readonly createRepository?: (
    env: BookIntegrityWorkerEnv,
  ) => BookIntegrityRepository;
  readonly createReportRepository?: (
    env: BookIntegrityWorkerEnv,
  ) => BookIntegrityReportRepository;
  readonly reportRepository?: BookIntegrityReportRepository;
  /** Resolve the owning teacher from trusted assignment/result authority. */
  readonly resolveTeacherOwnerId?: (input: {
    readonly actorUid: string;
    readonly bookId: string;
    readonly terminalId: string;
    readonly env: BookIntegrityWorkerEnv;
  }) => Promise<string | null>;
  readonly now?: () => number;
}

export type BookIntegrityReportHandlerOptions = Pick<
  BookIntegrityWorkerOptions,
  'createReportRepository' | 'reportRepository' | 'resolveTeacherOwnerId'
>;

export const createBookIntegritySignalHandler = (
  options: BookIntegrityWorkerOptions,
): BookRouteHandler => async (input: BookRouteHandlerInput): Promise<Response> => {
  const env = input.env as BookIntegrityWorkerEnv;
  if (env.BOOK_INTEGRITY_ROUTES_ENABLED !== 'enabled') {
    return json({
      code: 'integrity_capture_disabled',
      capture: 'disabled',
      completionAvailable: true,
      submissionAvailable: true,
      recordedSignals: 'preserved',
    }, 503);
  }
  if (input.request.method !== 'POST') {
    return json({ code: 'integrity_method_not_allowed' }, 405);
  }
  try {
    const payload = await readBoundedJson(input.request);
    if (!isBookIntegritySignalRequest(payload)) {
      throw new BookIntegrityCaptureError('integrity_request_malformed', 400);
    }
    const repository = options.createRepository?.(env)
      ?? new FirebaseRestBookIntegrityRepository({ env });
    const service = createTrustedBookIntegrityCaptureService({
      repository,
      ...(options.now ? { now: options.now } : {}),
      resolveAttemptAuthority: ({ actorUid, target }) => (
        options.resolveAttemptAuthority({ actorUid, target, env })
      ),
    });
    const result = await service.capture({
      actorUid: input.uid,
      routeBookId: input.params.bookId ?? '',
      request: payload,
    });
    return json(result);
  } catch (error) {
    if (error instanceof BookIntegrityCaptureError) {
      return json({ code: error.code }, error.status);
    }
    return json({ code: 'integrity_unavailable' }, 503);
  }
};

export const createBookIntegrityReportHandler = (
  options: BookIntegrityReportHandlerOptions,
): BookRouteHandler => async (input: BookRouteHandlerInput): Promise<Response> => {
  const env = input.env as BookIntegrityWorkerEnv;
  if (env.BOOK_INTEGRITY_REPORT_ROUTES_ENABLED !== 'enabled') {
    return json({
      code: 'integrity_report_disabled',
      report: 'hidden',
      linkage: 'preserved',
      submissionAvailable: true,
    }, 503);
  }
  if (input.request.method !== 'GET') {
    return json({ code: 'integrity_report_method_not_allowed' }, 405);
  }
  const terminalId = input.params.terminalId ?? '';
  if (!terminalId || !options.resolveTeacherOwnerId) {
    return json({ code: 'integrity_report_forbidden' }, 403);
  }
  try {
    const ownerId = await options.resolveTeacherOwnerId({
      actorUid: input.uid,
      bookId: input.params.bookId ?? '',
      terminalId,
      env,
    });
    if (!ownerId) return json({ code: 'integrity_report_forbidden' }, 403);
    const repository = options.reportRepository
      ?? options.createReportRepository?.(env)
      ?? new FirebaseRestBookIntegrityReportRepository({ env });
    const report = await repository.readReportForTeacher({ ownerId, terminalId });
    if (!report
      || !isBookIntegrityReport(report)
      || report.terminal.bookId !== (input.params.bookId ?? '')
      || report.terminal.ownerId !== ownerId
      || report.terminal.terminalId !== terminalId) {
      return json({ code: 'integrity_report_not_found' }, 404);
    }
    return json({ report });
  } catch (error) {
    if (error instanceof BookIntegrityReportRepositoryError) {
      return json({ code: 'integrity_report_unavailable' }, 503);
    }
    return json({ code: 'integrity_report_unavailable' }, 503);
  }
};

export const createBookIntegrityWorkerHandlers = (
  options: BookIntegrityWorkerOptions,
): Readonly<Record<string, BookRouteHandler>> => {
  const handlers: Record<string, BookRouteHandler> = {
    'futureSeam.integritySignal': createBookIntegritySignalHandler(options),
  };
  // Keep the #91-only composition unchanged for existing callers.  #92
  // callers opt into the teacher read seam by supplying its trusted owner
  // resolver and report repository factory.
  if (options.resolveTeacherOwnerId) {
    handlers['futureSeam.integrityReport'] = createBookIntegrityReportHandler(options);
  }
  return Object.freeze(handlers);
};
