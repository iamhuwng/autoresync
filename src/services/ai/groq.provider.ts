import type { Chunk } from '../../types/document.types';
import type { Result } from '../../types/result.types';
import type { IAIService, AIParseResult, ProviderStatus } from './ai.service';
import { getEnv } from '../../config/env.config';
import { validateAIResponse, validatePassagesOnly, validateQuestionsAndAnswers, normalizeQuestionType, normalizeAnswer } from './response.validator';
import { getDecryptedKeys } from '../api-keys.service';
import { extractJSON } from '../test-creation/ai-json-repair';

// Type-only import to avoid eager loading
type Groq = any;

/**
 * Groq AI provider implementation (fallback)
 * Uses Llama 3.3 70B Versatile model
 * Supports multiple API keys with rotation
 */
export class GroqProvider implements IAIService {
  private clients: Groq[] = [];
  private apiKeys: string[] = [];
  private currentKeyIndex = 0;
  private requestCount = 0;
  private sdkLoaded = false;
  private sdkLoadPromise: Promise<any> | null = null;

  // Track exhausted keys
  private exhaustedKeys = new Map<number, { timestamp: number; reason: string }>();
  private readonly QUOTA_RESET_HOURS = 24;

  private status: ProviderStatus = {
    name: 'groq',
    available: false,
    lastError: null,
    requestCount: 0,
    lastRequestTime: null,
  };

  constructor() {
    // Don't initialize eagerly - wait until first use
  }

  /**
   * Lazy load the Groq SDK
   */
  private async loadSDK(): Promise<any> {
    if (this.sdkLoaded) {
      return;
    }

    if (!this.sdkLoadPromise) {
      this.sdkLoadPromise = import('groq-sdk').then((module) => {
        this.sdkLoaded = true;
        return module;
      });
    }

    return this.sdkLoadPromise;
  }

  /**
   * Load all Groq API keys from .env and Firestore
   */
  private async loadAllGroqApiKeys(): Promise<string[]> {
    const keys: string[] = [];
    const env = getEnv();

    // Load from .env (support VITE_GROQ_API_KEY and VITE_GROQ_API_KEY_1 through _5)
    const legacyKey = env.VITE_GROQ_API_KEY;
    if (legacyKey && legacyKey.trim().length > 0 && !legacyKey.includes('your_')) {
      keys.push(legacyKey);
    }

    // Check for numbered keys (future env expansion)
    for (let i = 1; i <= 5; i++) {
      const key = (env as any)[`VITE_GROQ_API_KEY_${i}`] as string | undefined;
      if (key && key.trim().length > 0 && !key.includes('your_') && !keys.includes(key)) {
        keys.push(key);
      }
    }

    // Load from Firestore (encrypted keys)
    try {
      const firestoreKeys = await getDecryptedKeys('groq');
      for (const key of firestoreKeys) {
        if (key && !keys.includes(key)) {
          keys.push(key);
        }
      }
    } catch (error) {
      console.warn('[Groq] Failed to load Firestore keys:', error);
    }

    return keys;
  }

  /**
   * Initialize Groq clients with all available keys
   */
  private async initialize(): Promise<void> {
    try {
      // Load SDK first
      const { default: Groq } = await this.loadSDK();

      // Load all keys
      this.apiKeys = await this.loadAllGroqApiKeys();

      if (this.apiKeys.length === 0) {
        console.warn('⚠️ No Groq API keys configured - Groq fallback unavailable');
        return;
      }

      // Create a client for each key
      this.clients = this.apiKeys.map((apiKey, index) => {
        const client = new Groq({
          apiKey,
          dangerouslyAllowBrowser: true,
        });
        console.log(`✅ Groq client ${index + 1}/${this.apiKeys.length} initialized`);
        return client;
      });

      this.status.available = true;

      console.log(`✅ Groq provider initialized with ${this.clients.length} key(s) (fallback)`);
    } catch (error) {
      this.status.available = false;
      this.status.lastError = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Groq initialization failed:', error);
    }
  }

  /**
   * Get next available (non-exhausted) key in round-robin fashion
   */
  private getNextAvailableKeyRoundRobin(): number {
    this.requestCount++;

    for (let i = 0; i < this.clients.length; i++) {
      const keyIndex = (this.requestCount + i) % this.clients.length;
      if (!this.isKeyExhausted(keyIndex)) {
        return keyIndex;
      }
    }

    // All exhausted, use round-robin anyway
    console.warn('⚠️ [Groq] All keys exhausted, using round-robin anyway');
    return this.requestCount % this.clients.length;
  }

  /**
   * Check if a key is currently exhausted
   */
  private isKeyExhausted(keyIndex: number): boolean {
    const exhaustedKey = this.exhaustedKeys.get(keyIndex);
    if (!exhaustedKey) return false;

    const hoursElapsed = (Date.now() - exhaustedKey.timestamp) / (1000 * 60 * 60);
    if (hoursElapsed >= this.QUOTA_RESET_HOURS) {
      this.exhaustedKeys.delete(keyIndex);
      console.log(`✅ [Groq] Key #${keyIndex + 1} quota reset after ${Math.floor(hoursElapsed)}h`);
      return false;
    }

    return true;
  }

  /**
   * Mark a key as exhausted
   */
  private markKeyExhausted(keyIndex: number, reason: string): void {
    this.exhaustedKeys.set(keyIndex, {
      timestamp: Date.now(),
      reason,
    });
    const keyPreview = this.apiKeys[keyIndex]?.substring(this.apiKeys[keyIndex].length - 8) || 'unknown';
    console.warn(`⚠️ [Groq] Marked key #${keyIndex + 1} (...${keyPreview}) as exhausted: ${reason}`);
  }

