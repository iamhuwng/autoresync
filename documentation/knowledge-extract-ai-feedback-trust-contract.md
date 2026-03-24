# Knowledge Extract: AI Feedback Trust Contract

> **Session:** 2026-03-22
> **Scope:** Reusable contract for separating deterministic fallback content from trusted AI explanations and for upgrading weak saved feedback safely
> **Source:** Result modal / formative feedback remediation work in PRD-0039 implementation

---

## 1. Problem

AI-assisted feedback systems often fail in a specific way:
- deterministic fallback content is generated to avoid empty states
- that fallback is saved into the same fields used for real AI output
- the UI then renders fallback text as if it were finalized AI reasoning
- once saved, the result is treated as done and never meaningfully upgraded

This creates a trust failure, not just a wording problem. Students see low-value scaffold text labeled as AI explanation, and operators believe feedback generation succeeded when it only partially did.

A related failure mode is family-gated upgrade logic:
- THCS and IELTS results may be eligible for AI upgrade
- generic results silently never enter the upgrade path even though the prompt pipeline can support them

The core lesson is that AI feedback needs a trust contract, not just a prompt.

---

## 2. Contract

### 2.1 Never Store Backup Content in the Trusted AI Field

Do not mix these into one field:
- trusted AI-authored question explanations
- deterministic backup explanations

Use separate storage:
- `questionExplanations`: only renderable, trusted explanations
- `fallbackQuestionExplanations`: deterministic backup content

Rule:
- if the text would be embarrassing to show as "AI Explanation", it does not belong in the trusted field

### 2.2 Rendering Must Be Based on Trust, Not Presence

The UI must not use:
- "field exists" => render explanation

The UI should use:
- "field exists and passes trust checks" => render explanation
- otherwise show an upgrade-needed or pending state

This avoids presenting weak placeholder content as final output.

### 2.3 Weak Output Keeps the Result Upgrade-Needed

A saved result should remain eligible for AI upgrade when any of the following are true:
- generation mode is deterministic
- narrative AI feedback is missing or shallow
- wrong-answer explanations are missing
- saved question explanations match weak scaffold patterns

Rule:
- weak saved feedback is a provisional state, not a terminal state

### 2.4 Provider Validation Must Require Complete Strong Coverage

Do not accept an AI response only because it has a valid top-level shape.

For wrong-answer explanations, validation should require:
- every wrong-answer question key is present
- explanation keys are normalized (`Q1` and `1` must resolve consistently)
- each explanation passes a strong-quality gate

If any required explanation is missing or weak, reject the provider response and continue provider fallback or keep the upgrade-needed state.

### 2.5 Generic Results Must Share the Upgrade Path

Do not hardcode upgrade logic around only the best-known result families.

If the feedback generator supports a generic prompt branch, then saved-result regeneration must also support:
- THCS
- IELTS
- generic

Rule:
- payload-builder eligibility and modal retry logic must agree on the same family contract

### 2.6 Retry Must Mean Force AI Regeneration

A retry button is misleading if it only reuses stored feedback.

Retry should:
- bypass stored-final reuse when the feedback still needs upgrade
- force a new AI attempt
- preserve the previously saved payload if the upgrade fails

This gives the user a real recovery path without data loss.

---

## 3. Reference State Model

A useful mental model is:

1. `deterministic-only`
- baseline exists
- safe to show summary-level fallback
- question explanations are not trusted AI content

2. `ai-upgrade-needed`
- some saved feedback exists
- weak, missing, or mixed-quality question explanations remain
- render pending state for question explanations
- auto-upgrade on open or retry when appropriate

3. `ai-trusted`
- AI narrative exists
- wrong-answer explanations are complete and strong
- render explanations normally

4. `upgrade-failed-but-preserved`
- old feedback remains visible where safe
- UI communicates that strong AI upgrade did not complete
- user can retry later

---

## 4. Example Implementation Shape

### 4.1 Service Layer

```typescript
export interface FormativeFeedback {
  questionExplanations?: Record<string, string>;
  fallbackQuestionExplanations?: Record<string, string>;
  generationMode?: 'ai' | 'deterministic';
}

export function getRenderableQuestionExplanations(
  explanations: Record<string, string> | null | undefined,
): Record<string, string> {
  // keep only strong explanations
}

export function needsAiFeedbackUpgrade(
  feedback: FormativeFeedback | null | undefined,
): boolean {
  // deterministic, missing, weak, or partial explanations stay upgrade-needed
}
```

### 4.2 Generation Pipeline

```typescript
if (aiResult) {
  feedback.questionExplanations = getRenderableQuestionExplanations(
    aiResult.data.questionExplanations,
  );
}

feedback.fallbackQuestionExplanations = buildFallbackQuestionExplanations(...);
```

### 4.3 UI Contract

```tsx
const explanations = getRenderableQuestionExplanations(
  formativeFeedback?.questionExplanations,
);

if (explanations[String(questionNumber)]) {
  return <TrustedExplanation />;
}

if (needsAiFeedbackUpgrade(formativeFeedback)) {
  return <PendingExplanationState />;
}
```

---

## 5. Strong vs Weak Explanation Heuristics

Weak explanation traits:
- generic scaffold phrases with no actual reasoning work
- describes a clue without connecting it to the student's mistake
- says the correct answer works without explaining why the wrong answer fails
- gives a generic solving tip that could fit any question

Strong explanation traits:
- names the actual rule, pattern, or reading clue
- explains why the student's exact choice fails in this prompt
- explains why the correct choice works in this prompt
- gives a concrete reasoning path, not only a general study tip

Heuristic detection is useful, but it is not the final end state.

---

## 6. Better Long-Term Design

The strongest future-proof version is structured reasoning instead of prose-only validation.

Example fields per wrong-answer explanation:
- `ruleTested`
- `studentMistakeReason`
- `correctAnswerReason`
- `textEvidence`
- `stepByStepSolve`
- `memoryTip`

Then the renderer can compose final prose from validated fields rather than trusting arbitrary free-form text.

Rule:
- pattern matching is a useful guardrail
- structured explanation contracts are the more durable system design

---

## 7. Checklist

Use this when building or reviewing any AI feedback feature:

1. Are deterministic backups stored separately from trusted AI output?
2. Does the UI render only trusted explanations, not merely present ones?
3. Does weak or partial saved feedback remain upgrade-needed?
4. Does provider validation require complete strong coverage for every wrong-answer explanation?
5. Are question keys normalized consistently across provider responses and saved payloads?
6. Does retry truly force AI regeneration?
7. Are generic results supported anywhere the general prompt path exists?
8. If AI fails, does the system preserve useful fallback safely without pretending it is final AI output?

---

## 8. Lessons Learned

### 8.1 Prompt Quality Alone Cannot Solve a Trust Problem

Even a strong prompt cannot fix an architecture that stores fallback text in the same place as trusted AI output.

### 8.2 Rendering Rules Are as Important as Generation Rules

If the renderer trusts everything in the field, generation quality controls are easy to bypass indirectly.

### 8.3 Family Detection Bugs Can Masquerade as AI Quality Bugs

Sometimes weak feedback persists not because the provider is bad, but because the result never entered the AI upgrade path at all.

### 8.4 "Saved" Does Not Mean "Good Enough"

A saved payload should still be auditable as weak, partial, provisional, or trusted. Persistence is not a correctness signal.
