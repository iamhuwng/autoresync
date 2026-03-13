import { useEffect, useMemo, useState } from 'react';
import type { HomeworkAssignment } from '../types/homework.types';
import { getClass } from '../services/classManager';
import { getProfile } from '../services/profileService';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TargetCardData {
  targetName: string;
  targetType: 'class' | 'student';
  targetId: string;
  activeCount: number;
  overdueCount: number;
  totalCount: number;
  completionRate: number;
  latestHomeworkDate: number;
  studentCount: number;
  homework: HomeworkAssignment[];
}

// ─── Vietnamese diacritic-insensitive search helper ──────────────────────────
function normalizeSearchValue(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// ─── Constants ───────────────────────────────────────────────────────────────
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const URGENCY_WINDOW = 2 * DAY_IN_MS;

// ─── Name resolution cache ──────────────────────────────────────────────────
// Module-level cache so we don't re-fetch names across re-renders/remounts
const classNameCache = new Map<string, string>();
const studentNameCache = new Map<string, string>();

// ─── Urgency Tier Sorting (PRD FR-11) ────────────────────────────────────────

function getUrgencyTier(card: TargetCardData, now: number): number {
  // Tier 1: targets with past_due homework
  if (card.overdueCount > 0) return 1;

  // Check for within-48h deadlines
  const hasImminentDeadline = card.homework.some(
    hw => hw.status === 'active' && hw.scheduling.dueDate && (hw.scheduling.dueDate - now) <= URGENCY_WINDOW && (hw.scheduling.dueDate - now) > 0
  );
  if (hasImminentDeadline) return 2;

  // Tier 3: recently created (within 48h)
  if ((now - card.latestHomeworkDate) <= URGENCY_WINDOW) return 3;

  // Tier 4: other active targets
  if (card.activeCount > 0) return 4;

  // Tier 5: all completed
  return 5;
}

function getEarliestOverdueDueDate(homework: HomeworkAssignment[]): number {
  let earliest = Infinity;
  for (const hw of homework) {
    if (hw.status === 'past_due' && hw.scheduling.dueDate < earliest) {
      earliest = hw.scheduling.dueDate;
    }
  }
  return earliest === Infinity ? 0 : earliest;
}

function getNearestActiveDueDate(homework: HomeworkAssignment[]): number {
  let nearest = Infinity;
  for (const hw of homework) {
    if (hw.status === 'active' && hw.scheduling.dueDate && hw.scheduling.dueDate < nearest) {
      nearest = hw.scheduling.dueDate;
    }
  }
  return nearest === Infinity ? 0 : nearest;
}

function getLatestClosedAt(homework: HomeworkAssignment[]): number {
  let latest = 0;
  for (const hw of homework) {
    if (hw.closedAt && hw.closedAt > latest) {
      latest = hw.closedAt;
    }
  }
  return latest;
}

function urgencySort(a: TargetCardData, b: TargetCardData, now: number): number {
  const tierA = getUrgencyTier(a, now);
  const tierB = getUrgencyTier(b, now);

  if (tierA !== tierB) return tierA - tierB;

  switch (tierA) {
    case 1:
      // Sort by overdue count desc, then longest-overdue dueDate asc
      if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
      return getEarliestOverdueDueDate(a.homework) - getEarliestOverdueDueDate(b.homework);

    case 2:
      // Sort by most imminent deadline asc
      return getNearestActiveDueDate(a.homework) - getNearestActiveDueDate(b.homework);

    case 3:
      // Sort by createdAt desc (newest first)
      return b.latestHomeworkDate - a.latestHomeworkDate;

    case 4:
      // Sort by nearest dueDate asc
      return getNearestActiveDueDate(a.homework) - getNearestActiveDueDate(b.homework);

    case 5:
      // Sort by most recent closedAt desc
      return getLatestClosedAt(b.homework) - getLatestClosedAt(a.homework);

    default:
      return 0;
  }
}

// ─── Helper: Check if a string looks like a raw Firebase ID ──────────────────
function looksLikeRawId(name: string): boolean {
  // Firebase Auth UIDs are typically 28 alphanumeric chars
  // RTDB push keys are typically 20 chars starting with -
  // Class codes are 6 uppercase alphanumeric chars (these are valid names)
  if (!name || name.length < 8) return false;
  // If it's mostly alphanumeric with no spaces, it's probably a raw ID
  return /^[A-Za-z0-9_-]{8,}$/.test(name) && !name.includes(' ');
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTargetGrid(homework: HomeworkAssignment[], searchQuery: string) {
  // State for resolved names — maps ID → display name
  const [resolvedNames, setResolvedNames] = useState<Map<string, string>>(new Map());

  // ── Step 1: Build raw cards (synchronous, fast) ──
  const rawCards = useMemo(() => {
    const classMap = new Map<string, { name: string; items: HomeworkAssignment[] }>();
    const studentMap = new Map<string, { name: string; items: HomeworkAssignment[] }>();

    for (const hw of homework) {
      const target = hw.target;

      if (target.type === 'class') {
        const key = target.classId;
        if (!classMap.has(key)) {
          classMap.set(key, { name: target.className || key, items: [] });
        }
        classMap.get(key)!.items.push(hw);
      } else if (target.type === 'students') {
        // One card per unique studentId
        for (let i = 0; i < target.studentIds.length; i++) {
          const studentId = target.studentIds[i] as string;
          const studentName = (target.studentNames?.[i] as string | undefined) || studentId;
          if (!studentMap.has(studentId)) {
            studentMap.set(studentId, { name: studentName, items: [] });
          }
          studentMap.get(studentId)?.items.push(hw);
        }
      }
      // Exclude 'course' and 'group' types (FR-4)
    }

    // Build TargetCardData for each target
    const cards: TargetCardData[] = [];

    // Class targets
    for (const [classId, data] of classMap.entries()) {
      const items = data.items;
      const activeCount = items.filter(hw => hw.status === 'active' || hw.status === 'scheduled').length;
      const overdueCount = items.filter(hw => hw.status === 'past_due').length;
      const totalCount = items.length;

      const ratesWithValues = items.filter(hw => hw.stats.completionRate != null);
      const completionRate = ratesWithValues.length > 0
        ? Math.round(ratesWithValues.reduce((sum, hw) => sum + (hw.stats.completionRate ?? 0), 0) / ratesWithValues.length)
        : 0;

      const latestHomeworkDate = Math.max(...items.map(hw => hw.createdAt));

      const mostRecentHw = items.reduce<HomeworkAssignment | undefined>((latest, hw) => !latest || hw.createdAt > latest.createdAt ? hw : latest, undefined);
      const studentCount = mostRecentHw?.stats.totalAssigned || 0;

      cards.push({
        targetName: data.name,
        targetType: 'class',
        targetId: classId,
        activeCount,
        overdueCount,
        totalCount,
        completionRate,
        latestHomeworkDate,
        studentCount,
        homework: items,
      });
    }

    // Student targets
    for (const [studentId, data] of studentMap.entries()) {
      const items = data.items;
      const activeCount = items.filter(hw => hw.status === 'active' || hw.status === 'scheduled').length;
      const overdueCount = items.filter(hw => hw.status === 'past_due').length;
      const totalCount = items.length;

      const ratesWithValues = items.filter(hw => hw.stats.completionRate != null);
      const completionRate = ratesWithValues.length > 0
        ? Math.round(ratesWithValues.reduce((sum, hw) => sum + (hw.stats.completionRate ?? 0), 0) / ratesWithValues.length)
        : 0;

      const latestHomeworkDate = Math.max(...items.map(hw => hw.createdAt));

      cards.push({
        targetName: data.name,
        targetType: 'student',
        targetId: studentId,
        activeCount,
        overdueCount,
        totalCount,
        completionRate,
        latestHomeworkDate,
        studentCount: 1,
        homework: items,
      });
    }

    return cards;
  }, [homework]);

  // ── Step 2: Resolve missing names asynchronously ──
  useEffect(() => {
    const idsToResolve: Array<{ id: string; type: 'class' | 'student' }> = [];

    for (const card of rawCards) {
      // Check if the name looks like a raw ID (not a human-readable name)
      if (looksLikeRawId(card.targetName)) {
        // Check module-level cache first
        const cache = card.targetType === 'class' ? classNameCache : studentNameCache;
        if (cache.has(card.targetId)) {
          continue; // Already cached, will be applied in the memo below
        }
        idsToResolve.push({ id: card.targetId, type: card.targetType });
      }
    }

    if (idsToResolve.length === 0) {
      // Still apply any cached names
      const cachedUpdates = new Map<string, string>();
      for (const card of rawCards) {
        const cache = card.targetType === 'class' ? classNameCache : studentNameCache;
        const cached = cache.get(card.targetId);
        if (cached && looksLikeRawId(card.targetName)) {
          cachedUpdates.set(card.targetId, cached);
        }
      }
      if (cachedUpdates.size > 0) {
        setResolvedNames(prev => {
          const next = new Map(prev);
          for (const [k, v] of cachedUpdates) next.set(k, v);
          return next;
        });
      }
      return;
    }

    let cancelled = false;

    async function resolveNames() {
      const newNames = new Map<string, string>();

      await Promise.allSettled(
        idsToResolve.map(async ({ id, type }) => {
          try {
            if (type === 'class') {
              const classData = await getClass(id);
              if (classData?.name) {
                classNameCache.set(id, classData.name);
                newNames.set(id, classData.name);
              }
            } else {
              const profile = await getProfile(id);
              if (profile) {
                // Try firstName + familyName first
                const fullName = [profile.firstName, profile.familyName]
                  .filter(Boolean)
                  .join(' ')
                  .trim();
                // Cascade: fullName → displayName → email prefix
                const resolvedName = fullName
                  || profile.displayName?.trim()
                  || (profile.email ? (profile.email.split('@')[0] ?? profile.email) : null);
                if (resolvedName) {
                  studentNameCache.set(id, resolvedName);
                  newNames.set(id, resolvedName);
                }
              }
            }
          } catch (err) {
            console.warn(`[useTargetGrid] Failed to resolve name for ${type} ${id}:`, err);
          }
        })
      );

      if (!cancelled && newNames.size > 0) {
        setResolvedNames(prev => {
          const next = new Map(prev);
          for (const [k, v] of newNames) next.set(k, v);
          return next;
        });
      }
    }

    resolveNames();

    return () => { cancelled = true; };
  }, [rawCards]);

  // ── Step 3: Apply resolved names, filter, and sort ──
  const targetCards = useMemo(() => {
    const now = Date.now();

    // Apply resolved names to cards
    const cards = rawCards.map(card => {
      const resolvedName = resolvedNames.get(card.targetId);
      if (resolvedName && looksLikeRawId(card.targetName)) {
        return { ...card, targetName: resolvedName };
      }
      return card;
    });

    // Search filtering
    let filtered = cards;
    if (searchQuery.trim()) {
      const normalizedQuery = normalizeSearchValue(searchQuery.trim());
      filtered = cards.filter(card => {
        // Match target name
        if (normalizeSearchValue(card.targetName).includes(normalizedQuery)) return true;
        // Match any homework title or materialTitle
        return card.homework.some(hw =>
          normalizeSearchValue(hw.title || '').includes(normalizedQuery) ||
          normalizeSearchValue(hw.materialTitle).includes(normalizedQuery)
        );
      });
    }

    // Urgency-first sorting (PRD FR-11)
    filtered.sort((a, b) => urgencySort(a, b, now));

    return filtered;
  }, [rawCards, resolvedNames, searchQuery]);

  return { targetCards };
}

export default useTargetGrid;
