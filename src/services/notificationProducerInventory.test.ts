import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const sourceRoot = join(root, 'src');
const inventoryPath = join(root, 'documentation', 'tasks', 'PRD0062', 'evidence', 'notification-producer-inventory.md');
const sourceExtensions = /\.(?:js|jsx|ts|tsx)$/u;
const testFile = /\.(?:test|spec)\.[^.]+$/u;
const producerCall = /\b(?:dispatchCommittedNotification|commitClassAction|createCourseAnnouncementAction|wakeCourseTypeDecisionDelivery|wakeAssignmentNotification|wakeCourseRequestNotification|saveFeedbackAction|recordManualHomeworkReminder|markResultReviewed|buildSessionNotificationWrites|deliverSessionNotificationNow|dispatchThcsNotificationAction|submitManualThcsGrade)\s*\(/u;
const adapters = new Set([
    'src/services/assignmentActionClient.ts',
    'src/services/classActionClient.ts',
    'src/services/courseAnnouncementActionClient.ts',
    'src/services/courseTypeDecisionClient.ts',
    'src/services/enrollmentActionClient.ts',
    'src/services/feedbackActionClient.ts',
    'src/services/manualThcsGradeClient.ts',
    'src/services/notificationProducerClient.ts',
    'src/services/sessionNotificationActionClient.ts',
    'src/services/thcsNotificationActionClient.ts',
    'src/services/resultReviewActionClient.ts',
]);

interface InventoryRow {
    path: string;
    owner: string;
    family: string;
    status: string;
}

const filesUnder = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return entry.name === 'backups' ? [] : filesUnder(path);
        return sourceExtensions.test(entry.name) && !testFile.test(entry.name) ? [path] : [];
    });

const relativePath = (path: string): string => relative(root, path).replaceAll('\\', '/');
const sources = (): Map<string, string> => new Map(filesUnder(sourceRoot).map((path) => [relativePath(path), readFileSync(path, 'utf8')]));
const inventoryRows = (): InventoryRow[] => [...readFileSync(inventoryPath, 'utf8').matchAll(
    /^\| `([^`]+)` \| (#95|#96|#97) \| ([^|]+) \| ([^|]+) \|$/gmu,
) ].map((match) => ({ path: match[1]!, owner: match[2]!, family: match[3]!.trim(), status: match[4]!.trim() }));

describe('PRD0062 notification producer inventory', () => {
    it('inventories each current producer callsite exactly once', () => {
        const source = sources();
        const actual = [...source]
            .filter(([path, text]) => !adapters.has(path) && producerCall.test(text))
            .map(([path]) => path)
            .sort();
        const rows = inventoryRows();
        const assigned = rows.map((row) => row.path).sort();
        expect(new Set(assigned).size).toBe(assigned.length);
        expect(assigned).toEqual(actual);
        expect(new Set(rows.map((row) => row.owner))).toEqual(new Set(['#95', '#96', '#97']));
    });

    it('has no generic content-authoring producer call', () => {
        const source = sources();
        const actualGenericCalls = [...source]
            .filter(([, text]) => /\bcreateTrusted(?:Bulk)?Notifications?\s*\(/u.test(text))
            .map(([path]) => path)
            .sort();
        expect(actualGenericCalls).toEqual([]);
    });

    it('keeps raw inbox-content writes confined to the legacy adapter and account cleanup', () => {
        const allowed = new Set([
            'src/services/accountDeletionService.ts',
            'src/services/notificationService.ts',
        ]);
        const rawNotificationPaths = [...sources()]
            .filter(([, text]) => /(?:NOTIFICATIONS_REF|notifications\/\$\{|['"`]notifications\/)/u.test(text)
                && /\b(?:push|set|update|remove)\s*\(/u.test(text))
            .map(([path]) => path)
            .sort();
        expect(rawNotificationPaths).toEqual([...allowed].sort());
    });
});
