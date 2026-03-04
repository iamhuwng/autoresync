/**
 * THCS Diagnostic Log Generator — Shared utility for producing
 * human-readable diagnostic logs from parse debug data + editor state.
 *
 * Pure function — no DOM access, no clipboard, no side effects.
 */

import type { THCSSection, THCSTestMetadata } from '../../types/thcs-test.types';
import type { ReclassificationEvent } from './thcs-type-classifier';

// ── Type for __PARSE_DEBUG data ──

export interface ParseDebugData {
    timestamp?: string;
    pipeline?: string;
    provider?: 'groq' | 'gemini' | 'regex-fallback';
    parseDurationMs?: number;
    inputLength?: number;
    cleanedLength?: number;
    metadata?: Record<string, any>;
    sections?: Array<{
        name: string;
        detectedType: string;
        typeConfidence: number;
        questionCount: number;
        questionNumbers: number[];
    }>;
    totalQuestions?: number;
    answeredCount?: number;
    overallConfidence?: number;
    warnings?: Array<{ type: string; message: string }>;
    reclassifications?: ReclassificationEvent[];
}

// ── Main generator ──

export interface DiagnosticLogInput {
    parseDebug?: ParseDebugData | null;
    sections: THCSSection[];
    metadata: THCSTestMetadata;
}

export function generateDiagnosticLog({ parseDebug, sections, metadata }: DiagnosticLogInput): string {
    const lines: string[] = [];
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // ── Header ──
    lines.push('═══ THCS Test Diagnostic Log ═══');
    lines.push(`Generated: ${now}`);
    lines.push('');

    // ── Pipeline Info ──
    lines.push('── Parse Pipeline ──');
    if (parseDebug) {
        lines.push(`Provider: ${parseDebug.provider || 'unknown'} | Pipeline: ${parseDebug.pipeline || 'unknown'}`);
        lines.push(`Input: ${fmtNum(parseDebug.inputLength)} chars | Cleaned: ${fmtNum(parseDebug.cleanedLength)} chars`);
        lines.push(`Parse Confidence: ${parseDebug.overallConfidence ?? '—'}%`);
        if (parseDebug.parseDurationMs != null) {
            lines.push(`Duration: ${(parseDebug.parseDurationMs / 1000).toFixed(1)}s`);
        }
        if (parseDebug.reclassifications && parseDebug.reclassifications.length > 0) {
            lines.push(`Reclassifications: ${parseDebug.reclassifications.length}`);
            for (const r of parseDebug.reclassifications) {
                lines.push(`  "${r.sectionName}" ${r.from} → ${r.to} (${r.reason})`);
            }
        }
    } else {
        lines.push('No parse data available (template-based test or data unavailable)');
    }
    lines.push('');

    // ── Metadata ──
    lines.push('── Metadata ──');
    lines.push(`Title: ${metadata.title || '(untitled)'}`);
    lines.push(`Grade: ${metadata.gradeLevel} | Duration: ${metadata.duration} min | Exam: ${metadata.examType || '—'}`);
    if (metadata.timerMode) lines.push(`Timer: ${metadata.timerMode}`);
    if (metadata.school) lines.push(`School: ${metadata.school}`);
    if (metadata.province) lines.push(`Province: ${metadata.province}`);
    lines.push('');

    // ── Sections Overview ──
    const totalQ = sections.reduce((s, sec) => s + sec.questions.length, 0);
    const totalPts = sections.reduce((s, sec) => s + sec.totalPoints, 0);
    lines.push(`── Sections (${sections.length} sections, ${totalQ} questions, ${totalPts} pts) ──`);

    const warnings: string[] = [];

    for (let i = 0; i < sections.length; i++) {
        const sec = sections[i]!;
        const qs = sec.questions;
        const qRange = qs.length > 0
            ? `Q${qs[0]!.questionNumber}-${qs[qs.length - 1]!.questionNumber}`
            : 'no Qs';

        // Detect type from first question or fallback
        const sectionType = qs.length > 0 ? qs[0]!.type : '—';
        const layout = sec.layout || 'single-column';
        const passage = sec.passage ? ` | passage: ${sec.passage.wordCount}w` : '';

        lines.push(`[${i + 1}] ${sec.name} (${sectionType}, ${sec.totalPoints}pts) — ${qs.length} Qs (${qRange})${passage}`);
        lines.push(`    layout: ${layout}${sec.shuffle ? ' | shuffle' : ''}${sec.shuffleOptions ? '+opts' : ''}`);

        // Per-question detail (compact)
        for (const q of qs) {
            const ansStatus = q.correctAnswer
                ? `answer=${truncate(q.correctAnswer, 20)} ✓`
                : '⚠️ no answer';
            const optCount = q.options?.filter((o: string) => o && o.trim()).length || 0;
            const intent = q.intent ? ` [${q.intent}]` : '';
            lines.push(`    Q${q.questionNumber}: ${q.type}${intent} | ${ansStatus} | ${optCount} opts`);

            // Data warnings
            if (!q.correctAnswer) {
                warnings.push(`⚠ Q${q.questionNumber} (${sec.name}): missing answer`);
            }
            if (!q.questionText && !q.sentenceTemplate && !q.originalSentence) {
                warnings.push(`⚠ Q${q.questionNumber} (${sec.name}): empty question text`);
            }
        }

        if (sec.totalPoints === 0 && qs.length > 0) {
            warnings.push(`⚠ ${sec.name}: totalPoints = 0`);
        }
        if (qs.length === 0) {
            warnings.push(`⚠ ${sec.name}: empty section (0 questions)`);
        }
    }

    // ── Data Integrity ──
    if (warnings.length > 0) {
        lines.push('');
        lines.push(`── Data Integrity (${warnings.length} warning${warnings.length > 1 ? 's' : ''}) ──`);
        for (const w of warnings) {
            lines.push(`  ${w}`);
        }
    }

    // ── Parse Warnings (from AI pipeline) ──
    if (parseDebug?.warnings && parseDebug.warnings.length > 0) {
        lines.push('');
        lines.push('── Parse Warnings ──');
        for (const w of parseDebug.warnings) {
            lines.push(`  [${w.type}] ${w.message}`);
        }
    }

    // ── Footer ──
    lines.push('');
    lines.push('═══ End Diagnostic Log ═══');

    return lines.join('\n');
}

// ── Helpers ──

function fmtNum(n: number | undefined): string {
    if (n == null) return '—';
    return n.toLocaleString('en-US');
}

function truncate(s: string, maxLen: number): string {
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen - 1) + '…';
}
