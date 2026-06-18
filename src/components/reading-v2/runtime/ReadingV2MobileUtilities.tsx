import { type KeyboardEvent, useEffect, useRef } from 'react';
import { ReadingV2InstructionText } from '../shared/ReadingV2InstructionText';

export type ReadingV2MobileUtilityPanel = 'text-size' | 'instructions';

export interface ReadingV2MobileInstructionGroup {
  readonly taskGroupId: string;
  readonly rangeLabel: string;
  readonly texts: readonly string[];
}

interface ReadingV2MobileUtilitiesProps {
  readonly panel: ReadingV2MobileUtilityPanel;
  readonly textSize: number;
  readonly instructionGroups: readonly ReadingV2MobileInstructionGroup[];
  readonly onTextSizeChange: (size: number) => void;
  readonly onClose: () => void;
}

const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));

export function ReadingV2MobileUtilities({
  panel,
  textSize,
  instructionGroups,
  onTextSizeChange,
  onClose,
}: ReadingV2MobileUtilitiesProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = `reading-v2-mobile-${panel}-title`;

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, [panel]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusable = getFocusableElements(event.currentTarget);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="reading-v2-runtime__utility-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="reading-v2-runtime__utility-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <header>
          <div>
            <h2 id={titleId}>{panel === 'text-size' ? 'Text size' : 'Instructions'}</h2>
            <p>
              {panel === 'text-size'
                ? 'Adjust passage and question reading text.'
                : 'Review current passage instructions and mobile controls.'}
            </p>
          </div>
        </header>

        {panel === 'text-size' ? (
          <div className="reading-v2-runtime__text-size-control">
            <div>
              <span>Current size</span>
              <strong>{textSize}px</strong>
            </div>
            <input
              aria-label="Reading text size"
              type="range"
              min={14}
              max={22}
              step={1}
              value={textSize}
              onChange={(event) => onTextSizeChange(Number(event.currentTarget.value))}
            />
            <div aria-hidden="true"><span>14px</span><span>22px</span></div>
          </div>
        ) : (
          <div className="reading-v2-runtime__utility-instructions">
            {instructionGroups.map((group) => (
              <section key={group.taskGroupId}>
                <h3>{group.rangeLabel}</h3>
                {group.texts.map((text, index) => (
                  <ReadingV2InstructionText key={`${group.taskGroupId}-${index}`} text={text} />
                ))}
              </section>
            ))}
            <section>
              <h3>Mobile controls</h3>
              <p>Use Questions to open answers. Select a question number to jump to it. Submit opens review before final submission.</p>
            </section>
          </div>
        )}

        <footer>
          <button ref={closeButtonRef} type="button" onClick={onClose}>
            {panel === 'text-size' ? 'Done' : 'Close'}
          </button>
        </footer>
      </section>
    </div>
  );
}
