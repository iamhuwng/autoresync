---
title: 'Pattern: LLM JSON Response Recovery Pipeline'
createdAt: '2026-03-04T01:33:30.472Z'
updatedAt: '2026-03-04T01:39:03.067Z'
description: >-
  5-strategy recovery pipeline for parsing malformed JSON from LLM responses.
  Handles bad Unicode escapes, control characters, trailing commas, missing
  commas, and truncated output.
tags:
  - pattern
  - ai
  - json
  - parsing
  - resilience
---
# Pattern: LLM JSON Response Recovery Pipeline

## Problem

LLMs (Groq/Llama, Gemini, etc.) frequently return malformed JSON, especially with:
- **Vietnamese diacritical text** (ă, ê, ơ, ư) causing broken `\u` escape sequences
- **Trailing commentary** after the JSON closing `}`
- **Literal control characters** (newlines, tabs) inside JSON string values
- **Missing commas** between properties or after closing braces
- **Truncated output** (unclosed strings, brackets, braces) when hitting token limits

A naive `JSON.parse()` fails silently and drops the entire AI response, forcing expensive retries or fallback to inferior parsers.

## Solution

A **5-strategy cascading recovery pipeline** that progressively applies more aggressive repair methods:

| Strategy | What It Fixes | Cost |
|----------|--------------|------|
| 1. Direct parse | Well-formed JSON | Zero |
| 2. Unicode + control char sanitization | `\u` escapes, literal `
`/`\t` in strings | O(n) |
| 3. Trailing comma removal | `,}` or `,]` at end of arrays/objects | Regex |
| 4. Aggressive structural repair | Missing commas between properties | Regex + rescan |
| 5. Truncation repair | Unclosed strings, brackets, braces | O(n) |

**Plus:** Add `response_format: { type: "json_object" }` to Groq API calls to prevent trailing text.

### Key Insight: Bad Unicode Escape Fix

Vietnamese diacritics cause Llama to emit broken `\u` sequences (e.g., `\ub` instead of proper `\u0062`). A single regex fixes this:

```typescript
json = json.replace(/\\u(?![0-9a-fA-F]{4})/g, '\\\\u');
```

This escapes the backslash itself when `\u` is NOT followed by exactly 4 hex digits, converting invalid `\uXXX` to a literal `\u` string.

## Implementation

### Helper 1: sanitizeJsonControlChars()

Character-by-character scanner that tracks string context and replaces literal control characters with their escape sequences:

```typescript
function sanitizeJsonControlChars(jsonStr: string): string {
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        if (!char) continue;
        const charCode = char.charCodeAt(0);

        if (escaped) { result += char; escaped = false; continue; }
        if (char === '\\' && inString) { result += char; escaped = true; continue; }
        if (char === '"' && !escaped) { inString = !inString; result += char; continue; }

        if (inString && charCode < 32) {
            switch (charCode) {
                case 9: result += '\\t'; break;
                case 10: result += '\
'; break;
                case 13: result += '\\r'; break;
                default: result += `\\u${charCode.toString(16).padStart(4, '0')}`; break;
            }
        } else {
            result += char;
        }
    }
    return result;
}
```

### Helper 2: aggressiveJsonRepair()

Fixes structural issues common in multi-line LLM JSON:

```typescript
function aggressiveJsonRepair(jsonStr: string): string {
    let result = jsonStr;
    // Missing comma between properties
    result = result.replace(/(\")\s*
\s*(\")/g, '$1,
$2');
    // Missing comma after closing brace/bracket
    result = result.replace(/([\]}])\s*
\s*(\")/g, '$1,
$2');
    result = sanitizeJsonControlChars(result);
    return result;
}
```

### Helper 3: repairTruncatedJson()

Closes unclosed structures from token-limited output:

