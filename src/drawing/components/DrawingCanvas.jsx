/**
 * DrawingCanvas - Complete drawing system wrapper
 * Combines canvas, toolbar, and persistence
 */

import React, { useRef, useEffect } from 'react';
import useDrawing from '../hooks/useDrawing.js';
import DrawingToolbar from './DrawingToolbar.jsx';
import { getStorageManager } from '../storage/StorageManager.js';
import { getExportManager } from '../storage/ExportManager.js';

const DrawingCanvas = ({
  passageId,
  quizId,
  sessionId,
  isEnabled = false,
  backgroundImage = null,
  backgroundText = null,
  onDrawingChange = null,
  style = {}
}) => {
  const containerRef = useRef(null);
  const storageManager = useRef(getStorageManager());
  const exportManager = useRef(getExportManager());
  const autoSaveTimeoutRef = useRef(null);
  
  const {
    manager,
    isDrawing,
    currentTool,
    tools,
    canUndo,
    canRedo,
    enableDrawing,
    disableDrawing,
    switchTool,
    updateToolOptions,
    undo,
    redo,
    clear,
    setBackgroundImage,
    setBackgroundText,
    getDrawingData,
    loadDrawingData
  } = useDrawing(containerRef);
  
  // Enable/disable based on prop
  useEffect(() => {
    if (isEnabled) {
      enableDrawing();
    } else {
      disableDrawing();
    }
  }, [isEnabled, enableDrawing, disableDrawing]);
  
  // Set background image
  useEffect(() => {
    if (manager && backgroundImage) {
      setBackgroundImage(backgroundImage);
    }
  }, [manager, backgroundImage, setBackgroundImage]);
  
  // Set background text
  useEffect(() => {
    if (manager && backgroundText) {
      setBackgroundText(backgroundText);
    }
  }, [manager, backgroundText, setBackgroundText]);
  
  // Load saved drawing on mount
  useEffect(() => {
    if (!manager || !passageId || !quizId || !sessionId) return;
    
    const loadSavedDrawing = async () => {
      try {
        const savedData = await storageManager.current.loadDrawing(
          passageId,
          quizId,
          sessionId
        );
        
        if (savedData) {
          loadDrawingData(savedData);
          console.log('✅ Loaded saved drawing');
        }
      } catch (error) {
        console.error('❌ Failed to load saved drawing:', error);
      }
    };
    
    loadSavedDrawing();
  }, [manager, passageId, quizId, sessionId, loadDrawingData]);
  
  // Auto-save with debounce
  useEffect(() => {
    if (!manager || !passageId || !quizId || !sessionId) return;
    
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Save after 2 seconds of inactivity
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        const drawingData = getDrawingData();
        if (drawingData) {
          await storageManager.current.saveDrawing(
            passageId,
            quizId,
            sessionId,
            drawingData
          );
          
          if (onDrawingChange) {
            onDrawingChange(drawingData);
          }
        }
      } catch (error) {
        console.error('❌ Auto-save failed:', error);
      }
    }, 2000);
    
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [manager, passageId, quizId, sessionId, getDrawingData, onDrawingChange]);
  
  // Handle tool change
  const handleToolChange = (toolName) => {
    switchTool(toolName);
  };
  
  // Handle export
  const handleExport = async (format) => {
    if (!manager) return;
    
    try {
      const filename = `passage-${passageId}`;
      
      if (format === 'png') {
        await exportManager.current.exportWithBackground(manager, 'png', {
          filename,
          scale: 2
        });
        alert('PNG exported successfully!');
      } else if (format === 'pdf') {
        await exportManager.current.exportWithBackground(manager, 'pdf', {
          filename,
          title: `Passage ${passageId} - Annotated`
        });
        alert('PDF exported successfully!');
      }
    } catch (error) {
      console.error('❌ Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };
  
  const containerStyle = {
    position: 'relative',
    width: '100%',
    height: '100%',
    ...style
  };
  
  const toolbarStyle = {
    position: 'absolute',
    top: '16px',
    right: '16px',
    zIndex: 100
  };
  
  return (
    <div style={containerStyle}>
      {/* Drawing canvas container */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative'
        }}
      />
      
      {/* Toolbar (only show when drawing is enabled) */}
      {isEnabled && (
        <div style={toolbarStyle}>
          <DrawingToolbar
            currentTool={currentTool}
            onToolChange={handleToolChange}
            onUpdateToolOptions={updateToolOptions}
            onUndo={undo}
            onRedo={redo}
            onClear={clear}
            onExport={handleExport}
            canUndo={canUndo}
            canRedo={canRedo}
            tools={tools}
          />
        </div>
      )}
    </div>
  );
};

export default DrawingCanvas;
