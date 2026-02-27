/**
 * Drawing System - Main Export
 * Complete drawing and annotation system optimized for Surface Pen
 */

// Core components
export { default as DrawingManager } from './core/DrawingManager.js';
export { default as CanvasEngine } from './core/CanvasEngine.js';
export { default as PointerInputHandler } from './core/PointerInputHandler.js';
export { default as StrokeRenderer } from './core/StrokeRenderer.js';

// Tools
export {
  BaseTool,
  TextTool,
  PenTool,
  EraserTool,
  HighlighterTool,
  ShapeTool,
  createTool,
  createAllTools,
  DEFAULT_TOOLS
} from './tools/index.js';

// React components
export { default as DrawingCanvas } from './components/DrawingCanvas.jsx';
export { default as DrawingToolbar } from './components/DrawingToolbar.jsx';

// Hooks
export { default as useDrawing } from './hooks/useDrawing.js';

// Storage
export { default as StorageManager, getStorageManager } from './storage/StorageManager.js';
export { default as ExportManager, getExportManager } from './storage/ExportManager.js';
