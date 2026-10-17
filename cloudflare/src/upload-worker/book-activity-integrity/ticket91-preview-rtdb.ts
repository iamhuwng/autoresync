import type {
  BookIntegrityCanonicalEvent,
} from '../../../../src/services/book-activity/bookIntegrityCapture.types.ts';

interface PreviewMetrics {
  readonly requests: number;
  readonly ledgerWrites: number;
  readonly immutableEventWrites: number;
  readonly immutableEventConflicts: number;
  readonly deniedParentWrites: number;
  readonly deniedBrowserReads: number;
  readonly deniedBrowserWrites: number;
}

const clone = <T>(value: T): T => structuredClone(value);
const sensitive = /answer|response|prompt|pdfBytes|clipboardContents|secret|credential/iu;

const pathFrom = (request: Request): string => new URL(request.url).pathname
  .replace(/^\/+/u, '')
  .replace(/\.json$/u, '')
  .split('/')
  .filter(Boolean)
  .map((segment) => decodeURIComponent(segment))
  .join('/');

const eventIdFrom = (path: string): string | null => {
  const match = /\/events\/(integrity-v1-[a-f0-9]{40})$/u.exec(path);
  return match?.[1] ?? null;
};

const validLedger = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ledger = value as Record<string, unknown>;
  const events = ledger.events;
  const sessions = ledger.sessions;
  return Object.keys(ledger).length === 8
    && ledger.schemaVersion === 1
    && typeof ledger.recipientId === 'string'
    && typeof ledger.contextId === 'string'
    && typeof ledger.placementId === 'string'
    && typeof ledger.activityId === 'string'
    && typeof ledger.accountableAttemptId === 'string'
    && events !== null
    && typeof events === 'object'
    && !Array.isArray(events)
    && Object.keys(events).length <= 64
    && sessions !== null
    && typeof sessions === 'object'
    && !Array.isArray(sessions)
    && Object.keys(sessions).length <= 4
    && !sensitive.test(JSON.stringify(value));
};

const validImmutableEvent = (
  eventId: string,
  value: unknown,
): value is BookIntegrityCanonicalEvent => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return Object.keys(event).length === 14
    && event.schemaVersion === 1
    && event.eventId === eventId
    && event.source === 'browser'
    && typeof event.requestFingerprint === 'string'
    && typeof event.recordedAt === 'string'
    && typeof event.signal === 'string'
    && typeof event.clientSessionId === 'string'
    && Number.isSafeInteger(event.sequence)
    && typeof event.recipientId === 'string'
    && typeof event.accountableAttemptId === 'string'
    && Number.isSafeInteger(event.attemptNumber)
    && event.target !== null
    && typeof event.target === 'object'
    && !Array.isArray(event.target)
    && Object.keys(event.target).length === 8
    && typeof event.policyId === 'string'
    && Number.isSafeInteger(event.policyRevision)
    && !sensitive.test(JSON.stringify(value));
};

export class Ticket91RulesEquivalentRtdb {
  private ledger: unknown = null;
  private ledgerVersion = 0;
  private readonly events: Record<string, BookIntegrityCanonicalEvent> = {};
  private requestCount = 0;
  private ledgerWriteCount = 0;
  private immutableEventWriteCount = 0;
  private immutableEventConflictCount = 0;
  private deniedParentWriteCount = 0;
  private deniedBrowserReadCount = 0;
  private deniedBrowserWriteCount = 0;

  readonly fetch: typeof fetch = async (input, init): Promise<Response> => {
    const request = new Request(input, init);
    this.requestCount += 1;
    const url = new URL(request.url);
    const path = pathFrom(request);
    const eventId = eventIdFrom(path);
    const isLedger = path.endsWith('/ledger');
    if (url.searchParams.get('auth') !== 'ticket91-service-token') {
      if (request.method === 'GET') this.deniedBrowserReadCount += 1;
      else this.deniedBrowserWriteCount += 1;
      return new Response('rules denied browser access', { status: 401 });
    }

    if (request.method === 'GET' && isLedger) {
      return Response.json(this.ledger, {
        headers: { etag: `"ledger-${this.ledgerVersion}"` },
      });
    }
    if (request.method === 'GET' && eventId) {
      const event = this.events[eventId] ?? null;
      return Response.json(event, {
        headers: { etag: event ? `"event-${eventId}"` : 'null_etag' },
      });
    }
    if (request.method === 'PUT' && isLedger) {
      if (request.headers.get('if-match') !== `"ledger-${this.ledgerVersion}"`) {
        return new Response('etag mismatch', { status: 412 });
      }
      const value = await request.json();
      if (!validLedger(value)) return new Response('rules denied ledger', { status: 401 });
      this.ledger = clone(value);
      this.ledgerVersion += 1;
      this.ledgerWriteCount += 1;
      return Response.json(value);
    }
    if (request.method === 'PUT' && eventId) {
      if (request.headers.get('if-match') !== 'null_etag' || this.events[eventId]) {
        this.immutableEventConflictCount += 1;
        return new Response('immutable event exists', { status: 412 });
      }
      const value = await request.json();
      if (!validImmutableEvent(eventId, value) || Object.keys(this.events).length >= 64) {
        return new Response('rules denied event', { status: 401 });
      }
      this.events[eventId] = clone(value);
      this.immutableEventWriteCount += 1;
      return Response.json(value);
    }
    if (request.method !== 'GET') this.deniedParentWriteCount += 1;
    return new Response('rules denied path', { status: 401 });
  };

  snapshot(): {
    readonly ledger: unknown;
    readonly events: Readonly<Record<string, BookIntegrityCanonicalEvent>>;
  } {
    return {
      ledger: clone(this.ledger),
      events: clone(this.events),
    };
  }

  metrics(): PreviewMetrics {
    return {
      requests: this.requestCount,
      ledgerWrites: this.ledgerWriteCount,
      immutableEventWrites: this.immutableEventWriteCount,
      immutableEventConflicts: this.immutableEventConflictCount,
      deniedParentWrites: this.deniedParentWriteCount,
      deniedBrowserReads: this.deniedBrowserReadCount,
      deniedBrowserWrites: this.deniedBrowserWriteCount,
    };
  }

  async proveParentReplacementDenied(): Promise<boolean> {
    const response = await this.fetch(
      'https://ticket91.invalid/book_activity_integrity/scopes/student-1/homework-1/placement-1/activity-1/active-attempt-1.json?auth=ticket91-service-token',
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'if-match': 'null_etag',
        },
        body: JSON.stringify({ events: {} }),
      },
    );
    return response.status === 401;
  }

  async proveBrowserCanonicalAccessDenied(eventId: string): Promise<boolean> {
    const path = `https://ticket91.invalid/book_activity_integrity/scopes/student-1/homework-1/placement-1/activity-1/active-attempt-1/events/${eventId}.json`;
    const [read, write] = await Promise.all([
      this.fetch(path, { method: 'GET' }),
      this.fetch(path, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'if-match': 'null_etag' },
        body: JSON.stringify({ schemaVersion: 1 }),
      }),
    ]);
    return read.status === 401 && write.status === 401;
  }
}
