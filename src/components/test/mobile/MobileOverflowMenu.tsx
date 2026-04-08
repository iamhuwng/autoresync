import React from 'react';
import { MOBILE_READING_LAYER_Z_INDEX } from './mobileReadingLayering';

export interface MobileOverflowMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

export interface MobileOverflowMenuProps {
  isOpen: boolean;
  onClose: () => void;
  menuItems: MobileOverflowMenuItem[];
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: MOBILE_READING_LAYER_Z_INDEX.OVERFLOW_MENU,
  background: 'rgba(15, 23, 42, 0.18)',
};

const menuStyle: React.CSSProperties = {
  position: 'fixed',
  top: 'calc(env(safe-area-inset-top, 0px) + 52px)',
  right: '12px',
  zIndex: MOBILE_READING_LAYER_Z_INDEX.OVERFLOW_MENU + 1,
  width: 'min(280px, calc(100vw - 24px))',
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '1rem',
  boxShadow: '0 18px 36px rgba(15, 23, 42, 0.18)',
  overflow: 'hidden',
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: '0.375rem',
};

const getItemButtonStyle = (destructive: boolean): React.CSSProperties => ({
  width: '100%',
  minHeight: 48,
  padding: '0.75rem 0.875rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.75rem',
  border: 'none',
  background: 'transparent',
  borderRadius: '0.75rem',
  cursor: 'pointer',
  color: destructive ? '#b91c1c' : '#0f172a',
  fontSize: '0.9375rem',
  fontWeight: 600,
  textAlign: 'left',
});

const itemLabelStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const MobileOverflowMenu: React.FC<MobileOverflowMenuProps> = ({
  isOpen,
  onClose,
  menuItems,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close overflow menu"
        data-testid="mobile-overflow-menu-backdrop"
        onClick={onClose}
        style={backdropStyle}
      />
      <div
        role="menu"
        aria-label="More options"
        data-testid="mobile-overflow-menu"
        style={menuStyle}
      >
        <ul style={listStyle}>
          {menuItems.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                role="menuitem"
                data-testid={`mobile-overflow-item-${item.key}`}
                onClick={() => {
                  item.onSelect();
                  onClose();
                }}
                style={getItemButtonStyle(Boolean(item.destructive))}
              >
                <span style={itemLabelStyle}>{item.label}</span>
                <span aria-hidden="true" style={{ color: '#94a3b8', flexShrink: 0 }}>
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
};

export default MobileOverflowMenu;
