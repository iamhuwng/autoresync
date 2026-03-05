---
title: 'Pattern: AI Provider Fallback Chain with Key Rotation'
createdAt: '2026-03-04T22:24:39.168Z'
updatedAt: '2026-03-04T22:25:35.420Z'
description: >-
  How to implement a multi-provider AI fallback chain (Gemini → Groq →
  deterministic) with per-provider key rotation, validation, and graceful
  degradation
tags:
  - pattern
  - ai
  - resilience
  - fallback
---
# Pattern: AI Provider Fallback Chain with Key Rotation

## Problem

AI API calls are unreliable in production:
- Individual API keys get rate-limited (429 errors)
- Entire providers can be temporarily unavailable
- Keys stored in different locations (env vars, Firestore) need unified access
- A single failed AI call should NOT break the user experience

## Solution

Implement a **two-level fallback chain**:

1. **Inner loop (key rotation)**: For each provider, iterate through all available keys. Skip rate-limited keys, continue to next.
2. **Outer loop (provider fallback)**: If all keys for Provider A fail, fall back to Provider B.
3. **Final fallback**: If all providers fail, return `null` — let the caller handle graceful degradation.

## Architecture

```
generateAIFeedback()
  │
  ├─→ callGeminiForFeedback()
  │     ├─ Key 1 → try → rate-limited? → continue
  │     ├─ Key 2 → try → success? → return { data, model }
  │     └─ Key N → exhausted → return { success: false, allKeysExhausted: true }
  │
  ├─→ callGroqForFeedback()  (only if Gemini failed)
  │     ├─ Key 1 → try → validation failed? → continue
  │     ├─ Key 2 → try → success? → return { data, model }
  │     └─ Key N → exhausted → return { success: false }
  │
  └─→ return null  (deterministic-only fallback)
```

## Key Implementation Details

### 1. Unified result type for all providers

```typescript
interface AICallResult {
    success: boolean;
    data?: AIFeedbackResponse;
    model?: string;
    error?: string;
    allKeysExhausted?: boolean;
}
```

Every provider function returns the SAME shape. This makes the outer loop trivial.

### 2. Per-key try/catch with `continue`

```typescript
for (let i = 0; i < keys.length; i++) {
    try {
        const result = await callProvider(keys[i]);
        const validated = validateResponse(result);
        if (!validated) {
            console.warn(`Key ${i + 1} returned invalid response, trying next...`);
            continue;  // ← Validation failure = try next key
        }
        return { success: true, data: validated, model: 'provider-name' };
    } catch (error) {
        const isRateLimit = msg.includes('429') || msg.includes('rate limit');
        console.warn(`Key ${i + 1} failed: ${msg}`);
        continue;  // ← Both rate-limit AND other errors try next key
    }
}
return { success: false, error: 'All keys exhausted', allKeysExhausted: true };
```

### 3. Key gathering from multiple sources

```typescript
const keys: string[] = [];
// Source 1: Environment variables
const envKey = getEnv().VITE_PROVIDER_API_KEY;
if (envKey && !envKey.includes('your_')) keys.push(envKey);
// Source 2: Numbered env vars (VITE_PROVIDER_API_KEY_1 through _5)
for (let i = 1; i <= 5; i++) { ... }
// Source 3: Firestore encrypted keys
try {
    const firestoreKeys = await getDecryptedKeys('provider');
    for (const key of firestoreKeys) {
        if (key && !keys.includes(key)) keys.push(key);  // ← Deduplicate
    }
} catch { /* ignore — Firestore keys are optional */ }
```

### 4. Response validation before accepting

Always validate the AI response shape BEFORE returning success. Invalid responses → `continue` to next key, not `return failure`.

## Anti-Patterns

| Anti-Pattern | Why It Fails |
|--------------|-------------|
| Throw on first key failure | One bad key kills the entire request |
| No validation before success | Malformed AI output corrupts downstream |
| Blocking fallback chain | User waits for all providers to fail sequentially |
| Hardcoded single key | Rate limits block all users simultaneously |

## Source

- @task-2gv1pn (AI feedback generation pipeline)
- `src/services/formativeFeedback.service.ts` — `callGeminiForFeedback()`, `callGroqForFeedback()`, `generateAIFeedback()`
- Same pattern used in `src/services/ai/groq.provider.ts` for writing grading

## Related

- @doc/patterns/pattern-fire-and-forget-notification-wiring — How to wire fire-and-forget calls at call sites
- @doc/sop/groq-fallback-fix — Historical fix for Groq fallback mechanism
