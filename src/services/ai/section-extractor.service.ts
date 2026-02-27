import { hybridGeminiProvider } from './providers/hybrid.gemini.provider';
import type { Result } from '../../types/result.types';

/**
 * AI-extracted sections (raw text, no interpretation)
 */
export interface ExtractedSections {
  title: string;
  passages: Array<{
    id: string;
    content: string;
    questionRange: string;
  }>;
  questions: Array<{
    number: number;
    text: string;
    options: string[];
    hasBlank: boolean;
  }>;
  answerKey: Record<number, string>;
}

/**
 * Section Extractor Service (HYBRID MODE ONLY)
 * Uses dedicated hybrid AI provider - isolated from production
 */
class SectionExtractorService {
  /**
   * Extract sections from document using hybrid AI provider
   * AI does NOT classify question types or interpret structure
   */
  async extractSections(documentText: string): Promise<Result<ExtractedSections>> {
    try {
      console.log('📦 [Section Extractor] Starting extraction...');
      console.log(`📊 [Section Extractor] Input: ${documentText.length} chars`);
      
      // Use DEDICATED hybrid provider (not production gemini.provider)
      const result = await hybridGeminiProvider.extractSections(documentText);
      
      if (!result.success) {
        console.error('❌ [Section Extractor] AI extraction failed:', result.error);
        return {
          success: false,
          error: `Section extraction failed: ${result.error}`,
        };
      }
      
      console.log('✅ [Section Extractor] AI extraction successful');
      console.log('🔄 [Section Extractor] Transforming AI response...');
      
      // Transform AI response to ExtractedSections format
      const transformed = this.transformAIResponse(result.data);
      
      if (transformed.success) {
        console.log('✅ [Section Extractor] Transformation complete');
        console.log(`📊 [Section Extractor] Output: ${transformed.data.passages.length} passages, ${transformed.data.questions.length} questions`);
      }
      
      return transformed;
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown extraction error',
      };
    }
  }
  
  /**
   * Transform AI response to ExtractedSections format
   */
  private transformAIResponse(aiData: any): Result<ExtractedSections> {
    try {
      console.log('🔄 [Section Extractor] Transforming AI response...');
      
      // AI should return passages, questions, answerKey
      const passages = aiData.passages?.map((p: any, index: number) => {
        const range = this.extractQuestionRange(p) || `${index * 13 + 1}-${(index + 1) * 13}`;
        console.log(`📄 [Section Extractor] Passage ${index + 1}: "${p.title || p.id}" (Q${range})`);
        
        return {
          id: p.id || `passage-${index + 1}`,
          content: p.content || '',
          questionRange: range,
        };
      }) || [];
      
      const questions = aiData.questions?.map((q: any) => {
        const questionNum = q.questionNumber || q.number || 0;
        const questionText = q.questionText || q.text || '';
        const hasBlank = q.hasBlank || this.detectBlank(questionText);
        
        console.log(`❓ [Section Extractor] Q${questionNum}: ${questionText.substring(0, 50)}... (hasBlank: ${hasBlank}, options: ${q.options?.length || 0})`);
        
        return {
          number: questionNum,
          text: questionText,
          options: q.options || [],
          hasBlank,
        };
      }) || [];
      
      const answerKey: Record<number, string> = {};
      if (aiData.answerKey && typeof aiData.answerKey === 'object') {
        let keyCount = 0;
        for (const [key, value] of Object.entries(aiData.answerKey)) {
          const num = parseInt(key, 10);
          if (!isNaN(num)) {
            answerKey[num] = String(value);
            keyCount++;
          }
        }
        console.log(`🔑 [Section Extractor] Extracted ${keyCount} answer keys`);
      }
      
      console.log('✅ [Section Extractor] Transformation successful');
      
      return {
        success: true,
        data: {
          title: aiData.title || 'Untitled Quiz',
          passages,
          questions,
          answerKey,
        },
      };
    } catch (error) {
      console.error('❌ [Section Extractor] Transformation failed:', error);
      return {
        success: false,
        error: `Failed to transform AI response: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
  
  /**
   * Extract question range from passage
   */
  private extractQuestionRange(passage: any): string | null {
    if (passage.questionStart && passage.questionEnd) {
      return `${passage.questionStart}-${passage.questionEnd}`;
    }
    if (passage.questionRange) {
      return passage.questionRange;
    }
    return null;
  }
  
  /**
   * Detect if text has blank (matches various blank formats)
   * AI should normalize to 6 underscores, but this catches variations
   */
  private detectBlank(text: string): boolean {
    return /_{3,}/.test(text) || // Underscores (3+)
           /\.{4,}/.test(text) || // Dots (4+)
           /\[blank\]/i.test(text) || // [blank] marker
           /\[answer\]/i.test(text); // [answer] marker
  }
}

export const sectionExtractor = new SectionExtractorService();
