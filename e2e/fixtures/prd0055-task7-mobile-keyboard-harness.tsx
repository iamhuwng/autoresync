import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MobileListeningAnswerSheet } from '../../src/components/test/mobile/MobileListeningAnswerSheet';
import type { AnswerSheetQuestion } from '../../src/components/test/mobile/MobileListeningAnswerSheet';

const questions: AnswerSheetQuestion[] = Array.from({ length: 20 }, (_, index) => ({
  number: index + 1,
  type: 'completion',
}));

const SIMULATED_KEYBOARD_HEIGHT = 240;

function MobileKeyboardHarness() {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [scrollByPart, setScrollByPart] = useState<Record<string, number>>({});

  return (
    <main
      data-testid="prd0055-task7-keyboard-harness"
      style={{
        position: 'relative',
        width: '100vw',
        height: '100dvh',
        overflow: 'hidden',
        background: '#eef2f7',
      }}
    >
      <MobileListeningAnswerSheet
        isOpen
        onClose={() => {}}
        viewedPartNumber={1}
        startQuestion={1}
        endQuestion={20}
        questions={questions}
        answers={answers}
        onAnswerChange={(questionNumber, answer) => {
          setAnswers((current) => ({ ...current, [questionNumber]: answer }));
        }}
        currentQuestionNumber={20}
        testSubmitted={false}
        isLocked={false}
        scrollByPart={scrollByPart}
        onScrollChange={(partNumber, scrollTop) => {
          setScrollByPart((current) => ({ ...current, [String(partNumber)]: scrollTop }));
        }}
      />
      <div
        data-testid="simulated-mobile-keyboard"
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          height: SIMULATED_KEYBOARD_HEIGHT,
          zIndex: 9000,
          background: 'rgba(15, 23, 42, 0.24)',
          borderTop: '1px solid rgba(15, 23, 42, 0.2)',
          pointerEvents: 'none',
        }}
      />
    </main>
  );
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing root element for PRD-0055 Task 7 keyboard harness.');
}

createRoot(root).render(<MobileKeyboardHarness />);
