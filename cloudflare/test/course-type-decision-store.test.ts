import { describe, expect, it } from 'vitest';
import type { FirebaseRtdbQuery } from '../src/upload-worker/listening-authoring/rtdb.ts';
import { FirebaseCourseTypeDecisionStorage } from '../src/upload-worker/notifications/course-type-decision-store.ts';

describe('course type decision retry scan', () => {
  it('starts at dueAt zero so requests without an intent cannot occupy the result limit', async () => {
    let receivedQuery: FirebaseRtdbQuery | undefined;
    const database = {
      absent: { id: 'absent', status: 'pending' },
      dueA: { id: 'dueA', notificationIntent: { dueAt: 100 } },
      dueB: { id: 'dueB', notificationIntent: { dueAt: 200 } },
    };
    const storage = new FirebaseCourseTypeDecisionStorage({
      FIREBASE_DB_URL: 'https://example.firebaseio.com',
      FIREBASE_PROJECT_ID: 'test-project',
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: '{}',
      readDatabaseValue: async (_path, query) => {
        receivedQuery = query;
        if (!query || typeof query.startAt !== 'number') throw new Error('missing_due_at_lower_bound');
        const startAt = query.startAt;
        return Object.fromEntries(Object.entries(database)
          .filter(([, row]) => {
            const dueAt = (row as { notificationIntent?: { dueAt?: number } }).notificationIntent?.dueAt;
            return dueAt !== undefined && dueAt >= startAt;
          })
          .sort(([, left], [, right]) => (
            (left as { notificationIntent: { dueAt: number } }).notificationIntent.dueAt
            - (right as { notificationIntent: { dueAt: number } }).notificationIntent.dueAt
          ))
          .slice(0, query.limitToFirst));
      },
    });

    const rows = await storage.dueRequests(2);

    expect(receivedQuery).toEqual({ orderBy: 'notificationIntent/dueAt', startAt: 0, limitToFirst: 2 });
    expect(rows.map((row) => row.id)).toEqual(['dueA', 'dueB']);
  });
});
