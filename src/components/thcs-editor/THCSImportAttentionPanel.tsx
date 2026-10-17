interface THCSImportAttentionPanelProps {
    canDiscard: boolean;
    resolution: 'keep-source' | 'discard';
    onResolutionChange: (resolution: 'keep-source' | 'discard') => void;
}

export function THCSImportAttentionPanel({ canDiscard, resolution, onResolutionChange }: THCSImportAttentionPanelProps) {
    return <div className="thcs-import">
        <div className="thcs-import__heading"><h2>Import needs attention</h2><span>1 decision required</span></div>
        <div className="thcs-import__card thcs-import__attention">
            <h3>Some source content needs a safe place</h3>
            <p>The original structure could not be mapped safely to a supported question format.</p>
            <div role="group" aria-label="Resolve import" className="thcs-import__choices">
                <button type="button" aria-pressed={resolution === 'keep-source'} onClick={() => onResolutionChange('keep-source')}>
                    Keep as editable text
                </button>
                <button type="button" aria-pressed={resolution === 'discard'} disabled={!canDiscard} onClick={() => onResolutionChange('discard')}>
                    Leave this content out
                </button>
            </div>
        </div>
    </div>;
}
