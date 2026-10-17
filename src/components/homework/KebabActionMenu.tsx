import { useCallback, useRef, useState } from 'react';
import {
  KebabMenuIcon,
  EditIcon,
  DuplicateIcon,
  DeleteIcon,
  ExtendIcon,
  ResetIcon,
  RestoreIcon,
  PermanentDeleteIcon,
} from './HomeworkIcons';
import type { HomeworkAssignment } from '../../types/homework.types';
import { AnchoredMenuPortal } from './AnchoredMenuPortal';
import './KebabActionMenu.css';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface KebabActionMenuProps {
  homework: HomeworkAssignment;
  onEdit: (hw: HomeworkAssignment) => void;
  onDuplicate: (hw: HomeworkAssignment) => void;
  onDelete: (hw: HomeworkAssignment) => void;
  onExtendDeadline: (hw: HomeworkAssignment) => void;
  onRestore?: (hw: HomeworkAssignment) => void;
  onPermanentDelete?: (hw: HomeworkAssignment) => void;
  onResetComplete?: (hw: HomeworkAssignment) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function KebabActionMenu({
  homework,
  onEdit,
  onDuplicate,
  onDelete,
  onExtendDeadline,
  onRestore,
  onPermanentDelete,
  onResetComplete,
}: KebabActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setIsOpen(false), []);

  const handleAction = (action: (hw: HomeworkAssignment) => void) => {
    action(homework);
    closeMenu();
  };

  return (
    <div className="kebab-menu">
      <button
        ref={triggerRef}
        className="kebab-menu__trigger"
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((current) => !current);
        }}
        title="More actions"
      >
        <KebabMenuIcon size={16} />
      </button>

      <AnchoredMenuPortal
        open={isOpen}
        anchorRef={triggerRef}
        onClose={closeMenu}
        className="kebab-menu__dropdown"
      >
        <div role="menu" aria-label={'Actions for ' + (homework.title || homework.materialTitle)}>
          <button
            className="kebab-menu__item"
            type="button"
            role="menuitem"
            onClick={(e) => { e.stopPropagation(); handleAction(onEdit); }}
          >
            <span className="kebab-menu__item-icon"><EditIcon size={16} /></span>
            Edit
          </button>

          <button
            className="kebab-menu__item"
            type="button"
            role="menuitem"
            onClick={(e) => { e.stopPropagation(); handleAction(onDuplicate); }}
          >
            <span className="kebab-menu__item-icon"><DuplicateIcon size={16} /></span>
            Duplicate
          </button>

          <button
            className="kebab-menu__item"
            type="button"
            role="menuitem"
            onClick={(e) => { e.stopPropagation(); handleAction(onExtendDeadline); }}
          >
            <span className="kebab-menu__item-icon"><ExtendIcon size={16} /></span>
            Extend Deadline
          </button>

          {onResetComplete && (
            <button
              className="kebab-menu__item"
              type="button"
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); handleAction(onResetComplete); }}
            >
              <span className="kebab-menu__item-icon"><ResetIcon size={16} /></span>
              Reset Student
            </button>
          )}

          <div className="kebab-menu__separator" />

          {homework.archived && onRestore ? (
            <>
              <button
                className="kebab-menu__item"
                type="button"
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); handleAction(onRestore); }}
              >
                <span className="kebab-menu__item-icon"><RestoreIcon size={16} /></span>
                Restore
              </button>
              {onPermanentDelete && (
                <button
                  className="kebab-menu__item kebab-menu__item--danger"
                  type="button"
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); handleAction(onPermanentDelete); }}
                >
                  <span className="kebab-menu__item-icon"><PermanentDeleteIcon size={16} /></span>
                  Permanent Delete
                </button>
              )}
            </>
          ) : (
            <button
              className="kebab-menu__item kebab-menu__item--danger"
              type="button"
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); handleAction(onDelete); }}
            >
              <span className="kebab-menu__item-icon"><DeleteIcon size={16} /></span>
              Delete
            </button>
          )}
        </div>
      </AnchoredMenuPortal>
    </div>
  );
}

export default KebabActionMenu;