```typescript
function repairTruncatedJson(jsonStr: string): string {
    let result = jsonStr;

    // Close unclosed strings (odd quote count)
    let quoteCount = 0, esc = false;
    for (let i = 0; i < result.length; i++) {
        if (esc) { esc = false; continue; }
        if (result[i] === '\\') { esc = true; continue; }
        if (result[i] === '"') quoteCount++;
    }
    if (quoteCount % 2 !== 0) result += '"';

    // Strip trailing partial values
    result = result.replace(/,\s*"[^"]*$/, '');
    result = result.replace(/:\s*"[^"]*$/, ': ""');
    result = result.replace(/,\s*$/gm, '');

    // Close unclosed brackets/braces
    let braces = 0, brackets = 0, inStr = false, esc2 = false;
    for (let i = 0; i < result.length; i++) {
        const ch = result[i];
        if (esc2) { esc2 = false; continue; }
        if (ch === '\\' && inStr) { esc2 = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') braces++; else if (ch === '}') braces--;
        if (ch === '[') brackets++; else if (ch === ']') brackets--;
    }
    while (brackets > 0) { result += ']'; brackets--; }
    while (braces > 0) { result += '}'; braces--; }

    return result;
}
```

### Main Pipeline: extractJSON()

```typescript
function extractJSON(text: string): any {
    let cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/gi, '').trim();

    try { return JSON.parse(cleaned); } catch (e1) {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start === -1 || end === -1 || end <= start) throw new Error('No JSON found');
        let json = cleaned.substring(start, end + 1);

        // Strip comments, fix bad Unicode escapes
        json = json.replace(/\/\/[^
]*/g, '');
        json = json.replace(/\/\*[\s\S]*?\*\//g, '');
        json = json.replace(/\\u(?![0-9a-fA-F]{4})/g, '\\\\u');

        const sanitized = sanitizeJsonControlChars(json);
        try { return JSON.parse(sanitized); } catch (e2) {
            const noCommas = sanitized.replace(/,\s*([}\]])/g, '$1');
            try { return JSON.parse(noCommas); } catch (e3) {
                try { return JSON.parse(aggressiveJsonRepair(noCommas)); } catch (e4) {
                    try { return JSON.parse(repairTruncatedJson(noCommas)); } catch (e5) {
                        throw new Error(`All 5 strategies failed: ${(e5 as Error).message}`);
                    }
                }
            }
        }
    }
}
```

## When To Use

Apply this pattern whenever parsing JSON from LLM API responses that contain:
- Non-ASCII text (Vietnamese, Arabic, CJK, etc.)
- Long structured output (50+ questions, nested sections)
- Responses near the `max_tokens` limit

## API-Level Prevention

**Groq:** Add `response_format: { type: "json_object" }` to prevent trailing commentary.
**Gemini:** Use `generationConfig.responseMimeType = "application/json"` for structured output.
**OpenAI:** Use `response_format: { type: "json_object" }`.

## Canonical Implementations

| File | Function | Role |
|------|----------|------|
| `src/services/ai/groq.provider.ts` | `extractJSON()` (line ~829) | IELTS parser — original 5-strategy version |
| `src/services/test-creation/thcsDocumentParser.service.ts` | `extractJSON()` (line ~784) | THCS parser — ported version |

## Source

Extracted from THCS AI parse error investigation (2026-03-03). Both Groq keys failed on a Vietnamese THCS exam: Key 1 hit `Bad Unicode escape`, Key 2 hit `Unexpected non-whitespace after JSON`.



## Update Log

- **2026-03-04:** Added `response_format: { type: 'json_object' }` to THCS parser's Groq API call (line ~1448 in `thcsDocumentParser.service.ts`). This prevents the trailing commentary issue at the API level, reducing reliance on strategies 3-5.
- **2026-03-04:** THCS `extractJSON()` now fully mirrors the 5-strategy pipeline from `groq.provider.ts`, including the `sanitizeJsonControlChars()`, `aggressiveJsonRepair()`, and `repairTruncatedJson()` helper functions.
