import React from 'react';
import { GridIcon, ListIcon } from './icons.jsx';
import './MaterialViewModeToggle.css';

const MODES = [
  { value: 'grid', label: 'Grid view', icon: GridIcon },
  { value: 'list', label: 'List view', icon: ListIcon },
];

const MaterialViewModeToggle = ({ value = 'grid', onChange }) => {
  return (
    <div className="material-view-mode-toggle" role="group" aria-label="Materials view mode">
      {MODES.map((mode) => {
        const Icon = mode.icon;
        const active = value === mode.value;
        return (
          <button
            key={mode.value}
            type="button"
            className={`material-view-mode-toggle__button${active ? ' material-view-mode-toggle__button--active' : ''}`}
            aria-label={mode.label}
            aria-pressed={active}
            title={mode.label}
            onClick={() => {
              if (!active) {
                onChange?.(mode.value);
              }
            }}
          >
            <Icon size={18} />
          </button>
        );
      })}
    </div>
  );
};

export default React.memo(MaterialViewModeToggle);
