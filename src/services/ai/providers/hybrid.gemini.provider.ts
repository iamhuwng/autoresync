import { GoogleGenerativeAI } from '@google/generative-ai';
import { jsonrepair } from 'jsonrepair';
import type { Result } from '../../../types/result.types';

/**
 * HYBRID MODE GEMINI PROVIDER
 * 
 * ISOLATED from production AI provider
 * Purpose: Extraction + normalization ONLY (no type classification)
 */

export interface HybridAIResponse {
  passages: Array<{
    id: string;
    title: string;
    content: string;
    questionStart: number;
    questionEnd: number;
    wordCount: number;
  }>;
  questions: Array<{
    questionNumber: number;
    questionText: string;
    type: string; // Will be empty "" - code detects type
    options: string[] | null;
    answer: string;
    confidence: number;
  }>;
  answerKey: Record<number, string>;
  confidence: number;
}

class HybridGeminiProvider {
  private clients: any[] = [];
  private currentKeyIndex = 0;
  private sdkLoaded = false;

  /**
   * Initialize with API keys from environment
   */
  async initialize(): Promise<void> {
    if (this.sdkLoaded) {
      console.log('🔄 [Hybrid Provider] Already initialized, skipping');
      return;
    }

    console.log('🚀 [Hybrid Provider] Initializing...');
    const keys = this.loadApiKeys();
    
    if (keys.length === 0) {
      console.error('❌ [Hybrid Provider] No API keys found');
      throw new Error('No Gemini API keys configured for hybrid mode');
    }

    this.clients = keys.map(key => new GoogleGenerativeAI(key));
    this.sdkLoaded = true;
    
    console.log(`✅ [Hybrid Provider] Initialized with ${keys.length} API key(s)`);
    console.log(`📊 [Hybrid Provider] Using key index: ${this.currentKeyIndex + 1}/${keys.length}`);
  }

  /**
   * Load API keys from environment
   */
  private loadApiKeys(): string[] {
    const keys: string[] = [];
    
    for (let i = 1; i <= 5; i++) {
      const key = import.meta.env[`VITE_GEMINI_API_KEY_${i}`];
      if (key && key.trim() && !key.includes('your_')) {
        keys.push(key);
      }
    }
    
    return keys;
  }

