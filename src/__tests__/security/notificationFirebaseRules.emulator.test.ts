import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/38B5.json';

const hasDatabaseEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const describeEmulator = hasDatabaseEmulator ? describe : describe.skip;

type RuleNode = Record<string, RuleNode | string>;

const composeFragment = () => {
  const notifications: RuleNode = {};
  for (const operation of fragment.operations) {
    const segments = operation.path.split('/');
    let target = notifications;
    for (const segment of segments.slice(1)) {
      target[segment] ??= {};
      target = target[segment] as RuleNode;
    }
    target[operation.rule] = operation.expression;
  }
  return notifications;
};

const rules = JSON.stringify({
  rules: {
    notification_ticket99_probe: { '.read': true, '.write': true },
    notifications: composeFragment(),
  },
});

const notification = (overrides: Record<string, unknown> = {}) => ({
  id: 'notification-1',
  userId: 'student-1',
  type: 'info',
  title: 'A notification',
  message: 'Read this',
  read: false,
  createdAt: 1_754_000_000_000,
  link: '/student/homework/homework-1',
  metadata: { legacy: true },
  legacyPayload: { retained: true },
  ...overrides,
});

let testEnv: RulesTestEnvironment;

describe('Ticket #99 restrictive notification RTDB fragment', () => {
  it('owns only the fragment boundary and grants no notification-content creation claim', () => {
    expect(fragment.owner).toMatchObject({
      ticketId: '38B5',
      issue: 99,
      serviceIdentity: 'notification_command_service',
    });
    const expectedRuleLocations = [
      'notifications/.read',
      'notifications/.write',
      'notifications/$recipientId/.read',
      'notifications/$recipientId/.write',
      'notifications/$recipientId/$notificationId/.write',
      'notifications/$recipientId/$notificationId/read/.write',
    ];
    expect(fragment.owner.generatedRuleLocations).toEqual(expectedRuleLocations);
    expect(fragment.operations.map(
      (operation) => `${operation.path}/${operation.rule}`,
    )).toEqual(expectedRuleLocations);
    expect(Object.fromEntries(fragment.operations.map((operation) => [
      `${operation.path}/${operation.rule}`,
      operation.expression,
    ]))).toMatchObject({
      'notifications/.read': 'false',
      'notifications/.write': 'false',
      'notifications/$recipientId/.read': 'auth != null && auth.uid === $recipientId',
      'notifications/$recipientId/.write': 'false',
      'notifications/$recipientId/$notificationId/.write': 'false',
    });
    expect(fragment.operations.every(
      (operation) => operation.merge === 'replace-exact-deny',
    )).toBe(true);
    expect(fragment.owner.leastPrivilegePaths).toEqual([
      'notifications/$recipientId/$notificationId',
    ]);
    expect(fragment.operations.filter((operation) =>
      operation.rule === '.write' && operation.expression !== 'false')).toEqual([
      expect.objectContaining({
        path: 'notifications/$recipientId/$notificationId/read',
      }),
    ]);
    expect(JSON.stringify(fragment)).not.toMatch(/database\.rules\.json|deploy|rollback/iu);
  });

  if (!hasDatabaseEmulator) {
    it('requires the RTDB emulator when this test is selected', () => {
      throw new Error(
        'FIREBASE_DATABASE_EMULATOR_HOST is required; run this test through Firebase emulators:exec.',
      );
    });
  }

  describeEmulator('recipient-only read and exact read-state leaf write', () => {
    beforeAll(async () => {
      testEnv = await initializeTestEnvironment({
        projectId: 'demo-prd-0062-ticket-99',
        database: { rules },
      });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.database();
        await db.ref('notifications/student-1/notification-1').set(notification());
        await db.ref('notifications/student-2/notification-2').set(notification({
          id: 'notification-2',
          userId: 'student-2',
          title: 'Other recipient',
        }));
      });
    });

    it('allows a recipient to read their subtree and mark only an existing unread leaf read', async () => {
      const recipient = testEnv.authenticatedContext('student-1').database();

      await expect(recipient.ref('notifications/student-1').once('value')).resolves.toMatchObject({
        key: 'student-1',
      });
      await assertFails(recipient.ref('notifications/student-1/notification-1/read').remove());
      await assertSucceeds(recipient.ref('notifications/student-1/notification-1/read').set(true));
      expect((await recipient.ref(
        'notifications/student-1/notification-1',
      ).once('value')).val()).toEqual(notification({ read: true }));
      await assertFails(recipient.ref('notifications/student-1/notification-1/read').set(true));
      await assertFails(recipient.ref('notifications/student-1/notification-1/read').set(false));
      await assertFails(recipient.ref('notifications/student-1/missing/read').set(true));
    });

    it('denies anonymous and cross-user reads and read-state writes', async () => {
      const anonymous = testEnv.unauthenticatedContext().database();
      const other = testEnv.authenticatedContext('student-2').database();

      await assertFails(anonymous.ref('notifications/student-1').once('value'));
      await assertFails(anonymous.ref('notifications/student-1/notification-1/read').set(true));
      await assertFails(other.ref('notifications/student-1').once('value'));
      await assertFails(other.ref('notifications/student-1/notification-1/read').set(true));
    });

    it('denies browser creation, deletion, and every content or destination mutation', async () => {
      const recipient = testEnv.authenticatedContext('student-1').database();

      await assertFails(recipient.ref('notifications/student-1/browser-created').set(notification({
        id: 'browser-created',
      })));
      await assertFails(recipient.ref('notifications/student-1/notification-1').remove());
      for (const mutation of [
        { title: 'Forged title' },
        { message: 'Forged message' },
        { type: 'error' },
        { action: 'forged' },
        { destination: '/teacher/forged' },
        { link: '/teacher/forged' },
        { metadata: { forged: true } },
        { userId: 'student-2' },
        { recipientId: 'student-2' },
        { createdAt: 0 },
      ]) {
        await assertFails(recipient.ref('notifications/student-1/notification-1').update(mutation));
      }
    });

    it('denies full-row replacement and unknown or legacy-field deletion during read-state change', async () => {
      const recipient = testEnv.authenticatedContext('student-1').database();
      const replacement = notification({ read: true });
      Reflect.deleteProperty(replacement, 'userId');

      await assertFails(recipient.ref('notifications/student-1/notification-1').update({
        metadata: null,
      }));
      await assertFails(recipient.ref('notifications/student-1/notification-1').update({
        legacyPayload: null,
      }));
      await assertFails(recipient.ref('notifications/student-1/notification-1').set(replacement));
      await assertFails(recipient.ref('notifications/student-1/notification-1').set(notification({
        read: true,
        injected: 'content',
      })));
    });

    it('denies root and recipient-ancestor writes atomically, including fabricated service claims', async () => {
      const recipient = testEnv.authenticatedContext('student-1').database();
      const fabricatedService = testEnv.authenticatedContext('notification-worker', {
        notification_command_service: true,
        notification_command_recipientId: 'student-1',
        notification_command_operationId: 'service-created',
      }).database();

      await assertSucceeds(recipient.ref('notification_ticket99_probe/value').set('before'));
      await assertFails(recipient.ref().update({
        'notification_ticket99_probe/value': 'after',
        'notifications/student-1/notification-1/read': true,
      }));
      expect((await recipient.ref('notification_ticket99_probe/value').once('value')).val()).toBe('before');
      await assertFails(recipient.ref('notifications/student-1').set({
        'notification-1': notification({ read: true }),
      }));
      await assertFails(fabricatedService.ref(
        'notifications/student-1/service-created',
      ).set(notification({ id: 'service-created' })));
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});
