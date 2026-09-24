import React from 'react';
import { render } from '../../src/test/test-utils';
import AuthContext from '../../src/contexts/AuthContext';
import THCSTestEditorModal from '../../src/components/thcs-editor/THCSTestEditorModal';
import type { THCSTest, THCSSection } from '../../src/types/thcs-test.types';

const sizes = [23, 23, 23, 23, 23, 23, 20];
let questionNumber = 1;
const sections: THCSSection[] = sizes.map((questionCount, sectionIndex) => ({
  id: `section-${sectionIndex + 1}`,
  name: `Section ${sectionIndex + 1}`,
  order: sectionIndex,
  totalPoints: questionCount,
  pointMode: 'auto',
  instructionText: 'Choose the best answer.',
  isCustomInstruction: false,
  layout: 'single-column',
  questions: Array.from({ length: questionCount }, () => {
    const currentNumber = questionNumber++;
    return {
      id: `question-${currentNumber}`,
      questionNumber: currentNumber,
      type: 'mcq-grammar',
      intent: 'mcq-grammar',
      questionText: `Fixture question ${currentNumber}`,
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: 'A',
    };
  }),
}));

const test: THCSTest = {
  id: 'e2e-heavy-thcs-test',
  testType: 'THCS-THPT',
  metadata: { title: 'Heavy Section Delete Fixture', duration: 45, gradeLevel: 9, examType: 'ôn tập' },
  sections,
  questionCount: questionNumber - 1,
  totalPoints: questionNumber - 1,
  createdBy: 'e2e-teacher',
  ownerId: 'e2e-teacher',
  isPublic: false,
  isComplete: true,
  createdAt: 0,
  updatedAt: 0,
};

const authValue = { user: { uid: 'e2e-teacher' }, isAdmin: false };
render(
  <AuthContext.Provider value={authValue as never}>
    <div data-testid="heavy-thcs-fixture" data-section-count={sections.length} data-question-count={test.questionCount}>
      <THCSTestEditorModal test={test} show handleClose={() => {}} />
    </div>
  </AuthContext.Provider>,
);
