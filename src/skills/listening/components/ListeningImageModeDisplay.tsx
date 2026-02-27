/**
 * ListeningImageModeDisplay Component
 * Two-column layout for image-based Listening tests
 * 
 * Layout:
 * - Left Column: Question images (scrollable, zoomable)
 * - Right Column: Numbered answer inputs (1-40)
 * 
 * Use Case: When teacher uploads images of question sheets instead of text
 */

import React, { useState } from 'react';
import { TwoColumnLayout } from '../../../components/test/TwoColumnLayout';

interface QuestionImage {
  sectionNumber: number;
  imageUrl: string;
  imageCaption?: string;
  questionRange?: { start: number; end: number };
}

interface Question {
  number: number;
  type: string;
  question: string;
  options?: string[];
  answer: string | string[] | Record<string, string>;
  points: number;
  imageUrl?: string;
}

interface AudioSection {
  number: number;
  name: string;
  startQuestion: number;
  endQuestion: number;
}

interface ListeningImageModeDisplayProps {
  questionImages: QuestionImage[];
  questions: Question[];
  audioSections: AudioSection[];
  currentSection: number;
  answers: Record<number, any>;
  onAnswerChange: (questionNumber: number, answer: any) => void;
  currentQuestionNumber: number;
  testSubmitted?: boolean;
  questionResults?: Record<number, boolean>;
}

/**
 * Image Viewer Component - Left column
 */
