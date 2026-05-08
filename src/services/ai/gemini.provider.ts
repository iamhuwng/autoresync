import type { Chunk, ReadingLabeledOption } from '../../types/document.types';
import type { Result } from '../../types/result.types';
import type {
  IAIService,
  AIParseResult,
  ProviderStatus,
  AIStructuredGenerationOptions,
  WritingSuggestionBatchRequest,
  WritingSuggestionBatchResponse,
  WritingSuggestionScope,
} from './ai.service';
import { loadAllGeminiApiKeys } from '../../config/env.config';
import { validateAIResponse, validatePassagesOnly, validateQuestionsAndAnswers, normalizeQuestionType, normalizeAnswer } from './response.validator';
import { benchKey, isKeyBenched } from '../key-cooldown.service';
import { jsonrepair } from 'jsonrepair';

// Type-only import to avoid eager loading
type GoogleGenerativeAI = any;

/**
 * Gemini AI provider implementation
 * Supports multi-key rotation for rate limit handling
 * Uses dynamic imports to avoid loading the large SDK until needed
 */
export class GeminiProvider implements IAIService {
  private clients: GoogleGenerativeAI[] = [];
  private currentKeyIndex = 0;
  private apiKeys: string[] = [];
  private sdkLoaded = false;
  private sdkModule: any | null = null;
  private sdkLoadPromise: Promise<any> | null = null;

  // Round-robin request counter for load balancing
  private requestCount = 0;

  private status: ProviderStatus = {
    name: 'gemini',
    available: false,
    lastError: null,
    requestCount: 0,
    lastRequestTime: null,
  };

  constructor() {
    // Don't initialize eagerly - wait until first use
  }

  /**
   * Lazy load the Gemini SDK
   */
  private async loadSDK(): Promise<any> {
    if (this.sdkLoaded && this.sdkModule) {
      return this.sdkModule;
    }

    if (!this.sdkLoadPromise) {
      this.sdkLoadPromise = import('@google/generative-ai').then((module) => {
        this.sdkLoaded = true;
        this.sdkModule = module;
        return module;
      });
    }

    return this.sdkLoadPromise;
  }

  private haveApiKeysChanged(nextKeys: string[]): boolean {
    if (nextKeys.length !== this.apiKeys.length) {
      return true;
    }

    return nextKeys.some((key, index) => key !== this.apiKeys[index]);
  }

  private isRateLimitError(errorMessage?: string): boolean {
    return !!errorMessage && (
      errorMessage.includes('429') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('quota')
    );
  }

  private isTransientAvailabilityError(errorMessage?: string): boolean {
    return !!errorMessage && (
      errorMessage.includes('503') ||
      errorMessage.includes('high demand') ||
      errorMessage.includes('temporarily unavailable')
    );
  }

  /**
   * Initialize Gemini clients with all available API keys.
   * `forceRefresh` reloads the current key inventory so long-lived sessions
   * can pick up Firestore-managed keys that became available after first init.
   */
  private async initialize(forceRefresh = false): Promise<void> {
    try {
      // Load SDK first
      const { GoogleGenerativeAI } = await this.loadSDK();

      const nextKeys = forceRefresh || this.clients.length === 0
        ? await loadAllGeminiApiKeys()
        : this.apiKeys;

      if (nextKeys.length === 0) {
        throw new Error('No Gemini API keys configured');
      }

      const shouldRebuildClients = this.clients.length === 0 || this.haveApiKeysChanged(nextKeys);
      this.apiKeys = nextKeys;

      if (shouldRebuildClients) {
        this.clients = this.apiKeys.map(key => new GoogleGenerativeAI(key));
        this.currentKeyIndex = 0;
        const action = forceRefresh ? 'refreshed' : 'initialized';
        console.log(`✅ Gemini provider ${action} with ${this.apiKeys.length} API key(s)`);
      }

      this.status.available = true;
      this.status.lastError = null;
    } catch (error) {
      this.status.available = false;
      this.status.lastError = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Gemini initialization failed:', error);
    }
  }

  /**
   * Parse chunk with Gemini (with round-robin load balancing and rate limit handling)
   */
  async parseChunk(chunk: Chunk): Promise<Result<AIParseResult>> {
    await this.initialize(true);

    if (this.clients.length === 0) {
      return {
        success: false,
        error: 'Gemini clients not initialized',
      };
    }

    // ✅ Round-robin key selection BEFORE request (load balancing)
    this.currentKeyIndex = this.getNextAvailableKeyRoundRobin();
    console.log(`📤 Using Gemini API key ${this.currentKeyIndex + 1}/${this.clients.length} (round-robin)`);

    // Try with selected key
    const result = await this.attemptParse(chunk);

    if (result.success) {
      return result;
    }

    // Separate error types
    const isRateLimitError = this.isRateLimitError(result.error);
    const isTransientAvailabilityError = this.isTransientAvailabilityError(result.error);

    const isTruncationError = result.error?.includes('Incomplete') ||
      result.error?.includes('truncated') ||
      result.error?.includes('Partial response') ||
      result.error?.includes('empty response');

    // For truncation errors, STOP (don't waste other keys)
    if (isTruncationError) {
      console.error('❌ Response truncated (token limit). Not rotating keys.');
      console.error('   This is a document size issue, not a rate limit issue.');
      return {
        success: false,
        error: 'Response truncated - document may be too large for single-pass parsing',
      };
    }

    // For rate limit errors, try other keys
    if (isRateLimitError || isTransientAvailabilityError) {
      const retryReason = isTransientAvailabilityError ? 'temporary provider demand' : 'rate limit';
      console.warn(`⚠️ ${retryReason} on key ${this.currentKeyIndex + 1}, trying other keys...`);

      if (isRateLimitError) {
        this.markKeyExhausted(this.currentKeyIndex, 'Rate limit');
      }

      // Try remaining keys
      for (let attempt = 0; attempt < this.clients.length - 1; attempt++) {
        const nextKey = this.getNextAvailableKey();
        if (nextKey === -1) {
          console.warn('⚠️ All API keys are exhausted');
          break;
        }

        this.currentKeyIndex = nextKey;
        console.log(`🔄 Trying key ${this.currentKeyIndex + 1}/${this.clients.length}`);

        const retryResult = await this.attemptParse(chunk);

        if (retryResult.success) {
          return retryResult;
        }

        if (this.isRateLimitError(retryResult.error)) {
          this.markKeyExhausted(this.currentKeyIndex, 'Rate limit');
          continue;
        }

        if (this.isTransientAvailabilityError(retryResult.error)) {
          continue;
        }

        // Non-rate-limit error, stop trying other keys
        return retryResult;
      }

      return {
        success: false,
        error: 'All Gemini API keys exhausted or rate-limited',
      };
    }

    // For other errors, don't try other keys
    return result;
  }

