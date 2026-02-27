
import { describe, it, expect, vi } from 'vitest';
import { sendEmail, sendResultNotification, sendTeacherSessionComplete } from './emailNotification.service';
import { addDoc } from 'firebase/firestore';

// Mock dependencies
vi.mock('./firebase', () => ({
    firestore: {}
}));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    addDoc: vi.fn(),
    getFirestore: vi.fn()
}));

describe('emailNotification.service', () => {
    it('should queue email via addDoc', async () => {
        await sendEmail('test@example.com', 'Subject', '<p>Body</p>');
        expect(addDoc).toHaveBeenCalledTimes(1);
        const callArgs = (addDoc as any).mock.calls[0][1];
        expect(callArgs.to).toEqual(['test@example.com']);
        expect(callArgs.message.subject).toBe('Subject');
        expect(callArgs.message.html).toBe('<p>Body</p>');
    });

    it('should format result notification correctly', async () => {
        const mockResult = {
            studentName: 'John',
            score: 10,
            totalQuestions: 20,
            percentage: 50,
            bandScore: 5.5
        } as any;

        await sendResultNotification('student@example.com', mockResult, 'Test 1');

        expect(addDoc).toHaveBeenCalled();
        const callArgs = (addDoc as any).mock.lastCall[1];
        expect(callArgs.message.subject).toContain('Test Result: Test 1');
        expect(callArgs.message.html).toContain('50.0%');
        expect(callArgs.message.html).toContain('John');
    });

    it('should format teacher session complete notification correctly', async () => {
        const summary = {
            totalStudents: 10,
            avgScore: 75,
            passRate: 80,
            testTitle: 'Test A'
        };

        await sendTeacherSessionComplete('teacher@example.com', 'SESSION-123', summary);

        expect(addDoc).toHaveBeenCalled();
        const callArgs = (addDoc as any).mock.lastCall[1];
        expect(callArgs.message.subject).toContain('Session Complete: Test A');
        expect(callArgs.message.html).toContain('SESSION-123');
        expect(callArgs.message.html).toContain('75.0%');
    });
});
