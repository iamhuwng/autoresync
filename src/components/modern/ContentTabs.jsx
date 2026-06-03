import React from 'react';
import { Button } from './index';
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
    <nav className="content-tabs" aria-label="Material content filters">
      {visibleTabs.map((tab) => (
        <Button
          key={tab.id}
          variant={activeTab === tab.id ? 'primary' : 'glass'}
          size="sm"
          onClick={() => onTabChange(tab.id)}
          className="content-tab-button"
        >
          {tab.label}
        </Button>
      ))}
    </nav>
  );
};

export default ContentTabs;
