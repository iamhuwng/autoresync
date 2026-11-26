import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserByEmail } from './userService';

const mockGet = vi.fn();
const mockRef = vi.fn((_db: unknown, path?: string) => ({ path }));
const mockQuery = vi.fn((...args: unknown[]) => ({ args }));
const mockOrderByChild = vi.fn((field: string) => ({ orderByChild: field }));
const mockEqualTo = vi.fn((value: unknown) => ({ equalTo: value }));

vi.mock('firebase/database', () => ({
    ref: (db: unknown, path?: string) => mockRef(db, path),
    get: (refArg: unknown) => mockGet(refArg),
    query: (...args: unknown[]) => mockQuery(...args),
    orderByChild: (field: string) => mockOrderByChild(field),
    equalTo: (value: unknown) => mockEqualTo(value),
    update: vi.fn(),
    remove: vi.fn(),
    set: vi.fn(),
}));

vi.mock('./firebase', () => ({
    database: {},
}));

vi.mock('./assignmentManager', () => ({
    getAssignmentsByTeacher: vi.fn(),
}));

describe('userService.getUserByEmail', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('canonicalizes mixed-case email with whitespace to lowercase before querying RTDB', async () => {
        mockGet.mockResolvedValueOnce({
            exists: () => true,
            val: () => ({
                'student-1': { email: 'student@example.com', displayName: 'Student One', role: 'student' },
            }),
        });

        const user = await getUserByEmail('  Student@Example.COM  ');

        expect(mockOrderByChild).toHaveBeenCalledWith('email');
        expect(mockEqualTo).toHaveBeenCalledWith('student@example.com');
        expect(mockGet).toHaveBeenCalledTimes(1);
        expect(user).toMatchObject({ uid: 'student-1', email: 'student@example.com' });
    });

    it('falls back to exact trimmed email when a legacy record stores mixed casing', async () => {
        mockGet
            .mockResolvedValueOnce({ exists: () => false, val: () => null })
            .mockResolvedValueOnce({
                exists: () => true,
                val: () => ({
                    'student-legacy': { email: 'Legacy@Example.com', displayName: 'Legacy Student', role: 'student' },
                }),
            });

        const user = await getUserByEmail('  Legacy@Example.com ');

        expect(mockEqualTo).toHaveBeenNthCalledWith(1, 'legacy@example.com');
        expect(mockEqualTo).toHaveBeenNthCalledWith(2, 'Legacy@Example.com');
        expect(user).toMatchObject({ uid: 'student-legacy', email: 'Legacy@Example.com' });
    });

    it('returns null without querying for blank email input', async () => {
        const user = await getUserByEmail('   ');
        expect(user).toBeNull();
        expect(mockGet).not.toHaveBeenCalled();
    });
});
