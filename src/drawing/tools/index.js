/**
 * Tool Registry - Export drawing tools
 * Available tools: Text, Pen, Eraser, Highlighter, Shape
 */

import BaseTool from './BaseTool.js';
import TextTool from './TextTool.jsx';
import PenTool from './PenTool.js';
import EraserTool from './EraserTool.js';
import HighlighterTool from './HighlighterTool.js';
import ShapeTool from './ShapeTool.js';

export {
  BaseTool,
  TextTool,
  PenTool,
  EraserTool,
  HighlighterTool,
  ShapeTool
};

// Default tool order (by priority)
export const DEFAULT_TOOLS = [
  'pen',         // Priority 1 (default)
  'eraser',      // Priority 2
  'highlighter'  // Priority 3
];

// Tool factory function
export const createTool = (toolName) => {
  switch (toolName.toLowerCase()) {
    case 'pen':
      return new PenTool();
    case 'eraser':
      return new EraserTool();
    case 'highlighter':
      return new HighlighterTool();
    default:
      console.warn(`Unknown tool: ${toolName}, defaulting to Pen`);
      return new PenTool();
  }
};

// Create all default tools
export const createAllTools = () => {
  return {
    pen: new PenTool(),
    eraser: new EraserTool(),
    highlighter: new HighlighterTool()
  };
};
