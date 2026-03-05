/**
 * PassageContent — Rich text renderer for THCS reading passages.
 *
 * Interprets lightweight markup preserved from external AI extraction:
 *   **bold**     → <strong> (vocabulary/reference words)
 *   __underline__ → <u>     (underlined sentences for paraphrase Qs)
 *   (N)______    → styled blank badge
 *   ➤ / •        → styled bullet
 *   \n\n          → paragraph break with indent
 *
 * Falls back gracefully to plain text for passages without markup.
 * Zero Mantine imports — pure HTML + inline styles.
 */
import React from 'react';

interface PassageContentProps {
    /** The raw passage text (may contain **bold**, __underline__, etc.) */
    text: string;
    /** Optional: font size override */
    fontSize?: string;
}

/**
 * Parses a single line of passage text into React elements,
 * handling **bold**, __underline__, and (N)______ blank markers.
 */
function parseInlineFormatting(line: string, keyPrefix: string): React.ReactNode[] {
    const elements: React.ReactNode[] = [];
    // Combined regex to match all inline markers in order:
    //   **bold**  |  __underline__  |  (N)______
    const inlineRegex = /(\*\*(.+?)\*\*)|(__(.+?)__)|(\((\d+)\)\s*_{3,})/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let idx = 0;

    while ((match = inlineRegex.exec(line)) !== null) {
        // Push text before this match
        if (match.index > lastIndex) {
            elements.push(line.slice(lastIndex, match.index));
        }

        if (match[1]) {
            // **bold** match — match[2] is the inner text
            elements.push(
                <strong key={`${keyPrefix}-b-${idx}`} style={{ fontWeight: 700 }}>
                    {match[2]}
                </strong>
            );
        } else if (match[3]) {
            // __underline__ match — match[4] is the inner text
            elements.push(
                <u key={`${keyPrefix}-u-${idx}`} style={{ textDecorationColor: '#475569' }}>
                    {match[4]}
                </u>
            );
        } else if (match[5]) {
            // (N)______ blank match — match[6] is the number
            const blankNum = match[6];
            elements.push(
                <span
                    key={`${keyPrefix}-blank-${idx}`}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'baseline',
                        gap: '0.125rem',
                    }}
                >
                    <span style={{
                        fontSize: '0.75em',
                        fontWeight: 700,
                        color: '#8b5cf6',
                        background: 'rgba(139,92,246,0.08)',
                        borderRadius: '0.25rem',
                        padding: '0 0.25rem',
                        lineHeight: 1.4,
                    }}>
                        ({blankNum})
                    </span>
                    <span style={{
                        display: 'inline-block',
                        minWidth: '5rem',
                        borderBottom: '1.5px solid #94a3b8',
                        height: '1em',
                    }} />
                </span>
            );
        }

        lastIndex = match.index + match[0].length;
        idx++;
    }

    // Push remaining text after last match
    if (lastIndex < line.length) {
        elements.push(line.slice(lastIndex));
    }

    // If no matches were found, return the plain line
    if (elements.length === 0) {
        return [line];
    }

    return elements;
}

const PassageContent: React.FC<PassageContentProps> = ({ text, fontSize = '0.9375rem' }) => {
    if (!text) return null;

    // Normalize line endings
    const normalized = text.replace(/\r\n/g, '\n');

    // Split into paragraphs by double newlines
    const paragraphs = normalized.split(/\n\n+/);

    return (
        <div style={{ fontSize, lineHeight: 1.8, color: '#1e293b' }}>
            {paragraphs.map((para, pi) => {
                const trimmed = para.trim();
                if (!trimmed) return null;

                // Check if this paragraph is a bullet list (lines starting with ➤ or •)
                const lines = trimmed.split('\n');
                const isBulletPara = lines.every(l => /^\s*[➤•]\s/.test(l) || !l.trim());

                if (isBulletPara) {
                    return (
                        <div key={`p-${pi}`} style={{ margin: '0.5rem 0', paddingLeft: '0.5rem' }}>
                            {lines.map((line, li) => {
                                const bulletContent = line.replace(/^\s*[➤•]\s*/, '');
                                if (!bulletContent.trim()) return null;
                                return (
                                    <div
                                        key={`p-${pi}-l-${li}`}
                                        style={{
                                            display: 'flex',
                                            gap: '0.5rem',
                                            marginBottom: '0.25rem',
                                            alignItems: 'flex-start',
                                        }}
                                    >
                                        <span style={{
                                            color: '#8b5cf6',
                                            fontWeight: 700,
                                            flexShrink: 0,
                                            fontSize: '0.85em',
                                            marginTop: '0.15em',
                                        }}>
                                            ➤
                                        </span>
                                        <span>{parseInlineFormatting(bulletContent, `p${pi}l${li}`)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    );
                }

                // Regular paragraph — render with text-indent for first line
                // Handle single-line vs multi-line within a paragraph
                return (
                    <p
                        key={`p-${pi}`}
                        style={{
                            margin: '0 0 0.75rem 0',
                            textIndent: paragraphs.length > 1 ? '1.5rem' : '0',
                            textAlign: 'justify',
                        }}
                    >
                        {lines.map((line, li) => (
                            <React.Fragment key={`p-${pi}-l-${li}`}>
                                {li > 0 && <br />}
                                {parseInlineFormatting(line, `p${pi}l${li}`)}
                            </React.Fragment>
                        ))}
                    </p>
                );
            })}
        </div>
    );
};

export default PassageContent;
