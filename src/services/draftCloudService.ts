// @ts-nocheck
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, query, where, Timestamp } from 'firebase/firestore';
import type {
  DraftServiceInterface,
  ServiceResponse,
  DraftDocument,
  DraftListItem,
  DraftMetadata,
  DraftStatus,
  TestType,
  SkillType,
  TestFormat,
  Passage,
  ParsedQuestion,
} from '../types/draft.types';
import { canonicalizeReadingQuestion } from '../utils/readingQuestionContract';

/**
 * Legacy DraftData type for backwards compatibility with old quiz draft system
 * This is kept for the legacy draftCloudService functions
 */
export interface DraftData {
  id: string;
  name: string;
  quizTitle: string;
  passages: any[];
  skipPassages: boolean;
  questionText: string;
  answerKeyText: string;
  answerKeyData: any;
  parsedQuestions: any[];
  finalQuiz: any;
  completedSections: string[];
  timestamp: string;
}

/**
 * Firebase Firestore instance
 */
const db = getFirestore();

/**
 * Collection paths for drafts
 */
const DRAFTS_COLLECTION = 'drafts';

/**
 * Recursively remove undefined values from an object/array
 * Firestore does NOT allow undefined - convert to null
 */
export function deepRemoveUndefined(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepRemoveUndefined(item));
  }

  if (typeof obj === 'object') {
    // Handle Date objects - convert to Firestore Timestamp
    if (obj instanceof Date) {
      return Timestamp.fromDate(obj);
    }

    const cleaned: Record<string, any> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        // Convert undefined to null, recursively clean objects/arrays
        cleaned[key] = value === undefined ? null : deepRemoveUndefined(value);
      }
    }
    return cleaned;
  }

  return obj;
}

const normalizeParsedQuestions = (questions: ParsedQuestion[]): ParsedQuestion[] => questions.map((question) => {
  const canonicalQuestion = canonicalizeReadingQuestion({
    questionNumber: question.questionNumber || question.number,
    type: question.type,
    questionText: question.questionText || question.question || '',
    question: question.question,
    options: question.labeledOptions || question.options || [],
    labeledOptions: question.labeledOptions,
    optionLabelFormat: question.optionLabelFormat,
    sectionReferences: question.sectionReferences,
  });

  if (canonicalQuestion.issues.length > 0) {
    throw new Error(canonicalQuestion.issues[0]!.message);
  }

  return {
    ...question,
    questionText: canonicalQuestion.questionText,
    question: canonicalQuestion.question,
    options: canonicalQuestion.options,
    labeledOptions: canonicalQuestion.labeledOptions,
    optionLabelFormat: canonicalQuestion.optionLabelFormat,
    sectionReferences: canonicalQuestion.sectionReferences,
  };
});

/**
 * Convert Firestore Timestamps to Date objects
 */
export function convertTimestamps<T>(data: any): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (data instanceof Timestamp) {
    return data.toDate() as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map(item => convertTimestamps(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const converted: Record<string, any> = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        converted[key] = convertTimestamps(data[key]);
      }
    }
    return converted as T;
  }

  return data;
}

/**
 * Sanitize draft data for Firestore
 * Firestore does NOT allow undefined values - convert them to null or defaults
 */
function sanitizeDraftData(draftData: DraftData): Record<string, any> {
  const sanitized = {
    id: draftData.id || '',
    name: draftData.name || 'Untitled Draft',
    quizTitle: draftData.quizTitle || '',
    passages: Array.isArray(draftData.passages) ? draftData.passages : [],
    skipPassages: draftData.skipPassages ?? false,
    questionText: draftData.questionText || '',
    answerKeyText: draftData.answerKeyText || '',
    answerKeyData: draftData.answerKeyData || null,
    parsedQuestions: Array.isArray(draftData.parsedQuestions) ? draftData.parsedQuestions : [],
    finalQuiz: draftData.finalQuiz || null,
    completedSections: Array.isArray(draftData.completedSections) ? draftData.completedSections : [],
    timestamp: draftData.timestamp || new Date().toISOString(),
  };

  // Deep clean to remove any nested undefined values
  return deepRemoveUndefined(sanitized);
}

/**
 * Draft Cloud Service
 * Handles permanent draft storage in Firebase Firestore for cross-device access
 */
