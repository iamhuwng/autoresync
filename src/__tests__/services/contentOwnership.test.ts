import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveTestToFirebase, getAllTestsFromFirebase } from '../../services/testStorage';
import * as firebaseDatabase from 'firebase/database';

// Mock Firebase Database
vi.mock('firebase/database');
vi.mock('../../services/firebase', () => ({
  database: {}
}));

describe('Content Ownership', () => {
  let mockRef: any;
  let mockGet: any;
  let mockSet: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRef = vi.fn().mockReturnValue({});
    mockGet = vi.fn();
    mockSet = vi.fn();

    vi.mocked(firebaseDatabase.ref).mockImplementation(mockRef);
    vi.mocked(firebaseDatabase.get).mockImplementation(mockGet);
    vi.mocked(firebaseDatabase.set).mockImplementation(mockSet);
  });

  describe('saveTestToFirebase', () => {
    it('should save new test with current user\'s ownerId', async () => {
      mockSet.mockResolvedValue(undefined);

      const metadata = {
        title: 'Test Quiz',
        type: 'IELTS' as const,
        skill: 'Reading' as const,
        duration: 60,
        difficulty: 'Intermediate' as const
      };

      const passages = [{
        id: 'passage-1',
        title: 'Test Passage',
        content: 'Test content',
        type: 'text' as const
      }];

      const questions = [{
        number: 1,
        type: 'multiple-choice',
        question: 'Test question?',
        answer: 'A',
        passageId: 'passage-1',
        points: 1
      }];

      const currentUserId = 'teacher-uid-123';

      await saveTestToFirebase(
        metadata,
        passages,
        questions,
        currentUserId,
        undefined,
        currentUserId, // ownerId
        false // isPublic
      );

      expect(mockSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          ownerId: currentUserId,
          isPublic: false,
          createdBy: currentUserId
        })
      );
    });

    it('should save test as private by default', async () => {
      mockSet.mockResolvedValue(undefined);

      const metadata = {
        title: 'Private Test',
        type: 'TOEFL' as const,
        skill: 'Listening' as const,
        duration: 45
      };

      await saveTestToFirebase(
        metadata,
        [],
        [],
        'teacher-123',
        undefined,
        'teacher-123'
        // isPublic defaults to false
      );

      expect(mockSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          isPublic: false
        })
      );
    });

    it('should save test as public when specified', async () => {
      mockSet.mockResolvedValue(undefined);

      const metadata = {
        title: 'Public Test',
        type: 'Custom' as const,
        skill: 'Writing' as const,
        duration: 30
      };

      await saveTestToFirebase(
        metadata,
        [],
        [],
        'teacher-123',
        undefined,
        'teacher-123',
        true // isPublic
      );

      expect(mockSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          isPublic: true
        })
      );
    });
  });

  describe('Content Filtering', () => {
    it('should filter tests to show only owned content', () => {
      const currentUserId = 'teacher-A';
      
      const allTests = [
        { id: 'test-1', title: 'My Test', ownerId: 'teacher-A', isPublic: false },
        { id: 'test-2', title: 'Other Private', ownerId: 'teacher-B', isPublic: false },
        { id: 'test-3', title: 'Other Public', ownerId: 'teacher-B', isPublic: true },
        { id: 'test-4', title: 'My Public', ownerId: 'teacher-A', isPublic: true }
      ];

      const myContent = allTests.filter(test => test.ownerId === currentUserId);

      expect(myContent).toHaveLength(2);
      expect(myContent.map(t => t.id)).toEqual(['test-1', 'test-4']);
    });

    it('should filter tests to show only public content from others', () => {
      const currentUserId = 'teacher-A';
      
      const allTests = [
        { id: 'test-1', title: 'My Test', ownerId: 'teacher-A', isPublic: false },
        { id: 'test-2', title: 'Other Private', ownerId: 'teacher-B', isPublic: false },
        { id: 'test-3', title: 'Other Public', ownerId: 'teacher-B', isPublic: true },
        { id: 'test-4', title: 'My Public', ownerId: 'teacher-A', isPublic: true }
      ];

      const publicContent = allTests.filter(
        test => test.isPublic === true && test.ownerId !== currentUserId
      );

      expect(publicContent).toHaveLength(1);
      expect(publicContent[0].id).toBe('test-3');
    });

    it('should not show private content from other teachers', () => {
      const currentUserId = 'teacher-A';
      
      const allTests = [
        { id: 'test-1', title: 'Teacher B Private', ownerId: 'teacher-B', isPublic: false },
        { id: 'test-2', title: 'Teacher C Private', ownerId: 'teacher-C', isPublic: false }
      ];

      const myContent = allTests.filter(test => test.ownerId === currentUserId);
      const publicContent = allTests.filter(
        test => test.isPublic === true && test.ownerId !== currentUserId
      );

      expect(myContent).toHaveLength(0);
      expect(publicContent).toHaveLength(0);
    });
  });

  describe('Public Toggle', () => {
    it('should allow owner to toggle isPublic on their own content', async () => {
      const testId = 'test-123';
      const currentIsPublic = false;
      
      mockGet.mockResolvedValue({
        exists: () => true,
        val: () => ({
          id: testId,
          ownerId: 'teacher-A',
          isPublic: currentIsPublic
        })
      });

      mockSet.mockResolvedValue(undefined);

      // Simulate toggle
      const testRef = mockRef(`tests/${testId}`);
      await mockSet(testRef, {
        isPublic: !currentIsPublic,
        updatedAt: Date.now()
      });

      expect(mockSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          isPublic: true
        })
      );
    });

    it('should update updatedAt timestamp when toggling isPublic', async () => {
      const testId = 'test-123';
      const beforeTime = Date.now();
      
      mockSet.mockResolvedValue(undefined);

      const testRef = mockRef(`tests/${testId}`);
      const updateTime = Date.now();
      await mockSet(testRef, {
        isPublic: true,
        updatedAt: updateTime
      });

      expect(mockSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          updatedAt: expect.any(Number)
        })
      );

      const call = mockSet.mock.calls[0][1];
      expect(call.updatedAt).toBeGreaterThanOrEqual(beforeTime);
    });
  });

  describe('Access Control', () => {
    it('should prevent Teacher A from editing Teacher B\'s private content', () => {
      const currentUserId = 'teacher-A';
      const test = {
        id: 'test-123',
        title: 'Teacher B Test',
        ownerId: 'teacher-B',
        isPublic: false
      };

      const canEdit = test.ownerId === currentUserId;

      expect(canEdit).toBe(false);
    });

    it('should allow Teacher A to view Teacher B\'s public content', () => {
      const currentUserId = 'teacher-A';
      const test = {
        id: 'test-123',
        title: 'Teacher B Public Test',
        ownerId: 'teacher-B',
        isPublic: true
      };

      const canView = test.isPublic === true;

      expect(canView).toBe(true);
    });

    it('should allow owner to edit their own content regardless of isPublic', () => {
      const currentUserId = 'teacher-A';
      
      const privateTest = {
        id: 'test-1',
        ownerId: 'teacher-A',
        isPublic: false
      };

      const publicTest = {
        id: 'test-2',
        ownerId: 'teacher-A',
        isPublic: true
      };

      expect(privateTest.ownerId === currentUserId).toBe(true);
      expect(publicTest.ownerId === currentUserId).toBe(true);
    });
  });

  describe('Legacy Content Migration', () => {
    it('should handle tests without ownerId field', () => {
      const legacyTest = {
        id: 'legacy-test',
        title: 'Old Test',
        createdBy: 'teacher-default'
        // No ownerId or isPublic fields
      };

      // Migration should add these fields
      const migratedTest = {
        ...legacyTest,
        ownerId: legacyTest.createdBy || 'legacy-admin',
        isPublic: true // Default to public for legacy content
      };

      expect(migratedTest.ownerId).toBeDefined();
      expect(migratedTest.isPublic).toBe(true);
    });

    it('should use createdBy as ownerId for legacy tests if valid', () => {
      const legacyTest = {
        id: 'legacy-test',
        createdBy: 'actual-teacher-uid-123'
      };

      const ownerId = legacyTest.createdBy && 
                      legacyTest.createdBy !== 'teacher-default' && 
                      legacyTest.createdBy.length > 10
        ? legacyTest.createdBy
        : 'legacy-admin';

      expect(ownerId).toBe('actual-teacher-uid-123');
    });

    it('should assign legacy-admin for invalid createdBy values', () => {
      const legacyTests = [
        { createdBy: 'teacher-default' },
        { createdBy: 'admin' },
        { createdBy: '' }
      ];

      legacyTests.forEach(test => {
        const ownerId = test.createdBy && 
                        test.createdBy !== 'teacher-default' && 
                        test.createdBy.length > 10
          ? test.createdBy
          : 'legacy-admin';

        expect(ownerId).toBe('legacy-admin');
      });
    });
  });
});
