/**
 * THCSPassagePanel — Reading passage display (PRD-0027 Task 5.5)
 * Two-column sticky layout on desktop, collapsible slide-up on mobile.
 * Suppresses passage title when it duplicates the section name.
 * Supports rich-text formatting: **bold**, __underline__, {{braces}}, [I]-[X] markers.
 * Supports cloze blank markers: (N)______ → bold number + wide visual blank.
 */
import React, { useState, useEffect } from 'react';

/**
 * Renders passage content with rich-text formatting markers.
 * Parses: **bold** → <strong>, __underline__ → <u>, {{text}} → <u>, [I]-[X] → <strong>
 * Cloze blanks: (1)______ → bold purple number + wide blank line
 * Groups consecutive non-empty lines into paragraphs (blank lines = paragraph breaks).
 * PRD-0032 §FR2
 */
function renderPassageRichText(text: string): React.ReactNode[] {
    if (!text) return [];

    // Regex matches cloze blank markers + all formatting markers in one pass
    const markerRegex = /(\(\d+\)\s*_{2,}|\*\*(.+?)\*\*|__(.+?)__|{{(.+?)}}|\[(I{1,3}|IV|VI{0,3}|V|IX|X)\])/g;
    let keyIdx = 0;

    const processLine = (line: string): React.ReactNode[] => {
        const nodes: React.ReactNode[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        markerRegex.lastIndex = 0;
        while ((match = markerRegex.exec(line)) !== null) {
            // Add plain text before this match
            if (match.index > lastIndex) {
                nodes.push(line.slice(lastIndex, match.index));
            }

            // Cloze blank marker: (1)______ → bold number + wide blank
            const clozeMatch = match[0].match(/^\((\d+)\)\s*_{2,}$/);
            if (clozeMatch) {
                nodes.push(
                    <span key={`cloze-${keyIdx++}`} style={{ whiteSpace: 'nowrap' }}>
                        <strong style={{ color: '#6366f1', fontSize: '0.95em' }}>({clozeMatch[1]})</strong>
                        <span style={{
                            display: 'inline-block',
                            width: '6em',
                            borderBottom: '2px solid #94a3b8',
                            marginLeft: '0.15em',
                            verticalAlign: 'text-bottom',
                        }} />
                    </span>
                );
            } else if (match[2] !== undefined) {
                // **bold**
                nodes.push(<strong key={`b-${keyIdx++}`}>{match[2]}</strong>);
            } else if (match[3] !== undefined) {
                // __underline__
                nodes.push(<u key={`u-${keyIdx++}`}>{match[3]}</u>);
            } else if (match[4] !== undefined) {
                // {{braces}} → underline
                nodes.push(<u key={`br-${keyIdx++}`}>{match[4]}</u>);
            } else if (match[5] !== undefined) {
                // [I], [II], etc. → bold
                nodes.push(<strong key={`rm-${keyIdx++}`}>[{match[5]}]</strong>);
            }

            lastIndex = match.index + match[0].length;
        }

        // Add trailing plain text
        if (lastIndex < line.length) {
            nodes.push(line.slice(lastIndex));
        }

        return nodes;
    };

    // Group lines into paragraphs (separated by blank lines)
    // Consecutive non-empty lines form one paragraph — joined with space
    const lines = text.split('\n');
    const paragraphs: string[][] = [];
    let currentParagraph: string[] = [];

    for (const line of lines) {
        if (line.trim() === '') {
            if (currentParagraph.length > 0) {
                paragraphs.push(currentParagraph);
                currentParagraph = [];
            }
        } else {
            currentParagraph.push(line.trim());
        }
    }
    if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph);
    }

    // Render each paragraph as a <p> block
    return paragraphs.map((para, i) => {
        const joined = para.join(' ');
        return (
            <p key={`p-${i}`} style={{ margin: '0 0 0.75em 0' }}>
                {processLine(joined)}
            </p>
        );
    });
}

function useMediaQuery(query: string) {
    const [matches, setMatches] = useState(false);
    useEffect(() => {
        const media = window.matchMedia(query);
        if (media.matches !== matches) setMatches(media.matches);
        const listener = () => setMatches(media.matches);
        media.addEventListener('change', listener);
        return () => media.removeEventListener('change', listener);
    }, [matches, query]);
    return matches;
}

interface THCSPassagePanelProps {
    passage: { title?: string; content: string; imageUrl?: string };
    layout: 'single-column' | 'two-column';
    isVisible: boolean;
    onScrollToQuestions?: () => void;
    /** The name of the parent section — used to suppress duplicate titles */
    sectionName?: string;
}