export const draftCloudService = {
  /**
   * Save draft to Firestore (permanent, cross-device)
   */
  async saveDraftToCloud(draftData: DraftData): Promise<{ success: boolean; error?: string }> {
    void draftData;
    return {
      success: false,
      error: 'Legacy quizDrafts admin flow was removed. Use testDraftService with authenticated Firebase roles.',
    };

    try {
      // Check if admin is logged in via sessionStorage
      const isAdmin = false;

      if (!isAdmin) {
        return { success: false, error: 'User not authenticated' };
      }

      // Use hardcoded user ID for single admin user
      const userId = 'admin-teacher';
      console.log('💾 Saving draft for admin user:', userId);

      // Reference to user's drafts collection
      const draftRef = doc(db, 'users', userId, 'quizDrafts', draftData.id);

      // Sanitize data (Firestore doesn't allow undefined values)
      const sanitizedData = sanitizeDraftData(draftData);

      // Prepare data for Firestore
      const cloudDraft = {
        ...sanitizedData,
        userId: userId,
        createdAt: Timestamp.fromDate(new Date(sanitizedData.timestamp)),
        updatedAt: Timestamp.now(),
        isCloud: true,
      };

      // Recursively check for any remaining undefined values
      const hasUndefinedRecursive = (obj: any): boolean => {
        if (obj === undefined) return true;
        if (obj === null || typeof obj !== 'object') return false;
        if (Array.isArray(obj)) return obj.some(item => hasUndefinedRecursive(item));
        return Object.values(obj).some(value => hasUndefinedRecursive(value));
      };

      console.log('🔍 Saving sanitized draft data:', {
        id: sanitizedData.id,
        name: sanitizedData.name,
        passagesCount: sanitizedData.passages?.length || 0,
        questionsCount: sanitizedData.parsedQuestions?.length || 0,
        hasUndefinedTopLevel: Object.values(cloudDraft).some(v => v === undefined),
        hasUndefinedNested: hasUndefinedRecursive(cloudDraft),
      });

      await setDoc(draftRef, cloudDraft);

      console.log('✅ Draft saved to cloud:', draftData.id);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to save draft to cloud:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save to cloud',
      };
    }
  },

  /**
   * Load draft from Firestore
   */
  async loadDraftFromCloud(draftId: string): Promise<{ success: boolean; data?: DraftData; error?: string }> {
    void draftId;
    return {
      success: false,
      error: 'Legacy quizDrafts admin flow was removed. Use testDraftService with authenticated Firebase roles.',
    };

    try {
      // Check if admin is logged in via sessionStorage
      const isAdmin = false;

      if (!isAdmin) {
        return { success: false, error: 'User not authenticated' };
      }

      // Use hardcoded user ID for single admin user
      const userId = 'admin-teacher';

      const draftRef = doc(db, 'users', userId, 'quizDrafts', draftId);
      const draftSnap = await getDoc(draftRef);

      if (!draftSnap.exists()) {
        return { success: false, error: 'Draft not found in cloud' };
      }

      const data = draftSnap.data();

      // Convert Firestore Timestamps back to ISO strings
      const draftData: DraftData = {
        ...data,
        timestamp: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      } as DraftData;

      console.log('✅ Draft loaded from cloud:', draftId);
      return { success: true, data: draftData };
    } catch (error) {
      console.error('Failed to load draft from cloud:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load from cloud',
      };
    }
  },

  /**
   * Get all cloud drafts for current user
   */
  async getAllCloudDrafts(): Promise<{ success: boolean; data?: DraftData[]; error?: string }> {
    return {
      success: false,
      error: 'Legacy quizDrafts admin flow was removed. Use testDraftService with authenticated Firebase roles.',
    };

    try {
      // Check if admin is logged in via sessionStorage
      const isAdmin = false;

      if (!isAdmin) {
        return { success: false, error: 'User not authenticated' };
      }

      // Use hardcoded user ID for single admin user
      const userId = 'admin-teacher';
      console.log('🔍 Loading drafts for admin user:', userId);

      const draftsRef = collection(db, 'users', userId, 'quizDrafts');
      const querySnapshot = await getDocs(draftsRef);

      const drafts: DraftData[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        drafts.push({
          ...data,
          timestamp: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        } as DraftData);
      });

      // Sort by most recent first
      drafts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return { success: true, data: drafts };
    } catch (error) {
      console.error('Failed to get cloud drafts:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch cloud drafts',
      };
    }
  },

  /**
   * Delete draft from Firestore
   */
  async deleteDraftFromCloud(draftId: string): Promise<{ success: boolean; error?: string }> {
    void draftId;
    return {
      success: false,
      error: 'Legacy quizDrafts admin flow was removed. Use testDraftService with authenticated Firebase roles.',
    };

    try {
      // Check if admin is logged in via sessionStorage
      const isAdmin = false;

      if (!isAdmin) {
        return { success: false, error: 'User not authenticated' };
      }

      // Use hardcoded user ID for single admin user
      const userId = 'admin-teacher';

      const draftRef = doc(db, 'users', userId, 'quizDrafts', draftId);
      await deleteDoc(draftRef);

      console.log('✅ Draft deleted from cloud:', draftId);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete draft from cloud:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete from cloud',
      };
    }
  },

  /**
   * Sync: Check if cloud version is newer than local
   */
  async checkCloudVersion(draftId: string, localTimestamp: string): Promise<{
    success: boolean;
    isNewer?: boolean;
    cloudData?: DraftData;
    error?: string;
  }> {
    void draftId;
    void localTimestamp;
    return {
      success: false,
      error: 'Legacy quizDrafts admin flow was removed. Use testDraftService with authenticated Firebase roles.',
    };

    try {
      const result = await this.loadDraftFromCloud(draftId);

      if (!result.success || !result.data) {
        return { success: false, error: result.error };
      }

      const cloudTime = new Date(result.data.timestamp).getTime();
      const localTime = new Date(localTimestamp).getTime();

      return {
        success: true,
        isNewer: cloudTime > localTime,
        cloudData: result.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check cloud version',
      };
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// NEW: Test Draft Service implementing DraftServiceInterface
// For the new Test Creation Modal (PRD-0022)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Test Draft Service
 * Implements DraftServiceInterface for the new test creation flow (PRD-0022)
 * Stores drafts in /drafts/{draftId} collection with proper RBAC rules
 */
export const testDraftService: DraftServiceInterface = {
  /**
   * Create a new draft document
   * Called when: User completes Step 3 (metadata) and starts parsing
   */
  async createDraft(
    userId: string,
    testType: TestType,
    skillType: SkillType,
    format: TestFormat,
    metadata: DraftMetadata
  ): Promise<ServiceResponse<{ draftId: string }>> {
    try {
      // Generate a new document ID
      const draftRef = doc(collection(db, DRAFTS_COLLECTION));
      const draftId = draftRef.id;
      const now = new Date();

      const draftDoc: Omit<DraftDocument, 'id'> & { id: string } = {
        id: draftId,
        userId,
        testType,
        skillType,
        format,
        metadata,
        passages: [],
        questions: [],
        sectionInstructions: {},
        status: 'metadata',
        questionCount: 0,
        missingAnswerCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      // Sanitize and save to Firestore
      const sanitizedData = deepRemoveUndefined(draftDoc);
      await setDoc(draftRef, sanitizedData);

      console.log('✅ Test draft created:', draftId);
      return { success: true, data: { draftId } };
    } catch (error) {
      console.error('❌ Failed to create test draft:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create draft',
      };
    }
  },

  /**
   * Load a draft by ID
   * Called when: User navigates to /teacher/test/review/:draftId
   */
  async loadDraft(draftId: string): Promise<ServiceResponse<DraftDocument>> {
    try {
      const draftRef = doc(db, DRAFTS_COLLECTION, draftId);
      const draftSnap = await getDoc(draftRef);

      if (!draftSnap.exists()) {
        return { success: false, error: 'Draft not found' };
      }

      const data = draftSnap.data();
      const draftDocument = convertTimestamps<DraftDocument>(data);

      console.log('✅ Test draft loaded:', draftId);
      return { success: true, data: draftDocument };
    } catch (error) {
      console.error('❌ Failed to load test draft:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load draft',
      };
    }
  },

  /**
   * Update draft with partial data
   * Called when: Auto-save during review, or explicit save
   */
  async updateDraft(
    draftId: string,
    updates: Partial<Omit<DraftDocument, 'id' | 'userId' | 'createdAt'>>
  ): Promise<ServiceResponse> {
    try {
      const draftRef = doc(db, DRAFTS_COLLECTION, draftId);

      // Always update the updatedAt timestamp
      const updateData = {
        ...updates,
        questions: Array.isArray(updates.questions) ? normalizeParsedQuestions(updates.questions) : updates.questions,
        updatedAt: new Date(),
      };

      const sanitizedData = deepRemoveUndefined(updateData);
      await updateDoc(draftRef, sanitizedData);

      console.log('✅ Test draft updated:', draftId);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to update test draft:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update draft',
      };
    }
  },

  /**
   * Delete a draft permanently
   * Called when: User clicks Delete on draft card, or after successful publish
   */
  async deleteDraft(draftId: string): Promise<ServiceResponse> {
    try {
      const draftRef = doc(db, DRAFTS_COLLECTION, draftId);
      await deleteDoc(draftRef);

      console.log('✅ Test draft deleted:', draftId);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to delete test draft:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete draft',
      };
    }
  },

  /**
   * Get all drafts for a user
   * Called when: User views Drafts tab in Materials page
   */
  async getUserDrafts(userId: string): Promise<ServiceResponse<DraftListItem[]>> {
    try {
      const draftsRef = collection(db, DRAFTS_COLLECTION);
      // Only filter by userId (single-field, auto-indexed) — sort client-side
      // to avoid needing a composite index on userId + updatedAt
      const q = query(
        draftsRef,
        where('userId', '==', userId)
      );

      const querySnapshot = await getDocs(q);
      const drafts: DraftListItem[] = [];

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const updatedAt = data.updatedAt instanceof Timestamp
          ? data.updatedAt.toDate()
          : data.updatedAt ? new Date(data.updatedAt) : new Date(0);
        drafts.push({
          id: data.id,
          title: data.metadata?.title || 'Untitled Draft',
          testType: data.testType,
          skillType: data.skillType,
          format: data.format,
          cefrLevel: data.metadata?.cefrLevel,
          duration: data.metadata?.duration || 60,
          status: data.status,
          questionCount: data.questionCount || 0,
          createdAt: data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : new Date(data.createdAt),
          updatedAt,
        });
      });

      // Sort by updatedAt descending (most recent first) — done client-side
      drafts.sort((a, b) => {
        const timeA = a.updatedAt?.getTime?.() || 0;
        const timeB = b.updatedAt?.getTime?.() || 0;
        return timeB - timeA;
      });

      console.log(`✅ Loaded ${drafts.length} drafts for user:`, userId);
      return { success: true, data: drafts };
    } catch (error) {
      console.error('❌ Failed to get user drafts:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch drafts',
      };
    }
  },

  /**
   * Update only the draft status
   * Called when: Draft transitions between phases (metadata → parsing → review)
   */
  async updateDraftStatus(
    draftId: string,
    status: DraftStatus
  ): Promise<ServiceResponse> {
    try {
      const draftRef = doc(db, DRAFTS_COLLECTION, draftId);

      await updateDoc(draftRef, deepRemoveUndefined({
        status,
        updatedAt: new Date(),
      }));

      console.log('✅ Draft status updated to:', status);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to update draft status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update status',
      };
    }
  },

  /**
   * Save parsed content to draft
   * Called when: Parsing completes successfully
   */
  async saveParsedContent(
    draftId: string,
    passages: Passage[],
    questions: ParsedQuestion[],
    sectionInstructions: Record<string, string>
  ): Promise<ServiceResponse> {
    try {
      const draftRef = doc(db, DRAFTS_COLLECTION, draftId);

      // Count questions missing answers
      const missingAnswerCount = questions.filter(
        q => !q.answer || (typeof q.answer === 'string' && q.answer === '') || (Array.isArray(q.answer) && q.answer.length === 0)
      ).length;

      await updateDoc(draftRef, deepRemoveUndefined({
        passages,
        questions: normalizeParsedQuestions(questions),
        sectionInstructions,
        status: 'review' as DraftStatus,
        questionCount: questions.length,
        missingAnswerCount,
        updatedAt: new Date(),
      }));

      console.log('✅ Parsed content saved to draft:', draftId);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to save parsed content:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save parsed content',
      };
    }
  },
};
