import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestPageRouter from './TestPageRouter';

const mockGet = vi.fn();
const mockRef = vi.fn((_: unknown, path: string) => ({ path }));

vi.mock('../services/firebase', () => ({
  database: {},
}));

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  ref: (...args: unknown[]) => mockRef(...args),
}));

vi.mock('@mantine/core', () => ({
  Center: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Loader: () => <div>loading-spinner</div>,
}));

vi.mock('../skills/reading/components/ReadingTestPage', () => ({
  default: () => <div>reading-page</div>,
}));

vi.mock('../skills/listening/components/ListeningTestPage', () => ({
  default: () => <div>listening-page</div>,
}));

vi.mock('./StudentTestPage', () => ({
  default: () => <div>generic-page</div>,
}));

vi.mock('../components/thcs-student/THCSTestLayout', () => ({
  default: () => <div>thcs-page</div>,
}));

vi.mock('../components/writing-student/WritingTestPage', () => ({
  default: ({ testData }: any) => <div>writing-page:{testData?.title}</div>,
}));

function createSnapshot(value: any, exists = true) {
  return {
    exists: () => exists,
    val: () => value,
  };
}

function renderRouter() {
  return render(
    <MemoryRouter initialEntries={['/student-test/FMQYME']}>
      <Routes>
        <Route path="/student-test/:sessionCode" element={<TestPageRouter />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TestPageRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation(async ({ path }: { path: string }) => {
      switch (path) {
        case 'game_sessions/FMQYME/testId':
          return createSnapshot('writing-test-1');
        case 'tests/writing-test-1/testType':
          return createSnapshot('IELTS');
        case 'tests/writing-test-1/skill':
          return createSnapshot('Writing');
        case 'tests/writing-test-1':
          return createSnapshot({
            id: 'writing-test-1',
            title: 'IELTS Writing Mock',
            type: 'IELTS',
            testType: 'IELTS',
            skill: 'Writing',
            metadata: {
              title: 'IELTS Writing Mock',
              format: 'task2-only',
            },
            tasks: [],
          });
        default:
          return createSnapshot(null, false);
      }
    });
  });

  it('routes IELTS writing tests with testType set to the writing page', async () => {
    renderRouter();

    expect(await screen.findByText('writing-page:IELTS Writing Mock')).toBeInTheDocument();
    expect(screen.queryByText('generic-page')).not.toBeInTheDocument();
  });
});
