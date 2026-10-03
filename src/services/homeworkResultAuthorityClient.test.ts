import { afterEach, expect, it, vi } from 'vitest';
import { verifyHomeworkResultAuthority } from './homeworkResultAuthorityClient';

afterEach(() => vi.unstubAllEnvs());
it('holds an unqualified verifier and performs exactly one separate product attempt when configured', async () => {
    vi.stubEnv('VITE_HOMEWORK_RESULT_AUTHORITY_URL', '');
    const fetchImpl = vi.fn(async () => Response.json({ status: 'created' }));
    const getIdToken = vi.fn(async () => 'token');
    expect(await verifyHomeworkResultAuthority('result1', { fetchImpl, getIdToken })).toEqual({ status: 'held', code: 'homework_authority_not_qualified' });
    expect(getIdToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    const options = { fetchImpl, getIdToken, workerOrigin: 'https://authority.example.workers.dev' };
    expect(await verifyHomeworkResultAuthority('result1', options)).toEqual({ status: 'created' });
    expect(fetchImpl).toHaveBeenCalledWith('https://authority.example.workers.dev/homework-result-authority', expect.objectContaining({
        method: 'POST', body: '{"resultId":"result1"}', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    }));
    fetchImpl.mockImplementation(async () => Response.json({ status: 'authority_denied' }, { status: 403 }));
    expect(await verifyHomeworkResultAuthority('result1', options)).toEqual({ status: 'failed', code: 'authority_denied' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
});
