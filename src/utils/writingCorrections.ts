import type { GradingCorrection } from '../types/ielts-writing.types';

interface ExtractCorrectionOptions {
    createdAt: number;
    updatedAt: number;
}

interface NormalizeCorrectionSelectionInput {
    selectedText: string;
    from: number;
    to: number;
}

interface NormalizeTaskCorrectionsInput {
    taskNumber: 1 | 2;
    markedContent: Record<string, any> | null;
    corrections?: GradingCorrection[] | null;
    fallbackTimestamp: number;
}

export function normalizeCorrectionSelection({
    selectedText,
    from,
    to,
}: NormalizeCorrectionSelectionInput) {
    const safeText = typeof selectedText === 'string' ? selectedText : '';
    const leadingWhitespaceLength = safeText.match(/^\s+/)?.[0].length ?? 0;
    const trailingWhitespaceLength = safeText.match(/\s+$/)?.[0].length ?? 0;
    const normalizedFrom = from + leadingWhitespaceLength;
    const normalizedTo = to - trailingWhitespaceLength;

    if (normalizedFrom >= normalizedTo) {
        return {
            anchorText: safeText.trim() || safeText,
            from,
            to,
        };
    }

    return {
        anchorText: safeText.slice(leadingWhitespaceLength, safeText.length - trailingWhitespaceLength) || safeText.trim(),
        from: normalizedFrom,
        to: normalizedTo,
    };
}

export function normalizeTaskCorrections({
    taskNumber,
    markedContent,
    corrections,
    fallbackTimestamp,
}: NormalizeTaskCorrectionsInput): GradingCorrection[] {
    if (Array.isArray(corrections)) {
        return dedupeCorrections(
            corrections
                .map((correction) => normalizeCorrectionRecord(correction, taskNumber, fallbackTimestamp))
                .filter((correction): correction is GradingCorrection => Boolean(correction)),
        );
    }

    return extractCorrectionsFromMarkedContent(markedContent, taskNumber, {
        createdAt: fallbackTimestamp,
        updatedAt: fallbackTimestamp,
    });
}

export function upsertCorrectionRecord(
    existingCorrections: GradingCorrection[],
    nextCorrection: GradingCorrection,
): GradingCorrection[] {
    const nextById = new Map<string, GradingCorrection>();

    existingCorrections.forEach((correction) => {
        nextById.set(correction.id, correction);
    });

    nextById.set(nextCorrection.id, nextCorrection);
    return dedupeCorrections([...nextById.values()]);
}

export function removeCorrectionRecord(
    existingCorrections: GradingCorrection[],
    correctionId: string,
): GradingCorrection[] {
    return dedupeCorrections(existingCorrections.filter((correction) => correction.id !== correctionId));
}

export function extractCorrectionsFromMarkedContent(
    markedContent: Record<string, any> | null,
    taskNumber: 1 | 2,
    options: ExtractCorrectionOptions,
): GradingCorrection[] {
    if (!markedContent || typeof markedContent !== 'object') {
        return [];
    }

    const correctionsById = new Map<string, GradingCorrection>();
    let textOffset = 0;

    const visitNode = (node: any) => {
        if (!node || typeof node !== 'object') {
            return;
        }

        if (node.type === 'hardBreak') {
            textOffset += 1;
            return;
        }

        if (typeof node.text === 'string') {
            const nodeText = node.text;
            const correctionMark = Array.isArray(node.marks)
                ? node.marks.find((mark: any) => mark?.type === 'correctionMark' && typeof mark?.attrs?.correctionText === 'string')
                : null;

            if (correctionMark && nodeText.length > 0) {
                const correctionId = typeof correctionMark.attrs?.correctionId === 'string' && correctionMark.attrs.correctionId.trim()
                    ? correctionMark.attrs.correctionId
                    : `correction-${textOffset}-${textOffset + nodeText.length}`;
                const correctionText = String(correctionMark.attrs?.correctionText || '').trim();
                const existing = correctionsById.get(correctionId);

                if (existing) {
                    existing.anchorText += nodeText;
                    existing.to = textOffset + nodeText.length;
                    if (!existing.correctionText && correctionText) {
                        existing.correctionText = correctionText;
                    }
                } else {
                    correctionsById.set(correctionId, {
                        id: correctionId,
                        taskNumber,
                        anchorText: nodeText,
                        correctionText,
                        from: textOffset,
                        to: textOffset + nodeText.length,
                        createdAt: options.createdAt,
                        updatedAt: options.updatedAt,
                    });
                }
            }

            textOffset += nodeText.length;
            return;
        }

        const content = Array.isArray(node.content) ? node.content : [];
        content.forEach(visitNode);

        if (content.length > 0 && insertsBlockSeparator(node.type)) {
            textOffset += 1;
        }
    };

    visitNode(markedContent);

    return dedupeCorrections(
        [...correctionsById.values()].filter(
            (correction) => correction.anchorText.trim().length > 0 || correction.correctionText.length > 0,
        ),
    );
}

function normalizeCorrectionRecord(
    correction: GradingCorrection | null | undefined,
    taskNumber: 1 | 2,
    fallbackTimestamp: number,
): GradingCorrection | null {
    if (!correction || typeof correction !== 'object') {
        return null;
    }

    const normalizedFrom = typeof correction.from === 'number' ? correction.from : null;
    const normalizedTo = typeof correction.to === 'number' ? correction.to : null;

    if (normalizedFrom === null || normalizedTo === null || normalizedFrom >= normalizedTo) {
        return null;
    }

    const correctionId = typeof correction.id === 'string' && correction.id.trim()
        ? correction.id
        : `correction-${normalizedFrom}-${normalizedTo}`;
    const correctionText = String(correction.correctionText || '').trim();
    const anchorText = String(correction.anchorText || '').trim();
    const updatedAt = typeof correction.updatedAt === 'number'
        ? correction.updatedAt
        : (typeof correction.createdAt === 'number' ? correction.createdAt : fallbackTimestamp);
    const createdAt = typeof correction.createdAt === 'number'
        ? correction.createdAt
        : updatedAt;

    return {
        id: correctionId,
        taskNumber,
        anchorText,
        correctionText,
        from: normalizedFrom,
        to: normalizedTo,
        createdAt,
        updatedAt,
    };
}

function dedupeCorrections(corrections: GradingCorrection[]) {
    return [...new Map(corrections.map((correction) => [correction.id, correction])).values()]
        .sort((left, right) => {
            if (left.from !== right.from) {
                return left.from - right.from;
            }

            if (left.to !== right.to) {
                return left.to - right.to;
            }

            return left.id.localeCompare(right.id);
        });
}

function insertsBlockSeparator(nodeType: unknown) {
    return nodeType === 'paragraph'
        || nodeType === 'heading'
        || nodeType === 'blockquote'
        || nodeType === 'listItem';
}
