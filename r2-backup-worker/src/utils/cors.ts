import type { WorkerEnv } from '../types';

const PRODUCTION_APP_ORIGINS = new Set([
    'https://kahut1.web.app',
    'https://hocthem.net',
    'https://www.hocthem.net',
    'https://app.hocthem.net',
    'https://kahoot.hocthem.net',
    'https://portal.hocthem.net',
    'https://mstu.work',
    'https://app.mstu.work',
    'https://kahoot.mstu.work',
    'https://portal.mstu.work',
    'https://temp-a1437.web.app',
    'https://temp-a1437.firebaseapp.com',
]);

const DEFAULT_LOCAL_ORIGINS = new Set([
    'http://localhost:5173',
    'http://localhost:5174',
]);

const LOCAL_EMULATOR_ORIGINS = new Set(
    Array.from({ length: 10 }, (_, index) => `http://localhost:${5173 + index}`)
);

export function isApprovedBackupOrigin(origin: string | null, env?: Partial<WorkerEnv>): boolean {
    if (!origin) return false;
    if (PRODUCTION_APP_ORIGINS.has(origin) || DEFAULT_LOCAL_ORIGINS.has(origin)) {
        return true;
    }
    if (env?.LOCAL_EMULATOR_AUTH === 'true' && LOCAL_EMULATOR_ORIGINS.has(origin)) {
        return true;
    }
    return false;
}

export function buildCorsHeaders(
    request?: Request,
    env?: Partial<WorkerEnv>,
    methods = 'GET, POST, OPTIONS'
): Record<string, string> {
    const origin = request?.headers.get('Origin') ?? null;
    if (!origin || !isApprovedBackupOrigin(origin, env)) {
        return { Vary: 'Origin' };
    }
    return {
        Vary: 'Origin',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': methods,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

export function corsPreflightResponse(request: Request, env?: Partial<WorkerEnv>): Response {
    const origin = request.headers.get('Origin');
    if (!origin || !isApprovedBackupOrigin(origin, env)) {
        return new Response(null, {
            status: 403,
            headers: { Vary: 'Origin' },
        });
    }
    return new Response(null, {
        status: 204,
        headers: {
            ...buildCorsHeaders(request, env, 'GET, POST, OPTIONS'),
            'Access-Control-Max-Age': '86400',
        },
    });
}

export function rejectDisallowedBackupOrigin(request: Request, env?: Partial<WorkerEnv>): Response | null {
    const origin = request.headers.get('Origin');
    if (!origin || isApprovedBackupOrigin(origin, env)) {
        return null;
    }
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: {
            'Content-Type': 'application/json',
            Vary: 'Origin',
        },
    });
}

export function withBackupCorsHeaders(
    response: Response,
    request: Request,
    env?: Partial<WorkerEnv>
): Response {
    const headers = new Headers(response.headers);
    headers.delete('Access-Control-Allow-Origin');
    headers.set('Vary', 'Origin');
    const origin = request.headers.get('Origin');
    if (origin && isApprovedBackupOrigin(origin, env)) {
        headers.set('Access-Control-Allow-Origin', origin);
        if (!headers.has('Access-Control-Allow-Methods')) {
            headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        }
        if (!headers.has('Access-Control-Allow-Headers')) {
            headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        }
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}
