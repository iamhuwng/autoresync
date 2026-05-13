# AI Core System Research Report & Improvement Suggestions

**Date:** 2026-03-21  
**Scope:** Full audit of AI subsystem architecture, key management, error handling, and UX

---

## 1. System Architecture Overview

### 1.1 File Map

| File | Role |
|------|------|
| `src/services/ai/ai.service.ts` | Interface definitions (`IAIService`, `AIParseResult`, `ProviderStatus`) |
| `src/services/ai/router.service.ts` | **AIRouterService** — singleton `aiService` that routes to Gemini/Groq with fallback |
| `src/services/ai/gemini.provider.ts` | **GeminiProvider** — primary provider, Gemini 2.5 Flash, multi-key rotation |
| `src/services/ai/groq.provider.ts` | **GroqProvider** — fallback provider, Llama 3.3 70B Versatile, multi-key rotation |
| `src/services/ai/providers/hybrid.gemini.provider.ts` | **HybridGeminiProvider** — isolated extraction-only provider for THCS hybrid mode |
| `src/services/ai/response.validator.ts` | Zod-based validation + type normalization for AI responses |
| `src/services/ai/section-extractor.service.ts` | Wraps `hybridGeminiProvider` for section extraction |
| `src/services/api-keys.service.ts` | Firestore CRUD for encrypted API keys (AES-256 XOR obfuscation) |
| `src/services/key-cooldown.service.ts` | Centralized in-memory cooldown registry for rate-limited keys |
| `src/config/env.config.ts` | Env validation + `loadAllGeminiApiKeys()` (env + Firestore) |
| `src/services/reading-v2/readingV2AutoImport.service.ts` | Reading V2 Auto import facade that calls Gemini structured JSON generation directly |
| `src/services/formativeFeedback.service.ts` | Direct Gemini/Groq calls for formative feedback (bypasses router) |
| `src/services/progressiveFeedback.service.ts` | Direct Gemini calls for progressive narrative feedback (bypasses router) |
| `src/services/test-creation/thcsDocumentParser.service.ts` | Direct Gemini/Groq calls for THCS document restructuring (bypasses router) |
| `src/services/test-creation/ai-extractor.service.ts` | IELTS extraction orchestrator — uses `aiService` (router) with checkpoints |

### 1.2 Provider Strategy

```
User Action → aiService (Router) → Gemini (primary) → Groq (fallback)
                                      ↓                    ↓
                                 Key Rotation          Key Rotation
                                      ↓                    ↓
                                 key-cooldown.service (centralized bench)
```

- **Default strategy:** `gemini-first` with fallback enabled
- **Key sources:** `.env` (up to 5 Gemini + 1 Groq) + Firestore (unlimited, encrypted)
- **Rotation:** Round-robin load balancing + exhausted-key tracking (24h reset)
- **Cooldown:** Centralized `key-cooldown.service` with provider-specific durations (60s RPM, 1h RPD)
- **Structured JSON:** As of 2026-05-13, `GeminiProvider.generateStructuredJson(...)` rotates across configured Gemini keys for expired/invalid, forbidden/blocked, quota, rate-limit, and transient availability errors before surfacing failure to direct callers such as Reading V2 Auto.

### 1.3 AI Capabilities

| Capability | Router | Direct |
|------------|--------|--------|
| Parse chunk (passages + questions + answers) | ✅ | — |
| Parse passages only (2-call split) | ✅ | — |
| Parse questions + answers (2-call split) | ✅ | — |
| Generate answers from content | ✅ | — |
| Parse answer key only | ✅ | — |
| Grade writing answer | ✅ | — |
| Suggest alternative answers | ✅ | — |
| Formative feedback | — | ✅ (direct Gemini/Groq) |
| Progressive feedback | — | ✅ (direct Gemini) |
| THCS document restructuring | — | ✅ (direct Gemini/Groq) |
| Hybrid section extraction | — | ✅ (HybridGeminiProvider) |

---

## 2. Identified Issues & Improvement Suggestions

### 🔴 Critical Issues

#### 2.1 No User-Facing "AI Maintenance" Notification
**Problem:** When all API keys are exhausted/rate-limited, users see generic error messages or silent failures. There is no global UI mechanism to inform users that "AI features are temporarily unavailable."

