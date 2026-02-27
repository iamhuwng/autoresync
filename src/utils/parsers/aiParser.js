/**
 * aiParser.js - Stub Implementation
 * 
 * @deprecated This file is a stub. The original aiParser was deleted in PRD-0020.
 * Legacy components that still import this file will get stub functions.
 * 
 * For new development, use:
 * - src/services/test-creation/ai-extractor.service.ts (AI extraction)
 * - src/services/ai/router.service.ts (AI provider routing)
 */

const AI_STORAGE_KEY = 'gemini_api_key';
const AI_STATS_KEY = 'ai_parsing_stats';

/**
 * Get stored Gemini API key
 * @deprecated API key is now managed via environment variables
 * @returns {string|null} The stored API key or null
 */
export function getGeminiApiKey() {
    try {
        return localStorage.getItem(AI_STORAGE_KEY);
    } catch {
        return null;
    }
}

/**
 * Set Gemini API key
 * @deprecated API key is now managed via environment variables
 * @param {string} key - The API key to store
 */
export function setGeminiApiKey(key) {
    try {
        localStorage.setItem(AI_STORAGE_KEY, key);
    } catch (e) {
        console.warn('[aiParser] Failed to save API key:', e);
    }
}

/**
 * Clear stored API key
 * @deprecated
 */
export function clearGeminiApiKey() {
    try {
        localStorage.removeItem(AI_STORAGE_KEY);
    } catch (e) {
        console.warn('[aiParser] Failed to clear API key:', e);
    }
}

/**
 * Check if Gemini API is available
 * @deprecated Use new AI service instead
 * @returns {boolean} Whether API key is configured
 */
export function isGeminiAvailable() {
    return !!getGeminiApiKey();
}

/**
 * Get AI parsing statistics
 * @deprecated
 * @returns {Object} Parsing statistics
 */
export function getAIParsingStats() {
    try {
        const stats = localStorage.getItem(AI_STATS_KEY);
        if (stats) {
            return JSON.parse(stats);
        }
    } catch {
        // Ignore
    }
    return {
        total: 0,
        successful: 0,
        successRate: 0,
        avgConfidence: 0
    };
}

/**
 * Determine if AI parsing should be triggered
 * @deprecated Use new validation service instead
 * @param {number} confidence - Current parsing confidence
 * @returns {boolean} Whether to trigger AI
 */
export function shouldTriggerAI(confidence) {
    console.warn('[aiParser] shouldTriggerAI is deprecated. Use new test-creation services.');
    return confidence < 70 && isGeminiAvailable();
}

/**
 * Parse with AI fallback
 * @deprecated Use new AI extractor service instead
 * @param {string} text - Text to parse
 * @param {string} filename - Original filename
 * @param {Object} ruleBasedResult - Result from rule-based parsing
 * @returns {Promise<Object>} Parsed result
 */
export async function parseWithAIFallback(text, filename, ruleBasedResult) {
    console.warn('[aiParser] parseWithAIFallback is deprecated. Use new AI extractor service.');

    // Just return the rule-based result as fallback since AI is deprecated here
    return {
        ...ruleBasedResult,
        source: 'rule-based-fallback',
        aiAttempted: false,
        deprecationNotice: 'AI parsing has been moved to new test-creation services.'
    };
}

export default {
    getGeminiApiKey,
    setGeminiApiKey,
    clearGeminiApiKey,
    isGeminiAvailable,
    getAIParsingStats,
    shouldTriggerAI,
    parseWithAIFallback
};
