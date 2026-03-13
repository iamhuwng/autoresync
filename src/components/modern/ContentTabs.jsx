import React from 'react';
import { Button } from './index';
import './ContentTabs.css';

const ContentTabs = ({ activeTab, onTabChange }) => {
  return (
    <div className="content-tabs">
      <Button
        variant={activeTab === 'my' ? 'primary' : 'glass'}
        size="sm"
        onClick={() => onTabChange('my')}
        style={{ minWidth: '100px' }}
      >
        📁 My Content
      </Button>
      <Button
        variant={activeTab === 'public' ? 'primary' : 'glass'}
        size="sm"
        onClick={() => onTabChange('public')}
        style={{ minWidth: '100px' }}
      >
        🌐 Public Library
      </Button>
      <Button
        variant={activeTab === 'drafts' ? 'primary' : 'glass'}
        size="sm"
        onClick={() => onTabChange('drafts')}
        style={{ minWidth: '100px' }}
      >
        📝 Drafts
      </Button>
    </div>
  );
};

export default ContentTabs;
