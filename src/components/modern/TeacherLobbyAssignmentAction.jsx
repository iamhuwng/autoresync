import React from 'react';
import { CloneIcon } from './icons.jsx';

const TeacherLobbyAssignmentAction = ({ action }) => {
  const ActionIcon = CloneIcon;

  return (
    <button
      type="button"
      data-row-action="true"
      data-assignment-reason-code={action.assignability?.reasonCode}
      className={`material-list-row__action material-list-row__action--${action.variant || 'secondary'}`}
      aria-label={action.label}
      disabled={action.disabled}
      title={action.disabled ? action.disabledReason : action.label}
      onClick={() => {
        if (!action.disabled) {
          action.onSelect?.();
        }
      }}
    >
      <ActionIcon size={14} />
      <span className="material-list-row__action-label">{action.label}</span>
    </button>
  );
};

export default React.memo(TeacherLobbyAssignmentAction);
