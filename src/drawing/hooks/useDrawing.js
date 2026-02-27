/**
 * useDrawing - React hook for drawing system
 * Manages DrawingManager lifecycle and provides drawing interface
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import DrawingManager from '../core/DrawingManager.js';
import { createAllTools } from '../tools/index.js';

/**
 * Hook for managing drawing system
 * @param {React.RefObject} containerRef - Reference to container element
 * @param {Object} options - Configuration options
 * @returns {Object} Drawing system interface
 */
const useDrawing = (containerRef, options = {}) => {
  const [manager, setManager] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTool, setCurrentTool] = useState('pen'); // Default tool
  const [tools, setTools] = useState(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  
  const managerRef = useRef(null);
  const toolsRef = useRef(null);
  
  // Initialize drawing system
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Create DrawingManager
    const mgr = new DrawingManager(containerRef.current, options);
    managerRef.current = mgr;
    setManager(mgr);
    
    // Create all tools
    const allTools = createAllTools();
    toolsRef.current = allTools;
    setTools(allTools);
    
    // Set default tool (Pen - Priority 1)
    const defaultTool = allTools.pen;
    defaultTool.setManager(mgr);
    mgr.setTool(defaultTool);
    setCurrentTool('pen');
    
    // Initial state
    setIsDrawing(false);
    mgr.disable(); // Start disabled
    
    // Cleanup
    return () => {
      mgr.destroy();
      managerRef.current = null;
      toolsRef.current = null;
    };
  }, [containerRef]); // Removed 'options' to prevent infinite re-render
  
  // Update undo/redo state
  useEffect(() => {
    if (!manager) return;
    
    const updateUndoRedoState = () => {
      setCanUndo(manager.historyIndex >= 0);
      setCanRedo(manager.historyIndex < manager.history.length - 1);
    };
    
    // Update on any change
    const interval = setInterval(updateUndoRedoState, 100);
    
    return () => clearInterval(interval);
  }, [manager]);
  
  /**
   * Enable drawing mode
   */
  const enableDrawing = useCallback(() => {
    if (manager) {
      manager.enable();
      setIsDrawing(true);
    }
  }, [manager]);
  
  /**
   * Disable drawing mode
   */
  const disableDrawing = useCallback(() => {
    if (manager) {
      manager.disable();
      setIsDrawing(false);
    }
  }, [manager]);
  
  /**
   * Toggle drawing mode
   */
  const toggleDrawing = useCallback(() => {
    if (isDrawing) {
      disableDrawing();
    } else {
      enableDrawing();
    }
  }, [isDrawing, enableDrawing, disableDrawing]);
  
  /**
   * Switch to a different tool
   */
  const switchTool = useCallback((toolName) => {
    if (!manager || !tools) return;
    
    const tool = tools[toolName];
    if (!tool) {
      console.warn(`Tool not found: ${toolName}`);
      return;
    }
    
    tool.setManager(manager);
    manager.setTool(tool);
    setCurrentTool(toolName);
  }, [manager, tools]);
  
  /**
   * Update current tool options
   */
  const updateToolOptions = useCallback((options) => {
    if (!manager || !manager.currentTool) return;
    
    manager.currentTool.updateOptions(options);
  }, [manager]);
  
  /**
   * Undo last action
   */
  const undo = useCallback(() => {
    if (manager) {
      const success = manager.undo();
      if (success) {
        setCanUndo(manager.historyIndex >= 0);
        setCanRedo(manager.historyIndex < manager.history.length - 1);
      }
    }
  }, [manager]);
  
  /**
   * Redo previously undone action
   */
  const redo = useCallback(() => {
    if (manager) {
      const success = manager.redo();
      if (success) {
        setCanUndo(manager.historyIndex >= 0);
        setCanRedo(manager.historyIndex < manager.history.length - 1);
      }
    }
  }, [manager]);
  
  /**
   * Clear all drawings
   */
  const clear = useCallback(() => {
    if (manager) {
      if (window.confirm('Clear all drawings? This cannot be undone.')) {
        manager.clear();
        setCanUndo(false);
        setCanRedo(false);
      }
    }
  }, [manager]);
  
  /**
   * Set background image
   */
  const setBackgroundImage = useCallback((image) => {
    if (manager) {
      manager.setBackgroundImage(image);
    }
  }, [manager]);
  
  /**
   * Set background text
   */
  const setBackgroundText = useCallback((text) => {
    if (manager) {
      manager.setBackgroundText(text);
    }
  }, [manager]);
  
  /**
   * Export to PNG
   */
  const exportToPNG = useCallback(() => {
    if (manager) {
      return manager.exportToPNG();
    }
    return null;
  }, [manager]);
  
  /**
   * Get drawing data for persistence
   */
  const getDrawingData = useCallback(() => {
    if (manager) {
      return manager.getDrawingData();
    }
    return null;
  }, [manager]);
  
  /**
   * Load drawing data from persistence
   */
  const loadDrawingData = useCallback((data) => {
    if (manager && data) {
      manager.loadDrawingData(data);
      setCanUndo(manager.historyIndex >= 0);
      setCanRedo(false);
    }
  }, [manager]);
  
  return {
    // State
    manager,
    isDrawing,
    currentTool,
    tools,
    canUndo,
    canRedo,
    
    // Actions
    enableDrawing,
    disableDrawing,
    toggleDrawing,
    switchTool,
    updateToolOptions,
    undo,
    redo,
    clear,
    setBackgroundImage,
    setBackgroundText,
    exportToPNG,
    getDrawingData,
    loadDrawingData
  };
};

export default useDrawing;
