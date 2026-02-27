/**
 * ListeningInstructions Component
 * Renders IELTS-specific instructions for Listening question types
 * Based on official IELTS Listening task types
 */

import React from 'react';

interface ListeningInstructionsProps {
  type: string;
  questionRange: { start: number; end: number };
}

/**
 * Get IELTS Listening-specific instructions for each question type
 * Based on documentation/architecture/IELTS-LISTENING-TASKTYPES
 */
export const getListeningInstructions = (type: string, start: number, end: number): string => {
  const range = start === end ? `Question ${start}` : `Questions ${start}-${end}`;
  
  const instructionMap: Record<string, string> = {
    // Type 1: Form Completion
    'form-completion': `${range}\n\nComplete the form below.\n\nWrite NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.`,
    
    // Type 2: Note Completion
    'note-completion': `${range}\n\nComplete the notes below.\n\nWrite NO MORE THAN THREE WORDS for each answer.`,
    
    // Type 3: Table Completion
    'table-completion': `${range}\n\nComplete the table below.\n\nWrite NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.`,
    
    // Type 4: Multiple Choice - Single Answer
    'multiple-choice': `${range}\n\nChoose the correct letter, A, B or C.`,
    
    // Type 4b: Multiple Choice - Multiple Answers
    'multiple-choice-multiple': `${range}\n\nChoose TWO letters, A-E.\n\nWhich TWO of the following are mentioned?`,
    
    // Type 5: Matching
    'matching': `${range}\n\nWhat is the main concern of each speaker?\n\nChoose FIVE answers from the box and write the correct letter, A-H, next to Questions ${start}-${end}.`,
    
    // Type 6: Map/Plan Labelling
    'map-labelling': `${range}\n\nLabel the map below.\n\nWrite the correct letter, A-H, next to Questions ${start}-${end}.`,
    
    'plan-labelling': `${range}\n\nLabel the plan below.\n\nWrite the correct letter, A-I, next to Questions ${start}-${end}.`,
    
    // Type 7: Diagram Labelling
    'diagram-labelling': `${range}\n\nLabel the diagram below.\n\nWrite NO MORE THAN TWO WORDS for each answer.`,
    
    // Type 8: Sentence Completion
    'sentence-completion': `${range}\n\nComplete the sentences below.\n\nWrite NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.`,
    
    // Type 9: Summary Completion
    'summary-completion': `${range}\n\nComplete the summary below.\n\nWrite NO MORE THAN TWO WORDS for each answer.`,
    
    // Type 10: Short Answer Questions
    'short-answer': `${range}\n\nAnswer the questions below.\n\nWrite NO MORE THAN THREE WORDS AND/OR A NUMBER for each answer.`,
    
    // Type 11: Flow-chart Completion
    'flowchart-completion': `${range}\n\nComplete the flow-chart below.\n\nWrite NO MORE THAN TWO WORDS for each answer.`,
    
    // Legacy/fallback
    'completion': `${range}\n\nComplete the sentences below.\n\nWrite NO MORE THAN TWO WORDS from the recording for each answer.`,
  };
  
  return instructionMap[type] || `${range}\n\nAnswer the following questions based on what you hear.`;
};

export const ListeningInstructions: React.FC<ListeningInstructionsProps> = ({
  type,
  questionRange
}) => {
  const instructions = getListeningInstructions(type, questionRange.start, questionRange.end);
  const lines = instructions.split('\n');
  
  return (
    <div className="listening-instructions" style={{
      backgroundColor: '#f8fafc',
      border: '1px solid #cbd5e1',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '20px'
    }}>
      {/* Question Range Header */}
      <div style={{
        fontSize: '14px',
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <span style={{
          backgroundColor: '#3b82f6',
          color: 'white',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          {lines[0]}
        </span>
      </div>
      
      {/* Main Instructions */}
      <div style={{
        fontSize: '14px',
        color: '#334155',
        lineHeight: '1.6',
        fontWeight: '500'
      }}>
        {lines.slice(2, -1).join('\n')}
      </div>
      
      {/* Word Limit Emphasis */}
      {(() => {
        const lastLine = lines[lines.length - 1];
        if (lastLine && lastLine.includes('WORD')) {
          return (
            <div style={{
              marginTop: '12px',
              padding: '8px 12px',
              backgroundColor: '#fef3c7',
              border: '1px solid #fcd34d',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#92400e',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '16px' }}>⚠️</span>
              <span>{lastLine}</span>
            </div>
          );
        }
        return null;
      })()}
      
      {/* Special Instructions for Complex Types */}
      {type === 'map-labelling' && (
        <div style={{
          marginTop: '12px',
          fontSize: '12px',
          color: '#64748b',
          fontStyle: 'italic'
        }}>
          💡 Listen carefully for directional words like "next to", "opposite", "between", etc.
        </div>
      )}
      
      {type === 'matching' && (
        <div style={{
          marginTop: '12px',
          fontSize: '12px',
          color: '#64748b',
          fontStyle: 'italic'
        }}>
          💡 You may use any letter more than once, and some letters may not be used at all.
        </div>
      )}
      
      {type === 'multiple-choice-multiple' && (
        <div style={{
          marginTop: '12px',
          fontSize: '12px',
          color: '#64748b',
          fontStyle: 'italic'
        }}>
          💡 Select exactly TWO options. Order doesn't matter.
        </div>
      )}
    </div>
  );
};

/**
 * Group consecutive questions of the same type for instruction display
 */
export interface QuestionGroup {
  type: string;
  startNumber: number;
  endNumber: number;
  questions: any[];
}

export const groupQuestionsByType = (questions: any[]): QuestionGroup[] => {
  if (!questions || questions.length === 0) return [];
  
  const groups: QuestionGroup[] = [];
  const firstQuestion = questions[0];
  if (!firstQuestion) return [];
  
  let currentGroup: any[] = [firstQuestion];
  let currentType = firstQuestion.type;
  
  for (let i = 1; i < questions.length; i++) {
    const question = questions[i];
    
    // Check if same type and consecutive
    if (question.type === currentType) {
      currentGroup.push(question);
    } else {
      // Save current group
      if (currentGroup.length > 0) {
        groups.push({
          type: currentType,
          startNumber: currentGroup[0].number,
          endNumber: currentGroup[currentGroup.length - 1].number,
          questions: currentGroup
        });
      }
      
      // Start new group
      currentGroup = [question];
      currentType = question.type;
    }
  }
  
  // Don't forget the last group
  if (currentGroup.length > 0) {
    groups.push({
      type: currentType,
      startNumber: currentGroup[0].number,
      endNumber: currentGroup[currentGroup.length - 1].number,
      questions: currentGroup
    });
  }
  
  return groups;
};
