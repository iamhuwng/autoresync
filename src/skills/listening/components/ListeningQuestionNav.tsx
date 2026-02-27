/**
 * ListeningQuestionNav Component - IELTS CBT Style
 * 
 * Authentic IELTS Listening navigation with Part-based grouping
 * 
 * Layout:
 * [←] Part1 1 2 3 4 5 6 7 [8] 9 10 | Part2 0of10 | Part3 0of10 | Part4 0of10 | [✓]
 * 
 * Features:
 * - Parts grouped together
 * - Active part shows individual question numbers
 * - Inactive parts show completion count
 * - Active question has blue border highlight
 * - Previous/Next arrows
 * - Review (✓) button for submission
 */

import React, { useRef, useEffect, useState } from 'react';

interface ListeningQuestionNavProps {
  totalQuestions: number;
  currentQuestion: number;
  answers: Record<number, any>;
  sectionsInfo: Array<{
    number: number;
    startQ: number;
    endQ: number;
    name?: string;
  }>;
  onQuestionClick: (questionNumber: number) => void;
  onSectionClick?: (sectionNumber: number) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onReview?: () => void;
  testSubmitted?: boolean;
  questionResults?: Record<number, boolean>;
  currentSection?: number;
}

export const ListeningQuestionNav: React.FC<ListeningQuestionNavProps> = ({
  totalQuestions,
  currentQuestion,
  answers,
  sectionsInfo,
  onQuestionClick,
  onSectionClick,
  onPrevious,
  onNext,
  onReview,
  testSubmitted,
  questionResults,
  currentSection = 1,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeQuestionRef = useRef<HTMLButtonElement>(null);
  
  // Get section for a question (used for determining expanded part)
  const getSectionForQuestionNumber = (qNum: number): number => {
    for (const section of sectionsInfo) {
      if (qNum >= section.startQ && qNum <= section.endQ) {
        return section.number;
      }
    }
    return 1;
  };
  
  // Expanded part follows the CURRENT QUESTION being viewed, not the audio section
  // This allows students to navigate and view questions from any section
  // while audio continues playing the current section
  const viewingSection = getSectionForQuestionNumber(currentQuestion);
  const [expandedPart, setExpandedPart] = useState<number>(viewingSection);

  // Update expanded part when viewing a different section's questions
  useEffect(() => {
    setExpandedPart(viewingSection);
  }, [viewingSection]);

  // Auto-scroll to active question
  useEffect(() => {
    if (activeQuestionRef.current && scrollContainerRef.current) {
      activeQuestionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [currentQuestion]);

  // Count answered questions in a section
  const getAnsweredCount = (section: typeof sectionsInfo[0]): number => {
    let count = 0;
    for (let q = section.startQ; q <= section.endQ; q++) {
      if (answers[q] !== undefined && answers[q] !== '') {
        count++;
      }
    }
    return count;
  };

  // Get question status
  const getQuestionStatus = (qNum: number): 'active' | 'answered' | 'correct' | 'incorrect' | 'unanswered' => {
    if (testSubmitted && questionResults) {
      if (questionResults[qNum] === true) return 'correct';
      if (questionResults[qNum] === false) return 'incorrect';
    }
    if (qNum === currentQuestion) return 'active';
    if (answers[qNum] !== undefined && answers[qNum] !== '') return 'answered';
    return 'unanswered';
  };

  // Handle part click - expand/collapse and navigate
  const handlePartClick = (partNumber: number) => {
    if (expandedPart === partNumber) {
      // Already expanded, navigate to first question of section
      const section = sectionsInfo.find(s => s.number === partNumber);
      if (section && onSectionClick) {
        onSectionClick(partNumber);
      }
    } else {
      setExpandedPart(partNumber);
      if (onSectionClick) {
        onSectionClick(partNumber);
      }
    }
  };

  // Handle previous navigation
  const handlePrevious = () => {
    if (onPrevious) {
      onPrevious();
    } else if (currentQuestion > 1) {
      onQuestionClick(currentQuestion - 1);
    }
  };

  // Handle next navigation
  const handleNext = () => {
    if (onNext) {
      onNext();
    } else if (currentQuestion < totalQuestions) {
      onQuestionClick(currentQuestion + 1);
    }
  };

  return (
    <footer
      style={{
        backgroundColor: '#ffffff',
        borderTop: '1px solid #d1d5db',
        padding: '8px 12px',
        position: 'sticky',
        bottom: 0,
        zIndex: 100,
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.05)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          maxWidth: '100%',
        }}
      >
        {/* Previous Arrow */}
        <button
          onClick={handlePrevious}
          disabled={currentQuestion <= 1}
          aria-label="Previous"
          style={{
            width: '40px',
            height: '40px',
            backgroundColor: currentQuestion <= 1 ? '#e5e7eb' : '#374151',
            border: 'none',
            borderRadius: '6px',
            color: currentQuestion <= 1 ? '#9ca3af' : '#ffffff',
            cursor: currentQuestion <= 1 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: 'bold',
            flexShrink: 0,
            transition: 'all 0.2s',
          }}
        >
          ←
        </button>

        {/* Scrollable Navigation Area */}
        <div
          ref={scrollContainerRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            flex: 1,
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {sectionsInfo.map((section, idx) => {
            const isExpanded = expandedPart === section.number;
            const isActive = currentSection === section.number;
            const answeredCount = getAnsweredCount(section);
            const totalInSection = section.endQ - section.startQ + 1;

            return (
              <div
                key={section.number}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  padding: '4px 8px',
                  backgroundColor: isActive ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                  borderRadius: '6px',
                  borderTop: isActive ? '3px solid #3b82f6' : '3px solid transparent',
                  flexShrink: 0,
                }}
              >
                {/* Part Button */}
                <button
                  onClick={() => handlePartClick(section.number)}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: isActive ? '#3b82f6' : '#f3f4f6',
                    color: isActive ? '#ffffff' : '#374151',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s',
                  }}
                >
                  Part {section.number}
                </button>

                {/* Questions or Count */}
                {isExpanded ? (
                  // Expanded: Show individual question numbers
                  <div style={{ display: 'flex', gap: '2px' }}>
                    {Array.from(
                      { length: section.endQ - section.startQ + 1 },
                      (_, i) => section.startQ + i
                    ).map((qNum) => {
                      const status = getQuestionStatus(qNum);
                      const isActiveQ = qNum === currentQuestion;

                      // Determine button styles based on status
                      let bgColor = '#ffffff';
                      let borderColor = '#d1d5db';
                      let textColor = '#6b7280';

                      if (testSubmitted) {
                        if (status === 'correct') {
                          bgColor = '#10b981';
                          borderColor = '#10b981';
                          textColor = '#ffffff';
                        } else if (status === 'incorrect') {
                          bgColor = '#ef4444';
                          borderColor = '#ef4444';
                          textColor = '#ffffff';
                        }
                      } else {
                        if (status === 'answered') {
                          bgColor = '#e0e7ff';
                          borderColor = '#6366f1';
                          textColor = '#3730a3';
                        }
                      }

                      if (isActiveQ && !testSubmitted) {
                        borderColor = '#3b82f6';
                      }

                      return (
                        <button
                          key={qNum}
                          ref={isActiveQ ? activeQuestionRef : null}
                          onClick={() => onQuestionClick(qNum)}
                          aria-label={`Question ${qNum}`}
                          style={{
                            minWidth: '28px',
                            height: '28px',
                            padding: '0 4px',
                            backgroundColor: bgColor,
                            border: isActiveQ
                              ? `2px solid ${borderColor}`
                              : `1px solid ${borderColor}`,
                            borderRadius: '4px',
                            color: textColor,
                            fontSize: '12px',
                            fontWeight: isActiveQ ? 700 : 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            boxShadow: isActiveQ
                              ? '0 0 0 2px rgba(59, 130, 246, 0.3)'
                              : 'none',
                          }}
                        >
                          {qNum}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  // Collapsed: Show count
                  <span
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 500,
                      color: '#6b7280',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {answeredCount} of {totalInSection}
                  </span>
                )}

                {/* Separator */}
                {idx < sectionsInfo.length - 1 && (
                  <div
                    style={{
                      width: '1px',
                      height: '24px',
                      backgroundColor: '#d1d5db',
                      marginLeft: '4px',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Next Arrow */}
        <button
          onClick={handleNext}
          disabled={currentQuestion >= totalQuestions}
          aria-label="Next"
          style={{
            width: '40px',
            height: '40px',
            backgroundColor: currentQuestion >= totalQuestions ? '#e5e7eb' : '#3b82f6',
            border: 'none',
            borderRadius: '6px',
            color: currentQuestion >= totalQuestions ? '#9ca3af' : '#ffffff',
            cursor: currentQuestion >= totalQuestions ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: 'bold',
            flexShrink: 0,
            transition: 'all 0.2s',
          }}
        >
          →
        </button>

        {/* Review/Submit Button */}
        <button
          onClick={onReview}
          aria-label="Review answers"
          style={{
            width: '40px',
            height: '40px',
            backgroundColor: testSubmitted ? '#10b981' : '#6b7280',
            border: 'none',
            borderRadius: '6px',
            color: '#ffffff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            flexShrink: 0,
            transition: 'all 0.2s',
          }}
        >
          ✓
        </button>
      </div>

      {/* Hide scrollbar */}
      <style>{`
        footer > div > div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </footer>
  );
};

export default ListeningQuestionNav;
