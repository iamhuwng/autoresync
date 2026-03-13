import { useState, useEffect, useRef } from 'react';
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
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click (MUST include cleanup per Task 5.2)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleAction = (action: (hw: HomeworkAssignment) => void) => {
    action(homework);
    setIsOpen(false);
  };

  return (
    <div className="kebab-menu" ref={menuRef}>
      <button
        className="kebab-menu__trigger"
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        title="More actions"
      >
        <KebabMenuIcon size={16} />
      </button>

      {isOpen && (
        <div className="kebab-menu__dropdown">
          {/* Standard actions */}
          <button
            className="kebab-menu__item"
            type="button"
            onClick={(e) => { e.stopPropagation(); handleAction(onEdit); }}
          >
            <span className="kebab-menu__item-icon"><EditIcon size={16} /></span>
            Edit
          </button>

          <button
            className="kebab-menu__item"
            type="button"
            onClick={(e) => { e.stopPropagation(); handleAction(onDuplicate); }}
          >
            <span className="kebab-menu__item-icon"><DuplicateIcon size={16} /></span>
            Duplicate
          </button>

          <button
            className="kebab-menu__item"
            type="button"
            onClick={(e) => { e.stopPropagation(); handleAction(onExtendDeadline); }}
          >
            <span className="kebab-menu__item-icon"><ExtendIcon size={16} /></span>
            Extend Deadline
          </button>

          {onResetComplete && (
            <button
              className="kebab-menu__item"
              type="button"
              onClick={(e) => { e.stopPropagation(); handleAction(onResetComplete); }}
            >
              <span className="kebab-menu__item-icon"><ResetIcon size={16} /></span>
              Reset Student
            </button>
          )}

          <div className="kebab-menu__separator" />

          {/* Archive/Delete */}
          {homework.archived && onRestore ? (
            <>
              <button
                className="kebab-menu__item"
                type="button"
                onClick={(e) => { e.stopPropagation(); handleAction(onRestore); }}
              >
                <span className="kebab-menu__item-icon"><RestoreIcon size={16} /></span>
                Restore
              </button>
              {onPermanentDelete && (
                <button
                  className="kebab-menu__item kebab-menu__item--danger"
                  type="button"
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
              onClick={(e) => { e.stopPropagation(); handleAction(onDelete); }}
            >
              <span className="kebab-menu__item-icon"><DeleteIcon size={16} /></span>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default KebabActionMenu;
