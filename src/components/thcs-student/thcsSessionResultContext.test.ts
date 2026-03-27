import { describe, expect, it } from 'vitest';
import { buildThcsSessionResultContext } from './thcsSessionResultContext';

describe('buildThcsSessionResultContext', () => {
    it('builds canonical class-session context from session identifiers', () => {
        const result = buildThcsSessionResultContext({
            sessionCode: 'SESSION123',
            title: 'THCS Session Test',
            duration: 50,
        });

        expect(result).toEqual(
            expect.objectContaining({
                type: 'class_session',
                sessionCode: 'SESSION123',
                source: expect.objectContaining({
                    type: 'class',
                    id: 'SESSION123',
                    name: 'THCS Session Test',
                    sessionCode: 'SESSION123',
                }),
            }),
        );
    });

    it('preserves optional class and course identifiers when available', () => {
        const result = buildThcsSessionResultContext({
            sessionCode: 'SESSION123',
            title: 'THCS Session Test',
            duration: 50,
            classId: 'class-1',
            courseId: 'course-1',
        });

        expect(result).toEqual(
            expect.objectContaining({
                classId: 'class-1',
                courseId: 'course-1',
                source: expect.objectContaining({
                    classId: 'class-1',
                    courseId: 'course-1',
                }),
            }),
        );
    });
});