  /**
   * Attempt to parse with current key
   */
  private async attemptParse(chunk: Chunk): Promise<Result<AIParseResult>> {
    try {
      this.status.requestCount++;
      this.status.lastRequestTime = Date.now();

      const client = this.clients[this.currentKeyIndex];
      if (!client) {
        throw new Error('No client available');
      }

      const model = client.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.1, // Low temperature for consistent parsing
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 65536, // Gemini 2.5 Flash supports up to 65,536 tokens
          responseMimeType: 'application/json', // Force JSON output
        },
      });

      const prompt = this.buildPrompt(chunk);
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // Check for empty response
      if (!text || text.trim().length === 0) {
        throw new Error('Gemini returned empty response (possible quota/rate limit or content filter)');
      }

      // Parse JSON response
      const parsed = this.extractJSON(text);

      // Log parsed structure for debugging
      const parsedObj = parsed as Record<string, any>;
      const responseEnd = text.substring(Math.max(0, text.length - 100));
      console.log('📊 Parsed AI response structure:', {
        hasPassages: 'passages' in parsedObj,
        hasQuestions: 'questions' in parsedObj,
        hasAnswerKey: 'answerKey' in parsedObj,
        hasConfidence: 'confidence' in parsedObj,
        keys: Object.keys(parsedObj),
        responseLength: text.length,
        responseEnd: responseEnd.length > 50 ? `...${responseEnd.substring(responseEnd.length - 50)}` : responseEnd,
      });

      // Detect truncated responses (missing required fields)
      if (!('questions' in parsedObj) || !('answerKey' in parsedObj) || !('confidence' in parsedObj)) {
        throw new Error('Incomplete response - likely truncated due to token limit or rate limiting');
      }

      // Validate with Zod
      const validation = validateAIResponse(parsed);

      if (!validation.success) {
        console.error('❌ Validation details:', validation.error);
        console.error('📄 Actual response preview:', JSON.stringify(parsed).substring(0, 500));
        return {
          success: false,
          error: `Invalid response format: ${validation.error}`,
        };
      }

      // Post-process: normalize question types and answers
      const normalized = this.normalizeResult(validation.data);

      return {
        success: true,
        data: normalized,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.status.lastError = errorMessage;

      return {
        success: false,
        error: `Gemini parsing failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Build parsing prompt for Gemini
   * Uses focused prompts based on chunk type for better accuracy
   */
  private buildPrompt(chunk: Chunk): string {
    // Route to specific prompt based on chunk type
    switch (chunk.id) {
      case 'passages':
        return this.buildPassagesPrompt(chunk);
      case 'questions':
        return this.buildQuestionsPrompt(chunk);
      case 'answerKey':
        return this.buildAnswerKeyPrompt(chunk);
      default:
        // Fallback to combined prompt for unknown types (including 'section-extraction')
        return this.buildCombinedPrompt(chunk);
    }
  }

  /**
   * Build prompt specifically for parsing passages
   */
  private buildPassagesPrompt(chunk: Chunk): string {
    return `You are a reading passage extractor. Extract ONLY reading passages from this text.

Text:
"""
${chunk.text}
"""

**INSTRUCTIONS:**
1. Find passages with clear markers like "Passage:", "Reading:", or paragraph labels (A, B, C)
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
  "passages": [
    {
      "id": "passage-1",
      "title": "Passage Title",
      "content": "A  First paragraph text here...\\n\\nB  Second paragraph text here...\\n\\nC  Third paragraph text here...",
      "type": "text",
      "questionStart": 1,
      "questionEnd": 10,
      "wordCount": 450
    }
  ],
  "questions": [],
  "answerKey": {},
  "confidence": 95
}`;
  }

  /**
   * Build prompt specifically for parsing questions
   * Uses essence-based IELTS type classification
   */
  private buildQuestionsPrompt(chunk: Chunk): string {
    return `You are an IELTS question parser. Extract ALL questions from this text with accurate type classification.

Text:
"""
${chunk.text}
"""

**INSTRUCTIONS:**
1. Preserve ORIGINAL question numbers (don't renumber)
2. Classify question types ACCURATELY using the list below
3. Extract options for multiple-choice and matching questions
4. For completion: PRESERVE word limits in questionText ("ONE WORD ONLY", "NO MORE THAN TWO WORDS")

**QUESTION TYPES (use EXACT names):**

**TRUE/FALSE TYPES - Key Distinction: FACTS vs OPINIONS**
- "true-false-not-given" - FACTS: "agree with the INFORMATION given" (TRUE/FALSE/NOT GIVEN)
- "yes-no-not-given" - OPINIONS: "agree with the CLAIMS/VIEWS of the writer" (YES/NO/NOT GIVEN)

**MATCHING TYPES - Key Distinction: WHAT THEY MATCH TO**
- "matching-headings" - MAIN IDEA: "Choose the correct HEADING" (match to heading list i-x)
- "matching-information" - DETAILS: "Which PARAGRAPH/SECTION contains" (match to paragraph letters A-G)
- "matching-features" - ENTITIES: "Match statement to PERSON/THEORY" (match to list of names)
- "matching-sentence-endings" - COMPLETE: "Complete sentence with correct ENDING" (match to endings)

**COMPLETION TYPES - Key Distinction: WORD SOURCE**
- "completion" - Fill blanks using words FROM PASSAGE (preserve word limit!)
- "summary-completion-list" - Fill blanks from PROVIDED WORD BANK (A-H). ⚠️ FIRST question MUST contain the ENTIRE summary paragraph with ALL blanks (______). Subsequent questions get empty questionText "".
- "table-completion" - Fill table cells. Use pipe (|) in questionText to preserve column structure. Put headers in sectionInstruction with "TABLE_HEADERS:" prefix. 🚫 NEVER use questionNumber: 0.

**CHOICE TYPES - Key Distinction: NUMBER OF ANSWERS**
- "multiple-choice" - ONE answer: "Choose the correct letter"
- "multiple-select" - TWO+ answers: "Choose TWO/THREE letters"

**OTHER TYPES**
- "short-answer" - Q&A format: "What/When/Where/Who...?"
- "diagram-labeling" - Label diagram/map/plan parts

**MATCHING OPTIONS EXTRACTION:**
1. For matching-headings: Extract from "List of Headings" (i. xxx, ii. xxx...)
2. For matching-information: INFER from "sections A-G" → ["A","B","C","D","E","F","G"]
3. For matching-features: Extract from "List of People/Names" (A. xxx, B. xxx...)
4. For matching-sentence-endings: Extract from "List of Endings"

**STRUCTURED LABEL CONTRACT:**
- For any label-bearing option list, preserve the source labels as structured objects in "labeledOptions"
- Each labeled option must be shaped like { "label": "ii", "text": "The spread of cities" }
- Set "optionLabelFormat" to "roman", "letter", or "number" when labels exist
- If you also include "options", it must contain text only with no embedded labels
- Never duplicate the label inside the option text
- For unlabeled questions, return "labeledOptions": null and "optionLabelFormat": null

**OUTPUT (JSON object only, no markdown):**
{
  "passages": [],
  "questions": [
    {
      "questionNumber": 1,
      "questionText": "Question text here?",
      "type": "matching-headings",
      "options": null,
      "labeledOptions": [
        { "label": "ii", "text": "The spread of cities" },
        { "label": "iv", "text": "The dead" },
        { "label": "ix", "text": "The cities" }
      ],
      "optionLabelFormat": "roman",
      "answer": "",
      "confidence": 95,
      "context": null
    }
  ],
  "answerKey": {},
  "confidence": 90
}`;
  }

  /**
   * Build prompt specifically for parsing answer keys
   */
  private buildAnswerKeyPrompt(chunk: Chunk): string {
    return `You are an answer key parser. Extract answer key mappings from this text.

Text:
"""
${chunk.text}
"""

**INSTRUCTIONS:**
1. Find answer key section (usually labeled "Answers:", "Answer Key:", or similar)
2. Map question numbers to their correct answers
3. Preserve exact answer text (case-sensitive for True/False/Not Given)
4. If no answer key found, return empty object

**OUTPUT (JSON object only, no markdown):**
{
  "passages": [],
  "questions": [],
  "answerKey": {
    "1": "A",
    "2": "B",
    "3": "True"
  },
  "confidence": 95
}`;
  }

  /**
   * Build combined prompt (for interleaved IELTS/TOEFL format)
   */
  private buildCombinedPrompt(chunk: Chunk): string {
    return `You are an expert quiz parser. Extract passages, questions, and answer key. Classify question types accurately.

Text:
"""
${chunk.text}
"""

**QUESTION TYPES:**
- "multiple-choice" - One answer from options (A/B/C/D)
- "yes-no-not-given" - YES/NO/NOT GIVEN
- "true-false-not-given" - True/False/Not Given
- "completion" - Fill in blank (______) 
- "matching" - Match items to people/categories
- "matching-headings" - Choose correct heading for sections
- "matching-information" - Which section contains information
- "matching-features" - Match statements to people
- "matching-sentence-endings" - Complete sentences with endings

**⚠️ CRITICAL FORMATTING RULES for passage "content" field:**
- PRESERVE paragraph breaks: Separate paragraphs with \\n\\n (double newline)
- PRESERVE paragraph labels: Keep A, B, C, i, ii, iii, Section X, etc. at start of each paragraph
- Do NOT merge all text into one continuous block
- Students need paragraph labels to answer "Which paragraph contains..." questions

**OUTPUT (JSON only, no markdown):**
{
  "passages": [
    {
      "id": "passage-1",
      "title": "Passage title",
      "content": "A  First paragraph of the passage...\\n\\nB  Second paragraph of the passage...\\n\\nC  Third paragraph...",
      "type": "text",
      "questionStart": 1,
      "questionEnd": 13,
      "wordCount": 500
    }
  ],
  "questions": [
    {
      "questionNumber": 1,
      "questionText": "Question text",
      "type": "multiple-choice",
      "options": null,
      "labeledOptions": [
        { "label": "A", "text": "first option text" },
        { "label": "B", "text": "second option text" }
      ],
      "optionLabelFormat": "letter",
      "answer": "",
      "passageId": "passage-1",
      "confidence": 95,
      "context": null
    }
  ],
  "answerKey": {
    "1": "YES",
    "2": "temperature"
  },
  "confidence": 90
}

**CRITICAL:**
- Classify question types accurately
- Extract ALL content
- Keep original question numbers
- Always include all 4 fields (passages, questions, answerKey, confidence)
- PRESERVE paragraph structure in passage content (\\n\\n between paragraphs)`;
  }

  /**
   * Build prompt for passages-only extraction (2-call split parsing - Call 1)
   */
  private buildPassagesOnlyPrompt(chunk: Chunk): string {
    return `You are an expert reading passage extractor for IELTS/TOEFL tests. Extract ONLY the reading passages from this document.

**YOUR TASK:**
Extract ALL passages with their metadata. Do NOT extract questions or answer keys.

⚠️ **CRITICAL: EXTRACT ALL PASSAGES - DO NOT STOP EARLY!**
- IELTS tests typically have 3 passages (40 questions total)
- Passage 1: Questions 1-13
- Passage 2: Questions 14-26  
- Passage 3: Questions 27-40
- Make sure you include ALL passages, even if the document is long!

Text:
"""
${chunk.text}
"""

**INSTRUCTIONS:**
1. **Identify ALL Passages:**
   - Look for clear passage markers: "Passage 1", "Reading Passage", "Test 1 - Passage 1", "Test 1 - Passage 2", "Test 1 - Passage 3"
   - Or paragraph labels: (A), (B), (C) or long text blocks (300+ words)
   - Scan the ENTIRE document - don't stop after 1 or 2 passages!
   
2. **For Each Passage Extract:**
   - **id**: Unique ID (e.g., "passage-1", "passage-2", "passage-3")
   - **title**: Passage title or heading
   - **content**: COMPLETE passage text with PRESERVED FORMATTING (see rules below!)
   - **type**: "text" (or "image" if diagram mentioned)
   - **questionStart**: First question number this passage covers
   - **questionEnd**: Last question number this passage covers
   - **wordCount**: Approximate word count
   
3. **Question Ranges:**
   - Look for "Questions 1-13", "Questions 14-26", "Questions 27-40" markers near passages
   - If not explicit, estimate based on document structure
   - IELTS typical: Passage 1 = Q1-13, Passage 2 = Q14-26, Passage 3 = Q27-40

**═══════════════════════════════════════════════════════════════**
**⚠️ CRITICAL: PASSAGE CONTENT FORMATTING RULES**
**═══════════════════════════════════════════════════════════════**

The "content" field MUST preserve the original document structure. Students need to read the passage as it appears in the original test paper.

**RULE 1: PRESERVE PARAGRAPH BREAKS**
- Separate paragraphs with \\n\\n (double newline)
- Each paragraph should be on its own block
- Do NOT merge paragraphs into one continuous block of text

**RULE 2: PRESERVE PARAGRAPH LABELS/MARKERS**
- If paragraphs have labels like A, B, C, D, E, F, G → KEEP THEM at the start of each paragraph
- If paragraphs have numbers like 1, 2, 3 → KEEP THEM
- If paragraphs have roman numerals like i, ii, iii → KEEP THEM
- If paragraphs have "Section A", "Section B" → KEEP THEM
- If paragraphs have "Paragraph A" or "(A)" → KEEP THEM
- These labels are ESSENTIAL because questions like "Which paragraph contains..." reference them!

**RULE 3: PRESERVE SECTION HEADINGS**
- Keep any bold headings, section titles, or subheadings
- These provide structure students need for navigation

**RULE 4: FORMAT EXAMPLE**
✅ CORRECT content format:
"The Rise of Urban Farming\\n\\nA  In recent years, urban farming has gained significant popularity in major cities around the world. The concept involves growing food in urban environments...\\n\\nB  One of the primary drivers behind this movement is the increasing awareness of food sustainability. As global populations continue to rise...\\n\\nC  Critics of urban farming point to several limitations. The scale of production is often insufficient..."

❌ WRONG content format (all merged, no labels):
"In recent years, urban farming has gained significant popularity in major cities around the world. The concept involves growing food in urban environments... One of the primary drivers behind this movement is the increasing awareness of food sustainability. As global populations continue to rise... Critics of urban farming point to several limitations. The scale of production is often insufficient..."

**RULE 5: IF NO LABELS EXIST**
- Even if paragraphs have no labels (A/B/C), still separate them with \\n\\n
- Detect paragraph boundaries from the original text structure

**OUTPUT (JSON object only, no markdown, MUST include confidence score):**
{
  "passages": [
    {
      "id": "passage-1",
      "title": "Climate Change",
      "content": "A  The Earth's climate has changed throughout history...\\n\\nB  In the last century, human activities have accelerated...\\n\\nC  Scientists have proposed various solutions...",
      "type": "text",
      "questionStart": 1,
      "questionEnd": 13,
      "wordCount": 500
    },
    {
      "id": "passage-2",
      "title": "Ancient Rome",
      "content": "The Roman Empire was one of the largest...\\n\\nThe decline of Rome began in the 3rd century...\\n\\nHistorians have debated the causes...",
      "type": "text",
      "questionStart": 14,
      "questionEnd": 26,
      "wordCount": 480
    },
    {
      "id": "passage-3",
      "title": "Modern Technology",
      "content": "i  Technology has transformed every aspect of modern life...\\n\\nii  The rise of artificial intelligence presents both opportunities...\\n\\niii  Privacy concerns have grown alongside technological advances...",
      "type": "text",
      "questionStart": 27,
      "questionEnd": 40,
      "wordCount": 520
    }
  ],
  "confidence": 95
}

⚠️ **REMEMBER:**
1. Extract ALL passages from the document, not just the first 1 or 2!
2. PRESERVE paragraph breaks (\\n\\n between paragraphs)!
3. PRESERVE paragraph labels (A/B/C, 1/2/3, i/ii/iii, Section X)!
4. Students MUST be able to identify which paragraph is which!`;
  }

  /**
   * Build prompt for questions+answers extraction (2-call split parsing - Call 2)
   * 
   * Uses essence-based type detection derived from official IELTS documentation.
   * Key distinctions:
   * - TFNG vs YNNG: Facts (information) vs Opinions (claims/views)
   * - Matching types: By what they match TO (paragraphs, entities, headings, endings)
   * - Completion types: Word bank (list) vs Passage words (text)
   * 
   * @see type-classifier.service.ts for rule-based fallback patterns
   */
  private buildQuestionsAndAnswersPrompt(chunk: Chunk): string {
    return `You are an expert IELTS Reading test parser. Extract ALL questions AND their answer key from this document.

**YOUR TASK:**
Extract ALL questions with accurate type classification AND extract the answer key. Combine them in one response.

Text:
"""
${chunk.text}
"""

**═══════════════════════════════════════════════════════════════**
**IELTS QUESTION TYPES - ESSENCE-BASED CLASSIFICATION**
**═══════════════════════════════════════════════════════════════**

⚠️ **CRITICAL: Use these EXACT type names. Classification accuracy is paramount for grading!**

**─────────────────────────────────────────────────────────────────**
**GROUP 1: TRUE/FALSE TYPES (Distinguish by: FACTS vs OPINIONS)**
**─────────────────────────────────────────────────────────────────**

1. **"true-false-not-given"** (TFNG)
   - ESSENCE: Match statements to FACTS presented in the text
   - KEY PHRASE: "agree with the INFORMATION given in the passage"
   - Answer options: TRUE, FALSE, NOT GIVEN
   - Example: "The pyramids were built by slaves." → Check against factual claims in text
   
2. **"yes-no-not-given"** (YNNG)
   - ESSENCE: Match statements to the WRITER'S OPINIONS/CLAIMS
   - KEY PHRASE: "agree with the VIEWS/CLAIMS of the writer"
   - Answer options: YES, NO, NOT GIVEN
   - Example: "The author believes climate change is urgent." → Check writer's expressed opinion
   
   ⚠️ If instruction says "information" → TFNG
   ⚠️ If instruction says "claims", "views", "opinions" → YNNG

**─────────────────────────────────────────────────────────────────**
**GROUP 2: MATCHING TYPES (Distinguish by: WHAT THEY MATCH TO)**
**─────────────────────────────────────────────────────────────────**

3. **"matching-headings"** (Priority: HIGHEST for matching)
   - ESSENCE: Identify the MAIN IDEA of each paragraph/section
   - MATCH TO: Headings (usually roman numerals i-x)
   - KEY PHRASE: "Choose the correct HEADING for each paragraph"
   - Options: List of Headings (i. xxx, ii. xxx, iii. xxx...)
   - Example: "Paragraph A → Heading ii"

4. **"matching-information"**
   - ESSENCE: Locate where SPECIFIC DETAILS appear in the text
   - MATCH TO: Paragraph LETTERS (A, B, C, D, E, F, G)
   - KEY PHRASE: "Which PARAGRAPH/SECTION contains the following information?"
   - Options: INFER from "sections A-G" or "paragraphs A-F"
   - Example: "14. reference to early experiments" → Answer: C (paragraph C)
   
   ⚠️ IMPORTANT: Infer options from passage description:
   - "Reading Passage has sections A–G" → options: ["A", "B", "C", "D", "E", "F", "G"]

5. **"matching-features"**
   - ESSENCE: Match statements to NAMED ENTITIES (people, theories, time periods, countries, etc.)
   - MATCH TO: List of entities (NOT paragraphs!)
   - KEY PHRASE: "Match each statement with the correct person/researcher/theory"
   - Options: Extract from "List of People/Names/Researchers/Countries/Theories"
   - May include "NB You may use any letter more than once"
   - Example: "19. discovered the vaccine" → Answer: A (A. Louis Pasteur)
   
   ⚠️ If matching to PEOPLE/NAMES/ENTITIES → matching-features
   ⚠️ If matching to PARAGRAPHS/SECTIONS → matching-information

6. **"matching-sentence-endings"**
   - ESSENCE: Complete sentences by selecting the correct ENDING
   - MATCH TO: List of sentence endings (partial sentences)
   - KEY PHRASE: "Complete each sentence with the correct ENDING"
   - Options: Extract from "List of Endings"
   - Example: "31. The study revealed that participants..." → "A. preferred visual learning."

**─────────────────────────────────────────────────────────────────**
**GROUP 3: COMPLETION TYPES (Distinguish by: WORD SOURCE)**
**─────────────────────────────────────────────────────────────────**

7. **"summary-completion-list"**
   - ESSENCE: Fill blanks from a PROVIDED WORD BANK
   - WORD SOURCE: Box of words/phrases (A-H, A-L, etc.)
   - KEY PHRASE: "Complete using words from the BOX/LIST below"
   - Options: Extract the word bank as options array

   ⚠️ **CRITICAL: MULTI-GROUP IDENTIFICATION (summaryGroupId)**
   - Determine if the passage contains multiple separate summary completion exercises.
   - Assign a \`summaryGroupId\` string (e.g., "sc-1", "sc-2") to every question of type 'summary-completion-list' and 'summary-completion-text'.
   - A new group starts when a new instruction paragraph appears (e.g., 'Complete the following summary...').
   - All questions sharing the same instruction header MUST receive the SAME \`summaryGroupId\`.
   - The counter resets per passage (e.g., Passage 2 begins back at "sc-1").
   - NEVER include \`summaryGroupId\` for non-summary question types.
   
   ⚠️ **CRITICAL: SUMMARY PARAGRAPH FORMAT FOR summary-completion-list:**
   - The FIRST question in the group MUST contain the ENTIRE summary paragraph in its questionText
   - Use ______ (6+ underscores) to mark EACH blank position in the paragraph
   - Subsequent questions (2nd, 3rd, etc.) should have questionText = "" (empty string)
   - The summary must be the FULL text as it appears in the source, starting from the very first word
   - Include ALL text before, between, and after the blanks — do NOT truncate or skip sentences
   - If the summary has a title/heading, include it in sectionInstruction, NOT in questionText
   
   ✅ CORRECT Example (Q27-31 from a summary with word bank A-L):
   Question 27 (FIRST): questionText = "People go to art museums because they accept the value of seeing an original work of art. But they do not go to museums to read original manuscripts of novels, perhaps because the availability of novels has depended on ______ for so long, and also because with novels, the ______ are the most important thing.\n\nHowever, in historical times artists such as Leonardo were happy to instruct ______ to produce copies of their work and these days new methods of reproduction allow excellent replication of surface relief features as well as colour and ______.\n\nIt is regrettable that museums still promote the superiority of original works of art, since this may not be in the interests of the ______."
   Question 28: questionText = ""
   Question 29: questionText = ""
   Question 30: questionText = ""
   Question 31: questionText = ""
   
   ❌ WRONG: Splitting each question as a separate fragment like "perhaps because the availability of novels has depended on ______"
   ❌ WRONG: Starting mid-sentence, losing the beginning of the summary paragraph

8. **"summary-completion-text"**
   - ESSENCE: Fill blanks using WORDS FROM THE PASSAGE itself
   - WORD SOURCE: The reading passage (no word bank)
   - KEY PHRASE: "NO MORE THAN X WORDS from the passage"
   - Options: null (no predefined options)
   - ⚠️ PRESERVE word limit in questionText: "ONE WORD ONLY", "TWO WORDS", "THREE WORDS AND/OR A NUMBER"

9. **"sentence-completion"**
   - ESSENCE: Complete standalone sentences with passage words
   - Identified by: Sentences with blanks (______) or numbered gaps
   - Similar to summary-completion-text but for individual sentences

10. **"note-completion"**
    - ESSENCE: Fill in bullet points, outlines, or forms
    - Identified by: Bullet points (•, -, *) or form fields
    - Word limit often specified: "ONE WORD AND/OR A NUMBER"

11. **"table-completion"**
    - ESSENCE: Fill in table cells
    - Identified by: "Complete the TABLE below"
    - ⚠️ **CRITICAL: PRESERVE TABLE STRUCTURE using pipe (|) delimiters!**
    - The questionText MUST use pipe (|) to separate columns, matching the ORIGINAL table layout
    - Put the TABLE HEADERS in the sectionInstruction field with prefix "TABLE_HEADERS:" followed by pipe-separated headers
      Example sectionInstruction: "TABLE_HEADERS: Plant Species | Native Region | Medicinal Use. Complete the table below. Choose NO MORE THAN TWO WORDS."
    - 🚫 **ABSOLUTELY FORBIDDEN: Do NOT create ANY question with questionNumber: 0**
    - 🚫 **ABSOLUTELY FORBIDDEN: Do NOT create a separate header-only row as a question**
    - 🚫 **WRONG EXAMPLE (DO NOT DO THIS):** {"questionNumber": 0, "questionText": "Stepwell | Date | Features", ...}
    - Headers are METADATA, not questions. They go in sectionInstruction ONLY.
    - Use "______" (underscores) for blanks, NOT dots
    - Strip question number references like "(9)" from cell text (the questionNumber field already has it)
    - Strip word limit instructions like "(ONE WORD AND/OR A NUMBER)" from cell text (put in sectionInstruction)
    - Example source table:
      | Plant Species | Native Region | Medicinal Use |
      | Gingko Biloba | ______        | Improves cognitive function |
    - ✅ CORRECT output (headers in sectionInstruction, NO questionNumber: 0):
      {"questionNumber": 18, "questionText": "Gingko Biloba | ______ | Improves cognitive function", "type": "table-completion", "sectionInstruction": "TABLE_HEADERS: Plant Species | Native Region | Medicinal Use. Complete the table below.", ...}
    - Adapt column count and headers to match the ACTUAL source table (could be 2, 3, 4+ columns)

12. **"flowchart-completion"**
    - ESSENCE: Fill in flowchart boxes
    - Identified by: "Complete the FLOW-CHART below"

13. **"diagram-labeling"**
    - ESSENCE: Label parts of a diagram/map/plan
    - Identified by: "Label the DIAGRAM/MAP/PLAN below"

**─────────────────────────────────────────────────────────────────**
**GROUP 4: CHOICE TYPES (Distinguish by: NUMBER OF ANSWERS)**
**─────────────────────────────────────────────────────────────────**

14. **"multiple-choice"**
    - ESSENCE: Select ONE correct answer from options
    - KEY PHRASE: "Choose the correct LETTER, A, B, C or D"
    - Single answer expected
    
15. **"multiple-select"**
    - ESSENCE: Select TWO OR MORE correct answers
    - KEY PHRASE: "Choose TWO/THREE letters"
    - Example: "Which TWO of the following are mentioned?"
    - Answer format may be array: ["B", "D"]

**─────────────────────────────────────────────────────────────────**
**GROUP 5: OTHER TYPES**
**─────────────────────────────────────────────────────────────────**

16. **"short-answer"**
    - ESSENCE: Answer direct questions with words from passage
    - Identified by: Question-answer format (What/When/Where/Who/How/Why/Which...?)
    - KEY PHRASE: "Answer the questions below"
    - Example: "What year did the expedition begin?" → "1924"
    - Example: "Which part of the house provided shade?" → "roof"
    - Example: "Who discovered the vaccine?" → "Pasteur"
    
    ⚠️ **CRITICAL DISTINCTION from sentence-completion:**
    - **SHORT-ANSWER**: Full question format like "Which part provided shade?"
    - **SENTENCE-COMPLETION**: Gap-fill like "The shade was provided by ______"
    - If question STARTS with What/Who/Where/When/Why/How/Which AND has "?" → **short-answer**
    - If question HAS blanks (___) in the middle of a statement → **sentence-completion**

**═══════════════════════════════════════════════════════════════**
**EXTRACTION INSTRUCTIONS**
**═══════════════════════════════════════════════════════════════**

**A. QUESTIONS:**
1. **Find All Questions:**
   - Look for numbered questions (1., 2., ... 40)
   - Preserve ORIGINAL question numbers (don't renumber!)

2. **For Each Question Extract:**
   - **questionNumber**: Original number (1-40)
   - **questionText**: Complete question text
     * For completion: Include word limit e.g., "ONE WORD ONLY: The colony builds ______"
   - **type**: Use EXACT type name from above list (NOT generic "completion" or "matching")
   - **sectionInstruction**: The FULL section instruction text that applies to this question group
     * e.g., "Do the following statements agree with the information given in Reading Passage 1? TRUE / FALSE / NOT GIVEN"
     * e.g., "Complete the sentences below. Choose NO MORE THAN ONE WORD from the passage for each answer."
     * e.g., "Choose the correct letter, A, B, C or D."
     * This is the instruction that appears BEFORE the question group, NOT the question itself
     * Questions in the same section share the SAME sectionInstruction
   - **options**: 
     * MCQ/Multiple-select: ["A. ...", "B. ...", ...]
     * Matching-information: INFER section letters ["A", "B", "C", ...]
     * Matching-features/headings/endings: Extract from "List of..." section
     * Completion, TFNG, YNNG: null
   - **answer**: Leave as empty string ""
   - **passageId**: Which passage (e.g., "passage-1")
   - **confidence**: 0-100 score
   - **context**: MUST be null for ALL questions

**B. ANSWER KEY:**
1. Find "Answer Key", "Answers", or "Solutions" section
2. Map question numbers to answers
3. Preserve exact format: "A", "YES", "TRUE", "rivers", etc.

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

1. ❌ Confusing TFNG with YNNG
   ✅ "information" = TFNG, "claims/views" = YNNG

2. ❌ Using "matching" for "Which section contains"
   ✅ Use "matching-information" (match to paragraphs)

3. ❌ Using "matching-information" for "Match to person"
   ✅ Use "matching-features" (match to entities)

4. ❌ Missing options for matching-information
   ✅ Infer from "sections A-G" → options: ["A","B","C","D","E","F","G"]

5. ❌ Forgetting word limit for completion questions
   ✅ Include "NO MORE THAN THREE WORDS" in questionText

6. ❌ Using "sentence-completion" for Q&A questions
   ✅ If question starts with What/Who/Where/When/Why/How/Which AND has "?" → **short-answer**
   ✅ Use "sentence-completion" ONLY for blank-fill statements (_____ gaps)

7. ❌ Using "sentence-completion" for shared ending questions (Q31-35 with A-G endings)
   ✅ If multiple questions share SAME endings list → **matching-sentence-endings**
   ✅ "sentence-completion" = individual sentences with passage words, NO shared options

8. ❌ Using "multiple-choice" for many options (5+)
   ✅ If 5-7 ending options shared across questions → **matching-sentence-endings**
   ✅ If 8-11 heading options (i-xi) → **matching-headings**
   ✅ "multiple-choice" = typically 4 options (A-D) per question

**OUTPUT (JSON object only, no markdown):**
{
  "questions": [
    {
      "questionNumber": 1,
      "questionText": "The pyramids were built during the Old Kingdom period.",
      "type": "true-false-not-given",
      "sectionInstruction": "Do the following statements agree with the information given in Reading Passage 1? TRUE / FALSE / NOT GIVEN",
      "options": null,
      "answer": "",
      "passageId": "passage-1",
      "confidence": 95,
      "context": null
    },
    {
      "questionNumber": 14,
      "questionText": "reference to research problems",
      "type": "matching-information",
      "sectionInstruction": "Reading Passage 2 has seven paragraphs, A-G. Which paragraph contains the following information?",
      "options": ["A", "B", "C", "D", "E", "F", "G"],
      "answer": "",
      "passageId": "passage-2",
      "confidence": 92,
      "context": null
    },
    {
      "questionNumber": 19,
      "questionText": "discovered the vaccination technique",
      "type": "matching-features",
      "sectionInstruction": "Look at the following statements and the list of researchers below. Match each statement with the correct researcher, A-C.",
      "options": ["A. Louis Pasteur", "B. Edward Jenner", "C. Robert Koch"],
      "answer": "",
      "passageId": "passage-2",
      "confidence": 90,
      "context": null
    },
    {
      "questionNumber": 9,
      "questionText": "Rani Ki Vav | Excellent condition, despite the ______ | of 2001",
      "type": "table-completion",
      "sectionInstruction": "TABLE_HEADERS: Name | Location | Key Feature. Complete the table below. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
      "options": null,
      "answer": "",
      "passageId": "passage-1",
      "confidence": 92,
      "context": null
    },
    {
      "questionNumber": 27,
      "questionText": "People go to art museums because they accept the value of seeing an original work of art. But they do not go to museums to read original manuscripts of novels, perhaps because the availability of novels has depended on ______ for so long, and also because with novels, the ______ are the most important thing.\\n\\nHowever, in historical times artists such as Leonardo were happy to instruct ______ to produce copies of their work and these days new methods of reproduction allow excellent replication of surface relief features as well as colour and ______.\\n\\nIt is regrettable that museums still promote the superiority of original works of art, since this may not be in the interests of the ______.",
      "type": "summary-completion-list",
      "summaryGroupId": "sc-1",
      "sectionInstruction": "The value attached to original works of art. Complete the summary using the list of words, A-L, below.",
      "options": ["A. mechanical__(word)", "B.__(word)", "C.__(word)", "D. __(word)", "E. __(word)", "F. __(word)", "G. __(word)", "H. __(word)"],
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
      "sectionInstruction": "The value attached to original works of art. Complete the summary using the list of words, A-L, below.",
      "options": ["A. mechanical__(word)", "B. __(word)", "C. __(word)", "D. __(word)", "E. __(word)", "F. __(word)", "G. __(word)", "H. __(word)"],
      "answer": "",
      "passageId": "passage-3",
      "confidence": 95,
      "context": null
    }
  ],
  "answerKey": {
    "1": "TRUE",
    "14": "C",
    "19": "B"
  },
  "confidence": 90
}`;
  }

  /**
   * Extract JSON from response with robust error handling
   * Uses jsonrepair library to fix malformed JSON automatically
   */
  private extractJSON(text: string): unknown {
    // Remove markdown code blocks if present
    let cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Stage 1: Try direct parse (JSON Mode should give us valid JSON)
    try {
      const parsed = JSON.parse(cleaned);
      // Verify it's an object, not an array
      if (Array.isArray(parsed)) {
        throw new Error('Response is an array, expected object with passages/questions/answerKey/confidence');
      }
      return parsed;
    } catch (firstError) {
      console.warn('⚠️ Direct JSON parse failed, attempting repair...');

      // Stage 2: Extract JSON object (NOT arrays) if embedded in text
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      } else if (cleaned.startsWith('[')) {
        // If response starts with '[', it's a partial response (just one field)
        throw new Error('Partial response detected - AI returned only an array instead of complete object');
      }

      // Stage 3: Use jsonrepair library to fix common issues
      try {
        const repaired = jsonrepair(cleaned);
        console.log('✅ JSON repaired successfully');
        const parsed = JSON.parse(repaired);

        // Verify it's an object after repair
        if (Array.isArray(parsed)) {
          throw new Error('Repaired response is an array, expected object');
        }

        return parsed;
      } catch (repairError) {
        const errorMsg = repairError instanceof Error ? repairError.message : 'Unknown error';
        console.error('❌ JSON repair failed:', errorMsg);
        console.error('Original text length:', text.length);
        console.error('Cleaned text preview:', cleaned.substring(0, 200));
        console.error('Text ends with:', text.substring(Math.max(0, text.length - 100)));
        throw new Error(`JSON parsing failed after repair: ${errorMsg}`);
      }
    }
  }


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
    await this.initialize(true);

    if (this.clients.length === 0) {
      return {
        success: false,
        error: 'Gemini clients not initialized',
      };
    }

    // ✅ Round-robin key selection BEFORE request (load balancing)
    this.currentKeyIndex = this.getNextAvailableKeyRoundRobin();
    console.log(`📤 [parsePassagesOnly] Using Gemini API key ${this.currentKeyIndex + 1}/${this.clients.length} (round-robin)`);

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
    const isRateLimitError = this.isRateLimitError(result.error);
    const isTransientAvailabilityError = this.isTransientAvailabilityError(result.error);

    if (isRateLimitError || isTransientAvailabilityError) {
      const retryReason = isTransientAvailabilityError ? 'temporary provider demand' : 'rate limit';
      console.warn(`⚠️ [parsePassagesOnly] ${retryReason} on key ${this.currentKeyIndex + 1}, trying other keys...`);
      if (isRateLimitError) {
        this.markKeyExhausted(this.currentKeyIndex, 'Rate limit');
      }

      // Try remaining keys
      for (let attempt = 0; attempt < this.clients.length - 1; attempt++) {
        const nextKey = this.getNextAvailableKey();
        if (nextKey === -1) {
          console.warn('⚠️ All API keys are exhausted');
          break;
        }

        this.currentKeyIndex = nextKey;
        console.log(`🔄 [parsePassagesOnly] Trying key ${this.currentKeyIndex + 1}/${this.clients.length}`);

        const retryResult = await this.attemptParsePassages(text);
        if (retryResult.success) {
          return retryResult;
        }

        if (this.isRateLimitError(retryResult.error)) {
          this.markKeyExhausted(this.currentKeyIndex, 'Rate limit');
          continue;
        }

        if (this.isTransientAvailabilityError(retryResult.error)) {
          continue;
        }

        return retryResult;
      }

      return {
        success: false,
        error: 'All Gemini API keys exhausted or rate-limited',
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

      const chunk = { id: 'passages-only', number: 1, text, wordCount: text.split(/\s+/).length, startIndex: 0, endIndex: text.length, isLast: true };
      const prompt = this.buildPassagesOnlyPrompt(chunk);
      const result = await model.generateContent(prompt);
      const response = result.response;
      const responseText = response.text();

      if (!responseText || responseText.trim().length === 0) {
        throw new Error('Gemini returned empty response');
      }

      const parsed = this.extractJSON(responseText) as any;

      // 🔍 ROOT CAUSE INVESTIGATION: Log what Gemini actually returns
      const passagesCount = Array.isArray(parsed?.passages) ? parsed.passages.length : 0;
      console.log('🔍 Gemini parsePassagesOnly - Raw parsed data:', {
        passagesCount,
        responseLength: responseText.length,
        responseTokensApprox: Math.ceil(responseText.length / 4), // ~4 chars per token
        maxTokens: 16384,
        confidence: parsed?.confidence,
        firstPassage: parsed?.passages?.[0] ? {
          id: parsed.passages[0].id,
          title: parsed.passages[0].title?.substring(0, 50),
          hasContent: !!parsed.passages[0].content,
          questionStart: parsed.passages[0].questionStart,
          questionEnd: parsed.passages[0].questionEnd,
        } : 'No passages',
        lastPassage: parsed?.passages?.[passagesCount - 1] ? {
          id: parsed.passages[passagesCount - 1].id,
          title: parsed.passages[passagesCount - 1].title?.substring(0, 50),
        } : 'No passages',
      });

      // ⚠️ Warn if response might be truncated (close to token limit)
      const responseTokens = Math.ceil(responseText.length / 4);
      if (responseTokens > 14000) {
        console.warn('⚠️ Response length approaching token limit! May be truncated:', {
          responseTokens,
          maxTokens: 16384,
          utilizationPercent: Math.round((responseTokens / 16384) * 100),
        });
      }

      const validation = validatePassagesOnly(parsed);

      if (!validation.success) {
        // Log the exact validation error details
        console.error('❌ Passages validation failed. Sample data:',
          JSON.stringify(parsed, null, 2).substring(0, 500)
        );
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
    await this.initialize(true);

    if (this.clients.length === 0) {
      return {
        success: false,
        error: 'Gemini clients not initialized',
      };
    }

    // ✅ Round-robin key selection BEFORE request (load balancing)
    this.currentKeyIndex = this.getNextAvailableKeyRoundRobin();
    console.log(`📤 [parseQuestionsAndAnswers] Using Gemini API key ${this.currentKeyIndex + 1}/${this.clients.length} (round-robin)`);

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
    const isRateLimitError = this.isRateLimitError(result.error);
    const isTransientAvailabilityError = this.isTransientAvailabilityError(result.error);

    if (isRateLimitError || isTransientAvailabilityError) {
      const retryReason = isTransientAvailabilityError ? 'temporary provider demand' : 'rate limit';
      console.warn(`⚠️ [parseQuestionsAndAnswers] ${retryReason} on key ${this.currentKeyIndex + 1}, trying other keys...`);
      if (isRateLimitError) {
        this.markKeyExhausted(this.currentKeyIndex, 'Rate limit');
      }

      // Try remaining keys
      for (let attempt = 0; attempt < this.clients.length - 1; attempt++) {
        const nextKey = this.getNextAvailableKey();
        if (nextKey === -1) {
          console.warn('⚠️ All API keys are exhausted');
          break;
        }

        this.currentKeyIndex = nextKey;
        console.log(`🔄 [parseQuestionsAndAnswers] Trying key ${this.currentKeyIndex + 1}/${this.clients.length}`);

        const retryResult = await this.attemptParseQuestions(text);
        if (retryResult.success) {
          return retryResult;
        }

        if (this.isRateLimitError(retryResult.error)) {
          this.markKeyExhausted(this.currentKeyIndex, 'Rate limit');
          continue;
        }

        if (this.isTransientAvailabilityError(retryResult.error)) {
          continue;
        }

        return retryResult;
      }

      return {
        success: false,
        error: 'All Gemini API keys exhausted or rate-limited',
      };
    }

    return result;
  }

  /**
   * Single attempt to parse questions and answers
   */
  private async attemptParseQuestions(text: string): Promise<Result<{ questions: AIParseResult['questions']; answerKey: AIParseResult['answerKey']; confidence: number; }>> {
    try {
      this.status.requestCount++;
      this.status.lastRequestTime = Date.now();

      const client = this.clients[this.currentKeyIndex];
      if (!client) {
        throw new Error('No client available');
      }

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

      const chunk = { id: 'questions-answers', number: 1, text, wordCount: text.split(/\s+/).length, startIndex: 0, endIndex: text.length, isLast: true };
      const prompt = this.buildQuestionsAndAnswersPrompt(chunk);
      const result = await model.generateContent(prompt);
      const response = result.response;
      const responseText = response.text();

      if (!responseText || responseText.trim().length === 0) {
        throw new Error('Gemini returned empty response');
      }

      const parsed = this.extractJSON(responseText) as any;

      // 🔍 ROOT CAUSE INVESTIGATION: Log what Gemini actually returns
      console.log('🔍 Gemini parseQuestionsAndAnswers - Raw parsed data:', {
        questionsCount: Array.isArray(parsed?.questions) ? parsed.questions.length : 0,
        firstQuestionContext: parsed?.questions?.[0]?.context,
        contextType: typeof parsed?.questions?.[0]?.context,
        contextValue: JSON.stringify(parsed?.questions?.[0]?.context),
        sampleQuestions: parsed?.questions?.slice(0, 2).map((q: any) => ({
          questionNumber: q.questionNumber,
          contextExists: 'context' in q,
          contextValue: q.context,
          contextType: typeof q.context,
        })),
      });

      // 🔍 DEBUG: Check for questionNumber: 0
      const allQuestionNumbers = parsed?.questions?.map((q: any) => q.questionNumber) || [];
      console.log('🔍 [DEBUG] All questionNumbers in AI response:', allQuestionNumbers);
      const hasQuestionZero = allQuestionNumbers.includes(0);
      if (hasQuestionZero) {
        console.error('🚨 [BUG] AI OUTPUT CONTAINS questionNumber: 0!',
          parsed?.questions?.filter((q: any) => q.questionNumber === 0)
        );
      }

      const validation = validateQuestionsAndAnswers(parsed);

      if (!validation.success) {
        // Log the exact validation error details
        console.error('❌ Validation failed. Sample question that failed:',
          JSON.stringify(parsed?.questions?.[0], null, 2)
        );
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
   * Mark an API key as exhausted
   */
  private markKeyExhausted(keyIndex: number, reason: string): void {
    const key = this.apiKeys[keyIndex];
    const keyPreview = key?.substring(key.length - 8) || 'unknown';
    if (key) {
      benchKey(key, 'gemini', reason);
    }
    console.warn(`⚠️ Marked key #${keyIndex + 1} (...${keyPreview}) as exhausted: ${reason}`);
  }

  /**
   * Check if a key is currently exhausted
   */
  private isKeyExhausted(keyIndex: number): boolean {
    const key = this.apiKeys[keyIndex];
    return key ? isKeyBenched(key) : false;
  }

  /**
   * Get next available (non-exhausted) key in round-robin fashion
   * This distributes load evenly across all keys BEFORE they hit rate limits
   */
  private getNextAvailableKeyRoundRobin(): number {
    this.requestCount++;

    // Try keys in round-robin order
    for (let i = 0; i < this.clients.length; i++) {
      const keyIndex = (this.requestCount + i) % this.clients.length;
      if (!this.isKeyExhausted(keyIndex)) {
        return keyIndex;
      }
    }

    // All keys are currently benched. Fall back to round-robin in case a cooldown expires mid-flight.
    console.warn('⚠️ All keys are currently benched, using round-robin anyway in case a cooldown expires');
    return this.requestCount % this.clients.length;
  }

  /**
   * Get next available (non-exhausted) key (sequential, for fallback)
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
   * Generate answers from test content (passages + questions)
   * This asks AI to actually solve the questions based on passage content
   * Used for missing answer key dialog auto-suggestions
   * Now with retry logic to try all available keys before failing
   */
  async generateAnswersFromContent(
    passagesText: string,
    questions: Array<{
      number: number;
      questionText: string;
      type?: string;
      options?: Array<string | ReadingLabeledOption>;
      labeledOptions?: ReadingLabeledOption[];
    }>
  ): Promise<Result<{ answerKey: Record<number, string>; confidence: number }>> {
    // Lazy initialize on first use
    if (this.clients.length === 0 && !this.sdkLoaded) {
      await this.initialize();
    }

    if (this.clients.length === 0) {
      return {
        success: false,
        error: 'Gemini clients not initialized',
      };
    }

    // Try all keys until one works (with proper fallback)
    const triedKeys = new Set<number>();
    let lastError = '';

    while (triedKeys.size < this.clients.length) {
      // Get next available key (prefer non-exhausted keys first)
      let keyIndex = -1;
      for (let i = 0; i < this.clients.length; i++) {
        if (!triedKeys.has(i) && !this.isKeyExhausted(i)) {
          keyIndex = i;
          break;
        }
      }
      // If all non-benched keys were tried, fall back to the remaining keys in case a cooldown expired.
      if (keyIndex === -1) {
        for (let i = 0; i < this.clients.length; i++) {
          if (!triedKeys.has(i)) {
            keyIndex = i;
            break;
          }
        }
      }
      if (keyIndex === -1) break; // All keys tried

      triedKeys.add(keyIndex);
      this.currentKeyIndex = keyIndex;
      console.log(`📤 Using Gemini API key ${keyIndex + 1}/${this.clients.length} for answer generation`);

      try {
        this.status.requestCount++;
        this.status.lastRequestTime = Date.now();

        const client = this.clients[keyIndex];
        if (!client) {
          lastError = 'No client available';
          continue;
        }

        const model = client.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: {
            temperature: 0.1,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        });

        // Build prompt for answer generation
        const prompt = this.buildAnswerGenerationPrompt(passagesText, questions);
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        if (!text || text.trim().length === 0) {
          lastError = 'Gemini returned empty response';
          continue;
        }

        // Parse JSON response
        const parsed = this.extractJSON(text) as { answerKey: Record<string, string>; confidence: number };

        // Convert string keys to numbers
        const answerKey: Record<number, string> = {};
        for (const [key, value] of Object.entries(parsed.answerKey || {})) {
          answerKey[parseInt(key)] = String(value);
        }

        const answerCount = Object.keys(answerKey).length;
        console.log(`✅ AI generated ${answerCount} answers with key ${keyIndex + 1}`);

        return {
          success: true,
          data: {
            answerKey,
            confidence: parsed.confidence || 80,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        lastError = errorMessage;
        this.status.lastError = errorMessage;

        // Check if rate limited or 403 - mark key exhausted and try next
        if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
          console.warn(`⚠️ Key ${keyIndex + 1} rate limited, trying next key...`);
          this.markKeyExhausted(keyIndex, 'Rate limit');
          continue; // Try next key
        }

        if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
          console.warn(`⚠️ Key ${keyIndex + 1} returned 403 Forbidden, trying next key...`);
          this.markKeyExhausted(keyIndex, '403 Forbidden');
          continue; // Try next key
        }

        // For network errors, don't try other keys (they'll fail too)
        if (errorMessage.includes('Failed to fetch') ||
          errorMessage.includes('NetworkError') ||
          !navigator.onLine) {
          return {
            success: false,
            error: 'Network error - please check your internet connection',
          };
        }

        // For other errors, try next key
        console.warn(`⚠️ Key ${keyIndex + 1} failed: ${errorMessage}, trying next key...`);
        continue;
      }
    }

    // All keys exhausted
    console.error(`❌ All ${this.clients.length} API keys failed for answer generation`);
    return {
      success: false,
      error: `Answer generation failed after trying all ${this.clients.length} API keys. Last error: ${lastError}`,
    };
  }

  /**
   * Build prompt for generating answers from test content
   */
  private buildAnswerGenerationPrompt(
    passagesText: string,
    questions: Array<{
      number: number;
      questionText: string;
      type?: string;
      options?: Array<string | ReadingLabeledOption>;
      labeledOptions?: ReadingLabeledOption[];
    }>
  ): string {
    const questionsFormatted = questions.map(q => {
      let text = `Q${q.number}: ${q.questionText}`;
      if (q.type) text += ` [Type: ${q.type}]`;
      const rawOptions = (q.labeledOptions && q.labeledOptions.length > 0)
        ? q.labeledOptions
        : q.options || [];
      const formattedOptions = rawOptions
        .map((option, index) => {
          if (typeof option === 'string') {
            return option;
          }

          const label = option.label?.trim() || String.fromCharCode(65 + index);
          const optionText = option.text?.trim() || '';
          return optionText ? `${label}. ${optionText}` : label;
        })
        .filter(Boolean);

      if (formattedOptions.length > 0) {
        text += `\n   Options: ${formattedOptions.join(' | ')}`;
      }
      return text;
    }).join('\n\n');

    return `You are an expert test answer generator. Based on the passage content below, determine the CORRECT answers for each question.

**PASSAGE CONTENT:**
"""
${passagesText}
"""

**QUESTIONS TO ANSWER:**
${questionsFormatted}

**INSTRUCTIONS:**
1. Read the passage carefully
2. For each question, find the correct answer based on the passage content
3. For multiple-choice: Choose the best option (A, B, C, D, etc.)
4. For True/False/Not Given: Answer "TRUE", "FALSE", or "NOT GIVEN" based on passage
5. For Yes/No/Not Given: Answer "YES", "NO", or "NOT GIVEN" based on passage
6. For completion: Provide the exact word(s) from the passage that fill the blank
7. For matching: Provide the correct option letter/number
8. Be precise - use exact wording from passage where applicable

**OUTPUT (JSON only, no markdown):**
{
  "answerKey": {
    "1": "A",
    "2": "TRUE",
    "3": "rivers"
  },
  "confidence": 85
}

Generate answers for ALL ${questions.length} questions listed above.`;
  }

  /**
   * Grade a writing answer (Phase 2 — Task 6.2)
   */
  async gradeWritingAnswer(
    studentAnswer: string,
    modelAnswers: string[],
    originalSentence: string,
    context?: { sentenceStarter?: string; keyword?: string }
  ): Promise<Result<{ score: number; confidence: number; feedback: string }>> {
    if (this.clients.length === 0 && !this.sdkLoaded) await this.initialize();
    if (this.clients.length === 0) return { success: false, error: 'Gemini clients not initialized' };

    this.currentKeyIndex = this.getNextAvailableKeyRoundRobin();

    try {
      this.status.requestCount++;
      this.status.lastRequestTime = Date.now();
      const client = this.clients[this.currentKeyIndex];
      if (!client) throw new Error('No client available');

      const model = client.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      });

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

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = this.extractJSON(text) as { score: number; confidence: number; feedback: string };

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
   * Suggest alternative correct answers (Phase 2 — Task 6.6b)
   */
  async suggestAlternativeAnswers(
    originalSentence: string,
    existingAnswers: string[],
    questionType: 'fill-in' | 'writing',
    context?: { sentenceStarter?: string; keyword?: string }
  ): Promise<Result<Array<{ answer: string; confidence: number }>>> {
    if (this.clients.length === 0 && !this.sdkLoaded) await this.initialize();
    if (this.clients.length === 0) return { success: false, error: 'Gemini clients not initialized' };

    this.currentKeyIndex = this.getNextAvailableKeyRoundRobin();

    try {
      this.status.requestCount++;
      this.status.lastRequestTime = Date.now();
      const client = this.clients[this.currentKeyIndex];
      if (!client) throw new Error('No client available');

      const model = client.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      });

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

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());

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

  async generateStructuredJson(
    prompt: string,
    options: AIStructuredGenerationOptions = {}
  ): Promise<Result<unknown>> {
    if (this.clients.length === 0 && !this.sdkLoaded) await this.initialize();
    if (this.clients.length === 0) return { success: false, error: 'Gemini clients not initialized' };

    this.currentKeyIndex = this.getNextAvailableKeyRoundRobin();

    try {
      this.status.requestCount++;
      this.status.lastRequestTime = Date.now();
      const client = this.clients[this.currentKeyIndex];
      if (!client) throw new Error('No client available');

      const model = client.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: options.temperature ?? 0.1,
          maxOutputTokens: options.maxOutputTokens ?? 8192,
          responseMimeType: 'application/json',
        },
      });

      const request = options.systemInstruction
        ? [
          { text: `${options.systemInstruction}\n\n${prompt}` },
        ]
        : prompt;
      const result = await model.generateContent(request as any);
      const text = result.response.text();
      const parsed = this.extractJSON(text);

      return {
        success: true,
        data: parsed,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.status.lastError = msg;
      if (msg.includes('429') || msg.includes('rate limit')) {
        this.markKeyExhausted(this.currentKeyIndex, 'Rate limit');
      }
      return { success: false, error: `Structured generation failed: ${msg}` };
    }
  }

  private getWritingSuggestionScopeInstruction(scope: WritingSuggestionScope): string {
    switch (scope) {
      case 'grammar-correction':
        return 'Return grammar findings only. Return only precise micro-fixes that can be corrected with a short replacement.';
      case 'grammar-improvement':
        return 'Return grammar findings only. Return only broader improvement guidance items that should stay as comments, not direct micro-corrections.';
      case 'vocabulary-correction':
        return 'Return vocabulary/expression findings only. Return only precise micro-fixes that can be corrected with a short replacement.';
      case 'vocabulary-improvement':
        return 'Return vocabulary/expression findings only. Return only broader improvement guidance items that should stay as comments, not direct micro-corrections.';
      case 'combined':
      default:
        return 'Return both grammar and vocabulary/expression findings. Include both corrections and improvement comments when appropriate.';
    }
  }

  private buildWritingSuggestionPrompt(request: WritingSuggestionBatchRequest): string {
    const priorLedger = request.priorFindingsLedger.length > 0
      ? JSON.stringify(request.priorFindingsLedger, null, 2)
      : '[]';

    return [
      'You are a careful IELTS writing grading assistant.',
      'Return only valid JSON with no markdown fences and no explanatory prose.',
      'Analyze the full essay as one entity while anchoring each finding to the provided indexed sentence text.',
      this.getWritingSuggestionScopeInstruction(request.scope),
      `Return up to ${request.maxFindings} distinct findings in this batch.`,
      'Prefer distinct issues over alternate rewrites of the same issue.',
      'Do not return any finding that substantially repeats something already present in priorFindingsLedger.',
      'If there are clearly more worthwhile new findings after this batch, set hasMorePotential to true. Otherwise set it to false.',
      'anchorText must exactly match the provided sentence text.',
      'confidence must be an integer from 0 to 100.',
      'replacementText is optional and should be omitted for comment-style findings.',
      'Use only these issueFamily values:',
      'tense, agreement, article, plural, preposition, punctuation, sentence-structure, capitalization, pronoun, word-choice, collocation, word-form, spelling, register, awkward-phrase, task1-reporting.',
      '',
      'Return exactly this JSON shape:',
      '{',
      '  "findings": [',
      '    {',
      '      "focus": "grammar" | "vocabulary-expression",',
      '      "kind": "comment" | "correction",',
      '      "sentenceIndex": 0,',
      '      "anchorText": "",',
      '      "issueFamily": "",',
      '      "title": "",',
      '      "reason": "",',
      '      "replacementText": "",',
      '      "confidence": 0',
      '    }',
      '  ],',
      '  "hasMorePotential": false',
      '}',
      '',
      `Task prompt:\n${request.taskPrompt}`,
      '',
      `Essay structure:\n${JSON.stringify(request.essay, null, 2)}`,
      '',
      `Prior findings ledger:\n${priorLedger}`,
    ].join('\n');
  }

  async generateWritingSuggestionBatch(
    request: WritingSuggestionBatchRequest,
    options: AIStructuredGenerationOptions & {
      preferredKeyIndex?: number;
      keyLeaseId?: string | null;
    } = {}
  ): Promise<Result<WritingSuggestionBatchResponse>> {
    if (this.clients.length === 0 && !this.sdkLoaded) await this.initialize();
    if (this.clients.length === 0) return { success: false, error: 'Gemini clients not initialized' };

    if (
      typeof options.preferredKeyIndex === 'number'
      && this.clients[options.preferredKeyIndex]
      && !this.isKeyExhausted(options.preferredKeyIndex)
    ) {
      this.currentKeyIndex = options.preferredKeyIndex;
    } else {
      this.currentKeyIndex = this.getNextAvailableKeyRoundRobin();
    }

    try {
      this.status.requestCount++;
      this.status.lastRequestTime = Date.now();
      const client = this.clients[this.currentKeyIndex];
      if (!client) throw new Error('No client available');

      const modelName = 'gemini-2.5-flash';
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: options.temperature ?? 0.1,
          maxOutputTokens: options.maxOutputTokens ?? 16384,
          responseMimeType: 'application/json',
        },
      });

      const rawPrompt = this.buildWritingSuggestionPrompt(request);
      const result = await model.generateContent(rawPrompt);
      const response = result.response as any;
      const rawResponse = response.text();
      const repairedParsedJson = this.extractJSON(rawResponse) as Record<string, any>;

      if (!repairedParsedJson || !Array.isArray(repairedParsedJson.findings) || typeof repairedParsedJson.hasMorePotential !== 'boolean') {
        throw new Error('Invalid writing suggestion batch response shape');
      }

      return {
        success: true,
        data: {
          findings: repairedParsedJson.findings,
          hasMorePotential: repairedParsedJson.hasMorePotential,
          provider: 'gemini',
          model: modelName,
          rawPrompt,
          rawResponse,
          repairedParsedJson,
          finishReason: response.candidates?.[0]?.finishReason ?? null,
          usageMetadata: response.usageMetadata ?? null,
          keyLeaseId: options.keyLeaseId ?? null,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.status.lastError = msg;
      if (msg.includes('429') || msg.includes('rate limit') || msg.includes('403')) {
        this.markKeyExhausted(this.currentKeyIndex, msg.includes('403') ? '403 Forbidden' : 'Rate limit');
      }
      return { success: false, error: `Writing suggestion batch failed: ${msg}` };
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
      return { success: false, error: 'No clients initialized' };
    }

    try {
      const client = this.clients[0];
      const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
      await model.generateContent('Test connection');
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
    this.currentKeyIndex = 0;
  }
}

/**
 * Singleton instance
 */
export const geminiProvider = new GeminiProvider();
