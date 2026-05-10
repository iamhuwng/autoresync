/**
 * Offline Parsing Service for IELTS Reading Tests
 * 
 * Provides offline fallback functionality for test parsing:
 * - Rule-only local parsing when offline
 * - IndexedDB storage for parse results
 * - Comparison with AI results when connection restored
 * - Checkpoint persistence in Firestore
 * 
 * @module offline-parser.service
 * @version 1.0.0
 * @date 2026-02-06
 * @see PRD-0020 Phase 8
 */

import {
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    Timestamp,
    serverTimestamp,
} from 'firebase/firestore';
// @ts-ignore - JS service file
import { firestore as db } from '../firebase';
import { typeClassifierService, type ClassificationResult } from './type-classifier.service';
import type { QuestionType } from '../../types/QuestionSchema';
import {
    createRawSourceArtifact,
    type FormattedTestArtifact,
    type RawSourceArtifact,
    type RepairArtifact,
    type SourceAnchor,
    type VerificationArtifact,
} from './source-fidelity';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Parse result stored in IndexedDB
 */
export interface LocalParseResult {
    id: string;
    /** Original document text */
    documentText: string;
    /** Extracted passages */
    passages: ParsedPassage[];
    /** Parsed questions with rule-based classification */
    questions: ParsedQuestion[];
    /** Timestamp when parsed */
    parsedAt: number;
    /** Whether this was parsed offline */
    isOfflineParse: boolean;
    /** Whether AI comparison is pending */
    pendingAIComparison: boolean;
}

export interface ParsedPassage {
    id: string;
    title: string;
    content: string;
    order: number;
    questionRange?: {
        start: number;
        end: number;
    };
    sourceAnchor?: SourceAnchor;
}

export interface ParsedQuestion {
    questionNumber: number;
    questionText: string;
    type: QuestionType;
    confidence: number;
    options?: string[];
    answer?: string | string[];
    passageId?: string;
    sectionInstruction?: string;
    sourceAnchors?: SourceAnchor[];
    /** Classification details from rules engine */
    classificationDetails?: ClassificationResult;
}

/**
 * Comparison result between offline and AI parsing
 */
export interface OfflineVsAIComparison {
    id: string;
    /** Number of questions that matched */
    matchedCount: number;
    /** Number of questions with type differences */
    typeDifferenceCount: number;
    /** Detailed differences */
    differences: TypeDifference[];
    /** Recommendation for user */
    recommendation: 'use_ai' | 'use_offline' | 'review_needed';
}

export interface TypeDifference {
    questionNumber: number;
    offlineType: QuestionType;
    offlineConfidence: number;
    aiType: QuestionType;
    aiConfidence: number;
    /** Recommended type to use */
    recommended: QuestionType;
    /** Source of recommendation */
    recommendedSource: 'offline' | 'ai';
}

export interface ParsingCheckpointPartialResults extends Partial<LocalParseResult> {
    rawSource?: RawSourceArtifact;
    formattedTest?: FormattedTestArtifact;
    verification?: VerificationArtifact;
    repair?: RepairArtifact | null;
}

/**
 * Firestore checkpoint data
 */
export interface ParsingCheckpoint {
    id: string;
    userId: string;
    documentHash: string;
    stage: 'converting' | 'extracting' | 'classifying' | 'validating';
    progress: number;
    /** Partial results at this checkpoint */
    partialResults?: ParsingCheckpointPartialResults;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    /** Expires after 24 hours */
    expiresAt: Timestamp;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const IDB_NAME = 'test-creation-offline';
const IDB_VERSION = 1;
const IDB_STORE_NAME = 'parseResults';
const CHECKPOINT_COLLECTION = 'parsingCache';
const CHECKPOINT_TTL_HOURS = 24;

const sanitizeCheckpointPartialResults = (
    partialResults?: ParsingCheckpointPartialResults,
): ParsingCheckpointPartialResults | undefined => {
    if (partialResults === undefined) {
        return undefined;
    }

    return JSON.parse(JSON.stringify(partialResults)) as ParsingCheckpointPartialResults;
};

// ═══════════════════════════════════════════════════════════════
// INDEXEDDB MANAGER
// ═══════════════════════════════════════════════════════════════

class IndexedDBManager {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<IDBDatabase> | null = null;

