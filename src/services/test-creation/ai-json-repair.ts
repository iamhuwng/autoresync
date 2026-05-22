/**
 * Shared AI JSON Repair Utilities
 *
 * Canonical implementations extracted from groq.provider.ts.
 * Used by both IELTS (groq.provider.ts) and THCS (thcsDocumentParser.service.ts)
 * parsing pipelines so repair logic stays in sync.
 *
 * Exported functions:
 *   sanitizeJsonControlChars  — escape literal control chars inside JSON string values
 *   aggressiveJsonRepair      — fix missing commas, re-sanitize after structural repair
 *   repairTruncatedJson       — close unclosed brackets/braces from truncated responses
 *   extractJSON               — full 5-strategy JSON extraction (strip fences → parse →
 *                               sanitize → remove trailing commas → aggressive repair →
 *                               truncation repair)
 */

export type AIJsonExtractionFailureReason =
    | 'no-json-object'
    | 'bad-escape-sequence'
    | 'truncated-json'
    | 'malformed-json';

export class AIJsonExtractionError extends Error {
    readonly reason: AIJsonExtractionFailureReason;

    constructor(reason: AIJsonExtractionFailureReason, message: string) {
        super(message);
        this.name = 'AIJsonExtractionError';
        this.reason = reason;
    }
}

const classifyJsonExtractionFailure = (messages: readonly string[]): AIJsonExtractionFailureReason => {
    const text = messages.join('\n').toLowerCase();
    if (
        text.includes('bad escaped character')
        || text.includes('bad escape')
        || text.includes('invalid escaped character')
        || text.includes('invalid escape')
    ) {
        return 'bad-escape-sequence';
    }

    if (
        text.includes('unexpected end')
        || text.includes('unterminated')
        || text.includes('end of json input')
    ) {
        return 'truncated-json';
    }

    return 'malformed-json';
};

const messageForJsonExtractionFailure = (reason: AIJsonExtractionFailureReason): string => {
    switch (reason) {
        case 'no-json-object':
            return 'No JSON object found in AI response';
        case 'bad-escape-sequence':
            return 'No valid JSON found in AI response (bad-escape-sequence)';
        case 'truncated-json':
            return 'No valid JSON found in AI response (truncated-json)';
        case 'malformed-json':
        default:
            return 'No valid JSON found in AI response (malformed-json)';
    }
};

export const isAIJsonExtractionError = (error: unknown): error is AIJsonExtractionError =>
    error instanceof AIJsonExtractionError;

/**
 * Sanitize control characters inside JSON string values.
 * LLMs sometimes return JSON with literal newlines, tabs, etc.
 * inside string values instead of proper escape sequences.
 */
export function sanitizeJsonControlChars(jsonStr: string): string {
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        if (!char) continue; // Guard against undefined

        if (escaped) {
            result += char;
            escaped = false;
            continue;
        }

        if (char === '\\' && inString) {
            result += char;
            escaped = true;
            continue;
        }

        if (char === '"' && !escaped) {
            inString = !inString;
            result += char;
            continue;
        }

        if (inString) {
            const charCode = char.charCodeAt(0);
            if (charCode < 32) {
                switch (charCode) {
                    case 9: result += '\\t'; break;  // Tab
                    case 10: result += '\\n'; break;  // Newline
                    case 13: result += '\\r'; break;  // Carriage return
                    default: result += `\\u${charCode.toString(16).padStart(4, '0')}`; break;
                }
            } else {
                result += char;
            }
        } else {
            result += char;
        }
    }

    return result;
}

/**
 * Aggressively repair malformed JSON.
 * Handles unescaped quotes, missing commas between properties, etc.
 * Re-sanitizes control chars after structural repair.
 */
