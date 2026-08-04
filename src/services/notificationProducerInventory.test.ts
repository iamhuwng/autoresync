import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const sourceRoot = join(root, 'src');
const inventoryPath = join(
    root,
    'documentation',
    'tasks',
    'PRD0062',
    'evidence',
    'notification-producer-inventory.md',
);
const sourceExtensions = /\.(?:js|jsx|ts|tsx)$/u;
const testFile = /\.(?:test|spec)\.[^.]+$/u;
const producerCall = /\b(?:createNotification|createBulkNotifications|createTrustedNotification|createTrustedBulkNotifications|send[A-Z]\w*Notification|send(?:Session|Test)[A-Z]\w*Notifications|notifyWriting[A-Z]\w*)\b/u;
const legacyNotificationProducerCall = /\b(?:createNotification|createBulkNotifications|send(?!Trusted)[A-Z]\w*Notification|send(?!Trusted)(?:Session|Test)[A-Z]\w*Notifications|notifyWriting[A-Z]\w*)\b/u;

const filesUnder = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            return entry.name === 'backups' ? [] : filesUnder(path);
        }
        return sourceExtensions.test(entry.name) && !testFile.test(entry.name) ? [path] : [];
    });

const relativePath = (path: string): string => relative(root, path).replaceAll('\\', '/');

const inventoryRows = (): Array<{ path: string; owner: string }> => {
    const markdown = readFileSync(inventoryPath, 'utf8');
    return [...markdown.matchAll(/^\| `([^`]+)` \| #(95|96|97) \|/gmu)]
        .map((match) => ({ path: match[1]!, owner: match[2]! }));
};

describe('Ticket 38B1 notification producer inventory', () => {
    it('assigns every static and dynamic notification producer exactly once', () => {
        const actual = filesUnder(sourceRoot)
            .filter((path) => {
                const source = readFileSync(path, 'utf8');
                return (source.includes('notificationService') || source.includes('notificationProducerClient'))
                    && producerCall.test(source);
            })
            .map(relativePath)
            .sort();
        const rows = inventoryRows();
        const assigned = rows.map((row) => row.path).sort();

        expect(new Set(assigned).size).toBe(assigned.length);
        expect(assigned).toEqual(actual);
        expect(new Set(rows.map((row) => row.owner))).toEqual(new Set(['95', '96', '97']));
    });

    it('keeps raw notification-content writes inside owned compatibility paths', () => {
        const allowed = new Set([
            'src/services/accountDeletionService.ts',
            'src/services/notificationService.ts',
        ]);
        const rawNotificationPaths = filesUnder(sourceRoot)
            .filter((path) => {
                const source = readFileSync(path, 'utf8');
                return /(?:NOTIFICATIONS_REF|notifications\/\$\{|['"`]notifications\/)/u.test(source)
                    && /\b(?:push|set|update|remove)\s*\(/u.test(source);
            })
            .map(relativePath)
            .sort();

        expect(rawNotificationPaths).toEqual([...allowed].sort());
    });

    it('requires #95 producers to use the trusted seam with explicit authority', () => {
        const owned = [
            ['src/components/course/RequestReviewList.tsx', 'enrollment'],
            ['src/services/assignmentManager.ts', 'assignment'],
            ['src/services/classManager.ts', 'class'],
            ['src/services/courseAnnouncementService.ts', 'course-announcement'],
            ['src/services/courseManager.ts', 'course'],
            ['src/services/deadlineReminderService.ts', 'deadline'],
            ['src/services/enrollmentManager.ts', 'enrollment'],
            ['src/pages/TeacherHomeworkDetailPage.tsx', 'deadline'],
        ];
        for (const [relativeFile, producerFamily] of owned) {
            const source = readFileSync(join(root, relativeFile), 'utf8');
            expect(source, relativeFile).not.toContain('notificationService');
            expect(source, relativeFile).toContain('notificationProducerClient');
            if (relativeFile.endsWith('TeacherHomeworkDetailPage.tsx')) {
                expect(source, relativeFile).toContain('sendTrustedHomeworkReminderNotification');
            } else {
                expect(source, relativeFile).toContain(`producerFamily: '${producerFamily}'`);
                expect(source, relativeFile).toContain('producerFamily');
                expect(source, relativeFile).toContain('authorityRecordId');
                expect(source, relativeFile).toContain('operationKey');
            }
        }
    });

    it('requires #96 producers to use the trusted seam with explicit authority', () => {
        const owned = [
            ['src/components/results/TeacherFeedbackManager.tsx', 'feedback'],
            ['src/components/thcs-grading/InlineWritingGrader.tsx', 'result'],
            ['src/services/homeworkSubmissionService.ts', 'homework'],
            ['src/services/testResults.service.ts', 'result'],
        ];
        for (const [relativeFile, producerFamily] of owned) {
            const source = readFileSync(join(root, relativeFile), 'utf8');
            expect(source, relativeFile).not.toContain('notificationService');
            expect(source, relativeFile).not.toMatch(legacyNotificationProducerCall);
            expect(source, relativeFile).toContain('notificationProducerClient');
            expect(source, relativeFile).toContain(`producerFamily: '${producerFamily}'`);
            expect(source, relativeFile).toContain('authorityRecordId');
            expect(source, relativeFile).toContain('operationKey');
        }
    });

    it('requires #97 producers to use the trusted seam with explicit authority', () => {
        const owned = [
            ['src/services/writingSubmissionService.ts', 'writing'],
            ['src/services/thcsWritingGrading.service.ts', 'thcs-grading'],
            ['src/hooks/monitor/useMonitorControls.ts', 'monitor'],
            ['src/services/sessionManager.js', 'session'],
            ['src/components/writing-practice/WritingPracticeView.tsx', 'writing'],
            ['src/components/practice/THCSPracticeView.tsx', 'thcs-practice'],
            ['src/components/thcs-student/THCSTestLayout.tsx', 'thcs-practice'],
            ['src/components/thcs-editor/THCSHomeworkAssignDialog.tsx', 'thcs-practice'],
        ];
        for (const [relativeFile, producerFamily] of owned) {
            const source = readFileSync(join(root, relativeFile), 'utf8');
            expect(source, relativeFile).not.toContain('notificationService');
            expect(source, relativeFile).toContain('notificationProducerClient');
            expect(source, relativeFile).toContain(`producerFamily: '${producerFamily}'`);
            expect(source, relativeFile).toContain('authorityRecordId');
            expect(source, relativeFile).toContain('operationKey');
        }
    });
});
