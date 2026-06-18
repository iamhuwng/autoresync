import React from 'react';
import {
  AlertTriangleIcon,
  CloneIcon,
  DeleteIcon,
  EditIcon,
  FileIcon,
  PlayIcon,
  SchoolIcon,
  UseAsIsIcon,
  ViewIcon,
} from './icons.jsx';
import TeacherLobbyAssignmentAction from './TeacherLobbyAssignmentAction';
import './MaterialListRow.css';

const ICONS = {
  archive: DeleteIcon,
  'assign-homework': CloneIcon,
  edit: EditIcon,
  delete: DeleteIcon,
  play: PlayIcon,
  view: ViewIcon,
  clone: CloneIcon,
  'use-as-is': UseAsIsIcon,
  restore: UseAsIsIcon,
};

const ROW_ICONS = {
  school: SchoolIcon,
  reading: FileIcon,
  writing: EditIcon,
  draft: EditIcon,
  incomplete: AlertTriangleIcon,
  test: FileIcon,
};

const isInteractiveTarget = (target) => Boolean(target?.closest?.(
  'button, a, input, select, textarea, [role="button"], [data-row-action]',
));

const getSortedActions = (actions = []) =>
  [...actions].sort((left, right) => {
    const leftSlot = left.slot ?? Number.MAX_SAFE_INTEGER;
    const rightSlot = right.slot ?? Number.MAX_SAFE_INTEGER;
    return leftSlot - rightSlot;
  });

const MaterialListRow = ({ row }) => {
  const RowIcon = ROW_ICONS[row.iconKind] || FileIcon;
  const canSelect = Boolean(row.selection && !row.selection.disabled);
  const isSelected = Boolean(row.selection?.checked);
  const actions = getSortedActions(row.actions);

  const toggleSelection = () => {
    if (canSelect) {
      row.selection?.onChange?.();
    }
  };

  const handleRowClick = (event) => {
    if (!canSelect || isInteractiveTarget(event.target)) {
      return;
    }
    toggleSelection();
  };

  const handleRowKeyDown = (event) => {
    if (!canSelect || event.target !== event.currentTarget) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleSelection();
    }
  };

  const renderActionButton = (item) => {
    if (item.key === 'assign-homework') {
      return <TeacherLobbyAssignmentAction key={item.key} action={item} />;
    }

    const ActionIcon = ICONS[item.iconKind] || null;
    return (
      <button
        key={item.key}
        type="button"
        data-row-action="true"
        className={`material-list-row__action material-list-row__action--${item.variant || 'secondary'}`}
        aria-label={item.label}
        disabled={item.disabled}
        title={item.disabled ? item.disabledReason : item.label}
        onClick={() => {
          if (!item.disabled) {
            item.onSelect?.();
          }
        }}
      >
        {ActionIcon && <ActionIcon size={14} />}
        <span className="material-list-row__action-label">{item.label}</span>
      </button>
    );
  };

  return (
    <div
      className={[
        'material-list-row',
        `material-list-row--${row.accentKind || 'lavender'}`,
        row.selection ? 'material-list-row--selectable' : '',
        isSelected ? 'is-selected' : '',
      ].filter(Boolean).join(' ')}
      data-testid={`material-list-row-${row.id}`}
      aria-label={row.selection?.label}
      aria-selected={row.selection ? isSelected : undefined}
      tabIndex={canSelect ? 0 : undefined}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
    >
      <div className="material-list-row__accent" aria-hidden="true" />
      <div className="material-list-row__icon-tile" aria-hidden="true">
        <RowIcon size={20} />
      </div>

      <div className="material-list-row__material">
        <div className="material-list-row__title" title={row.titleTooltip || row.title}>
          {row.title}
        </div>
        <div className="material-list-row__badges" aria-label={`${row.title} metadata`}>
          {row.badges.map((badge) => (
            <span key={badge.key} className={`material-list-row__badge material-list-row__badge--${badge.tone || 'neutral'}`}>
              {badge.label}
            </span>
          ))}
        </div>
      </div>

      <div className="material-list-row__metric material-list-row__metric--items">
        <FileIcon size={16} />
        <span>{row.itemLabel}</span>
      </div>
      <div className="material-list-row__updated">
        {row.updatedLabel}
      </div>
      <div className="material-list-row__actions" aria-label={`${row.title} actions`}>
        {actions.map((item) => renderActionButton(item))}
      </div>
    </div>
  );
};

export default React.memo(MaterialListRow);
