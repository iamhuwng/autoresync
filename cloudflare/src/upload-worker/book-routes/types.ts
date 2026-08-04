export const BOOK_ROUTE_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;
export type BookRouteMethod = (typeof BOOK_ROUTE_METHODS)[number];

export const BOOK_ROUTE_DOMAINS = [
  'delivery',
  'activity-authoring',
  'assembly',
  'source-upload',
  'runtime',
  'document-delivery',
  'homework',
  'evaluation-history',
  'integrity',
  'notifications',
  'impact-snapshot',
  'updates',
  'replacement-cleanup',
] as const;
export type BookRouteDomain = (typeof BOOK_ROUTE_DOMAINS)[number];

export const BOOK_ROUTE_FIREBASE_AUTH = [
  'firebase-id-token-owner',
  'firebase-id-token-teacher',
  'firebase-id-token-student',
  'firebase-id-token-before-lookup',
  'firebase-id-token',
] as const;
export type BookRouteFirebaseAuth = (typeof BOOK_ROUTE_FIREBASE_AUTH)[number];

export const BOOK_ROUTE_RATE_CLASSES = [
  'book-control',
  'book-read',
  'book-document',
  'book-future',
] as const;
export type BookRouteRateClass = (typeof BOOK_ROUTE_RATE_CLASSES)[number];

export interface CanonicalBookRouteDescriptor {
  readonly id: string;
  readonly methods: readonly BookRouteMethod[];
  readonly pathTemplate: string;
  readonly owner: string;
  readonly domain: BookRouteDomain;
  readonly handler: string;
  readonly firebaseAuth: BookRouteFirebaseAuth;
  readonly rateClass: BookRouteRateClass;
  readonly gateEnv: string;
  readonly gateDefault: 'disabled';
  readonly requestBodyBytes: number;
  readonly responseLimitBytes: number;
  readonly identityEnv?: string;
  readonly credentialEnv?: string;
  readonly source: 'contributor' | 'future-seam';
  readonly contributorTicket?: string;
}

export type BookRouteManifest = readonly CanonicalBookRouteDescriptor[];
