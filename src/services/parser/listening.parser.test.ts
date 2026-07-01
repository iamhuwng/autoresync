/**
 * Listening Parser Test
 * Quick verification that listening parser works correctly
 */

import { describe, it, expect } from 'vitest';
import { listeningParser } from './listening.parser';

describe('ListeningParser', () => {
  describe('canHandle', () => {
    it('should detect IELTS Listening text', () => {
      const text = `
        Questions 1-6
        Complete the notes below.
        Write NO MORE THAN TWO WORDS for each answer.
        
        CHILDREN'S ENGINEERING WORKSHOPS
        
        Outdoor play sessions
        - focus on building 1 __________ structures
        - sessions held in local 2 __________
      `;
      
      const result = listeningParser.canHandle(text);
      
      expect(result.canHandle).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      console.log('canHandle result:', result);
    });
    
    it('should reject non-listening text', () => {
      const text = 'This is just a regular paragraph with no questions.';
      
      const result = listeningParser.canHandle(text);
      
      expect(result.canHandle).toBe(false);
      console.log('Non-listening canHandle result:', result);
    });
  });
  
  describe('parseListeningText', () => {
    it('should parse note completion questions', async () => {
      const text = `
Questions 1-4

Complete the notes below.

Write NO MORE THAN TWO WORDS for each answer.

CHILDREN'S ENGINEERING WORKSHOPS

Outdoor play sessions
- focus on building 1 __________ structures
- sessions held in local 2 __________

Booking information
- phone number: 3 __________
- cost: 4 __________ per child
      `;
      
      const result = await listeningParser.parseListeningText(text);
      
      console.log('Parse result:', {
        sectionsCount: result.sections.length,
        questionsCount: result.questions.length,
        confidence: result.parseConfidence,
        sectionTypes: result.sections.map(s => s.type),
      });
      
      expect(result.sections.length).toBeGreaterThan(0);
      expect(result.sections[0].type).toBe('note-completion');
      expect(result.questions.length).toBe(4);
      expect(result.parseConfidence).toBeGreaterThanOrEqual(70);
    });
    
    it('should parse multiple choice questions', async () => {
      const text = `
Questions 5-8

Choose the correct letter, A, B, or C.

5. What time does the workshop start?
A. 9:00 AM
B. 10:00 AM
C. 11:00 AM

6. How long does each session last?
A. 1 hour
B. 2 hours
C. 3 hours

7. What is the maximum group size?
A. 10 children
B. 15 children
C. 20 children

8. Who leads the workshops?
A. Teachers
B. Engineers
C. Parents
      `;
      
      const result = await listeningParser.parseListeningText(text);
      
      console.log('Multiple choice result:', {
        sectionsCount: result.sections.length,
        questionsCount: result.questions.length,
        sectionTypes: result.sections.map(s => s.type),
        questionTypes: result.questions.map(q => q.type),
      });
      
      expect(result.sections[0].type).toBe('multiple-choice');
      expect(result.questions.length).toBe(4);
    });
    
    it('should parse matching questions', async () => {
      const text = `
Questions 11-15

Which activity is associated with each location?

Choose FIVE answers from the box and write the correct letter, A-G, next to Questions 11-15.

A. Swimming
B. Running
C. Cycling
D. Yoga
E. Tennis
F. Basketball
G. Volleyball

11. Sports Hall __________
12. Swimming Pool __________
13. Outdoor Court __________
14. Fitness Room __________
15. Track __________
      `;
      
      const result = await listeningParser.parseListeningText(text);
      
      console.log('Matching result:', {
        sectionsCount: result.sections.length,
        questionsCount: result.questions.length,
        sectionTypes: result.sections.map(s => s.type),
        optionsBoxLength: result.sections[0]?.optionsBox?.length,
      });
      
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].type).toBe('matching');
      expect(result.sections[0].optionsBox).toBeDefined();
      expect(result.sections[0].optionsBox?.length).toBeGreaterThan(0);
    });

    it('should detect numbered PART headers without matching instructional prose', async () => {
      const result = await listeningParser.parseListeningText(`
PART 1 Questions 1-2

Complete the notes below.

1. First answer __________
2. Second answer __________
      `);

      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].questionRange).toEqual({ start: 1, end: 2 });
      expect(result.questions).toHaveLength(2);
    });
    
    it('should validate IELTS structure', async () => {
      const text = `
Questions 1-10

Complete the notes below.
Write NO MORE THAN ONE WORD for each answer.

Note content here with blanks 1 __________ through 10 __________

Questions 11-20

Choose the correct letter, A, B, or C.

Questions here...

Questions 21-30

Complete the table below.

Table content...

Questions 31-40

Matching questions...
      `;
      
      const result = await listeningParser.parseListeningText(text);
      
      console.log('IELTS validation result:', {
        validation: result.validation,
        metadata: result.metadata,
      });
      
      expect(result.validation).toBeDefined();
      expect(result.validation?.sectionCount.actual).toBe(4);
    });
  });
  
  describe('parse (Result wrapper)', () => {
    it('should return Result type with success', async () => {
      const text = `
Questions 1-5
Complete the form below.
Write NO MORE THAN TWO WORDS for each answer.

1 __________ Name
2 __________ Address
      `;
      
      const result = await listeningParser.parse(text);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.parserUsed).toBe('listening');
      }
    });
  });
});
