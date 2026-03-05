---
title: 'Pattern: Rounding-Safe Point Distribution'
createdAt: '2026-03-05T08:38:56.697Z'
updatedAt: '2026-03-05T08:40:06.057Z'
description: >-
  How to distribute N total points across M sections/items such that the sum is
  always exactly N, by assigning the rounding remainder to the last item.
tags:
  - pattern
  - math
  - points
  - rounding
---
# Pattern: Rounding-Safe Point Distribution

## Problem

When distributing a fixed total (e.g., 10 points) across N items with floating-point arithmetic:

```typescript
// 40 questions, 10 points total
const pointsPerQuestion = 10 / 40;  // = 0.25 exactly — but rarely this clean

// 37 questions, 10 points total
const pointsPerQuestion = 10 / 37;  // = 0.27027027... (repeating)

// 3 sections × 0.2702... = 0.8108... — accumulated rounding error
// Sum across all sections ≠ exactly 10.0
```

Naively rounding each section independently causes **rounding drift**: the total ends up as 9.99 or 10.01, which fails validation and confuses users.

## Solution

**Last-item absorbs the remainder**: compute all items normally, track the running total, then assign the final item the difference `(target - runningTotal)` instead of the formula value.

```typescript
const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);
const pointsPerQuestion = totalQuestions > 0 ? 10 / totalQuestions : 0;
let runningPointsTotal = 0;

const sections = parsedSections.map((ps, si) => {
    const isLastSection = si === parsedSections.length - 1;
    let sectionPoints: number;

    if (isLastSection && totalQuestions > 0) {
        // Last section absorbs rounding remainder — guarantees sum = exactly 10.0
        sectionPoints = Math.round((10 - runningPointsTotal) * 100) / 100;
    } else {
        sectionPoints = Math.round(pointsPerQuestion * ps.questions.length * 100) / 100;
    }

    runningPointsTotal += sectionPoints;
    return { ...section, totalPoints: sectionPoints };
});
// ✅ sum(sections.totalPoints) === exactly 10.0
```

## Why `Math.round(x * 100) / 100`

This rounds to 2 decimal places. For point values ≤ 10, this prevents values like `0.27000000000000002` while preserving meaningful precision.

## Anti-Pattern: Naive Equal Distribution

```typescript
// ❌ Accumulated rounding error
sections.map(s => ({
    totalPoints: Math.round((10 / totalQuestions) * s.questions.length * 100) / 100
}));
// 37 questions: section sums might be [2.70, 2.70, 2.70, 1.89] = 10.09 ❌
```

## Generalization

The pattern works for any fixed-total distribution:

```typescript
function distributeTotal(items: number[], total: number): number[] {
    const perUnit = total / items.reduce((a, b) => a + b, 0);
    let running = 0;
    return items.map((count, i) => {
        const isLast = i === items.length - 1;
        const value = isLast
            ? Math.round((total - running) * 100) / 100
            : Math.round(perUnit * count * 100) / 100;
        running += value;
        return value;
    });
}
```

## When to Use

| Scenario | Use This? |
|----------|-----------|
| Distributing fixed total points across sections | ✅ Yes |
| Distributing percentage shares that must sum to 100% | ✅ Yes |
| Distributing items where floating-point error is acceptable | ❌ Not needed |
| Integer-only distribution (use integer remainder assignment instead) | ❌ Use `Math.floor` + remainder directly |

## Source

`src/services/test-creation/thcs-draft-converter.ts` lines 71–419
