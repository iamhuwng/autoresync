import React from 'react';
import { createRoot } from 'react-dom/client';
import { MobileListeningHeader } from '../../src/components/test/mobile/MobileListeningHeader';
import { MobileListeningSubmitSheet } from '../../src/components/test/mobile/MobileListeningSubmitSheet';
import type { ListeningPartInfo } from '../../src/components/test/mobile/MobileListeningSubmitSheet';

const parts: ListeningPartInfo[] = [
  { partNumber: 1, questionNumbers: [1, 2, 3, 4, 5] },
  { partNumber: 2, questionNumbers: [6, 7, 8, 9, 10] },
  { partNumber: 3, questionNumbers: [11, 12, 13, 14, 15] },
  { partNumber: 4, questionNumbers: [16, 17, 18, 19, 20] },
];

const answers = {
  1: 'A',
  2: 'B',
  6: 'C',
  11: 'D',
};

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function BatchCA11yHarness() {
  const isSubmitting = new URLSearchParams(window.location.search).get('submitting') === '1';

  return (
    <main
      data-testid="prd0055-task7-batch-c-a11y-harness"
      style={{
        minHeight: '100dvh',
        width: '100vw',
        overflow: 'hidden',
        background: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <MobileListeningHeader
        timeRemaining={240}
        formatTime={formatTime}
        onSubmitPress={() => {}}
        onOverflowMenuToggle={() => {}}
        isPaused={false}
        isWaiting={false}
        isSubmitting={isSubmitting}
        testSubmitted={false}
      />
      <div
        aria-hidden="true"
        style={{
          padding: '1rem',
          color: '#475569',
          fontSize: '0.875rem',
        }}
      >
        Batch C runtime accessibility harness
      </div>
      <MobileListeningSubmitSheet
        parts={parts}
        answers={answers}
        onConfirmSubmit={() => {}}
        onClose={() => {}}
        isSubmitting={isSubmitting}
      />
    </main>
  );
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing root element for PRD-0055 Task 7 Batch C a11y harness.');
}

createRoot(root).render(<BatchCA11yHarness />);
