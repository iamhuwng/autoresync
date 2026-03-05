---
id: 0yg6fx
title: Build Retry Manager
status: done
priority: high
labels:
  - from-spec-v2
  - core-module
createdAt: '2026-03-04T22:45:51.161Z'
updatedAt: '2026-03-05T01:01:35.226Z'
timeSpent: 1518
assignee: '@me'
spec: specs/ai-pipeline-redesign
fulfills:
  - AC-8
order: 3
---
# Build Retry Manager

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create `thcs-retry-manager.ts`. Internal retry: Groq llama (temp 0.1) → Gemini Flash (temp 0.2) → teacher. Compromise: Flash (0.15) → Flash (0.3) → skip. Circuit breaker at 5 total AI calls per session. Better/worse comparison between retries (fewer issues = better). Session-level call tracking.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Model/temperature progression configurable
- [x] #2 Better/worse comparison: fewer issues = better
- [x] #3 Circuit breaker at 5 total AI calls enforced
- [x] #4 Session-level call tracking persists across retries
- [x] #5 Clean escalation path to teacher or skip
- [x] #6 Order: 1 (no dependencies)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### New file
`src/services/test-creation/thcs-retry-manager.ts`

### Architecture
A standalone, stateless-per-call retry orchestrator. Each parse session creates a `RetrySession` that tracks total AI calls and manages escalation. The module does NOT contain AI provider logic — it delegates to a caller-provided `callAI` function.

### Interfaces

```typescript
// Configuration for a retry chain
interface RetryChainConfig {
  steps: Array<{
    provider: 'groq' | 'gemini';
    model: string;
    temperature: number;
  }>;
  fallback: 'teacher' | 'skip';
}

// Built-in chains
const REPAIR_CHAIN: RetryChainConfig = {
  steps: [
    { provider: 'groq', model: 'llama-3.3-70b-versatile', temperature: 0.1 },
    { provider: 'gemini', model: 'gemini-2.0-flash', temperature: 0.2 },
  ],
  fallback: 'teacher',
};

const COMPROMISE_CHAIN: RetryChainConfig = {
  steps: [
    { provider: 'gemini', model: 'gemini-2.0-flash', temperature: 0.15 },
    { provider: 'gemini', model: 'gemini-2.0-flash', temperature: 0.3 },
  ],
  fallback: 'skip',
};

// Session state (created once per parseThcsText call)
interface RetrySession {
  totalCalls: number;
  maxCalls: number; // 5 — circuit breaker
  callLog: RetryCallEntry[];
}

interface RetryCallEntry {
  timestamp: number;
  provider: string;
  model: string;
  temperature: number;
  issueCountBefore: number;
  issueCountAfter: number;
  verdict: 'better' | 'worse' | 'same';
}

// Result of a retry attempt
interface RetryResult<T> {
  outcome: 'success' | 'escalated' | 'circuit-breaker' | 'all-failed';
  bestResult: T | null;
  callLog: RetryCallEntry[];
  escalatedTo?: 'teacher' | 'skip';
}
```

### Core Functions

#### 1. `createRetrySession(maxCalls?: number): RetrySession`
Factory — creates a session with `totalCalls: 0`, `maxCalls: 5`.

#### 2. `executeRetryChain<T>(session, chain, callAI, compareResults): Promise<RetryResult<T>>`
Main orchestrator:
1. Check circuit breaker (`session.totalCalls >= session.maxCalls`) → return `circuit-breaker`
2. Call first step in chain via `callAI(step)`
3. Increment `session.totalCalls`
4. If success, store as `bestResult`
5. If issues remain, try next step:
   - Call `callAI(nextStep)`, increment counter
   - Run `compareResults(previous, current)` → returns `{ verdict: 'better'|'worse'|'same', issueCount: number }`
   - If `better`: use current as new base, continue
   - If `worse` or `same`: keep previous, escalate to next step
6. If all steps exhausted → return `all-failed` with `escalatedTo: chain.fallback`
7. Between each call, re-check circuit breaker

#### 3. `compareIssueCount(before: number, after: number): 'better' | 'worse' | 'same'`
Simple comparison helper (fewer issues = better).

#### 4. `isCircuitBreakerTripped(session): boolean`
Check if total calls ≥ max.

#### 5. `getSessionStats(session): { totalCalls, remaining, callLog }`
For diagnostic logging.

### Key Design Decisions
- **Generic `callAI` callback**: The retry manager doesn't know about Groq/Gemini internals. It receives a `(step) => Promise<{ result: T, issueCount: number } | null>` callback.
- **No provider initialization**: Provider init (SDK loading, key rotation) stays in existing `callGroqDirect`/`callGeminiDirect` or future wrappers. The retry manager only orchestrates the SEQUENCE.
- **Session is mutable state**: `totalCalls` increments across repair, compromise, and external retry calls within ONE parse session. This ensures the circuit breaker counts ALL AI calls, not just repair calls.
- **Chains are configurable**: The two built-in chains (repair + compromise) are exported constants. The integration task (T11) can pass custom chains if needed.
- **No async side effects**: The retry manager has zero imports beyond types. No Firebase, no API keys, no SDK. Pure orchestration logic.

### Files changed
- `src/services/test-creation/thcs-retry-manager.ts` (NEW — ~120 lines)

### Dependencies
- None (pure logic module)

### Consumed by
- Task `pqr0rq` (Pass 2 Repair) — uses `REPAIR_CHAIN` + `executeRetryChain`
- Task `78pz92` (Compromise Step) — uses `COMPROMISE_CHAIN`
- Task `le05g6` (External Retry) — creates its own chain config
- Task `8085zl` (Integration) — creates `RetrySession` at parse entry point, passes to all consumers
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Notes
- Created `thcs-retry-manager.ts` (~190 lines)
- Core exports: `createRetrySession`, `executeRetryChain`, `REPAIR_CHAIN`, `COMPROMISE_CHAIN`
- Helpers: `compareIssueCount`, `isCircuitBreakerTripped`, `getSessionStats`
- Full type exports: RetryStep, RetrySession, RetryChainConfig, RetryResult, AICallOutcome, RetryCallEntry
- 22 unit tests passing (thcs-retry-manager.test.ts)
- Zero TypeScript errors (tsc --noEmit clean)
<!-- SECTION:NOTES:END -->