const ImageViewer: React.FC<{
  images: QuestionImage[];
  currentSection: number;
  currentQuestionNumber: number;
  audioSections: AudioSection[];
  zoom: number;
  onZoomChange: (zoom: number) => void;
}> = ({ images, currentSection, currentQuestionNumber, audioSections, zoom, onZoomChange }) => {
  // Derive the VIEWING section from currentQuestionNumber, not audio section
  // This allows images to follow navigation regardless of test mode
  const viewingSection = audioSections.find(s =>
    currentQuestionNumber >= s.startQuestion && currentQuestionNumber <= s.endQuestion
  );
  const viewingSectionNumber = viewingSection?.number || currentSection;
  
  // Filter images for the section being VIEWED, not what audio is playing
  const sectionImages = images
    .filter(img => img.sectionNumber === viewingSectionNumber)
    .sort((a, b) => (a.questionRange?.start || 0) - (b.questionRange?.start || 0));

  // Find the image that covers the current question number
  const findImageIndexForQuestion = (questionNum: number): number => {
    for (let i = 0; i < sectionImages.length; i++) {
      const img = sectionImages[i];
      if (img && img.questionRange) {
        if (questionNum >= img.questionRange.start && questionNum <= img.questionRange.end) {
          return i;
        }
      }
    }
    // If no specific range match, default to first image
    return 0;
  };

  // Automatically select image based on current question
  const activeImageIndex = findImageIndexForQuestion(currentQuestionNumber);
  const currentImage = sectionImages[activeImageIndex] || sectionImages[0];

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#1e293b',
    }}>
      {/* Image Controls Header */}
      <div style={{
        padding: '12px 16px',
        background: '#0f172a',
        borderBottom: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <span style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'white',
          }}>
            📄 Section {viewingSectionNumber} Questions
          </span>
          {currentImage?.questionRange && (
            <span style={{
              fontSize: '12px',
              color: '#94a3b8',
              padding: '2px 8px',
              background: '#334155',
              borderRadius: '4px',
            }}>
              Q{currentImage.questionRange.start}-{currentImage.questionRange.end}
            </span>
          )}
        </div>

        {/* Zoom Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <button
            onClick={() => onZoomChange(Math.max(50, zoom - 25))}
            style={{
              padding: '4px 8px',
              background: '#334155',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            −
          </button>
          <span style={{ fontSize: '12px', color: '#94a3b8', minWidth: '45px', textAlign: 'center' }}>
            {zoom}%
          </span>
          <button
            onClick={() => onZoomChange(Math.min(200, zoom + 25))}
            style={{
              padding: '4px 8px',
              background: '#334155',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            +
          </button>
          <button
            onClick={() => onZoomChange(100)}
            style={{
              padding: '4px 8px',
              background: '#475569',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Image Navigation (if multiple images per section) */}
      {sectionImages.length > 1 && (
        <div style={{
          padding: '8px 16px',
          background: '#0f172a',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {sectionImages.map((img, idx) => (
            <div
              key={idx}
              style={{
                padding: '4px 12px',
                background: activeImageIndex === idx ? '#3b82f6' : '#334155',
                border: 'none',
                borderRadius: '6px',
                color: 'white',
                fontSize: '12px',
                fontWeight: 600,
                opacity: activeImageIndex === idx ? 1 : 0.6,
              }}
            >
              Q{img?.questionRange?.start || '?'}-{img?.questionRange?.end || '?'}
            </div>
          ))}
        </div>
      )}

      {/* Image Display Area */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '16px',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
      }}>
        {currentImage ? (
          <div style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease',
          }}>
            <img
              src={currentImage.imageUrl}
              alt={currentImage.imageCaption || `Section ${viewingSectionNumber} Questions`}
              style={{
                maxWidth: '100%',
                height: 'auto',
                borderRadius: '8px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
              }}
            />
            {currentImage.imageCaption && (
              <div style={{
                textAlign: 'center',
                marginTop: '12px',
                fontSize: '13px',
                color: '#94a3b8',
              }}>
                {currentImage.imageCaption}
              </div>
            )}
          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            color: '#64748b',
            padding: '40px',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🖼️</div>
            <div style={{ fontSize: '16px', fontWeight: 600 }}>No question images available</div>
            <div style={{ fontSize: '13px', marginTop: '8px' }}>
              Question images for this section have not been uploaded
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Answer Input Panel - Right column
 */
const AnswerInputPanel: React.FC<{
  questions: Question[];
  answers: Record<number, any>;
  onAnswerChange: (questionNumber: number, answer: any) => void;
  currentQuestionNumber: number;
  testSubmitted?: boolean;
  questionResults?: Record<number, boolean>;
  currentSection: number;
  audioSections: AudioSection[];
}> = ({
  questions,
  answers,
  onAnswerChange,
  currentQuestionNumber,
  testSubmitted,
  questionResults,
  currentSection,
  audioSections,
}) => {
    // Derive the VIEWING section from currentQuestionNumber, not audio section
    // This allows the answer sheet to follow navigation regardless of test mode
    const viewingSection = audioSections.find(s =>
      currentQuestionNumber >= s.startQuestion && currentQuestionNumber <= s.endQuestion
    );
    const viewingSectionNumber = viewingSection?.number || currentSection;
    
    // Filter questions based on what the student is VIEWING, not what audio is playing
    const sectionQuestions = questions.filter(
      q => viewingSection && q.number >= viewingSection.startQuestion && q.number <= viewingSection.endQuestion
    );

    return (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'white',
      }}>
        {/* Section Header */}
        <div style={{
          padding: '16px 20px',
          background: '#f8fafc',
          borderBottom: '2px solid #e2e8f0',
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: '16px',
            fontWeight: 700,
            color: '#1e293b',
            marginBottom: '4px',
          }}>
            ✍️ Answer Sheet
          </div>
          <div style={{
            fontSize: '13px',
            color: '#64748b',
          }}>
            Section {viewingSectionNumber}: Questions {viewingSection?.startQuestion}-{viewingSection?.endQuestion}
          </div>
        </div>

        {/* Answer Inputs */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            {sectionQuestions.map((question) => {
              const isActive = currentQuestionNumber === question.number;
              const isAnswered = answers[question.number] !== undefined && answers[question.number] !== '';
              const isCorrect = testSubmitted ? questionResults?.[question.number] : undefined;

              return (
                <div
                  key={question.number}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '12px 16px',
                    background: isActive ? '#f0f9ff' : testSubmitted
                      ? isCorrect ? '#f0fdf4' : '#fef2f2'
                      : '#fafafa',
                    borderRadius: '8px',
                    border: `2px solid ${isActive ? '#3b82f6' : testSubmitted
                      ? isCorrect ? '#10b981' : '#ef4444'
                      : isAnswered ? '#10b981' : '#e2e8f0'
                      }`,
                    transition: 'all 0.2s',
                  }}
                >
                  {/* Question Number */}
                  <div style={{
                    minWidth: '36px',
                    height: '36px',
                    background: testSubmitted
                      ? isCorrect ? '#10b981' : '#ef4444'
                      : isActive ? '#3b82f6' : isAnswered ? '#10b981' : '#64748b',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '14px',
                  }}>
                    {question.number}
                  </div>

                  {/* Answer Input */}
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      value={answers[question.number] || ''}
                      onChange={(e) => onAnswerChange(question.number, e.target.value)}
                      disabled={testSubmitted}
                      placeholder="Type your answer..."
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        fontSize: '15px',
                        border: '2px solid #e2e8f0',
                        borderRadius: '6px',
                        outline: 'none',
                        fontFamily: 'inherit',
                        background: testSubmitted ? '#f9fafb' : 'white',
                        transition: 'border-color 0.2s',
                      }}
                      onFocus={(e) => {
                        if (!testSubmitted) {
                          e.currentTarget.style.borderColor = '#3b82f6';
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#e2e8f0';
                      }}
                    />
                  </div>

                  {/* Status Indicator */}
                  {testSubmitted && (
                    <div style={{
                      fontSize: '18px',
                    }}>
                      {isCorrect ? '✓' : '✗'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Answer Summary Footer */}
        <div style={{
          padding: '12px 20px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: '13px',
            color: '#64748b',
          }}>
            {Object.keys(answers).filter(k => {
              const num = parseInt(k);
              return viewingSection && num >= viewingSection.startQuestion && num <= viewingSection.endQuestion && answers[num];
            }).length} of {sectionQuestions.length} answered
          </div>
          {testSubmitted && questionResults && (
            <div style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#10b981',
            }}>
              {Object.entries(questionResults).filter(([k, v]) => {
                const num = parseInt(k);
                return viewingSection && num >= viewingSection.startQuestion && num <= viewingSection.endQuestion && v;
              }).length} correct
            </div>
          )}
        </div>
      </div>
    );
  };

/**
 * Main ListeningImageModeDisplay Component
 */
export const ListeningImageModeDisplay: React.FC<ListeningImageModeDisplayProps> = ({
  questionImages,
  questions,
  audioSections,
  currentSection,
  answers,
  onAnswerChange,
  currentQuestionNumber,
  testSubmitted,
  questionResults,
}) => {
  const [imageZoom, setImageZoom] = useState(100);

  return (
    <TwoColumnLayout
      leftColumn={
        <ImageViewer
          images={questionImages}
          currentSection={currentSection}
          currentQuestionNumber={currentQuestionNumber}
          audioSections={audioSections}
          zoom={imageZoom}
          onZoomChange={setImageZoom}
        />
      }
      rightColumn={
        <AnswerInputPanel
          questions={questions}
          answers={answers}
          onAnswerChange={onAnswerChange}
          currentQuestionNumber={currentQuestionNumber}
          testSubmitted={testSubmitted}
          questionResults={questionResults}
          currentSection={currentSection}
          audioSections={audioSections}
        />
      }
      defaultLeftWidth={55}
      minLeftWidth={35}
      maxLeftWidth={70}
    />
  );
};

export default ListeningImageModeDisplay;