export function aggressiveJsonRepair(jsonStr: string): string {
    let result = jsonStr;

    // Fix: missing comma between properties (e.g., "a": 1 "b": 2 → "a": 1, "b": 2)
    result = result.replace(/(\")\s*\n\s*(\")/g, '$1,\n$2');

    // Fix: missing comma after closing brace/bracket before next key
    result = result.replace(/([\]}])\s*\n\s*(\")/g, '$1,\n$2');

    // Re-sanitize control chars after repair
    result = sanitizeJsonControlChars(result);

    return result;
}

/**
 * Repair truncated JSON by closing unclosed brackets and braces.
 * Handles responses that were cut off mid-generation.
 */
export function repairTruncatedJson(jsonStr: string): string {
    let result = jsonStr;

    // Close any unclosed string at the end
    let quoteCount = 0;
    let esc = false;
    for (let i = 0; i < result.length; i++) {
        if (esc) { esc = false; continue; }
        if (result[i] === '\\') { esc = true; continue; }
        if (result[i] === '"') quoteCount++;
    }
    if (quoteCount % 2 !== 0) {
        // Odd number of quotes — we're inside an unclosed string
        result += '"';
    }

    // Remove trailing comma if present
    result = result.replace(/,\s*$/, '');

    // Count unclosed brackets and braces
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < result.length; i++) {
        const ch = result[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\' && inString) { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') openBraces++;
        else if (ch === '}') openBraces--;
        else if (ch === '[') openBrackets++;
        else if (ch === ']') openBrackets--;
    }

    // Close any unclosed structures
    while (openBrackets > 0) { result += ']'; openBrackets--; }
    while (openBraces > 0) { result += '}'; openBraces--; }

    return result;
}

/**
 * Extract JSON from an AI response string using 5 progressive recovery strategies:
 *   1. Direct parse after stripping markdown fences
 *   2. Sanitize control characters inside string values, then parse
 *   3. Remove trailing commas (common LLM mistake), then parse
 *   4. Aggressive structural repair (missing commas, re-sanitize), then parse
 *   5. Truncation repair (close unclosed brackets/braces), then parse
 *
 * Throws if all strategies fail.
 */
export function extractJSON(text: string): unknown {
    let cleaned = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

    // Strategy 1: try parsing as-is
    try {
        return JSON.parse(cleaned);
    } catch (e1) {
        // Extract outermost JSON object
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new AIJsonExtractionError('no-json-object', messageForJsonExtractionFailure('no-json-object'));
        }
        const jsonStr = jsonMatch[0]!;

        // Strategy 2: Sanitize control characters, then parse
        const sanitized = sanitizeJsonControlChars(jsonStr);
        try {
            return JSON.parse(sanitized);
        } catch (e2) {
            // Strategy 3: Remove trailing commas, then parse
            const noTrailingCommas = sanitized.replace(/,\s*([\]}])/g, '$1');
            try {
                return JSON.parse(noTrailingCommas);
            } catch (e3) {
                // Strategy 4: Aggressive structural repair
                try {
                    const repaired = aggressiveJsonRepair(noTrailingCommas);
                    return JSON.parse(repaired);
                } catch (e4) {
                    // Strategy 5: Truncation repair
                    try {
                        const truncRepaired = repairTruncatedJson(noTrailingCommas);
                        return JSON.parse(truncRepaired);
                    } catch (e5) {
                        const reason = classifyJsonExtractionFailure([
                            (e1 as Error).message,
                            (e2 as Error).message,
                            (e3 as Error).message,
                            (e4 as Error).message,
                            (e5 as Error).message,
                        ]);
                        console.warn('[ai-json-repair] All JSON recovery strategies failed:', {
                            strategy1: (e1 as Error).message,
                            strategy2: (e2 as Error).message,
                            strategy3: (e3 as Error).message,
                            strategy4: (e4 as Error).message,
                            strategy5: (e5 as Error).message,
                            reason,
                            responseLength: jsonStr.length,
                        });
                        throw new AIJsonExtractionError(reason, messageForJsonExtractionFailure(reason));
                    }
                }
            }
        }
    }
}
