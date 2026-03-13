import { useMemo } from 'react';
import type { HomeworkAssignment } from '../types/homework.types';

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

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTargetGrid(homework: HomeworkAssignment[], searchQuery: string) {
  const targetCards = useMemo(() => {
    const now = Date.now();

    // ── Step 1: Group homework by target ──
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

    // ── Step 2: Build TargetCardData for each target ──
    const cards: TargetCardData[] = [];

    // Class targets
    for (const [classId, data] of classMap.entries()) {
      const items = data.items;
      const activeCount = items.filter(hw => hw.status === 'active' || hw.status === 'scheduled').length;
      const overdueCount = items.filter(hw => hw.status === 'past_due').length;
      const totalCount = items.length;

      // Average completion rate
      const ratesWithValues = items.filter(hw => hw.stats.completionRate != null);
      const completionRate = ratesWithValues.length > 0
        ? Math.round(ratesWithValues.reduce((sum, hw) => sum + (hw.stats.completionRate ?? 0), 0) / ratesWithValues.length)
        : 0;

      // Latest homework date
      const latestHomeworkDate = Math.max(...items.map(hw => hw.createdAt));

      // Student count from most recent homework's totalAssigned
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

    // ── Step 3: Search filtering ──
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

    // ── Step 4: Urgency-first sorting (PRD FR-11) ──
    filtered.sort((a, b) => urgencySort(a, b, now));

    return filtered;
  }, [homework, searchQuery]);

  return { targetCards };
}

export default useTargetGrid;
