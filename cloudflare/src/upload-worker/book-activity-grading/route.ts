import type { CanonicalBookRouteDescriptor } from '../book-routes/types.ts';

const MAX_COMMAND_BYTES = 128 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;

/**
 * Contributor descriptors only. Ticket #59 owns canonical manifest assembly.
 */
export const bookActivityEvaluationRouteDescriptors: readonly CanonicalBookRouteDescriptor[] = Object.freeze([
  {
    id: 'book.evaluation-history.command',
    methods: ['POST'],
    pathTemplate: '/book-evaluation/commands',
    owner: '#89',
    domain: 'evaluation-history',
    handler: 'bookActivityEvaluation.command',
    firebaseAuth: 'firebase-id-token',
    rateClass: 'book-control',
    gateEnv: 'BOOK_ACTIVITY_EVALUATION_COMMANDS_ENABLED',
    gateDefault: 'disabled',
    requestBodyBytes: MAX_COMMAND_BYTES,
    responseLimitBytes: MAX_RESPONSE_BYTES,
    identityEnv: 'BOOK_ACTIVITY_EVALUATION_SERVICE_IDENTITY',
    credentialEnv: 'BOOK_ACTIVITY_EVALUATION_GOOGLE_SA_KEY',
    source: 'contributor',
    contributorTicket: '#89',
  },
  {
    id: 'book.evaluation-history.read',
    methods: ['GET'],
    pathTemplate: '/book-evaluation/history/:bookId/:studentId',
    owner: '#89',
    domain: 'evaluation-history',
    handler: 'bookActivityEvaluation.history',
    firebaseAuth: 'firebase-id-token',
    rateClass: 'book-read',
    gateEnv: 'BOOK_EVALUATION_HISTORY_ROUTES_ENABLED',
    gateDefault: 'disabled',
    requestBodyBytes: 0,
    responseLimitBytes: MAX_RESPONSE_BYTES,
    identityEnv: 'BOOK_ACTIVITY_EVALUATION_SERVICE_IDENTITY',
    credentialEnv: 'BOOK_ACTIVITY_EVALUATION_GOOGLE_SA_KEY',
    source: 'contributor',
    contributorTicket: '#89',
  },
]);
