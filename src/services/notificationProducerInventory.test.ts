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
const producerCall = /\b(?:createNotification|createBulkNotifications|send[A-Z]\w*Notification|send(?:Session|Test)[A-Z]\w*Notifications|notifyWriting[A-Z]\w*)\b/u;

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
                return source.includes('notificationService') && producerCall.test(source);
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
            'src/services/migrations/migrateNotifications.ts',
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
});
