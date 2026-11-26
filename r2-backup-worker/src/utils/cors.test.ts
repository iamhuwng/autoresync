import { describe, expect, it } from 'vitest';
import {
    corsPreflightResponse,
    isApprovedBackupOrigin,
    rejectDisallowedBackupOrigin,
    withBackupCorsHeaders,
} from './cors';

describe('r2-backup-worker CORS policy', () => {
    it('allows production and role-default localhost origins, never wildcard', () => {
        for (const origin of [
            'https://kahut1.web.app',
            'https://hocthem.net',
            'https://www.hocthem.net',
            'http://localhost:5173',
            'http://localhost:5174',
        ]) {
            expect(isApprovedBackupOrigin(origin)).toBe(true);
            const preflight = corsPreflightResponse(
                new Request('https://r2-backup-worker.test/api/backup/health', {
                    method: 'OPTIONS',
                    headers: { Origin: origin },
                })
            );
            expect(preflight.status).toBe(204);
            expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(origin);
            expect(preflight.headers.get('Vary')).toBe('Origin');
        }
    });

    it('rejects untrusted origins and non-default localhost ports in production', () => {
        for (const origin of [
            'https://evil.example',
            'http://localhost:5175',
            'http://localhost:5182',
            'http://127.0.0.1:5173',
        ]) {
            expect(isApprovedBackupOrigin(origin)).toBe(false);
            const request = new Request('https://r2-backup-worker.test/api/backup/health', {
                method: 'OPTIONS',
                headers: { Origin: origin },
            });
            const preflight = corsPreflightResponse(request);
            expect(preflight.status).toBe(403);
            expect(preflight.headers.get('Access-Control-Allow-Origin')).toBeNull();

            const rejected = rejectDisallowedBackupOrigin(request);
            expect(rejected?.status).toBe(403);
            expect(rejected?.headers.get('Access-Control-Allow-Origin')).toBeNull();
        }
    });

    it('allows 5175-5182 only when LOCAL_EMULATOR_AUTH is enabled', () => {
        expect(isApprovedBackupOrigin('http://localhost:5176', { LOCAL_EMULATOR_AUTH: 'true' })).toBe(true);
        expect(isApprovedBackupOrigin('http://localhost:5182', { LOCAL_EMULATOR_AUTH: 'true' })).toBe(true);
        expect(isApprovedBackupOrigin('http://localhost:5183', { LOCAL_EMULATOR_AUTH: 'true' })).toBe(false);
    });

    it('replaces any wildcard ACAO header with exact approved origin or omits it', () => {
        const base = new Response('{}', {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        const approved = withBackupCorsHeaders(
            base,
            new Request('https://r2-backup-worker.test/api/backup/health', {
                headers: { Origin: 'https://kahut1.web.app' },
            })
        );
        expect(approved.headers.get('Access-Control-Allow-Origin')).toBe('https://kahut1.web.app');

        const noOrigin = withBackupCorsHeaders(
            base,
            new Request('https://r2-backup-worker.test/api/backup/health')
        );
        expect(noOrigin.headers.get('Access-Control-Allow-Origin')).toBeNull();
        expect(noOrigin.headers.get('Vary')).toBe('Origin');
    });
});