  /**
   * Get next available key (sequential, for fallback)
   */
  private getNextAvailableKey(): number {
    for (let i = 0; i < this.clients.length; i++) {
      const nextIndex = (this.currentKeyIndex + i + 1) % this.clients.length;
      if (!this.isKeyExhausted(nextIndex)) {
        return nextIndex;
      }
    }
    return -1; // All keys exhausted
  }

  /**
   * Clean up expired exhausted keys
   */
  private cleanupExhaustedKeys(): void {
    const now = Date.now();
    const resetTimeMs = this.QUOTA_RESET_HOURS * 60 * 60 * 1000;

    for (const [keyIndex, data] of this.exhaustedKeys.entries()) {
      if (now - data.timestamp >= resetTimeMs) {
        this.exhaustedKeys.delete(keyIndex);
        console.log(`🔄 [Groq] Cleaned up exhausted key #${keyIndex + 1}`);
      }
    }
  }

  /**
   * Parse chunk with Groq (with round-robin load balancing)
   */
  async parseChunk(chunk: Chunk): Promise<Result<AIParseResult>> {
    // Lazy initialize on first use
    if (this.clients.length === 0 && !this.sdkLoaded) {
      await this.initialize();
    }

    if (this.clients.length === 0) {
      return {
        success: false,
        error: 'Groq clients not initialized'
      };
    }

    // Clean up expired exhausted keys
    this.cleanupExhaustedKeys();

    // Round-robin key selection
    this.currentKeyIndex = this.getNextAvailableKeyRoundRobin();
    console.log(`📤 [Groq parseChunk] Using key ${this.currentKeyIndex + 1}/${this.clients.length} (round-robin)`);

    // Try with selected key
    const result = await this.attemptParseChunk(chunk);

    if (result.success) {
      return result;
    }

    // Check for rate limit error
    const isRateLimitError = result.error?.includes('429') ||
      result.error?.includes('rate limit') ||
      result.error?.includes('quota');

    if (isRateLimitError) {
      console.warn(`⚠️ [Groq] Rate limit on key ${this.currentKeyIndex + 1}, trying other keys...`);
      this.markKeyExhausted(this.currentKeyIndex, 'Rate limit');

      // Try remaining keys
      for (let attempt = 0; attempt < this.clients.length - 1; attempt++) {
        const nextKey = this.getNextAvailableKey();
        if (nextKey === -1) {
          console.warn('⚠️ All Groq API keys are exhausted');
          break;
        }

        this.currentKeyIndex = nextKey;
        console.log(`🔄 [Groq] Trying key ${this.currentKeyIndex + 1}/${this.clients.length}`);

        const retryResult = await this.attemptParseChunk(chunk);
        if (retryResult.success) {
          return retryResult;
        }

        if (retryResult.error?.includes('429') || retryResult.error?.includes('rate limit')) {
          this.markKeyExhausted(this.currentKeyIndex, 'Rate limit');
          continue;
        }

        return retryResult;
      }

      return {
        success: false,
        error: 'All Groq API keys exhausted or rate-limited',
      };
    }

    return result;
  }