const THCSPassagePanel: React.FC<THCSPassagePanelProps> = ({
    passage, layout, isVisible, onScrollToQuestions, sectionName,
}) => {
    const [showPanel, setShowPanel] = useState(false);
    const isMobile = useMediaQuery('(max-width: 767px)');

    if (!isVisible || !passage.content) return null;

    // Suppress passage title if it's the same as the section name (avoids double display)
    const shouldShowTitle = passage.title
        && passage.title.trim().toLowerCase() !== (sectionName || '').trim().toLowerCase();

    // Mobile or two-column on small screen: floating button + slide-up panel
    const useSlideUp = isMobile && layout === 'two-column';

    if (useSlideUp) {
        return (
            <>
                {/* Floating show passage button */}
                <button
                    onClick={() => setShowPanel(true)}
                    style={{
                        position: 'fixed', bottom: 80, right: 16, zIndex: 20,
                        padding: '0.5rem 1rem', borderRadius: '2rem',
                        background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                        color: '#fff', border: 'none', fontWeight: 600,
                        fontSize: '0.875rem', cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(139,92,246,0.3)',
                    }}
                >
                    📖 Show Passage
                </button>

                {/* Slide-up panel */}
                {showPanel && (
                    <div style={{
                        position: 'fixed', bottom: 0, left: 0, right: 0,
                        height: '80vh', zIndex: 30,
                        background: '#fff', borderTopLeftRadius: '1rem',
                        borderTopRightRadius: '1rem',
                        boxShadow: '0 -10px 40px rgba(0,0,0,0.15)',
                        display: 'flex', flexDirection: 'column',
                    }}>
                        <div style={{
                            padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <span style={{ fontWeight: 700 }}>{passage.title || 'Reading Passage'}</span>
                            <button
                                onClick={() => setShowPanel(false)}
                                style={{
                                    border: 'none', background: 'transparent',
                                    fontSize: '1.25rem', cursor: 'pointer',
                                }}
                            >
                                ✕
                            </button>
                        </div>
                        <div style={{
                            flex: 1, overflowY: 'auto', padding: '1rem',
                            fontSize: '0.9375rem', lineHeight: 1.8,
                        }}>
                            {renderPassageRichText(passage.content)}
                        </div>
                    </div>
                )}
            </>
        );
    }

    // Desktop two-column: sticky sidebar that scrolls with content
    // position: sticky works because the parent (main content div) has NO overflow set.
    // top = header(~36px) + section-tabs(~45px) + gap = ~85px
    // maxHeight accounts for header+tabs top and footer question pills (~40px) bottom
    if (layout === 'two-column') {
        return (
            <div style={{
                position: 'sticky',
                top: 85,
                maxHeight: 'calc(100vh - 130px)',
                overflowY: 'auto',
                scrollbarGutter: 'stable',
                padding: '1rem',
                background: 'rgba(255,255,255,0.97)',
                borderRadius: '0.75rem',
                border: '1px solid rgba(139,92,246,0.12)',
                boxShadow: '0 2px 12px rgba(139,92,246,0.06)',
            }}>
                {shouldShowTitle && (
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: '0 0 0.75rem' }}>
                        {passage.title}
                    </h3>
                )}
                {passage.imageUrl && (
                    <img
                        src={passage.imageUrl}
                        alt={passage.title || 'Passage image'}
                        style={{ maxWidth: '100%', borderRadius: '0.5rem', marginBottom: '0.75rem' }}
                    />
                )}
                <div style={{ fontSize: '0.9375rem', lineHeight: 1.8 }}>
                    {renderPassageRichText(passage.content)}
                </div>
            </div>
        );
    }

    // Single-column
    return (
        <div style={{
            padding: '1.25rem',
            background: 'rgba(255,255,255,0.9)',
            borderRadius: '0.75rem',
            border: '1px solid rgba(139,92,246,0.1)',
            marginBottom: '1rem',
        }}>
            {shouldShowTitle && (
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', margin: '0 0 0.75rem' }}>
                    {passage.title}
                </h3>
            )}
            {passage.imageUrl && (
                <img
                    src={passage.imageUrl}
                    alt={passage.title || 'Passage image'}
                    style={{ maxWidth: '100%', borderRadius: '0.5rem', marginBottom: '0.75rem' }}
                />
            )}
            <div style={{ fontSize: '0.9375rem', lineHeight: 1.8 }}>
                {renderPassageRichText(passage.content)}
            </div>
            {onScrollToQuestions && (
                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                    <button
                        onClick={onScrollToQuestions}
                        style={{
                            padding: '0.5rem 1.5rem', border: '1px solid rgba(139,92,246,0.3)',
                            borderRadius: '2rem', background: 'rgba(139,92,246,0.06)',
                            color: '#8b5cf6', fontWeight: 600, cursor: 'pointer',
                        }}
                    >
                        ⬇ Scroll to Questions
                    </button>
                </div>
            )}
        </div>
    );
};

export default THCSPassagePanel;
