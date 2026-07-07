import React from 'react';
import {
  CloneIcon,
  DeleteIcon,
  FileIcon,
  PlusIcon,
  UseAsIsIcon,
} from './icons.jsx';
import './MaterialSelectionToolbar.css';

const ACTION_ICONS = {
  archive: FileIcon,
  assign: CloneIcon,
  create: PlusIcon,
  delete: DeleteIcon,
  restore: UseAsIsIcon,
};

const MaterialSelectionToolbar = ({
  selectedCount = 0,
  itemLabel = 'materials',
  actions = [],
  error,
}) => {
  if (selectedCount <= 0) {
    return null;
  }

  return (
    <div className="material-selection-toolbar-shell">
      <div className="material-selection-toolbar" aria-label="Material selection actions">
        <span className="material-selection-toolbar__count">
          {selectedCount} selected
        </span>
        {itemLabel && (
          <span className="material-selection-toolbar__item-label">{itemLabel}</span>
        )}
        {actions.map((action) => {
          const Icon = ACTION_ICONS[action.iconKind] || FileIcon;
          return (
            <button
              key={action.key}
              type="button"
              className={`material-selection-toolbar__button material-selection-toolbar__button--${action.variant || 'secondary'}`}
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.disabled ? action.disabledReason : action.label}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{action.label}</span>
            </button>
          );
        })}
        {error && (
          <span className="material-selection-toolbar__error" role="status">
            {error}
          </span>
        )}
      </div>
    </div>
  );
};

export default React.memo(MaterialSelectionToolbar);