  /**
   * Attempt to parse with current key
   */
  private async attemptParseChunk(chunk: Chunk): Promise<Result<AIParseResult>> {
    try {
      this.status.requestCount++;
      this.status.lastRequestTime = Date.now();

      const client = this.clients[this.currentKeyIndex];
      if (!client) {
        throw new Error('No client available');
      }

      const completion = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are an expert quiz parser. Return only valid JSON, no markdown.',
          },
          {
            role: 'user',
            content: this.buildPrompt(chunk),
          },
        ],
        temperature: 0.1,
        max_tokens: 8192,
      });

      const text = completion.choices[0]?.message?.content;

      if (!text) {
        return { success: false, error: 'Empty response from Groq' };
      }

      const parsed = extractJSON(text);

      // Log parsed structure for debugging
      const parsedObj = parsed as Record<string, any>;
      console.log('📊 Groq parsed structure:', {
        hasPassages: 'passages' in parsedObj,
        hasQuestions: 'questions' in parsedObj,
        hasAnswerKey: 'answerKey' in parsedObj,
        hasConfidence: 'confidence' in parsedObj,
        keys: Object.keys(parsedObj),
        firstQuestionKeys: parsedObj.questions?.[0] ? Object.keys(parsedObj.questions[0]) : [],
      });

      const validation = validateAIResponse(parsed);

      if (!validation.success) {
        console.error('❌ Groq validation failed:', validation.error);
        console.error('📄 Sample question:', JSON.stringify(parsedObj.questions?.[0] || {}, null, 2));
        return {
          success: false,
          error: `Invalid response format: ${validation.error}`,
        };
      }

      // Post-process: normalize question types and answers
      const normalized = this.normalizeResult(validation.data);

      return { success: true, data: normalized };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.status.lastError = errorMessage;

      return {
        success: false,
        error: `Groq parsing failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Build parsing prompt (focused prompts based on chunk type)
   */
  private buildPrompt(chunk: Chunk): string {
    // Use same focused approach as Gemini for consistency
    switch (chunk.id) {
      case 'passages':
        return this.buildPassagesPrompt(chunk);
      case 'questions':
        return this.buildQuestionsPrompt(chunk);
      case 'answerKey':
        return this.buildAnswerKeyPrompt(chunk);
      default:
        return this.buildCombinedPrompt(chunk);
    }
  }

  private buildPassagesPrompt(chunk: Chunk): string {
    return `You are a reading passage extractor. Extract ONLY reading passages from this text.

Text:
"""
${chunk.text}
"""

**INSTRUCTIONS:**
1. Find passages with clear markers like "Passage:", "Reading:", or paragraph labels
2. Extract title and full content for each passage
3. Determine which question numbers each passage covers
4. If NO clear passages exist, return empty array

**⚠️ CRITICAL FORMATTING RULES for "content" field:**
- PRESERVE paragraph breaks: Separate paragraphs with \\n\\n (double newline)
- PRESERVE paragraph labels: Keep A, B, C, i, ii, iii, Section X, etc. at the start of each paragraph
- Do NOT merge all text into one continuous block
- Students need paragraph labels to answer "Which paragraph contains..." questions

**OUTPUT (JSON object only, no markdown):**
{
  "passages": [{"id": "passage-1", "title": "Title", "content": "A  First paragraph...\\n\\nB  Second paragraph...", "type": "text", "questionStart": 1, "questionEnd": 10, "wordCount": 450}],
  "questions": [],
  "answerKey": {},
  "confidence": 95
}`;
  }

  private buildQuestionsPrompt(chunk: Chunk): string {
    return `You are a quiz question parser for IELTS Reading tests. Extract ALL questions with their details.

Text:
"""
${chunk.text}
"""

**INSTRUCTIONS:**
1. Preserve ORIGINAL question numbers (don't renumber)
2. Identify question type accurately using the guide below
3. Extract options for matching/choice questions
4. For completion: extract ONLY the sentence with the blank (______)

**═══════════════════════════════════════════════════════════════**
**QUESTION TYPE CLASSIFICATION GUIDE (ESSENCE-BASED)**
**═══════════════════════════════════════════════════════════════**

**GROUP 1: TRUE/FALSE (Distinguish by FACTS vs OPINIONS)**
| Type | Key Phrase | What it Checks |
|------|-----------|---------------|
| "true-false-not-given" | "agree with the INFORMATION" | Facts in passage |
| "yes-no-not-given" | "agree with the CLAIMS/VIEWS" | Writer's opinions |

**GROUP 2: MATCHING (Distinguish by WHAT THEY MATCH TO)**
| Type | Match TO | Typical Instruction |
|------|----------|-------------------|
| "matching-headings" | Roman numerals (i-x) | "Choose the correct heading" |
| "matching-information" | Paragraph letters (A-G) | "Which paragraph contains..." |
| "matching-features" | Named entity list (people, theories) | "Match statements to persons" |
| "matching-sentence-endings" | Endings list (A-G) | "Complete with correct ending" |

**GROUP 3: COMPLETION (Distinguish by WORD SOURCE)**
| Type | Word Source | Key Indicator |
|------|------------|---------------|
| "sentence-completion" | From passage | "complete using words FROM THE PASSAGE" |
| "summary-completion-text" | From passage | Summary paragraph with blanks. MUST assign a 'summaryGroupId' (e.g. "sc-1") to all questions under the same instruction block. Increment (e.g. "sc-2") if a new summary instruction block appears in the same passage. |
| "summary-completion-list" | From box/list | "Choose from the BOX/LIST below". ⚠️ FIRST question MUST have ENTIRE summary paragraph with ALL blanks (______). Subsequent questions get empty questionText. MUST assign a 'summaryGroupId' (e.g. "sc-1") to all questions under the same instruction block. Increment (e.g. "sc-2") if a new summary instruction block appears in the same passage. NEVER put this property on non-summary questions. |
| "note-completion" | From passage | Notes/bullet format with blanks |
| "table-completion" | From passage | Table format with blanks — see TABLE FORMAT RULES below |
| "flowchart-completion" | From passage | Flowchart/diagram with blanks |
| "diagram-labeling" | From passage/list | Label parts of diagram |

**⚠️ TABLE FORMAT RULES (for "table-completion" ONLY):**
- questionText MUST use PIPE character to separate columns, preserving original table layout
- Example: questionText = "Gingko Biloba PIPE ______ PIPE Improves cognitive function" (replace PIPE with the actual pipe character)
- Put column headers in sectionInstruction: "TABLE_HEADERS: Plant Species PIPE Native Region PIPE Medicinal Use. Complete the table below."
- Use underscores (______) for blanks, NOT dots
- 🚫 ABSOLUTELY FORBIDDEN: Do NOT create ANY question with questionNumber: 0
- 🚫 ABSOLUTELY FORBIDDEN: Do NOT create a header-only row as a question
- Headers are METADATA, not questions

**GROUP 4: CHOICE (Distinguish by NUMBER OF ANSWERS)**
| Type | Answers | Typical Instruction |
|------|---------|-------------------|
| "multiple-choice" | ONE | "Choose ONE letter A-D" |
| "multiple-select" | TWO+ | "Choose TWO letters A-E" |

**GROUP 5: OTHER**
| Type | Description |
|------|-------------|
| "short-answer" | Open-ended question requiring text answer |

**OUTPUT (JSON object only, no markdown):**
{
  "passages": [],
  "questions": [{"questionNumber": 1, "questionText": "...", "type": "true-false-not-given", "options": null, "answer": "", "confidence": 95, "context": null}],
  "answerKey": {},
  "confidence": 90
}`;
  }

  private buildAnswerKeyPrompt(chunk: Chunk): string {
    return `You are an answer key parser. Extract answer key mappings from this text.

Text:
"""
${chunk.text}
"""

**INSTRUCTIONS:**
1. Find answer key section (labeled "Answers:", "Answer Key:", etc.)
2. Map question numbers to their correct answers
3. Preserve exact answer text (case-sensitive)

**OUTPUT (JSON object only, no markdown):**
{
  "passages": [],
  "questions": [],
  "answerKey": {"1": "A", "2": "B", "3": "True"},
  "confidence": 95
}`;
  }

  private buildCombinedPrompt(chunk: Chunk): string {
    return `You are an expert quiz parser specializing in IELTS and TOEFL reading tests. Analyze this document and extract ALL passages, questions, and answer key.

**DOCUMENT FORMAT:**
This document may have an INTERLEAVED structure:
- Passage 1 → Questions 1-13
- Passage 2 → Questions 14-26
- Passage 3 → Questions 27-40
- Answer Key (at the end)

**EXTRACTION RULES:**

1. **PASSAGES:**
   - Look for markers like "Reading Passage 1", "Test 1 - Reading Passage 2", "### **Passage 3**"
   - Extract the COMPLETE passage text with PRESERVED paragraph breaks (\\n\\n between paragraphs)
   - PRESERVE paragraph labels (A, B, C, i, ii, iii, Section X) at the start of each paragraph
   - Extract all paragraphs until the next "Questions" marker
   - Identify which question numbers each passage covers
   - Set questionStart and questionEnd based on the question range for that passage

2. **QUESTIONS:**
   - Extract ALL questions (preserve original numbers: 1, 2, 3... 40)
   - For each question, identify its type (multiple-choice, completion, yes-no-not-given, etc.)
   - Extract options if present
   - Link each question to its passage using passageId (e.g., "passage-1", "passage-2", "passage-3")
   - For IELTS format: capture context structure if questions are grouped under section headings

3. **ANSWER KEY:**
   - Look for "Answer Key" section (usually at the end)
   - Extract ALL question-answer mappings
   - Preserve exact answer format (A/B/C/D, YES/NO, text answers)

4. **QUESTION TYPES (Use SPECIFIC types, not generic):**
   **True/False:** "true-false-not-given" (facts) or "yes-no-not-given" (opinions)
   **Matching:** "matching-headings", "matching-information", "matching-features", "matching-sentence-endings"
   **Completion:** "sentence-completion", "summary-completion-text", "summary-completion-list", "note-completion", "table-completion" (use pipe | for columns!), "flowchart-completion", "diagram-labeling"
   **Choice:** "multiple-choice" (one answer), "multiple-select" (multiple answers)
   **Other:** "short-answer"

**CRITICAL:** Extract EVERYTHING. Do not skip any passages or questions.

Text:
"""
${chunk.text}
"""

**OUTPUT (JSON object only, no markdown):**
{
  "passages": [
    {
      "id": "passage-1",
      "title": "Passage title",
      "content": "A  First paragraph of the passage...\\n\\nB  Second paragraph...\\n\\nC  Third paragraph...",
      "type": "text",
      "questionStart": 1,
      "questionEnd": 13,
      "wordCount": 500
    }
  ],
  "questions": [
    {
      "questionNumber": 1,
      "questionText": "Question text?",
      "type": "yes-no-not-given",
      "options": null,
      "answer": "",
      "passageId": "passage-1",
      "confidence": 95,
      "context": null
    }
  ],
  "answerKey": {
    "1": "YES",
    "2": "NO",
    "3": "NOT GIVEN"
  },
  "confidence": 90
}`;
  }

  /**
   * Build prompt for passages-only extraction (2-call split parsing - Call 1)
   */
  private buildPassagesOnlyPrompt(chunk: Chunk): string {
    return `You are an expert reading passage extractor for IELTS/TOEFL tests. Extract ONLY the reading passages from this document.

**YOUR TASK:**
Extract ALL passages with their metadata. Do NOT extract questions or answer keys.

Text:
"""
${chunk.text}
"""

**INSTRUCTIONS:**
1. **Identify Passages:**
   - Look for clear passage markers: "Passage 1", "Reading Passage", "Test 1 - Passage 1"
   - Or paragraph labels: (A), (B), (C) or long text blocks (300+ words)
   
2. **For Each Passage Extract:**
   - **id**: Unique ID (e.g., "passage-1", "passage-2")
   - **title**: Passage title or heading
   - **content**: COMPLETE passage text with PRESERVED formatting:
     * Separate paragraphs with \\n\\n (double newline)
     * KEEP paragraph labels (A, B, C, i, ii, etc.) at start of each paragraph
     * Do NOT merge into one continuous block
   - **type**: "text" (or "image" if diagram mentioned)
   - **questionStart**: First question number this passage covers
   - **questionEnd**: Last question number this passage covers
   - **wordCount**: Approximate word count
   
3. **Question Ranges:**
   - Look for "Questions 1-13" or similar markers near passages
   - If not explicit, estimate based on document structure
   - IELTS typical: Passage 1 = Q1-13, Passage 2 = Q14-26, Passage 3 = Q27-40

**OUTPUT (JSON object only, no markdown, MUST include confidence score):**
{
  "passages": [
    {
      "id": "passage-1",
      "title": "Climate Change",
      "content": "Full passage text here...",
      "type": "text",
      "questionStart": 1,
      "questionEnd": 13,
      "wordCount": 500
    },
    {
      "id": "passage-2",
      "title": "Ancient Rome",
      "content": "Full passage text here...",
      "type": "text",
      "questionStart": 14,
      "questionEnd": 26,
      "wordCount": 480
    }
  ],
  "confidence": 95
}`;
  }

  /**
   * Build prompt for questions+answers extraction (2-call split parsing - Call 2)
   */
  private buildQuestionsAndAnswersPrompt(chunk: Chunk): string {
    return `You are an expert quiz question and answer key parser for IELTS Reading tests. Extract ALL questions AND their answers from this document.

**YOUR TASK:**
Extract ALL questions with metadata AND extract the answer key. Combine them in one response.

Text:
"""
${chunk.text}
"""

**═══════════════════════════════════════════════════════════════**
**STEP 1: QUESTION TYPE CLASSIFICATION GUIDE (ESSENCE-BASED)**
**═══════════════════════════════════════════════════════════════**

**GROUP 1: TRUE/FALSE (Distinguish by FACTS vs OPINIONS)**
| Type | Key Phrase | What it Checks |
|------|-----------|---------------|
| "true-false-not-given" | "agree with the INFORMATION" | Facts in passage |
| "yes-no-not-given" | "agree with the CLAIMS/VIEWS" | Writer's opinions |

**GROUP 2: MATCHING (Distinguish by WHAT THEY MATCH TO)**
| Type | Match TO | Typical Instruction |
|------|----------|-------------------|
| "matching-headings" | Roman numerals (i-x) | "Choose the correct heading" |
| "matching-information" | Paragraph letters (A-G) | "Which paragraph contains..." |
| "matching-features" | Named entity list (people, theories) | "Match statements to persons" |
| "matching-sentence-endings" | Endings list (A-G) | "Complete with correct ending" |

**GROUP 3: COMPLETION (Distinguish by WORD SOURCE)**
| Type | Word Source | Key Indicator |
|------|------------|---------------|
| "sentence-completion" | From passage | "complete using words FROM THE PASSAGE" |
| "summary-completion-text" | From passage | Summary paragraph with blanks. MUST assign a 'summaryGroupId' (e.g. "sc-1") to all questions under the same instruction block. Increment (e.g. "sc-2") if a new summary instruction block appears in the same passage. |
| "summary-completion-list" | From box/list | "Choose from the BOX/LIST below". ⚠️ FIRST question MUST have ENTIRE summary paragraph with ALL blanks (______). Subsequent questions get empty questionText. MUST assign a 'summaryGroupId' (e.g. "sc-1") to all questions under the same instruction block. Increment (e.g. "sc-2") if a new summary instruction block appears in the same passage. NEVER put this property on non-summary questions. |
| "note-completion" | From passage | Notes/bullet format with blanks |
| "table-completion" | From passage | Table format with blanks — see TABLE FORMAT RULES above |
| "flowchart-completion" | From passage | Flowchart/diagram with blanks |
| "diagram-labeling" | From passage/list | Label parts of diagram |

**GROUP 4: CHOICE (Distinguish by NUMBER OF ANSWERS)**
| Type | Answers | Typical Instruction |
|------|---------|-------------------|
| "multiple-choice" | ONE | "Choose ONE letter A-D" |
| "multiple-select" | TWO+ | "Choose TWO letters A-E" |

**GROUP 5: OTHER**
| Type | Description | Examples |
|------|-------------|----------|
| "short-answer" | Questions in Q&A format starting with What/Who/Where/When/Which/How/Why | "Which part of some stepwells provided shade for people?", "What type of serious climatic event... is mentioned?" |

**⚠️ CRITICAL DISTINCTION: short-answer vs sentence-completion:**
- **SHORT-ANSWER**: Question format like "Which part provided shade?" "What type of event...?" "Who are frequent visitors?"
  → These are direct questions expecting a word/phrase answer from the passage
- **SENTENCE-COMPLETION**: Gap-fill format like "The shade was provided by ______" 
  → These have a blank (___) to fill in

**RULE:** If it starts with What/Who/Where/When/Which/How/Why AND ends with "?" → use "short-answer"
         If it has blanks (___) to fill → use "sentence-completion"

**═══════════════════════════════════════════════════════════════**
**STEP 2: EXTRACTION INSTRUCTIONS**
**═══════════════════════════════════════════════════════════════**

**A. QUESTIONS:**
1. Find numbered questions (1., 2., ... 40)
2. Preserve ORIGINAL question numbers
3. For each question extract:
   - **questionNumber**: Original number (1-40)
   - **questionText**: Complete question text
   - **type**: Use SPECIFIC type from guide above (NOT generic "completion" or "matching")
   - **sectionInstruction**: The FULL section instruction text that applies to this question group
     * e.g., "Do the following statements agree with the information given in Reading Passage 1? TRUE / FALSE / NOT GIVEN"
     * e.g., "Complete the sentences below. Choose NO MORE THAN ONE WORD from the passage for each answer."
     * Questions in the same section share the SAME sectionInstruction
   - **options**: Array of options for MCQ/matching, null for others
   - **answer**: Leave as empty string ""
   - **passageId**: Which passage it relates to
   - **confidence**: 0-100 confidence score
   - **context**: ALWAYS null

**B. ANSWER KEY:**
1. Find Answer Key section (at end)
2. Map each question number to its answer
3. Preserve exact format: "A", "YES", "rivers", etc.

**═══════════════════════════════════════════════════════════════**
**🔍 PRE-ANALYSIS: QUESTION GROUP DETECTION**
**═══════════════════════════════════════════════════════════════**

Before classifying individual questions, IDENTIFY QUESTION GROUPS that share options:

1. **Scan for shared option lists:**
   - "List of Endings" (A-G) → All questions in that section = **matching-sentence-endings**
   - "List of Headings" (i-xi) → All questions in that section = **matching-headings**
   - "List of People/Researchers" → All questions = **matching-features**

2. **Count questions sharing same options:**
   - If 5+ sentence beginnings share endings A-G → **matching-sentence-endings**
   - Example: Q31-35 all use "A-G endings" → ALL are matching-sentence-endings

3. **Group detection OVERRIDES individual analysis!**

**═══════════════════════════════════════════════════════════════**
**⚠️ COMMON MISTAKES TO AVOID**
**═══════════════════════════════════════════════════════════════**

1. ❌ Using generic "completion" → ✅ Use specific type (sentence-completion, note-completion, etc.)
2. ❌ Using generic "matching" → ✅ Use specific type (matching-headings, matching-features, etc.)
3. ❌ Confusing TFNG with YNNG → ✅ Check for "information" vs "claims/views"

4. ❌ Using "sentence-completion" for Q&A questions
   ✅ If question starts with What/Who/Where/When/Why/How/Which AND has "?" → **short-answer**
   ✅ Use "sentence-completion" ONLY for blank-fill statements (_____ gaps)

5. ❌ Using "sentence-completion" for shared ending questions (Q31-35 with A-G endings)
   ✅ If multiple questions share SAME endings list → **matching-sentence-endings**
   ✅ "sentence-completion" = individual sentences with passage words, NO shared options

6. ❌ Using "multiple-choice" for many options (5+)
   ✅ If 5-7 ending options shared across questions → **matching-sentence-endings**
   ✅ If 8-11 heading options (i-xi) → **matching-headings**
   ✅ "multiple-choice" = typically 4 options (A-D) per question

**OUTPUT (JSON object only, no markdown):**
{
  "questions": [
    {
      "questionNumber": 1,
      "questionText": "The writer claims that the main cause of climate change is human activity.",
      "type": "yes-no-not-given",
      "sectionInstruction": "Do the following statements agree with the claims of the writer in Reading Passage 1? YES / NO / NOT GIVEN",
      "options": null,
      "answer": "",
      "passageId": "passage-1",
      "confidence": 95,
      "context": null
    },
    {
      "questionNumber": 2,
      "questionText": "The colony was built near the ______.",
      "type": "sentence-completion",
      "sectionInstruction": "Complete the sentences below. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
      "options": null,
      "answer": "",
      "passageId": "passage-1",
      "confidence": 92,
      "context": null
    },
    {
      "questionNumber": 27,
      "questionText": "People go to art museums because they accept the value of seeing an original work of art. But they do not go to museums to read original manuscripts of novels, perhaps because the availability of novels has depended on ______ for so long, and also because with novels, the ______ are the most important thing.\\n\\nHowever, in historical times artists such as Leonardo were happy to instruct ______ to produce copies of their work.",
      "type": "summary-completion-list",
      "summaryGroupId": "sc-1",
      "sectionInstruction": "Complete the summary using the list of words, A-L, below.",
      "options": ["A. mechanical", "B. ideas", "C. assistants", "D. colour"],
      "answer": "",
      "passageId": "passage-3",
      "confidence": 95,
      "context": null
    },
    {
      "questionNumber": 28,
      "questionText": "",
      "type": "summary-completion-list",
      "summaryGroupId": "sc-1",
      "sectionInstruction": "Complete the summary using the list of words, A-L, below.",
      "options": ["A. mechanical", "B. ideas"],
      "answer": "",
      "passageId": "passage-3",
      "confidence": 95,
      "context": null
    }
  ],
  "answerKey": {
    "1": "YES",
    "2": "greenhouse gases",
    "3": "NOT GIVEN"
  },
  "confidence": 90
}`;
  }

  // extractJSON, sanitizeJsonControlChars, aggressiveJsonRepair, repairTruncatedJson
  // are now imported from ../test-creation/ai-json-repair.ts

  /**
   * Normalize result (question types, answers)
   */
  private normalizeResult(result: AIParseResult): AIParseResult {
    return {
      ...result,
      questions: result.questions.map(q => ({
        ...q,
        type: normalizeQuestionType(q.type),
        answer: normalizeAnswer(q.answer, q.type),
      })),
    };
  }

  /**
   * Parse passages only (2-call split parsing - Call 1)
   */
  async parsePassagesOnly(text: string): Promise<Result<{ passages: AIParseResult['passages']; confidence: number; }>> {
    // Lazy initialize on first use
    if (this.clients.length === 0 && !this.sdkLoaded) {
      await this.initialize();
    }

    if (this.clients.length === 0) {
      return { success: false, error: 'Groq clients not initialized' };
    }

    // Clean up expired exhausted keys
    this.cleanupExhaustedKeys();

    // Round-robin key selection
    this.currentKeyIndex = this.getNextAvailableKeyRoundRobin();
    console.log(`📤 [Groq parsePassagesOnly] Using key ${this.currentKeyIndex + 1}/${this.clients.length} (round-robin)`);

    // Try parsing with retry on rate limit
    return this.attemptParsePassagesWithRetry(text);
  }

  /**
   * Attempt to parse passages with rate limit retry logic
   */
  private async attemptParsePassagesWithRetry(text: string): Promise<Result<{ passages: AIParseResult['passages']; confidence: number; }>> {
    const result = await this.attemptParsePassages(text);

    if (result.success) {
      return result;
    }

    // Check for rate limit error
    const isRateLimitError = result.error?.includes('429') ||
      result.error?.includes('rate limit') ||
      result.error?.includes('quota');

    if (isRateLimitError) {
      console.warn(`⚠️ [Groq parsePassagesOnly] Rate limit on key ${this.currentKeyIndex + 1}, trying other keys...`);
      this.markKeyExhausted(this.currentKeyIndex, 'Rate limit');

      // Try remaining keys
      for (let attempt = 0; attempt < this.clients.length - 1; attempt++) {
        const nextKey = this.getNextAvailableKey();
        if (nextKey === -1) {
          console.warn('⚠️ All Groq API keys are exhausted');
          break;
        }

        this.currentKeyIndex = nextKey;
        console.log(`🔄 [Groq parsePassagesOnly] Trying key ${this.currentKeyIndex + 1}/${this.clients.length}`);

        const retryResult = await this.attemptParsePassages(text);
        if (retryResult.success) {
          return retryResult;
        }

        if (retryResult.error?.includes('429') || retryResult.error?.includes('rate limit')) {
          this.markKeyExhausted(this.currentKeyIndex, 'Rate limit');
          continue;
        }

        return retryResult;
      }

      return {
        success: false,
        error: 'All Groq API keys exhausted or rate-limited',
      };
    }

    return result;
  }

  /**
   * Single attempt to parse passages
   */
  private async attemptParsePassages(text: string): Promise<Result<{ passages: AIParseResult['passages']; confidence: number; }>> {
    try {
      this.status.requestCount++;
      this.status.lastRequestTime = Date.now();

      const client = this.clients[this.currentKeyIndex];
      if (!client) {
        throw new Error('No client available');
      }

      const chunk = { id: 'passages-only', number: 1, text, wordCount: text.split(/\s+/).length, startIndex: 0, endIndex: text.length, isLast: true };
      const completion = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are an expert passage extractor. Return only valid JSON, no markdown.' },
          { role: 'user', content: this.buildPassagesOnlyPrompt(chunk) },
        ],
        temperature: 0.1,
        max_tokens: 4096, // Smaller response (passages only)
      });

      const text_response = completion.choices[0]?.message?.content;
      if (!text_response) {
        throw new Error('Empty response from Groq');
      }

      const parsed = extractJSON(text_response);
      const validation = validatePassagesOnly(parsed);

      if (!validation.success) {
        return {
          success: false,
          error: `Invalid response format: ${validation.error}`,
        };
      }

      return {
        success: true,
        data: validation.data,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.status.lastError = errorMessage;

      return {
        success: false,
        error: `Passages parsing failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Parse questions and answers (2-call split parsing - Call 2)
   */
  async parseQuestionsAndAnswers(text: string): Promise<Result<{ questions: AIParseResult['questions']; answerKey: AIParseResult['answerKey']; confidence: number; }>> {
    // Lazy initialize on first use
    if (this.clients.length === 0 && !this.sdkLoaded) {
      await this.initialize();
    }

    if (this.clients.length === 0) {
      return { success: false, error: 'Groq clients not initialized' };
    }

    // Clean up expired exhausted keys
    this.cleanupExhaustedKeys();

    // Round-robin key selection
    this.currentKeyIndex = this.getNextAvailableKeyRoundRobin();
    console.log(`📤 [Groq parseQuestionsAndAnswers] Using key ${this.currentKeyIndex + 1}/${this.clients.length} (round-robin)`);

    // Try parsing with retry on rate limit
    return this.attemptParseQuestionsWithRetry(text);
  }

  /**
   * Attempt to parse questions with rate limit retry logic
   */
  private async attemptParseQuestionsWithRetry(text: string): Promise<Result<{ questions: AIParseResult['questions']; answerKey: AIParseResult['answerKey']; confidence: number; }>> {
    const result = await this.attemptParseQuestions(text);

    if (result.success) {
      return result;
    }

    // Check for rate limit error
    const isRateLimitError = result.error?.includes('429') ||
      result.error?.includes('rate limit') ||
      result.error?.includes('quota');

    if (isRateLimitError) {
      console.warn(`⚠️ [Groq parseQuestionsAndAnswers] Rate limit on key ${this.currentKeyIndex + 1}, trying other keys...`);
      this.markKeyExhausted(this.currentKeyIndex, 'Rate limit');

      // Try remaining keys
      for (let attempt = 0; attempt < this.clients.length - 1; attempt++) {
        const nextKey = this.getNextAvailableKey();
        if (nextKey === -1) {
          console.warn('⚠️ All Groq API keys are exhausted');
          break;
        }

        this.currentKeyIndex = nextKey;
        console.log(`🔄 [Groq parseQuestionsAndAnswers] Trying key ${this.currentKeyIndex + 1}/${this.clients.length}`);

        const retryResult = await this.attemptParseQuestions(text);
        if (retryResult.success) {
          return retryResult;
        }

        if (retryResult.error?.includes('429') || retryResult.error?.includes('rate limit')) {
          this.markKeyExhausted(this.currentKeyIndex, 'Rate limit');
          continue;
        }

        return retryResult;
      }

      return {
        success: false,
        error: 'All Groq API keys exhausted or rate-limited',
      };
    }

    return result;
  }

  /**
   * Single attempt to parse questions
   */
  private async attemptParseQuestions(text: string): Promise<Result<{ questions: AIParseResult['questions']; answerKey: AIParseResult['answerKey']; confidence: number; }>> {
    try {
      this.status.requestCount++;
      this.status.lastRequestTime = Date.now();

      const client = this.clients[this.currentKeyIndex];
      if (!client) {
        throw new Error('No client available');
      }

      const chunk = { id: 'questions-answers', number: 1, text, wordCount: text.split(/\s+/).length, startIndex: 0, endIndex: text.length, isLast: true };
      const completion = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are an expert question and answer parser. Return only valid JSON, no markdown.' },
          { role: 'user', content: this.buildQuestionsAndAnswersPrompt(chunk) },
        ],
        temperature: 0.1,
        max_tokens: 8192, // Larger response (questions + answers)
      });

      const text_response = completion.choices[0]?.message?.content;
      if (!text_response) {
        throw new Error('Empty response from Groq');
      }

      const parsed = extractJSON(text_response);
      const validation = validateQuestionsAndAnswers(parsed);

      if (!validation.success) {
        return {
          success: false,
          error: `Invalid response format: ${validation.error}`,
        };
      }

      // Normalize question types and answers
      const normalized = {
        ...validation.data,
        questions: validation.data.questions.map((q: AIParseResult['questions'][0]) => ({
          ...q,
          type: normalizeQuestionType(q.type),
          answer: normalizeAnswer(q.answer, q.type),
        })),
      };

      return {
        success: true,
        data: normalized,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.status.lastError = errorMessage;

      return {
        success: false,
        error: `Questions+Answers parsing failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Grade a writing answer (Phase 2 — Task 6.3)
   */
  async gradeWritingAnswer(
    studentAnswer: string,
    modelAnswers: string[],
    originalSentence: string,
    context?: { sentenceStarter?: string; keyword?: string }
  ): Promise<Result<{ score: number; confidence: number; feedback: string }>> {
    if (this.clients.length === 0 && !this.sdkLoaded) await this.initialize();
    if (this.clients.length === 0) return { success: false, error: 'Groq clients not initialized' };

    this.cleanupExhaustedKeys();
    this.currentKeyIndex = this.getNextAvailableKeyRoundRobin();

    try {
      this.status.requestCount++;
      this.status.lastRequestTime = Date.now();
      const client = this.clients[this.currentKeyIndex];
      if (!client) throw new Error('No client available');

      const contextStr = context?.sentenceStarter
        ? `The student should continue the sentence starting with: "${context.sentenceStarter}".`
        : context?.keyword
          ? `The student should rewrite using the word: "${context.keyword}".`
          : '';

      const prompt = `You are an expert English teacher grading a sentence rewriting exercise.

Original sentence: "${originalSentence}"
Model answer(s): ${modelAnswers.map(a => `"${a}"`).join(', ')}
Student answer: "${studentAnswer}"
${contextStr}

Is the student's rewrite semantically equivalent to the model answer(s)?
Consider: grammar correctness, meaning preservation, natural English.

Respond with JSON only:
{"score": 0-100, "confidence": 0-100, "feedback": "brief constructive feedback"}`;

      const completion = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are an English grading expert. Return only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 256,
      });

      const text = completion.choices[0]?.message?.content;
      if (!text) throw new Error('Empty response from Groq');

      const parsed = extractJSON(text) as { score: number; confidence: number; feedback: string };

      return {
        success: true,
        data: {
          score: typeof parsed.score === 'number' ? parsed.score : 0,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
          feedback: parsed.feedback || '',
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.status.lastError = msg;
      if (msg.includes('429') || msg.includes('rate limit')) {
        this.markKeyExhausted(this.currentKeyIndex, 'Rate limit');
      }
      return { success: false, error: `Writing grading failed: ${msg}` };
    }
  }

  /**
   * Suggest alternative correct answers (Phase 2 — Task 6.6c)
   */
  async suggestAlternativeAnswers(
    originalSentence: string,
    existingAnswers: string[],
    questionType: 'fill-in' | 'writing',
    context?: { sentenceStarter?: string; keyword?: string }
  ): Promise<Result<Array<{ answer: string; confidence: number }>>> {
    if (this.clients.length === 0 && !this.sdkLoaded) await this.initialize();
    if (this.clients.length === 0) return { success: false, error: 'Groq clients not initialized' };

    this.cleanupExhaustedKeys();
    this.currentKeyIndex = this.getNextAvailableKeyRoundRobin();

    try {
      this.status.requestCount++;
      this.status.lastRequestTime = Date.now();
      const client = this.clients[this.currentKeyIndex];
      if (!client) throw new Error('No client available');

      const contextStr = context?.sentenceStarter
        ? `Sentence starter: "${context.sentenceStarter}".`
        : context?.keyword
          ? `Keyword to use: "${context.keyword}".`
          : '';

      const prompt = `Given this sentence: "${originalSentence}"
And these existing correct answers: ${existingAnswers.map(a => `"${a}"`).join(', ')}
${contextStr}

Suggest 2-3 additional plausible correct answers for a ${questionType} English grammar question.
Only suggest answers that are grammatically correct and semantically equivalent.

Respond with JSON array only:
[{"answer": "suggested answer", "confidence": 0-100}]`;

      const completion = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are an English teacher. Return only valid JSON array.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 512,
      });

      const text = completion.choices[0]?.message?.content;
      if (!text) throw new Error('Empty response from Groq');

      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const suggestions = Array.isArray(parsed)
        ? parsed.map((s: any) => ({
          answer: String(s.answer || ''),
          confidence: typeof s.confidence === 'number' ? s.confidence : 70,
        }))
        : [];

      return { success: true, data: suggestions };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.status.lastError = msg;
      if (msg.includes('429') || msg.includes('rate limit')) {
        this.markKeyExhausted(this.currentKeyIndex, 'Rate limit');
      }
      return { success: false, error: `Suggestion generation failed: ${msg}` };
    }
  }

  /**
   * Get provider status
   */
  getStatus(): ProviderStatus {
    return { ...this.status };
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<Result> {
    // Lazy initialize on first use
    if (this.clients.length === 0 && !this.sdkLoaded) {
      await this.initialize();
    }

    if (this.clients.length === 0) {
      return { success: false, error: 'Client not initialized' };
    }

    try {
      const client = this.clients[0];
      if (!client) {
        return { success: false, error: 'No client available' };
      }
      await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 10,
      });
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }

  /**
   * Reset error state
   */
  reset(): void {
    this.status.lastError = null;
  }
}

/**
 * Singleton instance
 */
export const groqProvider = new GroqProvider();
