import React, { useState, useEffect } from 'react';
import { ActionIcon, Paper } from '@mantine/core';
import { IconMenu2, IconX } from '@tabler/icons-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import PassageRenderer from './PassageRenderer_v2';

/**
 * CollapsiblePassagePanel - A resizable panel layout for displaying passage/material content
 *
 * Features:
 * - Hamburger icon button to open panel (only shown if passage exists)
 * - Draggable divider for resizing panels (50/50 default, 20-80% constraints)
 * - Close button (X) to collapse panel
 * - Displays passage content using PassageRenderer
 * - Default state: collapsed (isOpen: false)
 * - Auto-resets to collapsed when passage changes (new question)
 *
 * @param {Object} passage - The passage object to display (null/undefined if no passage)
 * @param {React.ReactNode} children - The question content to display in the right panel (can be function)
 * @returns {JSX.Element} The collapsible panel component with children
 */
const CollapsiblePassagePanel = ({ passage, children, title, drawingMode = false, drawingCanvas = null, onDrawingModeChange = null }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Support children as function to pass isOpen state
  const renderChildren = typeof children === 'function' ? children({ isPassageOpen: isOpen }) : children;

  // Reset to collapsed state when passage changes (new question navigation)
  useEffect(() => {
    setIsOpen(false);
  }, [passage]);

  // If no passage, render children directly without any panel UI
  if (!passage) {
    return <>{renderChildren}</>;
  }

  // If passage exists but panel is closed, show hamburger button + full-width children
  if (!isOpen) {
    return (
      <>
        <div style={{ position: 'fixed', top: '20px', left: '20px', zIndex: 101 }}>
          <ActionIcon
            onClick={() => setIsOpen(true)}
            size="lg"
            variant="filled"
            color="blue"
            aria-label="Open passage panel"
          >
            <IconMenu2 size={24} />
          </ActionIcon>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px' }}>
          <h2 style={{ margin: '0 auto', color: '#1e293b', fontWeight: '700', fontSize: '1.5rem' }}>{title}</h2>
        </div>
        {renderChildren}
      </>
    );
  }

  // If passage exists and panel is open, show resizable panel layout
  return (
    <PanelGroup direction="horizontal" autoSaveId={null} style={{ flex: 1, overflow: 'hidden' }}>
      {/* Left Panel - Passage/Material (50% default, 20-80% constraints) */}
      <Panel order={1} defaultSize={50} minSize={20} maxSize={80} style={{ position: 'relative', overflow: 'hidden' }}>
        <Paper
          shadow="sm"
          p={0}
          style={{
            height: '100%',
            width: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            backgroundColor: 'white',
            borderRight: '1px solid #e0e0e0'
          }}
        >
          {/* Header with title, controls, and close button */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            marginBottom: '0',
            position: 'sticky',
            top: 0,
            backgroundColor: 'white',
            padding: '1rem 1rem 10px 1rem',
            borderBottom: '1px solid #f0f0f0',
            zIndex: 10,
            gap: '10px'
          }}>
            {/* Title Row */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px'
            }}>
              <h2 style={{ margin: 0, fontSize: '1.3em', color: '#1e293b', fontWeight: '700' }}>Passage/Material</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* Drawing Mode Toggle Button */}
                {onDrawingModeChange && (
                  <button
                    onClick={() => onDrawingModeChange(!drawingMode)}
                    style={{
                      padding: '8px 16px',
                      background: drawingMode
                        ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                        : 'white',
                      color: drawingMode ? 'white' : '#475569',
                      border: '2px solid #cbd5e1',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: drawingMode
                        ? '0 4px 12px rgba(139, 92, 246, 0.3)'
                        : '0 2px 8px rgba(0, 0, 0, 0.1)',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (!drawingMode) {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!drawingMode) {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                      }
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>✏️</span>
                    <span>Drawing {drawingMode ? 'ON' : 'OFF'}</span>
                  </button>
                )}
                <ActionIcon
                  onClick={() => setIsOpen(false)}
                  size="lg"
                  variant="subtle"
                  color="gray"
                  aria-label="Close passage panel"
                >
                  <IconX size={24} />
                </ActionIcon>
              </div>
            </div>
          </div>

          {/* Passage Content with Drawing Canvas Overlay */}
          <div style={{ marginTop: '0', padding: '0 1rem 1rem 1rem', position: 'relative' }}>
            <PassageRenderer
              passage={passage}
            />

            {/* Drawing Canvas Overlay */}
            {drawingMode && drawingCanvas && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: '1rem',
                right: '1rem',
                bottom: '1rem',
                pointerEvents: drawingMode ? 'auto' : 'none',
                zIndex: 100
              }}>
                {drawingCanvas}
              </div>
            )}
          </div>
        </Paper>
      </Panel>

      {/* Draggable Divider - 4px width, col-resize cursor */}
      <PanelResizeHandle style={{
        width: '4px',
        backgroundColor: '#e0e0e0',
        cursor: 'col-resize',
        position: 'relative',
        transition: 'background-color 0.2s'
      }}>
        <div
          style={{
            width: '100%',
            height: '100%'
          }}
          onMouseEnter={(e) => e.currentTarget.parentElement.style.backgroundColor = '#bbb'}
          onMouseLeave={(e) => e.currentTarget.parentElement.style.backgroundColor = '#e0e0e0'}
        />
      </PanelResizeHandle>

      {/* Right Panel - Question Area (50% default) */}
      <Panel order={2} defaultSize={50}>
        <div style={{ height: '100%', overflowY: 'auto' }}>
          {renderChildren}
        </div>
      </Panel>
    </PanelGroup>
  );
};

export default CollapsiblePassagePanel;
