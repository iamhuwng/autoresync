---
title: 'Pattern: Urgency-Tiered Sorting for List Views'
createdAt: '2026-03-13T19:19:30.033Z'
updatedAt: '2026-03-13T19:20:06.880Z'
description: >-
  Multi-tier urgency sorting system that replaces simple date sorting. Groups
  items into urgency tiers (overdue → imminent → new → calm → completed) with
  secondary sorting within tiers.
tags:
  - pattern
  - ux
  - sorting
  - homework
  - list-view
---
# Pattern: Urgency-Tiered Sorting for List Views

## Problem

Simple date sorting (newest first / oldest first) doesn't serve teacher workflows. A teacher managing 30+ homework assignments needs to see **the most urgent items first**, not the newest.

## Solution: 5-Tier Urgency System

```typescript
function getUrgencyTier(card: TargetCardData, now: number): number {
    if (card.overdueCount > 0) return 1;              // 🔴 Has overdue submissions
    if (hasImminentDeadline(card, 48h)) return 2;      // 🟡 Deadline within 48h
    if (isRecentlyCreated(card, 48h)) return 3;        // 🟢 Newly created
    if (card.activeCount > 0) return 4;                // ⚪ Active but calm
    return 5;                                           // ✅ All completed
}
```

### Secondary Sort Within Same Tier

```typescript
function compareSameTier(a, b, tier) {
    switch (tier) {
        case 1: return b.overdueCount - a.overdueCount;       // More overdue first
        case 2: return a.nearestDeadline - b.nearestDeadline;  // Soonest deadline first
        case 3: return b.newestCreatedAt - a.newestCreatedAt;  // Most recent first
        case 4: return b.activeCount - a.activeCount;          // Most active first
        case 5: return b.totalCount - a.totalCount;            // Largest completed set first
    }
}
```

## When To Use

Any list view where items have **varying urgency levels** and the user needs to act on the most urgent first:
- Teacher homework dashboard (assignment targets)
- Student task lists
- Notification queues
- Admin moderation queues

## Lesson Learned

Simple date sorting forces teachers to scan the full list. Urgency tiers bring "what needs attention NOW" to the top automatically — reducing cognitive load.

## Source

- `useTargetGrid.ts` → `sortByUrgency()` function
- PRD-0034/0035 Homework Management Overhaul