**Impact:** Users attempt AI operations, wait for timeouts, and get confused by cryptic errors.

**Suggestion:** Implement a global `useAIStatus` hook that checks key availability and surfaces a maintenance banner across all AI-consuming pages.

#### 2.2 Multiple Direct AI Callers Bypass Router
**Problem:** `formativeFeedback.service.ts`, `progressiveFeedback.service.ts`, and `thcsDocumentParser.service.ts` all make direct Gemini/Groq calls, duplicating key-loading, rotation, and error-handling logic. They don't go through `aiService` (the router).

**Impact:** 
- Code duplication (~200 lines repeated per service)
- Inconsistent error handling across callers
- Harder to add global features (like maintenance mode) since each caller is independent

**Suggestion:** Extract a common `callWithKeyRotation(provider, config)` utility or extend the router to support custom prompts. All callers should funnel through a single key-management layer.

#### 2.3 XOR "Encryption" Is Security Theater
**Problem:** `api-keys.service.ts` uses XOR with a hardcoded key (`mstu-kahoot-api-keys-2026`) embedded in the JS bundle. Anyone can extract API keys from Firestore + bundle.

**Impact:** API keys stored in Firestore are effectively plaintext to anyone who inspects the client bundle.

**Suggestion:** 
- Short-term: Document this as a known limitation (it's already noted in comments).
- Long-term: Proxy AI calls through a Cloud Function or backend that holds the real keys. The client never sees raw API keys.

---

### 🟡 Moderate Issues

#### 2.4 HybridGeminiProvider Doesn't Load Firestore Keys
**Problem:** `hybrid.gemini.provider.ts` only loads keys from `.env` (`import.meta.env`). It doesn't call `getDecryptedKeys('gemini')` to include Firestore-managed keys.

**Impact:** Admin-added keys in the Settings page don't work for hybrid/THCS mode extraction.

**Suggestion:** Add Firestore key loading to `HybridGeminiProvider.loadApiKeys()`, matching the pattern in `loadAllGeminiApiKeys()`.

#### 2.5 GeminiProvider Doesn't Use Centralized Cooldown
**Problem:** `gemini.provider.ts` tracks exhausted keys with its own `exhaustedKeys` Map (24h reset) but does NOT call `benchKey()` / `isKeyBenched()` from `key-cooldown.service.ts`. Meanwhile, `groq.provider.ts` DOES integrate with the centralized cooldown.

**Impact:** If a Gemini key is rate-limited in `GeminiProvider`, other direct callers (formativeFeedback, progressiveFeedback) don't know about it and will hit the same rate limit again.

**Suggestion:** Add `benchKey(key, 'gemini', reason)` calls in `GeminiProvider.markKeyExhausted()` and check `isKeyBenched()` in `isKeyExhausted()`, matching the GroqProvider pattern.

#### 2.6 No Centralized Key Availability Check
**Problem:** There's no single function to answer "are ANY AI keys available right now?" Each service loads keys independently, filters benched ones, and handles the "zero keys available" case differently.

**Impact:** Makes it hard to implement a global maintenance mode check. Every consumer has to independently figure out if AI is available.

**Suggestion:** Add `getAIAvailability(): { available: boolean; geminiAvailable: boolean; groqAvailable: boolean; reason?: string }` to a central service.

#### 2.7 Inconsistent Model Versions
**Problem:** Most callers use `gemini-2.5-flash`, but there's no centralized model configuration. Model names are hardcoded in each provider and each direct caller.

**Impact:** Upgrading the model requires changes in 5+ files.

**Suggestion:** Add a `AI_MODELS` config object in `env.config.ts` or a dedicated `ai.config.ts` file.

---

### 🟢 Minor / Quality-of-Life

#### 2.8 SDK Lazy Loading Pattern Is Repeated
**Problem:** Both `GeminiProvider` and `GroqProvider` implement the same lazy-load-SDK pattern (`sdkLoaded`, `sdkLoadPromise`, `loadSDK()`).

**Suggestion:** Extract to a shared `lazyLoadModule(importFn)` utility.

#### 2.9 Prompt Duplication
**Problem:** `GeminiProvider` and `GroqProvider` have nearly identical IELTS classification prompts (800+ lines each). Changes must be mirrored.

**Suggestion:** Move prompts to shared template files (e.g., `src/services/ai/prompts/ielts-questions.prompt.ts`).

#### 2.10 No Telemetry / Usage Dashboard
**Problem:** `api-keys.service.ts` has `incrementKeyUsage()` and `incrementKeyError()` but they don't appear to be called from the providers. The `requestCount` and `errorCount` fields in Firestore are likely always 0.

**Suggestion:** Wire up usage tracking in the providers, or add a periodic sync from `key-cooldown.service` stats to Firestore.

#### 2.11 Missing Provider Interface Methods on HybridGeminiProvider
**Problem:** `HybridGeminiProvider` doesn't implement `IAIService`. It has its own `extractSections()` method with no shared interface.

**Suggestion:** Either create a separate `IHybridAIService` interface or fold hybrid extraction into the main provider.

---

## 3. Priority Roadmap

| Priority | Item | Effort |
|----------|------|--------|
| **P0** | AI maintenance mode banner (all-keys-exhausted UX) | 2-4 hours |
| **P1** | Integrate GeminiProvider with centralized cooldown | 30 min |
| **P1** | Add Firestore keys to HybridGeminiProvider | 30 min |
| **P2** | Extract common key-rotation utility for direct callers | 4-6 hours |
| **P2** | Centralize model version config | 1 hour |
| **P2** | Add centralized `getAIAvailability()` function | 1 hour |
| **P3** | Shared prompt templates | 2-3 hours |
| **P3** | Wire up Firestore usage tracking | 1-2 hours |
| **P3** | Proxy API keys through Cloud Function | 8+ hours |

---

## 4. Current Error Flow (Before Maintenance Mode)

```
User triggers AI action
  → Provider loads keys (env + Firestore)
  → All keys rate-limited?
     YES → Returns { success: false, error: "All keys exhausted" }
           → UI shows generic error toast or "parsing failed" message
           → User retries → same failure → frustration
     NO  → Normal AI call with rotation
```

**After Maintenance Mode (proposed):**
```
User triggers AI action
  → Global AIStatusProvider detects all keys exhausted
  → Shows friendly maintenance banner: "AI features are temporarily unavailable"
  → Disables AI action buttons
  → Auto-recovers when keys become available again
```

---

## 5. 2026-04-09 Reading Creator Mitigation

The teacher IELTS Reading creator now fails closed when provider issues prevent complete extraction.

Current mitigation:
- Gemini referrer-blocked `403` responses and Groq `429` exhaustion can still happen upstream.
- `src/services/test-creation/index.ts` now treats non-success AI extraction as a real failure and routes to offline/rules fallback instead of silently continuing with empty AI output.
- Offline fallback is only considered successful when it produces reviewable question content.
- A zero-question parse now surfaces an error instead of opening a blank review draft.
- `TestCreationModal` now checks `saveParsedContent()` and blocks navigation if draft persistence fails.

This does not solve provider availability by itself; it prevents provider failures from degrading into silent blank-review drafts.

## 6. 2026-04-10 Reading Creator Resilience Follow-Up

The Reading creator now has stage-specific retry behavior for question extraction instead of relying only on fail-closed handling.

Current runtime rules:
- Gemini `503` / `high demand` failures during passage or question extraction are treated as transient availability failures and retried across the remaining Gemini keys.
- Groq question-extraction failures that return `413` / `request too large` are treated as prompt-budget failures. The provider retries with smaller `max_tokens` budgets before it benches any key.
- The local offline parser now recognizes markdown-numbered IELTS questions such as `**35.** Question text`, so a markdown paste can still produce reviewable questions if AI providers fail.

Implication:
- provider outages still matter, but a single transient Gemini spike or one oversized Groq request should no longer collapse immediately into a zero-question parse.
- the remaining structural gap is architectural rather than operational: the system still uses a provider-first extraction chain instead of a staged parse job with explicit artifacts for normalized source, passages, questions, and review draft.
