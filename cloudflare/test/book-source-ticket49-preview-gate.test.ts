import { describe, expect, it } from 'vitest';

import {
  evaluateTicket49PreviewUploadGate,
  parseTicket49PreviewGateConfig,
  TICKET49_PREVIEW_CONFIG_KEYS,
} from '../src/upload-worker/book-source/ticket49-preview-gate.ts';

const NOW = Date.parse('2026-07-30T12:00:00.000Z');
const TEACHER_ID = 'teacher-ticket49';
const BOOK_ID = 'book-ticket49-disposable';
const OBJECT_KEY_PREFIX = 'ticket49-preview/book-ticket49-disposable/';

const config = (overrides: Record<string, unknown> = {}): string => JSON.stringify({
  schemaVersion: 'v1',
  environment: 'ticket49-preview',
  emergencyState: 'enabled',
  teacherId: TEACHER_ID,
  bookId: BOOK_ID,
  providerObjectKeyPrefix: OBJECT_KEY_PREFIX,
  issuedAt: '2026-07-30T11:00:00.000Z',
  expiresAt: '2026-07-30T13:00:00.000Z',
  ...overrides,
});

const uploadContext = (overrides: Record<string, unknown> = {}) => ({
  teacherId: TEACHER_ID,
  bookId: BOOK_ID,
  providerObjectKeyPrefix: OBJECT_KEY_PREFIX,
  ...overrides,
});

describe('Ticket 49 disposable-preview upload activation gate', () => {
  it('parses only the bounded exact deployment schema', () => {
    const parsed = parseTicket49PreviewGateConfig(config());

    expect(parsed).toEqual({
      schemaVersion: 'v1',
      environment: 'ticket49-preview',
      emergencyState: 'enabled',
      teacherId: TEACHER_ID,
      bookId: BOOK_ID,
      providerObjectKeyPrefix: OBJECT_KEY_PREFIX,
      issuedAt: '2026-07-30T11:00:00.000Z',
      expiresAt: '2026-07-30T13:00:00.000Z',
    });
    expect(Object.keys(parsed ?? {}).sort()).toEqual([...TICKET49_PREVIEW_CONFIG_KEYS].sort());
    expect(parseTicket49PreviewGateConfig({
      schemaVersion: 'v1',
      environment: 'ticket49-preview',
      emergencyState: 'enabled',
      teacherId: TEACHER_ID,
      bookId: BOOK_ID,
      providerObjectKeyPrefix: OBJECT_KEY_PREFIX,
      issuedAt: '2026-07-30T11:00:00.000Z',
      expiresAt: '2026-07-30T13:00:00.000Z',
    })).toBeNull();
  });

  it.each([
    ['absent config', undefined],
    ['malformed config', '{malformed'],
    ['request-supplied config object', { emergencyState: 'enabled' }],
    ['extra config key', config({ unexpected: true })],
    ['missing config key', JSON.stringify({
      schemaVersion: 'v1',
      environment: 'ticket49-preview',
      emergencyState: 'enabled',
      teacherId: TEACHER_ID,
      bookId: BOOK_ID,
      providerObjectKeyPrefix: OBJECT_KEY_PREFIX,
      issuedAt: '2026-07-30T11:00:00.000Z',
    })],
    ['disabled emergency state', config({ emergencyState: 'disabled' })],
    ['wrong environment', config({ environment: 'staging' })],
    ['wrong teacher', config({ teacherId: 'teacher-other' })],
    ['wrong book', config({ bookId: 'book-other' })],
    ['wrong provider object-key prefix', config({ providerObjectKeyPrefix: 'other-prefix/' })],
    ['expired config', config({ expiresAt: '2026-07-30T12:00:00.000Z' })],
    ['not-yet-issued config', config({
      issuedAt: '2026-07-30T12:01:00.000Z',
      expiresAt: '2026-07-30T13:00:00.000Z',
    })],
    ['lifetime over 24 hours', config({
      issuedAt: '2026-07-30T11:00:00.000Z',
      expiresAt: '2026-07-31T11:00:00.001Z',
    })],
  ])('denies %s', (_label, rawConfig) => {
    expect(evaluateTicket49PreviewUploadGate(rawConfig, uploadContext(), NOW)).toBe(false);
  });

  it('denies a wrong request teacher, book, or provider object-key prefix', () => {
    for (const context of [
      uploadContext({ teacherId: 'teacher-other' }),
      uploadContext({ bookId: 'book-other' }),
      uploadContext({ providerObjectKeyPrefix: 'other-prefix/' }),
    ]) {
      expect(evaluateTicket49PreviewUploadGate(config(), context, NOW)).toBe(false);
    }
  });

  it('does not accept config forged in request context when deployment config is absent', () => {
    expect(evaluateTicket49PreviewUploadGate(undefined, {
      ...uploadContext(),
      deploymentConfig: config(),
      body: { emergencyState: 'enabled' },
    }, NOW)).toBe(false);
  });

  it('allows only the exact enabled deployment config and upload context', () => {
    expect(evaluateTicket49PreviewUploadGate(
      config(),
      uploadContext(),
      new Date('2026-07-30T12:00:00.000Z'),
    )).toBe(true);
  });
});