  /**
   * Extract sections from document (hybrid mode)
   */
  async extractSections(documentText: string): Promise<Result<HybridAIResponse>> {
    console.log('📤 [Hybrid Provider] Starting section extraction...');
    console.log(`📊 [Hybrid Provider] Document length: ${documentText.length} chars`);
    
    if (!this.sdkLoaded) {
      await this.initialize();
    }

    if (this.clients.length === 0) {
      console.error('❌ [Hybrid Provider] No clients available');
      return {
        success: false,
        error: 'No Gemini clients available for hybrid mode',
      };
    }

    try {
      const startTime = Date.now();
      const client = this.clients[this.currentKeyIndex];
      
      console.log(`🔑 [Hybrid Provider] Using API key ${this.currentKeyIndex + 1}/${this.clients.length}`);
      
      const model = client.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.1,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 65536, // Gemini 2.5 Flash supports up to 65,536 tokens
          responseMimeType: 'application/json',
        },
      });

      console.log('🤖 [Hybrid Provider] Sending request to Gemini...');
      const prompt = this.buildHybridPrompt(documentText);
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      const elapsed = Date.now() - startTime;
      console.log(`⏱️ [Hybrid Provider] Response received in ${elapsed}ms`);
      console.log(`📏 [Hybrid Provider] Response length: ${responseText.length} chars`);

      if (!responseText || !responseText.trim()) {
        console.error('❌ [Hybrid Provider] Empty response from Gemini');
        throw new Error('Empty response from Gemini');
      }

      console.log('🔍 [Hybrid Provider] Extracting JSON from response...');
      const parsed = this.extractJSON(responseText);
      
      console.log('✅ [Hybrid Provider] JSON extracted successfully');
      console.log('🔎 [Hybrid Provider] Validating response structure...');
      const validated = this.validateHybridResponse(parsed);

      if (!validated.success) {
        console.error('❌ [Hybrid Provider] Validation failed:', validated.error);
        return validated;
      }

      console.log('✅ [Hybrid Provider] Validation passed');
      console.log(`📊 [Hybrid Provider] Extracted: ${validated.data.passages.length} passages, ${validated.data.questions.length} questions`);
      
      // Check for potential truncation
      this.detectTruncation(validated.data, documentText);
      
      return {
        success: true,
        data: validated.data,
      };

    } catch (error) {
      console.error('❌ [Hybrid Provider] Error during extraction:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown hybrid parsing error',
      };
    }
  }

  /**
   * Build minimal hybrid prompt (extraction + normalization only)
   */
  private buildHybridPrompt(documentText: string): string {
    return `You are a document formatter. Your ONLY job is to extract and normalize formatting - DO NOT classify types or interpret content.

**YOUR TASKS:**
1. Extract passages (full text + question ranges)
2. Extract questions (normalize blanks and options)
3. Extract answer key
4. **CRITICAL:** Extract task instructions and generate options from them

**DO NOT:**
- Classify question types (leave as empty string "")
- Interpret question structure
- Guess missing information

Text:
"""
${documentText}
"""

**FORMATTING RULES:**
- Blanks: Always "______" (6 underscores)
- Options: "A. Text", "B. Text" (uppercase letter + period)
- Headings: "i. Text", "ii. Text" (lowercase roman + period)
- Remove: Inline instructions like "(T/F/NG)" from question text

**TASK INSTRUCTION DETECTION (CRITICAL):**

When you see a section like this:
\`\`\`
### Questions 1-7
*Do the following statements agree with the views of the writer?*
*   **TRUE** if the statement agrees
*   **FALSE** if the statement contradicts
*   **NOT GIVEN** if there is no information

1. Statement text here...
2. Another statement...
\`\`\`

You MUST:
1. Prepend the task instruction to EACH question text: "Do the following statements agree with the views of the writer? Statement text here..."
2. Generate options array from the instructions: ["TRUE", "FALSE", "NOT GIVEN"]

**ALL 16 IELTS TASK TYPE PATTERNS:**

**Type 1: Sentence Completion**
- Instructions: "Choose ONE WORD ONLY" or "NO MORE THAN TWO WORDS"
- Format: "1. The colony constructs its nest using ______"
- Action: Keep blank as "______" (6 underscores), no options array
- hasBlank: true

**Type 2: Summary Completion (from Text)**
- Instructions: "Complete the summary" + "NO MORE THAN TWO WORDS"
- Format: Paragraph with numbered blanks "**4** ______"
- Action: Keep blanks, no options
- hasBlank: true

**Type 3: Summary Completion (from List)**
- Instructions: "using the list of phrases, A–H"
- Format: Summary with blanks + separate list of phrases
- Action: Extract list as options ["A", "B", "C"...], keep blank in question text
- hasBlank: true, options: ["A", "B", "C", "D", "E", "F", "G", "H"]

**Type 4: Note Completion**
- Instructions: "ONE WORD AND/OR A NUMBER"
- Format: Bulleted notes with blanks "**14** ______"
- Action: Keep blanks, no options
- hasBlank: true

**Type 5: Table Completion**
- Instructions: "Complete the table"
- Format: Table with cells containing "**18** ______"
- Action: Keep blanks, no options
- hasBlank: true

**Type 6: Flow-Chart Completion**
- Instructions: "Complete the flow-chart"
- Format: Sequential boxes with "**21** ______"
- Action: Keep blanks, no options
- hasBlank: true

**Type 7: Diagram Label Completion**
- Instructions: "Label the diagram"
- Format: "(Arrow pointing to X): **24** ______"
- Action: Keep blanks, no options
- hasBlank: true

**Type 8: True/False/Not Given**
- Instructions: "Do the following statements agree with the information"
- Format: "27. The total population declined in the 1990s."
- Action: Prepend instruction, add options
- Prepend: "Do the following statements agree with the information given? "
- options: ["TRUE", "FALSE", "NOT GIVEN"]

**Type 9: Yes/No/Not Given**
- Instructions: "agree with the claims of the writer"
- Format: "31. The author believes learning is impossible."
- Action: Prepend instruction, add options
- Prepend: "Do the following statements agree with the claims of the writer? "
- options: ["YES", "NO", "NOT GIVEN"]

**Type 10: Matching Headings**
- Instructions: "Choose the correct heading for each section" + "i–viii"
- Format: "1. Section A"
- Action: Generate roman numeral options based on list provided
- Prepend: "Choose the correct heading for Section X: "
- options: ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"]

**Type 11: Matching Information**
- Instructions: "Which paragraph contains the following information?"
- Format: "6. a mention of the specific tools used"
- Action: Generate letter options based on paragraph range
- Prepend: "Which paragraph contains the following information? "
- options: ["A", "B", "C", "D", "E", "F"]

**Type 12: Matching Features**
- Instructions: "Match each statement with" + list of names/places
- Format: "10. Suggests that marsupials migrated"
- List: "A. Dr. Grant  B. Prof. Sattler  C. Dr. Malcolm"
- Action: Extract list as options
- Prepend: "Match the statement with the correct [scientist/place/date]: "
- options: ["A", "B", "C"] (from provided list)

**Type 13: Matching Sentence Endings**
- Instructions: "Complete each sentence with the correct ending, A–F"
- Format: "14. The introduction of species often leads to ______"
- List: "A. soil salinity  B. biodiversity protected"
- Action: Extract endings list as options
- Prepend: "Complete the sentence with the correct ending: "
- options: ["A", "B", "C", "D", "E", "F"]

**Type 14: Multiple Choice (Standard)**
- Instructions: "Choose the correct letter, A, B, C or D"
- Format: Question with 4 options listed underneath
- Action: Extract options normally
- options: ["A. Text", "B. Text", "C. Text", "D. Text"]

**Type 15: List Selection (Multiple Choice)**
- Instructions: "Choose TWO letters, A–E"
- Format: "Which TWO are mentioned as benefits?"
- Action: Extract options, note multiple selection in question text
- Prepend: "Choose TWO letters: "
- options: ["A", "B", "C", "D", "E"]

**Type 16: Short Answer Questions**
- Instructions: "NO MORE THAN THREE WORDS AND/OR A NUMBER"
- Format: "21. What instrument is used to measure depth?"
- Action: **PREPEND word limit to questionText**, no options (direct question)
- Prepend: "Choose NO MORE THAN THREE WORDS AND/OR A NUMBER from the passage for each answer: "
- hasBlank: false, options: []
- Example: "Choose NO MORE THAN THREE WORDS from the passage: How many life stories did Young write?"

**OUTPUT (JSON only, no markdown):**
{
  "passages": [
    {
      "id": "passage-1",
      "title": "First heading or line from passage",
      "content": "Complete passage text here...",
      "type": "text",
      "questionStart": 1,
      "questionEnd": 13,
      "wordCount": 500
    }
  ],
  "questions": [
    {
      "questionNumber": 1,
      "questionText": "Do the following statements agree with the views of the writer? 'The last man who knew everything' has also been claimed to other people.",
      "type": "",
      "options": ["TRUE", "FALSE", "NOT GIVEN"],
      "answer": "",
      "passageId": "passage-1",
      "confidence": 95,
      "context": null
    },
    {
      "questionNumber": 8,
      "questionText": "Choose NO MORE THAN THREE WORDS AND/OR A NUMBER from the passage for each answer: How many life stories did Young write for the Encyclopedia Britannica?",
      "type": "",
      "options": [],
      "answer": "",
      "passageId": "passage-1",
      "confidence": 95,
      "context": null
    },
    {
      "questionNumber": 14,
      "questionText": "Which paragraph contains the following information? The example of a research on building weather prediction for agriculture",
      "type": "",
      "options": ["A", "B", "C", "D", "E", "F"],
      "answer": "",
      "passageId": "passage-2",
      "confidence": 95,
      "context": null
    }
  ],
  "answerKey": {
    "1": "TRUE",
    "14": "D"
  },
  "confidence": 85
}

**CRITICAL:**
- Extract ALL passages, questions, and answers
- Keep original question numbers (don't renumber)
- **ALWAYS include task instructions in questionText**
- **ALWAYS generate options from task instructions**
- **For completion/short answer: PREPEND word count limit to questionText** (e.g., "Choose NO MORE THAN TWO WORDS: question text...")
- Leave "type" as empty string "" (code will detect it)
- Always include all 4 top-level fields (passages, questions, answerKey, confidence)`;
  }

  /**
   * Extract JSON from response
   */
  private extractJSON(text: string): unknown {
    let cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }

      const repaired = jsonrepair(cleaned);
      return JSON.parse(repaired);
    }
  }

  /**
   * Validate hybrid response structure
   */
  private validateHybridResponse(data: any): Result<HybridAIResponse> {
    console.log('🔍 [Hybrid Provider] Validating response structure...');
    
    if (!data || typeof data !== 'object') {
      console.error('❌ [Hybrid Provider] Response is not an object:', typeof data);
      return {
        success: false,
        error: 'Invalid response: not an object',
      };
    }

    const hasPassages = 'passages' in data;
    const hasQuestions = 'questions' in data;
    const hasAnswerKey = 'answerKey' in data;
    const hasConfidence = 'confidence' in data;
    
    console.log('📊 [Hybrid Provider] Response fields:', {
      passages: hasPassages,
      questions: hasQuestions,
      answerKey: hasAnswerKey,
      confidence: hasConfidence,
    });

    // Hybrid mode: Both passages AND questions should be present
    // But provide defaults if AI misses them
    if (!hasPassages) {
      console.log('⚠️ [Hybrid Provider] No passages found, using empty array');
      data.passages = [];
    }
    if (!hasQuestions) {
      console.log('⚠️ [Hybrid Provider] No questions found, using empty array');
      data.questions = [];
    }
    
    // Fill in defaults for optional fields
    if (!hasAnswerKey) {
      console.log('⚠️ [Hybrid Provider] No answerKey found, using empty object');
      data.answerKey = {};
    }
    if (!hasConfidence) {
      console.log('⚠️ [Hybrid Provider] No confidence found, using default: 85');
      data.confidence = 85;
    }
    
    // Warn if we got NOTHING useful
    if (data.passages.length === 0 && data.questions.length === 0) {
      console.error('❌ [Hybrid Provider] AI returned empty passages and questions');
      return {
        success: false,
        error: 'AI returned no passages or questions - check document format',
      };
    }

    console.log('✅ [Hybrid Provider] Validation successful');
    return {
      success: true,
      data: data as HybridAIResponse,
    };
  }

  /**
   * Detect if response may have been truncated
   */
  private detectTruncation(data: HybridAIResponse, originalText: string): void {
    const expectedQuestionCount = this.estimateQuestionCount(originalText);
    const actualQuestionCount = data.questions.length;
    
    if (expectedQuestionCount > 0 && actualQuestionCount < expectedQuestionCount * 0.7) {
      console.warn('⚠️ [Hybrid Provider] Possible truncation detected!');
      console.warn(`⚠️ [Hybrid Provider] Expected ~${expectedQuestionCount} questions, got ${actualQuestionCount}`);
      console.warn('⚠️ [Hybrid Provider] AI response may have been cut off due to length');
    }
    
    // Check if answer key is suspiciously empty when we have many questions
    if (actualQuestionCount > 10 && Object.keys(data.answerKey || {}).length === 0) {
      console.warn('⚠️ [Hybrid Provider] No answer keys extracted despite having many questions');
      console.warn('⚠️ [Hybrid Provider] Answer key section may have been truncated');
    }
    
    // Check passage question ranges vs actual questions
    let totalExpectedFromPassages = 0;
    data.passages.forEach(p => {
      const rangeSize = (p.questionEnd - p.questionStart) + 1;
      totalExpectedFromPassages += rangeSize;
    });
    
    if (totalExpectedFromPassages > actualQuestionCount) {
      console.warn('⚠️ [Hybrid Provider] Passage ranges indicate more questions than extracted');
      console.warn(`⚠️ [Hybrid Provider] Passages expect ${totalExpectedFromPassages} questions, but only ${actualQuestionCount} extracted`);
    }
  }
  
  /**
   * Estimate question count from document text
   */
  private estimateQuestionCount(text: string): number {
    // Look for common question number patterns
    const patterns = [
      /Question\s+(\d+)/gi,
      /^\s*(\d+)\.\s+/gm,
      /\*\*(\d+)\*\*/g,
    ];
    
    const numbers = new Set<number>();
    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          const num = parseInt(match[1], 10);
          if (num > 0 && num <= 200) {
            numbers.add(num);
          }
        }
      }
    }
    
    return numbers.size;
  }

  /**
   * Rotate to next API key (for rate limiting)
   */
  rotateKey(): void {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.clients.length;
  }
}

// Singleton export
export const hybridGeminiProvider = new HybridGeminiProvider();
