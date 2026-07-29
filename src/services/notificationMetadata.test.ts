import { describe, expect, it } from 'vitest';
import {
    adaptStoredNotification,
    parseNotificationMetadata,
} from './notificationMetadata';

const validBookMetadata = {
    schemaVersion: 1,
    kind: 'book',
    contextType: 'book',
    contextId: 'book-123',
    updateActionId: 'update-456',
    checkpointAvailable: true,
    deadlineClass: 'upcoming',
    actionClass: 'resume',
} as const;

describe('notification metadata contract', () => {
    it('keeps legacy metadata readable', () => {
        const legacy = { resultId: 'result-1', source: 'grading' };

        expect(parseNotificationMetadata(legacy)).toEqual({
            kind: 'legacy',
            metadata: legacy,
        });
    });

    it('accepts the bounded Book metadata shape', () => {
        expect(parseNotificationMetadata(validBookMetadata)).toEqual({
            kind: 'book',
            metadata: validBookMetadata,
        });

        expect(parseNotificationMetadata({
            ...validBookMetadata,
            contextId: '-FirebasePushId12345',
            updateActionId: '_generated_action_1',
        })).toEqual({
            kind: 'book',
            metadata: {
                ...validBookMetadata,
                contextId: '-FirebasePushId12345',
                updateActionId: '_generated_action_1',
            },
        });
    });

    it('rejects unknown versions, types, and fields', () => {
        expect(parseNotificationMetadata({ ...validBookMetadata, schemaVersion: 2 })).toEqual({
            kind: 'invalid',
            reason: 'unknown-schema-version',
        });
        expect(parseNotificationMetadata({ ...validBookMetadata, kind: 'arbitrary' })).toEqual({
            kind: 'invalid',
            reason: 'unknown-type',
        });
        expect(parseNotificationMetadata({ ...validBookMetadata, accessToken: 'secret' })).toEqual({
            kind: 'invalid',
            reason: 'unknown-field',
        });
        for (const field of ['answers', 'activityJson', 'pdfObjectId', 'credentials', 'teacherImpactCounts']) {
            expect(parseNotificationMetadata({ ...validBookMetadata, [field]: 'private' })).toEqual({
                kind: 'invalid',
                reason: 'unknown-field',
            });
        }
    });

    it('rejects oversized structured metadata before field processing', () => {
        expect(parseNotificationMetadata({
            ...validBookMetadata,
            contextId: 'x'.repeat(2000),
        })).toEqual({
            kind: 'invalid',
            reason: 'over-limit',
        });
    });

    it('rejects malformed identifiers and values', () => {
        expect(parseNotificationMetadata({ ...validBookMetadata, contextId: '../private' })).toEqual({
            kind: 'invalid',
            reason: 'invalid-context-id',
        });
        expect(parseNotificationMetadata({ ...validBookMetadata, checkpointAvailable: 'yes' })).toEqual({
            kind: 'invalid',
            reason: 'invalid-checkpoint',
        });
        expect(parseNotificationMetadata({ ...validBookMetadata, actionClass: 'submit' })).toEqual({
            kind: 'invalid',
            reason: 'invalid-action-class',
        });
    });

    it('drops invalid metadata while preserving legacy notification fields', () => {
        expect(adaptStoredNotification({
            title: 'Old notification',
            message: 'Still readable',
            read: false,
            createdAt: 100,
            metadata: { schemaVersion: 99, token: 'do-not-trust' },
        }, 'legacy-id')).toEqual({
            id: 'legacy-id',
            type: 'info',
            title: 'Old notification',
            message: 'Still readable',
            read: false,
            createdAt: 100,
        });
    });
});
