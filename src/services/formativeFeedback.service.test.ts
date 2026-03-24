import { describe, it, expect } from 'vitest';
import {
  buildFeedbackPrompt,
  buildFallbackQuestionExplanation,
  getRenderableQuestionExplanations,
  isWeakQuestionExplanation,
  needsAiFeedbackUpgrade,
  validateAIFeedbackResponse,
} from './formativeFeedback.service';

describe('formativeFeedback.service', () => {
  it('flags the old boilerplate explanation as weak', () => {
    expect(
      isWeakQuestionExplanation(
        'You chose "D", but the correct answer is "B". Review the grammar rule or vocabulary pattern behind this question and try again with similar exercises.',
      ),
    ).toBe(true);

    expect(
      isWeakQuestionExplanation(
        'This question tests present perfect in the sentence "She has lived here since 2020." You chose "lived", but the correct answer is "has lived" because "since 2020" requires the present perfect to connect past time with the present. To solve it correctly, identify the time marker first and then choose the verb form that matches that timeline.',
      ),
    ).toBe(false);

    expect(
      isWeakQuestionExplanation(
        'This question tests sentence arrangement in the context of "a. Maria: When I told my parents I wanted to study engineering...". You left this question unanswered, but the correct answer is "C" (c-e-a-d-b). Missing a response here usually means the key grammar or meaning clue in the prompt was not fully tracked. The correct answer works because the correct answer is the option that works with both the language pattern and the overall meaning of the prompt. When you review it, go back to Sentence Arrangement and trace the exact clue before choosing again. A reliable way to solve questions like this is to read the whole prompt carefully, identify the key clue that controls the answer, remove options that only partially fit, and then select the answer that remains correct in full context.',
      ),
    ).toBe(true);

    expect(
      isWeakQuestionExplanation(
        'The strongest clue for this question is "Beyond Boundaries: Inventions That Break the Rules and Set New Standards". Because you left it blank, the fastest way in is to anchor your answer to that exact clue instead of trying to remember the whole passage at once. The correct answer is "B" (challenge) because it is the option that preserves the full meaning of the relevant line, not just part of the topic. A good method is to find the key line first, paraphrase it in simple words, and then choose the option that says the same thing without adding or changing information.',
      ),
    ).toBe(true);

    expect(
      isWeakQuestionExplanation(
        'This is an ordering question, so the key is to find the sentence that can open the paragraph without depending on anything earlier. Sentence d has to come first because it introduces the main situation before the later sentences react to it or add consequences. A common trap here is that several orders look possible at first, but only one sequence lets every sentence connect smoothly to the one before it. When you solve these questions, lock the opening sentence first, then use pronouns, connectors, and repeated ideas to test each next link instead of guessing the whole order at once.',
      ),
    ).toBe(true);
  });

  it('rejects AI responses that miss or weaken required wrong-answer explanations', () => {
    const raw = {
      questionTopics: {
        Q1: { topic: 'vocabulary in context', category: 'Reading' },
      },
      questionExplanations: {
        Q1: 'The strongest clue for this question is "Beyond Boundaries". Because you left it blank, the fastest way in is to anchor your answer to that exact clue instead of trying to remember the whole passage at once. The correct answer is "B" because it preserves the full meaning of the line. A good method is to find the key line first, paraphrase it in simple words, and then choose the option that says the same thing without adding or changing information.',
      },
      feedback: {
        summary: 'You need more practice with reading comprehension.',
        strengths: '',
        revision: '',
        critical: '',
      },
      studyRecommendations: [],
    };

    expect(validateAIFeedbackResponse(raw, ['1'])).toBeNull();
    expect(validateAIFeedbackResponse(raw, ['2'])).toBeNull();
  });

  it('filters weak saved question explanations out of the renderable map', () => {
    const strongExplanation = 'This question tests the present perfect. The clue "since 2020" shows the action started in the past and still continues now, so "has lived" works while "lived" wrongly finishes the action in the past. Use has/have + past participle when a past starting point is still connected to the present.';
    expect(
      getRenderableQuestionExplanations({
        Q1: 'You did not answer this question. The correct answer is "D". Review the grammar rule or vocabulary pattern behind this question and try again with similar exercises.',
        '2': strongExplanation,
      }),
    ).toEqual({
      '2': strongExplanation,
    });
  });

  it('builds a detailed sentence-arrangement fallback explanation from the original prompt', () => {
    const explanation = buildFallbackQuestionExplanation(
      12,
      {
        questionNumber: 12,
        isCorrect: false,
        studentAnswer: '',
        correctAnswer: 'C',
        pointsEarned: 0,
        pointsMax: 1,
      } as any,
      {
        intent: 'sentence-arrangement',
        text: 'a. Maria: When I told my parents I wanted to study engineering, they seemed worried. b. Their reaction made me doubt myself for a while. c. At first, I felt excited because I had finally chosen the career I really wanted. d. Later, my science teacher encouraged me to trust my ability. e. Then they suggested I consider nursing instead.',
        options: ['a-b-c-d-e', 'b-a-d-c-e', 'c-a-e-b-d', 'e-c-a-b-d'],
      },
    );

    expect(explanation).toContain('Sentence c has to come first');
    expect(explanation).toContain('c-a-e-b-d');
    expect(explanation).toContain('Sentence a');
    expect(explanation).toContain('Sentence e');
    expect(explanation).not.toContain('A reliable way to solve questions like this is to');
  });

  it('builds a clue-based grammar fallback explanation instead of generic scaffolding', () => {
    const explanation = buildFallbackQuestionExplanation(
      5,
      {
        questionNumber: 5,
        isCorrect: false,
        studentAnswer: 'B',
        correctAnswer: 'C',
        pointsEarned: 0,
        pointsMax: 1,
      } as any,
      {
        intent: 'mcq-grammar',
        text: 'She ___ in Hanoi since 2020.',
        options: ['lives', 'lived', 'has lived', 'was living'],
      },
    );

    expect(explanation).toContain('"since"');
    expect(explanation).toContain('"B" (lived)');
    expect(explanation).toContain('"C" (has lived)');
    expect(explanation).toContain('present perfect');
    expect(explanation).not.toContain('The correct answer works because the correct answer is');
  });

  it('includes approved-book chapter recommendation instructions in the THCS prompt', () => {
    const gradingResult = {
      totalPoints: 7,
      maxPoints: 10,
      scaledScore: 7.0,
      sectionResults: [],
      questionResults: {
        5: {
          questionNumber: 5,
          isCorrect: false,
          studentAnswer: 'B',
          correctAnswer: 'C',
          pointsEarned: 0,
          pointsMax: 1,
        },
      },
    } as any;

    const sections = [
      {
        id: 'section-1',
        name: 'Grammar',
        questions: [
          {
            questionNumber: 5,
            questionText: 'Choose the best answer.',
            type: 'mcq-grammar',
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: 'C',
          },
        ],
      },
    ] as any;

    const prompt = buildFeedbackPrompt(gradingResult, sections, {
      title: 'THCS Progress Check',
      gradeLevel: 8,
      family: 'thcs',
      type: 'THCS-THPT',
    });

    expect(prompt.userPrompt).toContain('Approved study books');
    expect(prompt.userPrompt).toContain('English Grammar in Use (5th Edition)');
    expect(prompt.userPrompt).toContain('"studyRecommendations"');
    expect(prompt.userPrompt).toContain('"sectionTitle"');
  });

  it('labels unanswered THCS responses as unanswered in the AI prompt', () => {
    const gradingResult = {
      totalPoints: 0,
      maxPoints: 1,
      scaledScore: 0,
      sectionResults: [],
      questionResults: {
        1: {
          questionNumber: 1,
          isCorrect: false,
          studentAnswer: '',
          correctAnswer: 'B',
          pointsEarned: 0,
          pointsMax: 1,
        },
      },
    } as any;

    const sections = [
      {
        id: 'section-1',
        name: 'Grammar',
        questions: [
          {
            questionNumber: 1,
            questionText: 'Choose the best answer.',
            type: 'mcq-grammar',
            options: ['challenger', 'challenge', 'challenging', 'challenged'],
            correctAnswer: 'B',
          },
        ],
      },
    ] as any;

    const prompt = buildFeedbackPrompt(gradingResult, sections, {
      title: 'THCS Progress Check',
      gradeLevel: 8,
      family: 'thcs',
      type: 'THCS-THPT',
    });

    expect(prompt.userPrompt).toContain('Answer status: UNANSWERED');
    expect(prompt.userPrompt).toContain('Student answer: "No answer provided"');
    expect(prompt.userPrompt).not.toContain('Student chose:');
    expect(prompt.userPrompt).toContain('Never say the student chose an option when Answer status is UNANSWERED');
  });

  it('uses the IELTS-specific prompt branch when metadata family is ielts', () => {
    const gradingResult = {
      totalPoints: 30,
      maxPoints: 40,
      scaledScore: 6.5,
      sectionResults: [
        {
          sectionId: 'passage-1',
          sectionName: 'Passage 1',
          pointsEarned: 10,
          pointsMax: 13,
          correctCount: 10,
          totalCount: 13,
          percentage: 76.9,
          intentBreakdown: {
            true_false_not_given: { correct: 4, total: 6 },
            matching: { correct: 6, total: 7 },
          },
        },
      ],
      questionResults: {
        1: {
          questionNumber: 1,
          isCorrect: false,
          studentAnswer: 'False',
          correctAnswer: 'True',
          pointsEarned: 0,
          pointsMax: 1,
        },
      },
    } as any;

    const sections = [
      {
        id: 'passage-1',
        name: 'Passage 1',
        questions: [
          {
            questionNumber: 1,
            questionText: 'Question 1',
            type: 'true_false_not_given',
          },
        ],
      },
    ] as any;

    const prompt = buildFeedbackPrompt(gradingResult, sections, {
      title: 'IELTS Reading Test 1',
      gradeLevel: 9,
      family: 'ielts',
      type: 'ielts_reading',
      bandScore: 6.5,
      timeSpent: 2100,
      totalQuestions: 40,
      passageResults: [
        { passageName: 'Passage 1', questionRange: [1, 13], correct: 10, total: 13, percentage: 76.9 },
      ],
    });

    expect(prompt.systemPrompt).toContain('IELTS tutor');
    expect(prompt.userPrompt).toContain('Band score');
    expect(prompt.userPrompt).toContain('Passage performance');
    expect(prompt.userPrompt).toContain('Question-type analysis');
    expect(prompt.userPrompt).toContain('time-management advice');
    expect(prompt.userPrompt).toContain('Grammar for IELTS');
    expect(prompt.userPrompt).toContain('"studyRecommendations"');
  });

  it('marks saved AI feedback for upgrade when blank answers are described as chosen answers', () => {
    const feedback = {
      totalCorrect: 0,
      totalQuestions: 1,
      generationMode: 'ai',
      aiFeedback: {
        summary: 'Needs revision.',
        strengths: '',
        revision: 'Focus on grammar.',
        critical: '',
      },
      questionExplanations: {
        '1': 'The student chose "challenger", but the correct answer is "challenge" because the sentence needs a verb.',
      },
      fallbackQuestionExplanations: {
        '1': 'Because you left it blank, the best starting point is to identify the controlling clue in the sentence first, then test each option against that clue.',
      },
    } as any;

    const questionResults = [
      {
        questionNumber: 1,
        isCorrect: false,
        studentAnswer: '—',
        correctAnswer: 'B',
      },
    ] as any;

    expect(needsAiFeedbackUpgrade(feedback, questionResults)).toBe(true);
  });
});
