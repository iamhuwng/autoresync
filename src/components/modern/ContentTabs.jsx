import React from 'react';
import { Button } from './index';
import './ContentTabs.css';

const tabs = [
  { id: 'my', label: 'My Content' },
  { id: 'public', label: 'Public Library' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'reading-passage', label: 'Reading Passage' },
  { id: 'book', label: 'Book' },
];

const ContentTabs = ({ activeTab, onTabChange }) => {
  return (
    <nav className="content-tabs" aria-label="Material content filters">
      {tabs.map((tab) => (
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
