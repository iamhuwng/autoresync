import React, { Profiler, useState } from 'react';
import { render } from '../../src/test/test-utils';
import THCSQuestionsStep from '../../src/components/thcs-editor/THCSQuestionsStep';
import AuthContext from '../../src/contexts/AuthContext';
import THCSTestEditorModal from '../../src/components/thcs-editor/THCSTestEditorModal';
import type { THCSSection, THCSTest, THCSTestMetadata } from '../../src/types/thcs-test.types';

declare global {
  interface Window {
    __thcsQuestionPerf?: { mountDurationMs: number; commits: number };
  }
}

const mode = new URLSearchParams(window.location.search).get('mode') ?? 'create';
const isModal = mode.startsWith('modal');
const sizes = mode === 'draft' || mode === 'modal' ? [23, 23, 23, 23, 23, 23, 20]
  : mode === 'large' || mode === 'modal-large' ? [100, 100, 100, 100, 100, 100, 100]
    : [100];
let questionNumber = 1;
const initialSections: THCSSection[] = sizes.map((questionCount, sectionIndex) => ({
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

const metadata: THCSTestMetadata = {
  title: `THCS ${mode} question performance fixture`,
  duration: 45,
  gradeLevel: 9,
  examType: 'ôn tập',
};

const publishedTest: THCSTest = {
  id: 'e2e-published-thcs-performance',
  testType: 'THCS-THPT',
  metadata,
  sections: initialSections,
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

function Harness() {
  const [sections, setSections] = useState(initialSections);
  const startedAt = performance.now();
  const updateSection = (index: number, section: THCSSection) => {
    setSections((current) => current.map((item, itemIndex) => itemIndex === index ? section : item));
  };
  const moveSection = (index: number, direction: -1 | 1) => {
    setSections((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return next.map((section, order) => ({ ...section, order }));
    });
  };
  const onRender: React.ProfilerOnRenderCallback = (_id, phase, actualDuration) => {
    const prior = window.__thcsQuestionPerf;
    window.__thcsQuestionPerf = {
      mountDurationMs: phase === 'mount' ? actualDuration : prior?.mountDurationMs ?? 0,
      commits: (prior?.commits ?? 0) + 1,
    };
    const root = document.querySelector<HTMLElement>('[data-testid="thcs-question-performance"]');
    if (root) root.dataset.renderReadyMs = String(Math.round((performance.now() - startedAt) * 100) / 100);
  };

  return (
    <Profiler id="thcs-questions-step" onRender={onRender}>
      <AuthContext.Provider value={authValue as never}>
        {isModal ? (
          <div
            data-testid="thcs-question-performance"
            data-mode={mode}
            data-section-count={sections.length}
            data-question-count={sections.reduce((sum, section) => sum + section.questions.length, 0)}
          >
            <THCSTestEditorModal test={publishedTest} show handleClose={() => {}} />
          </div>
        ) : (
          <main
            data-testid="thcs-question-performance"
            data-mode={mode}
            data-section-count={sections.length}
            data-question-count={sections.reduce((sum, section) => sum + section.questions.length, 0)}
          >
            <THCSQuestionsStep
              sections={sections}
              draftId={mode === 'create' ? null : `published-${mode}-fixture`}
              metadata={metadata}
              onSectionUpdate={updateSection}
              onSectionDelete={(index) => setSections((current) => current.filter((_, i) => i !== index))}
              onSectionMove={moveSection}
              onAddSection={() => setSections((current) => [...current, {
                id: `section-${current.length + 1}`,
                name: `Section ${current.length + 1}`,
                order: current.length,
                totalPoints: 0,
                pointMode: 'auto',
                instructionText: 'Choose the best answer.',
                isCustomInstruction: false,
                layout: 'single-column',
                questions: [],
              }])}
              onReorder={setSections}
            />
          </main>
        )}
      </AuthContext.Provider>
    </Profiler>
  );
}

render(<Harness />);
