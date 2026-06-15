import React from 'react';
import { getTeacherMaterialsCapabilities } from '../../config/readingV2FeatureFlags';
import './ContentTabs.css';

const tabs = [
  { id: 'my', label: 'My Content' },
  { id: 'public', label: 'Public Library' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'reading-passage', label: 'Reading Passage', capability: 'canUseReadingPassageLibrary' },
  { id: 'book', label: 'Book', capability: 'canUseMaterialBooks' },
];

const ContentTabs = ({ activeTab, onTabChange, capabilities = getTeacherMaterialsCapabilities() }) => {
  const visibleTabs = tabs.filter((tab) => !tab.capability || capabilities?.[tab.capability]);

  return (
    <nav className="content-tabs" role="tablist" aria-label="Material content filters">
      {visibleTabs.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={`content-tab-button${isActive ? ' content-tab-button--active' : ''}`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
};

export default ContentTabs;
