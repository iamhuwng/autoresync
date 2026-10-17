import React from 'react';
import MaterialListRow from './MaterialListRow';
import './MaterialListView.css';

const MaterialListView = ({ rows, itemLabel = 'tests', showLoadedCount = true }) => {
  return (
    <section className="material-list-view" aria-label="Materials list view">
      <div className="material-list-view__header" role="row">
        <div className="material-list-view__header-material">Material</div>
        <div className="material-list-view__header-items">Items</div>
        <div className="material-list-view__header-updated">Updated</div>
        <div className="material-list-view__header-actions">Actions</div>
      </div>

      <div className="material-list-view__rows">
        {rows.map((row) => (
          <MaterialListRow key={row.id} row={row} />
        ))}
      </div>

      {showLoadedCount && <div className="material-list-view__footer">
        <span>
          {rows.length} {itemLabel} loaded
        </span>
      </div>}
    </section>
  );
};

export default React.memo(MaterialListView);
