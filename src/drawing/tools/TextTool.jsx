/**
 * TextTool - Add text annotations to drawings
 * Priority 1 (HIGHEST) - Click canvas to open text input dialog
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import BaseTool from './BaseTool.js';

class TextTool extends BaseTool {
  constructor() {
    super('Text', 'text');
    
    // Text tool options
    this.options = {
      size: 16,             // Font size in pixels
      color: '#000000',     // Text color
      font: 'Arial, sans-serif'
    };
    
    // Dialog state
    this.isDialogOpen = false;
    this.dialogPosition = null;
    this.dialogCallback = null;
    this.editingAnnotation = null;
  }
  
  onActivate() {
    super.onActivate();
    if (this.manager && this.manager.canvasEngine) {
      const canvas = this.manager.canvasEngine.getCanvas();
      if (canvas) {
        canvas.style.cursor = 'text';
      }
    }
  }
  
  onDeactivate() {
    super.onDeactivate();
    // Close dialog if open
    this.closeDialog();
  }
  
  onStrokeStart(point, pointerId) {
    // On click, open text input dialog at that position
    this.openDialog(point.x, point.y);
  }
  
  // No stroke updates for text tool
  onStrokeUpdate(points, pointerId) {}
  onStrokeEnd(points, pointerId) {}
  onStrokeCancel(pointerId) {}
  
  openDialog(x, y, existingAnnotation = null) {
    this.dialogPosition = { x, y };
    this.editingAnnotation = existingAnnotation;
    this.isDialogOpen = true;
    
    // Trigger UI update (need to call external callback)
    if (this.onDialogStateChange) {
      this.onDialogStateChange(true);
    }
  }
  
  closeDialog() {
    this.isDialogOpen = false;
    this.dialogPosition = null;
    this.editingAnnotation = null;
    
    if (this.onDialogStateChange) {
      this.onDialogStateChange(false);
    }
  }
  
  handleDialogSubmit(text, size, color) {
    if (text && text.trim() !== '' && this.manager && this.dialogPosition) {
      const annotation = {
        id: `text_${Date.now()}`,
        type: 'text',
        text: text.trim(),
        x: this.dialogPosition.x,
        y: this.dialogPosition.y,
        size: size || this.options.size,
        color: color || this.options.color,
        timestamp: Date.now()
      };
      
      if (this.editingAnnotation) {
        // Update existing annotation (future feature)
        // For now, just add new one
      }
      
      this.manager.addTextAnnotation(annotation);
    }
    
    this.closeDialog();
  }
  
  handleDialogCancel() {
    this.closeDialog();
  }
  
  // Method to get dialog component (called by React integration)
  getDialogComponent() {
    if (!this.isDialogOpen || !this.dialogPosition) {
      return null;
    }
    
    return (
      <TextInputDialog
        position={this.dialogPosition}
        initialText={this.editingAnnotation?.text || ''}
        initialSize={this.editingAnnotation?.size || this.options.size}
        initialColor={this.editingAnnotation?.color || this.options.color}
        onSubmit={(text, size, color) => this.handleDialogSubmit(text, size, color)}
        onCancel={() => this.handleDialogCancel()}
      />
    );
  }
  
  getSettingsPanel() {
    return {
      fields: [
        {
          type: 'select',
          label: 'Font Size',
          options: [
            { label: 'Small (12px)', value: 12 },
            { label: 'Medium (16px)', value: 16 },
            { label: 'Large (24px)', value: 24 }
          ],
          value: this.options.size,
          onChange: (value) => this.updateOptions({ size: value })
        },
        {
          type: 'color',
          label: 'Color',
          presets: ['#000000', '#3b82f6', '#ef4444', '#10b981', '#8b5cf6'],
          value: this.options.color,
          onChange: (value) => this.updateOptions({ color: value })
        }
      ]
    };
  }
}

/**
 * TextInputDialog Component
 * Modal dialog for entering text annotations
 */
const TextInputDialog = ({ position, initialText, initialSize, initialColor, onSubmit, onCancel }) => {
  const [text, setText] = useState(initialText);
  const [size, setSize] = useState(initialSize);
  const [color, setColor] = useState(initialColor);
  
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(text, size, color);
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      handleSubmit(e);
    }
  };
  
  // Position dialog near click point but ensure it's visible
  const dialogStyle = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 350),
    top: Math.min(position.y, window.innerHeight - 250),
    zIndex: 10000,
    background: 'white',
    border: '2px solid #cbd5e1',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
    width: '320px',
    fontFamily: 'Arial, sans-serif'
  };
  
  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    background: 'rgba(0, 0, 0, 0.3)',
    backdropFilter: 'blur(2px)'
  };
  
  return createPortal(
    <>
      <div style={overlayStyle} onClick={onCancel} />
      <div style={dialogStyle}>
        <form onSubmit={handleSubmit}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
            Add Text Annotation
          </h3>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#475569' }}>
              Text:
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter text here..."
              autoFocus
              rows={3}
              style={{
                width: '100%',
                padding: '8px',
                border: '2px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                resize: 'vertical'
              }}
            />
          </div>
          
          <div style={{ marginBottom: '16px', display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#475569' }}>
                Size:
              </label>
              <select
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              >
                <option value={12}>Small (12px)</option>
                <option value={16}>Medium (16px)</option>
                <option value={24}>Large (24px)</option>
              </select>
            </div>
            
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#475569' }}>
                Color:
              </label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={{
                  width: '100%',
                  height: '38px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              />
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                border: '2px solid #e2e8f0',
                borderRadius: '6px',
                background: 'white',
                color: '#64748b',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.background = '#f1f5f9'}
              onMouseLeave={(e) => e.target.style.background = 'white'}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!text.trim()}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                background: text.trim() ? '#3b82f6' : '#cbd5e1',
                color: 'white',
                fontSize: '14px',
                fontWeight: '500',
                cursor: text.trim() ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (text.trim()) e.target.style.background = '#2563eb';
              }}
              onMouseLeave={(e) => {
                if (text.trim()) e.target.style.background = '#3b82f6';
              }}
            >
              Add Text
            </button>
          </div>
          
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '12px 0 0 0', textAlign: 'center' }}>
            Press <kbd>Ctrl+Enter</kbd> to submit, <kbd>Esc</kbd> to cancel
          </p>
        </form>
      </div>
    </>,
    document.body
  );
};

export default TextTool;
export { TextInputDialog };
