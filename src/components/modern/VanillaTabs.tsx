import { Button } from './Button';
import './VanillaTabs.css';

export interface VanillaTabDefinition {
  key: string;
  label: string;
  icon?: string;
}

export interface VanillaTabsProps {
  tabs: VanillaTabDefinition[];
  activeTab: string;
  onTabChange: (key: string) => void;
  className?: string;
}

export function VanillaTabs({
  tabs,
  activeTab,
  onTabChange,
  className = '',
}: VanillaTabsProps) {
  return (
    <div className={`vanilla-tabs ${className}`.trim()}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;

        return (
          <div
            key={tab.key}
            className={`vanilla-tabs__item ${isActive ? 'active' : ''}`.trim()}
          >
            <Button
              variant={isActive ? 'primary' : 'glass'}
              size="sm"
              onClick={() => onTabChange(tab.key)}
              className={`vanilla-tabs__button ${isActive ? 'vanilla-tabs__button--active' : ''}`.trim()}
            >
              <span className="vanilla-tabs__label">
                {tab.icon ? `${tab.icon} ` : ''}
                {tab.label}
              </span>
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export default VanillaTabs;
