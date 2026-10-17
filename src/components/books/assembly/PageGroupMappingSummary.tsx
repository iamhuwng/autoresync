import type { BookUnitCandidate } from '../../../types/bookAssembly.types';

interface PageGroupMappingSummaryProps {
  readonly selectedUnit: BookUnitCandidate;
  readonly missingRequiredActivityKeys: readonly string[];
  readonly onMoveActivitySlot: (activityKey: string, direction: -1 | 1) => void;
}

const PageGroupMappingSummary = ({
  selectedUnit,
  missingRequiredActivityKeys,
  onMoveActivitySlot,
}: PageGroupMappingSummaryProps) => (
  <div className="book-assembly-workspace__mapping-summary">
    <h3>Mapped Unit {selectedUnit.unitKey}</h3>
    {missingRequiredActivityKeys.length > 0 && (
      <p role="alert">Required source context is missing for {missingRequiredActivityKeys.join(', ')}.</p>
    )}
    <ol aria-label="Page Groups">
      {selectedUnit.pageGroups.map((group) => (
        <li key={group.pageGroupKey}>
          <strong>{group.pageGroupKey}</strong>
          <span>{group.sourceKey} pages {group.pages.join(', ')}</span>
          <span>
            {group.mode === 'reference_only'
              ? 'Reference only'
              : `Activities ${group.activityKeys.join(', ')}`}
          </span>
          {group.defaultPhysicalPageNumber !== undefined && (
            <span>Default page {group.defaultPhysicalPageNumber}</span>
          )}
        </li>
      ))}
    </ol>
    <ol aria-label="Activity slot order">
      {selectedUnit.activitySlots.map((slot) => (
        <li key={slot.activityKey}>
          <span>{slot.order}. {slot.activityKey} ({slot.contextRequirement})</span>
          <span>Page Groups: {slot.pageGroupKeys.join(', ')}</span>
          <button type="button" onClick={() => onMoveActivitySlot(slot.activityKey, -1)} aria-label={`Move ${slot.activityKey} up`}>Up</button>
          <button type="button" onClick={() => onMoveActivitySlot(slot.activityKey, 1)} aria-label={`Move ${slot.activityKey} down`}>Down</button>
        </li>
      ))}
    </ol>
  </div>
);

export default PageGroupMappingSummary;
