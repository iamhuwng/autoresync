import type { HomeworkTag } from '../../hooks/useHomeworkTags';

interface HomeworkTagChipsProps {
    allTags: HomeworkTag[];
    tags?: string[];
    selectedTag?: string | null;
    onTagSelect?: (tag: string | null) => void;
    selectable?: boolean;
}

function getTagConfig(tagId: string, allTags: HomeworkTag[]): HomeworkTag {
    return allTags.find((tag) => tag.id === tagId) ?? {
        id: tagId,
        label: tagId,
        color: '#64748b',
    };
}

function buildChipColors(color?: string, active = false): { background: string; border: string; text: string } {
    const baseColor = color ?? '#64748b';

    if (active) {
        return {
            background: baseColor,
            border: baseColor,
            text: '#ffffff',
        };
    }

    return {
        background: `${baseColor}14`,
        border: `${baseColor}33`,
        text: baseColor,
    };
}

export function HomeworkTagChips({
    allTags,
    tags,
    selectedTag = null,
    onTagSelect,
    selectable = false,
}: HomeworkTagChipsProps) {
    const isFilterMode = selectable || typeof onTagSelect === 'function';

    if (isFilterMode) {
        return (
            <div
                role="group"
                aria-label="Homework tag filters"
                style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}
            >
                <button
                    type="button"
                    aria-label="Show all homework tags"
                    onClick={() => onTagSelect?.(null)}
                    style={{
                        borderRadius: '999px',
                        padding: '0.45rem 0.85rem',
                        border: selectedTag === null ? '1px solid #0f172a' : '1px solid #cbd5e1',
                        background: selectedTag === null ? '#0f172a' : '#ffffff',
                        color: selectedTag === null ? '#ffffff' : '#475569',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}
                >
                    All
                </button>
                {allTags.map((tag) => {
                    const isActive = selectedTag === tag.id;
                    const colors = buildChipColors(tag.color, isActive);

                    return (
                        <button
                            key={tag.id}
                            type="button"
                            aria-label={`Filter homework by tag ${tag.label}`}
                            onClick={() => onTagSelect?.(tag.id)}
                            style={{
                                borderRadius: '999px',
                                padding: '0.45rem 0.85rem',
                                border: `1px solid ${colors.border}`,
                                background: colors.background,
                                color: colors.text,
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            {tag.label}
                        </button>
                    );
                })}
            </div>
        );
    }

    if (!tags || tags.length === 0) {
        return null;
    }

    return (
        <div
            role="group"
            aria-label="Homework tags"
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}
        >
            {tags.map((tagId) => {
                const tag = getTagConfig(tagId, allTags);
                const colors = buildChipColors(tag.color, false);

                return (
                    <span
                        key={tag.id}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            borderRadius: '999px',
                            padding: '0.3rem 0.7rem',
                            border: `1px solid ${colors.border}`,
                            background: colors.background,
                            color: colors.text,
                            fontSize: '0.74rem',
                            fontWeight: 700,
                        }}
                    >
                        {tag.label}
                    </span>
                );
            })}
        </div>
    );
}

export default HomeworkTagChips;
