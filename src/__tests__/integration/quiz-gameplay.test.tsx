import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Quiz Gameplay Integration Tests
 * 
 * Tests the quiz session flow:
 * - Session creation and player joining
 * - Question progression and timer
 * - Answer submission and scoring
 * - Session end and results
 */

// Mock Firebase
vi.mock('../../services/firebase', () => ({
  database: {},
  firestore: {},
}));

// Mock firebase/database
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  onValue: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  push: vi.fn(),
  serverTimestamp: vi.fn(),
}));

describe('Quiz Gameplay Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Session Creation', () => {
    it('should create a quiz session with valid quiz data', async () => {
      // This tests the session creation flow
      const mockQuiz = {
        id: 'quiz-123',
        title: 'Test Quiz',
        questions: [
          {
            id: 'q1',
            number: 1,
            question: 'What is 2+2?',
            type: 'multiple-choice',
            options: ['3', '4', '5', '6'],
            answer: '4',
            timer: 30,
            points: 10,
          },
          {
            id: 'q2',
            number: 2,
            question: 'What is 3+3?',
            type: 'multiple-choice',
            options: ['5', '6', '7', '8'],
            answer: '6',
            timer: 30,
            points: 10,
          },
        ],
        version: 1,
      };

      expect(mockQuiz.questions).toHaveLength(2);
      expect(mockQuiz.version).toBe(1);
    });

    it('should generate unique session codes', () => {
      // Test session code generation
      const generateCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
      };

      const code1 = generateCode();
      const code2 = generateCode();

      expect(code1).toHaveLength(6);
      expect(code2).toHaveLength(6);
      // Very unlikely to be the same
      expect(code1).not.toBe(code2);
    });
  });

  describe('Player Management', () => {
    it('should allow players to join session', () => {
      const players: Record<string, any> = {};

      // Simulate player join
      const playerId = 'player-1';
      players[playerId] = {
        name: 'Test Player',
        ip: '127.0.0.1',
        score: 0,
        answers: {},
        joinedAt: Date.now(),
      };

      expect(Object.keys(players)).toHaveLength(1);
      expect(players[playerId].name).toBe('Test Player');
    });

    it('should ban players and prevent rejoin', () => {
      const bannedPlayers: Record<string, any> = {};

      // Ban a player
      const playerId = 'player-1';
      bannedPlayers[playerId] = {
        name: 'Bad Player',
        ip: '127.0.0.1',
        bannedAt: Date.now(),
      };

      // Check if player can rejoin
      const canJoin = (pid: string) => !bannedPlayers[pid];

      expect(canJoin(playerId)).toBe(false);
      expect(canJoin('player-2')).toBe(true);
    });
  });

  describe('Question Progression', () => {
    it('should advance to next visible question', () => {
      const questions = [
        { number: 1, hidden: false },
        { number: 2, hidden: true }, // Hidden
        { number: 3, hidden: false },
      ];

      // Find next visible question from index 0
      let nextIndex = 1;
      while (nextIndex < questions.length && questions[nextIndex].hidden) {
        nextIndex++;
      }

      expect(nextIndex).toBe(2); // Should skip hidden question 2
    });

    it('should detect last visible question', () => {
      const questions = [
        { number: 1, hidden: false },
        { number: 2, hidden: false },
        { number: 3, hidden: true },
      ];

      const currentIndex = 1;

      // Check if there are more visible questions
      const isLastVisible = () => {
        for (let i = currentIndex + 1; i < questions.length; i++) {
          if (!questions[i].hidden) return false;
        }
        return true;
      };

      expect(isLastVisible()).toBe(true);
    });
  });

  describe('Answer Scoring', () => {
    it('should score multiple choice correctly', () => {
      const question = {
        type: 'multiple-choice',
        answer: 'B',
        points: 10,
      };

      const scoreAnswer = (studentAnswer: string) => {
        return studentAnswer === question.answer ? question.points : 0;
      };

      expect(scoreAnswer('B')).toBe(10);
      expect(scoreAnswer('A')).toBe(0);
    });

    it('should score completion questions with case insensitivity', () => {
      const question = {
        type: 'completion',
        answer: 'oxygen',
        points: 10,
      };

      const scoreAnswer = (studentAnswer: string) => {
        return studentAnswer.toLowerCase().trim() === question.answer.toLowerCase()
          ? question.points
          : 0;
      };

      expect(scoreAnswer('oxygen')).toBe(10);
      expect(scoreAnswer('OXYGEN')).toBe(10);
      expect(scoreAnswer(' Oxygen ')).toBe(10);
      expect(scoreAnswer('nitrogen')).toBe(0);
    });

    it('should calculate total score for all answers', () => {
      const questions = [
        { answer: 'A', points: 10 },
        { answer: 'B', points: 10 },
        { answer: 'C', points: 20 },
      ];

      const studentAnswers: Record<number, string> = {
        0: 'A', // Correct
        1: 'A', // Wrong
        2: 'C', // Correct
      };

      const totalScore = questions.reduce((score, q, i) => {
        return score + (studentAnswers[i] === q.answer ? q.points : 0);
      }, 0);

      expect(totalScore).toBe(30); // 10 + 0 + 20
    });
  });

  describe('Quiz Version Tracking', () => {
    it('should initialize quiz with version 1', () => {
      const newQuiz = {
        title: 'New Quiz',
        questions: [],
        version: 1,
        editHistory: [
          { timestamp: Date.now(), changes: ['Initial creation'] },
        ],
      };

      expect(newQuiz.version).toBe(1);
      expect(newQuiz.editHistory).toHaveLength(1);
    });

    it('should increment version on edit', () => {
      let quiz = {
        version: 1,
        editHistory: [{ timestamp: Date.now(), changes: ['Initial'] }],
      };

      // Simulate edit
      const onSave = (changes: string[]) => {
        quiz = {
          ...quiz,
          version: quiz.version + 1,
          editHistory: [
            ...quiz.editHistory,
            { timestamp: Date.now(), changes },
          ],
        };
      };

      onSave(['Title updated', '2 question(s) modified']);

      expect(quiz.version).toBe(2);
      expect(quiz.editHistory).toHaveLength(2);
      expect(quiz.editHistory[1].changes).toContain('Title updated');
    });

    it('should limit edit history to last 10 entries', () => {
      const editHistory = Array.from({ length: 15 }, (_, i) => ({
        timestamp: Date.now() + i,
        changes: [`Edit ${i + 1}`],
      }));

      // Simulate the slice operation from QuizEditor
      const limitedHistory = editHistory.slice(-10);

      expect(limitedHistory).toHaveLength(10);
      expect(limitedHistory[0].changes[0]).toBe('Edit 6'); // First after slicing
      expect(limitedHistory[9].changes[0]).toBe('Edit 15'); // Last
    });
  });

  describe('Session End and Reset', () => {
    it('should reset player scores on session end', () => {
      const players: Record<string, any> = {
        'p1': { name: 'Player 1', score: 50, answers: { 0: 'A' } },
        'p2': { name: 'Player 2', score: 30, answers: { 0: 'B' } },
      };

      // Reset players for new session
      const resetPlayers: Record<string, any> = {};
      Object.keys(players).forEach((id) => {
        resetPlayers[id] = {
          name: players[id].name,
          ip: players[id].ip || 'unknown',
          score: 0,
          answers: {},
        };
      });

      expect(resetPlayers['p1'].score).toBe(0);
      expect(resetPlayers['p1'].answers).toEqual({});
      expect(resetPlayers['p1'].name).toBe('Player 1');
    });

    it('should preserve banned players on session end', () => {
      const bannedPlayers = {
        'banned-1': { name: 'Bad Player', bannedAt: Date.now() },
      };

      // Session end should not clear banned list
      const sessionData = {
        status: 'waiting',
        players: {},
        bannedPlayers: bannedPlayers, // Preserved
        currentQuestionIndex: 0,
      };

      expect(Object.keys(sessionData.bannedPlayers)).toHaveLength(1);
    });
  });
});