    /**
     * Initialize IndexedDB
     */
    async init(): Promise<IDBDatabase> {
        if (this.db) return this.db;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(IDB_NAME, IDB_VERSION);

            request.onerror = () => {
                console.error('[IndexedDB] Failed to open database:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('[IndexedDB] Database opened successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Create parse results store
                if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
                    const store = db.createObjectStore(IDB_STORE_NAME, { keyPath: 'id' });
                    store.createIndex('parsedAt', 'parsedAt', { unique: false });
                    store.createIndex('pendingAIComparison', 'pendingAIComparison', { unique: false });
                    console.log('[IndexedDB] Created store:', IDB_STORE_NAME);
                }
            };
        });

        return this.initPromise;
    }

    /**
     * Save parse result to IndexedDB
     */
    async save(result: LocalParseResult): Promise<void> {
        const db = await this.init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(IDB_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(IDB_STORE_NAME);
            const request = store.put(result);

            request.onsuccess = () => {
                console.log('[IndexedDB] Saved parse result:', result.id);
                resolve();
            };

            request.onerror = () => {
                console.error('[IndexedDB] Failed to save:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get parse result by ID
     */
    async get(id: string): Promise<LocalParseResult | null> {
        const db = await this.init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(IDB_STORE_NAME, 'readonly');
            const store = transaction.objectStore(IDB_STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => {
                resolve(request.result || null);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get all results pending AI comparison
     */
    async getPendingComparison(): Promise<LocalParseResult[]> {
        const db = await this.init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(IDB_STORE_NAME, 'readonly');
            const store = transaction.objectStore(IDB_STORE_NAME);
            const index = store.index('pendingAIComparison');
            const request = index.getAll(IDBKeyRange.only(true));

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Delete parse result
     */
    async delete(id: string): Promise<void> {
        const db = await this.init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(IDB_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(IDB_STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear old entries (older than 7 days)
     */
    async clearOldEntries(): Promise<number> {
        const db = await this.init();
        const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
        let deletedCount = 0;

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(IDB_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(IDB_STORE_NAME);
            const index = store.index('parsedAt');
            const range = IDBKeyRange.upperBound(cutoff);
            const request = index.openCursor(range);

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    cursor.delete();
                    deletedCount++;
                    cursor.continue();
                } else {
                    console.log(`[IndexedDB] Cleared ${deletedCount} old entries`);
                    resolve(deletedCount);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }
}

// ═══════════════════════════════════════════════════════════════
// OFFLINE PARSER SERVICE
// ═══════════════════════════════════════════════════════════════

class OfflineParserService {
    private idbManager = new IndexedDBManager();

    // ─────────────────────────────────────────────────────────────
    // NETWORK STATUS
    // ─────────────────────────────────────────────────────────────

    /**
     * Check if currently online
     */
    isOnline(): boolean {
        return typeof navigator !== 'undefined' ? navigator.onLine : true;
    }

    /**
     * Add listener for online status changes
     */
    onStatusChange(callback: (isOnline: boolean) => void): () => void {
        const handleOnline = () => callback(true);
        const handleOffline = () => callback(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }

    // ─────────────────────────────────────────────────────────────
    // OFFLINE PARSING (RULE-BASED ONLY)
    // ─────────────────────────────────────────────────────────────

    /**
     * Parse document text using only rule-based classification
     * Used when offline or as fallback
     * 
     * @param documentText - The extracted document text
     * @param documentId - Unique identifier for this document
     * @returns Local parse result
     */
    async parseOffline(documentText: string, documentId: string): Promise<LocalParseResult> {
        const rawSource = createRawSourceArtifact(documentText);
        const passages = this.extractPassagesFromSource(rawSource);
        const questions = this.extractAndClassifyQuestionsFromSource(rawSource, passages);

        const result: LocalParseResult = {
            id: documentId,
            documentText,
            passages,
            questions,
            parsedAt: Date.now(),
            isOfflineParse: true,
            pendingAIComparison: true,
        };

        // Save to IndexedDB
        await this.idbManager.save(result);

        console.log(`[OfflineParser] Parsed ${questions.length} questions from ${passages.length} passages`);
        return result;
    }

    private extractPassagesFromSource(rawSource: RawSourceArtifact): ParsedPassage[] {
        return rawSource.passageBlocks.map((passage) => ({
            id: passage.rawPassageId.replace('raw-', ''),
            title: passage.title,
            content: passage.content,
            order: passage.order,
            questionRange: passage.questionRange,
            sourceAnchor: passage.bodyAnchor,
        }));
    }

    private extractAndClassifyQuestionsFromSource(
        rawSource: RawSourceArtifact,
        passages: ParsedPassage[],
    ): ParsedQuestion[] {
        const answerKey = rawSource.answerKeyBlock?.answers || {};

        return rawSource.questionBlocks
            .map((rawQuestion) => {
                const optionsForClassification =
                    rawQuestion.options.length > 0
                        ? rawQuestion.options
                        : rawQuestion.sharedOptions;
                const classification = rawQuestion.instructionText
                    ? typeClassifierService.detectFromSectionContext(
                        rawQuestion.instructionText,
                        rawQuestion.questionText,
                        optionsForClassification,
                    )
                    : typeClassifierService.classifyQuestion(
                        rawQuestion.questionText,
                        optionsForClassification,
                    );

                return {
                    questionNumber: rawQuestion.questionNumber,
                    questionText: rawQuestion.questionText,
                    type: classification.type,
                    confidence: classification.confidence,
                    options:
                        optionsForClassification.length > 0
                            ? optionsForClassification
                            : undefined,
                    answer: answerKey[rawQuestion.questionNumber],
                    passageId: this.assignPassageFromPassages(
                        rawQuestion.questionNumber,
                        passages,
                    ),
                    sectionInstruction: rawQuestion.instructionText,
                    sourceAnchors: [
                        rawQuestion.blockAnchor,
                        ...(rawQuestion.instructionAnchor ? [rawQuestion.instructionAnchor] : []),
                    ],
                    classificationDetails: classification,
                };
            })
            .sort((a, b) => a.questionNumber - b.questionNumber);
    }

    private assignPassageFromPassages(
        questionNumber: number,
        passages: ParsedPassage[],
    ): string {
        const rangedPassage = passages.find((passage) =>
            passage.questionRange &&
            questionNumber >= passage.questionRange.start &&
            questionNumber <= passage.questionRange.end,
        );

        if (rangedPassage) {
            return rangedPassage.id;
        }

        if (passages.length <= 1) return passages[0]?.id || 'passage-1';

        const questionsPerPassage = 13;
        const passageIndex = Math.min(
            Math.floor((questionNumber - 1) / questionsPerPassage),
            passages.length - 1,
        );

        return passages[passageIndex]?.id || `passage-${passageIndex + 1}`;
    }

    /**
     * Extract passages from document text
     */
    extractPassages(text: string): ParsedPassage[] {
        const passages: ParsedPassage[] = [];

        // Pattern: "READING PASSAGE 1/2/3" or "Passage A/B/C"
        const passagePattern = /(?:READING\s+)?PASSAGE\s+([123ABC])\s*[:\-—]?\s*([^\n]+)?/gi;
        const matches = [...text.matchAll(passagePattern)];

        if (matches.length === 0) {
            // No explicit passages found, treat entire text as one passage
            passages.push({
                id: 'passage-1',
                title: 'Reading Passage',
                content: text.substring(0, 5000), // Limit content length
                order: 1,
            });
            return passages;
        }

        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            if (!match) continue;

            const identifier = match[1] ?? '1';
            const title = match[2]?.trim() || `Passage ${identifier}`;
            const matchIndex = match.index ?? 0;
            const startIndex = matchIndex + match[0].length;
            const endIndex = matches[i + 1]?.index ?? text.length;
            const content = text.substring(startIndex, endIndex).trim();

            passages.push({
                id: `passage-${identifier.toLowerCase()}`,
                title,
                content: content.substring(0, 5000),
                order: i + 1,
            });
        }

        return passages;
    }

    /**
     * Extract and classify questions from document text
     */
    extractAndClassifyQuestions(text: string, passages: ParsedPassage[]): ParsedQuestion[] {
        const questions: ParsedQuestion[] = [];
        const normalizedText = text.replace(/\r\n/g, '\n');

        // Pattern: "Questions X-Y" or "Question X"
        const questionSectionPattern = /Questions?\s+(\d+)(?:\s*[-–—to]\s*(\d+))?[.\s:]/gi;
        const questionPattern = /^\s*(?:[-*]\s*)?(?:\*\*|__)?(?:Question\s+)?(\d+)\s*[.)](?:\*\*|__)?\s*(.*)$/gmi;

        // Find question sections with instructions
        const sections = [...normalizedText.matchAll(questionSectionPattern)];

        // Extract individual questions
        const questionMatches = [...normalizedText.matchAll(questionPattern)];

        for (const qMatch of questionMatches) {
            if (!qMatch || !qMatch[1] || !qMatch[2]) continue;

            const questionNumber = parseInt(qMatch[1], 10);
            let questionText = qMatch[2].trim();
            if (!questionText) {
                questionText = this.findNextQuestionText(
                    normalizedText,
                    (qMatch.index ?? 0) + qMatch[0].length
                );
            }

            if (!questionText) continue;

            // Find which section this question belongs to
            const sectionInstruction = this.findSectionInstruction(normalizedText, questionNumber, sections);

            // Classify using type classifier service with context
            const classification = sectionInstruction
                ? typeClassifierService.detectFromSectionContext(sectionInstruction, questionText, [])
                : typeClassifierService.classifyQuestion(questionText, []);

            // Determine which passage this question belongs to
            const passageId = this.assignPassage(questionNumber, passages.length);

            questions.push({
                questionNumber,
                questionText,
                type: classification.type,
                confidence: classification.confidence,
                passageId,
                classificationDetails: classification,
            });
        }

        // Sort by question number
        questions.sort((a, b) => a.questionNumber - b.questionNumber);

        return questions;
    }

    findNextQuestionText(text: string, startIndex: number): string {
        const remainingLines = text.slice(startIndex).split('\n');

        for (const rawLine of remainingLines) {
            const line = rawLine.trim();
            if (!line) continue;
            if (/^(?:Question\s+)?\d+\s*[.)]/i.test(line)) continue;
            return line;
        }

        return '';
    }

    /**
     * Find section instruction for a question
     */
    findSectionInstruction(
        text: string,
        questionNumber: number,
        sections: RegExpMatchArray[]
    ): string {
        for (let i = sections.length - 1; i >= 0; i--) {
            const section = sections[i];
            if (!section || !section[1]) continue;

            const start = parseInt(section[1], 10);
            const end = section[2] ? parseInt(section[2], 10) : start;

            if (questionNumber >= start && questionNumber <= end) {
                // Extract instruction text after this section header
                const sectionIndex = section.index ?? 0;
                const startIndex = sectionIndex + section[0].length;
                const endIndex = sections[i + 1]?.index ?? startIndex + 500;
                return text.substring(startIndex, endIndex).trim();
            }
        }
        return '';
    }

    /**
     * Assign question to a passage (simple heuristic)
     */
    assignPassage(questionNumber: number, passageCount: number): string {
        if (passageCount <= 1) return 'passage-1';

        // IELTS typically has ~13 questions per passage
        const questionsPerPassage = 13;
        const passageIndex = Math.min(
            Math.floor((questionNumber - 1) / questionsPerPassage),
            passageCount - 1
        );

        return `passage-${passageIndex + 1}`;
    }

    // ─────────────────────────────────────────────────────────────
    // AI COMPARISON
    // ─────────────────────────────────────────────────────────────

    /**
     * Compare offline parse result with AI result
     * 
     * @param offlineResult - The offline parse result
     * @param aiQuestions - Questions from AI extraction
     * @returns Comparison result
     */
    compareWithAI(
        offlineResult: LocalParseResult,
        aiQuestions: { questionNumber: number; type: string; confidence: number }[]
    ): OfflineVsAIComparison {
        const differences: TypeDifference[] = [];
        let matchedCount = 0;

        const aiMap = new Map(aiQuestions.map(q => [q.questionNumber, q]));

        for (const offlineQ of offlineResult.questions) {
            const aiQ = aiMap.get(offlineQ.questionNumber);

            if (!aiQ) continue;

            const offlineType = offlineQ.type;
            const aiType = aiQ.type as QuestionType;

            if (offlineType === aiType) {
                matchedCount++;
            } else {
                // Determine recommendation
                const offlineConf = offlineQ.confidence;
                const aiConf = aiQ.confidence;
                const recommended = aiConf > offlineConf ? aiType : offlineType;
                const recommendedSource = aiConf > offlineConf ? 'ai' : 'offline';

                differences.push({
                    questionNumber: offlineQ.questionNumber,
                    offlineType,
                    offlineConfidence: offlineConf,
                    aiType,
                    aiConfidence: aiConf,
                    recommended,
                    recommendedSource,
                });
            }
        }

        // Determine overall recommendation
        let recommendation: 'use_ai' | 'use_offline' | 'review_needed';
        if (differences.length === 0) {
            recommendation = 'use_ai'; // Both agree
        } else if (differences.length <= 2) {
            recommendation = 'review_needed'; // Minor differences
        } else {
            // Many differences - prefer AI if average confidence is higher
            const avgAIConf = differences.reduce((sum, d) => sum + d.aiConfidence, 0) / differences.length;
            const avgOfflineConf = differences.reduce((sum, d) => sum + d.offlineConfidence, 0) / differences.length;
            recommendation = avgAIConf > avgOfflineConf ? 'use_ai' : 'review_needed';
        }

        return {
            id: offlineResult.id,
            matchedCount,
            typeDifferenceCount: differences.length,
            differences,
            recommendation,
        };
    }

    /**
     * Mark offline result as compared (no longer pending)
     */
    async markCompared(id: string): Promise<void> {
        const result = await this.idbManager.get(id);
        if (result) {
            result.pendingAIComparison = false;
            await this.idbManager.save(result);
        }
    }

    /**
     * Get all results pending AI comparison
     */
    async getPendingComparisons(): Promise<LocalParseResult[]> {
        return this.idbManager.getPendingComparison();
    }

    // ─────────────────────────────────────────────────────────────
    // FIRESTORE CHECKPOINTS
    // ─────────────────────────────────────────────────────────────

    /**
     * Save parsing checkpoint to Firestore
     * 
     * @param userId - User ID
     * @param documentHash - Hash of the document being parsed
     * @param stage - Current parsing stage
     * @param progress - Progress percentage
     * @param partialResults - Partial results at this checkpoint
     */
    async saveCheckpoint(
        userId: string,
        documentHash: string,
        stage: ParsingCheckpoint['stage'],
        progress: number,
        partialResults?: ParsingCheckpointPartialResults
    ): Promise<string> {
        try {
            const checkpointId = `${userId}_${documentHash}`;
            const docRef = doc(db, CHECKPOINT_COLLECTION, checkpointId);
            const sanitizedPartialResults = sanitizeCheckpointPartialResults(partialResults);

            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + CHECKPOINT_TTL_HOURS);

            const checkpointBase = {
                id: checkpointId,
                userId,
                documentHash,
                stage,
                progress,
                createdAt: serverTimestamp() as Timestamp,
                updatedAt: serverTimestamp() as Timestamp,
                expiresAt: Timestamp.fromDate(expiresAt),
            };
            const checkpoint =
                sanitizedPartialResults === undefined
                    ? checkpointBase
                    : {
                        ...checkpointBase,
                        partialResults: sanitizedPartialResults,
                    };

            await setDoc(docRef, checkpoint, { merge: true });
            console.log(`[OfflineParser] Saved checkpoint at stage: ${stage}, progress: ${progress}%`);

            return checkpointId;
        } catch (error) {
            console.error('[OfflineParser] Failed to save checkpoint:', error);
            throw new Error('Failed to save parsing checkpoint');
        }
    }

    /**
     * Get checkpoint for a document
     */
    async getCheckpoint(userId: string, documentHash: string): Promise<ParsingCheckpoint | null> {
        try {
            const checkpointId = `${userId}_${documentHash}`;
            const docRef = doc(db, CHECKPOINT_COLLECTION, checkpointId);
            const snapshot = await getDoc(docRef);

            if (!snapshot.exists()) {
                return null;
            }

            const checkpoint = snapshot.data() as ParsingCheckpoint;

            // Check if expired
            if (checkpoint.expiresAt && checkpoint.expiresAt.toDate() < new Date()) {
                await this.deleteCheckpoint(userId, documentHash);
                return null;
            }

            return checkpoint;
        } catch (error) {
            console.error('[OfflineParser] Failed to get checkpoint:', error);
            return null;
        }
    }

    /**
     * Delete checkpoint
     */
    async deleteCheckpoint(userId: string, documentHash: string): Promise<void> {
        try {
            const checkpointId = `${userId}_${documentHash}`;
            const docRef = doc(db, CHECKPOINT_COLLECTION, checkpointId);
            await deleteDoc(docRef);
            console.log('[OfflineParser] Deleted checkpoint');
        } catch (error) {
            console.error('[OfflineParser] Failed to delete checkpoint:', error);
        }
    }

    /**
     * Generate hash for document text
     */
    async hashDocument(text: string): Promise<string> {
        // Simple hash for document identification
        const encoder = new TextEncoder();
        const data = encoder.encode(text.substring(0, 1000)); // Use first 1000 chars
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
    }

    // ─────────────────────────────────────────────────────────────
    // STORAGE MANAGEMENT
    // ─────────────────────────────────────────────────────────────

    /**
     * Get local parse result by ID
     */
    async getLocalResult(id: string): Promise<LocalParseResult | null> {
        return this.idbManager.get(id);
    }

    /**
     * Delete local parse result
     */
    async deleteLocalResult(id: string): Promise<void> {
        return this.idbManager.delete(id);
    }

    /**
     * Clear old entries from IndexedDB
     */
    async cleanupOldEntries(): Promise<number> {
        return this.idbManager.clearOldEntries();
    }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

/**
 * Singleton instance of OfflineParserService
 */
export const offlineParserService = new OfflineParserService();

/**
 * Re-export class for testing
 */
export { OfflineParserService, IndexedDBManager };

/**
 * Constants for testing
 */
export const OFFLINE_PARSER_CONSTANTS = {
    IDB_NAME,
    IDB_VERSION,
    IDB_STORE_NAME,
    CHECKPOINT_COLLECTION,
    CHECKPOINT_TTL_HOURS,
};
