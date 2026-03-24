import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StudyRecommendations } from './StudyRecommendations';

const formativeFeedback = {
  studyRecommendations: [
    {
      skillTag: 'Grammar',
      questionNumbers: [5, 6, 7],
      guidance: 'Questions 5, 6, and 7 show a tense-control gap around present perfect and time markers.',
      resources: [
        {
          bookTitle: 'English Grammar in Use (5th Edition)',
          author: 'Raymond Murphy',
          sectionTitle: 'Unit 11: Present Perfect and Past Simple',
          reason: 'This unit directly contrasts the tense choices that caused the mistakes in Questions 5, 6, and 7.',
        },
        {
          bookTitle: 'Grammar for IELTS',
          author: 'Diana Hopkins',
          sectionTitle: 'Unit 3: Present Perfect Review',
          reason: 'Use this as a second pass if you want IELTS-style reinforcement after fixing the core rule.',
        },
      ],
    },
    {
      skillTag: 'Reading Comprehension',
      questionNumbers: [12, 13],
      guidance: 'Questions 12 and 13 suggest the student is missing locating-keyword clues before selecting an answer.',
      resources: [
        {
          bookTitle: 'The Official Cambridge Guide to IELTS',
          author: 'Pauline Cullen & Amanda French',
          sectionTitle: 'Reading Section: Matching Information',
          reason: 'This section trains the exact scanning and clue-tracking habit those questions need.',
        },
      ],
    },
  ],
} as any;

describe('StudyRecommendations', () => {
  it('renders AI-authored chapter and section recommendations tied to weak questions', () => {
    render(<StudyRecommendations formativeFeedback={formativeFeedback} />);

    expect(screen.getByTestId('fb-study-recommendations')).toBeInTheDocument();
    expect(screen.getByTestId('fb-study-card-grammar')).toBeInTheDocument();
    expect(screen.getByText('Q5, Q6, Q7')).toBeInTheDocument();
    expect(screen.getByText('Unit 11: Present Perfect and Past Simple')).toBeInTheDocument();
    expect(screen.getByText(/caused the mistakes in Questions 5, 6, and 7/i)).toBeInTheDocument();
  });

  it('hides the widget when no AI study recommendations exist', () => {
    render(<StudyRecommendations formativeFeedback={{ studyRecommendations: [] } as any} />);
    expect(screen.queryByTestId('fb-study-recommendations')).not.toBeInTheDocument();
  });

  it('renders the stretch-state intro when recommendations are not tied to wrong questions', () => {
    render(
      <StudyRecommendations
        formativeFeedback={{
          studyRecommendations: [
            {
              skillTag: 'Advanced Extension',
              questionNumbers: [],
              guidance: 'Move into denser academic texts and higher-precision grammar review.',
              resources: [
                {
                  bookTitle: 'Advanced Grammar in Use (3rd Edition)',
                  author: 'Martin Hewings',
                  sectionTitle: 'Advanced Verb Patterns',
                  reason: 'This gives the student a harder next step after a clean result.',
                },
              ],
            },
          ],
        } as any}
      />,
    );

    expect(screen.getByText(/stretch targets from your approved book library/i)).toBeInTheDocument();
    expect(screen.getByText('Advanced Verb Patterns')).toBeInTheDocument();
  });

  it('does not crash when legacy recommendations omit questionNumbers', () => {
    render(
      <StudyRecommendations
        formativeFeedback={{
          studyRecommendations: [
            {
              skillTag: 'Grammar',
              guidance: 'Review the tense units that match this weak area.',
              resources: [
                {
                  bookTitle: 'English Grammar in Use (5th Edition)',
                  author: 'Raymond Murphy',
                  sectionTitle: 'Unit 11: Present Perfect and Past Simple',
                  reason: 'This unit covers the tense contrast behind the mistakes.',
                },
              ],
            },
          ],
        } as any}
      />,
    );

    expect(screen.getByTestId('fb-study-recommendations')).toBeInTheDocument();
    expect(screen.queryByText(/^Q/)).not.toBeInTheDocument();
    expect(screen.getByText('Unit 11: Present Perfect and Past Simple')).toBeInTheDocument();
  });
});
