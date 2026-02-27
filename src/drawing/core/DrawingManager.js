/**
 * DrawingManager - Main orchestrator for the drawing system
 * Coordinates canvas, input, rendering, and tool management
 */

import CanvasEngine from './CanvasEngine.js';
import PointerInputHandler from './PointerInputHandler.js';
import StrokeRenderer from './StrokeRenderer.js';

class DrawingManager {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = options;
    
    // Initialize core components
    this.canvasEngine = new CanvasEngine(containerElement, {
      desynchronized: true,
      alpha: true
    });
    
    this.strokeRenderer = new StrokeRenderer(this.canvasEngine.getContext());
    
    this.inputHandler = new PointerInputHandler(this.canvasEngine.getCanvas(), {
      onStrokeStart: this.handleStrokeStart.bind(this),
      onStrokeUpdate: this.handleStrokeUpdate.bind(this),
      onPredictedPoints: this.handlePredictedPoints.bind(this),
      onStrokeEnd: this.handleStrokeEnd.bind(this),
      onStrokeCancel: this.handleStrokeCancel.bind(this)
    });
    
    // State
    this.strokes = [];              // Completed strokes
    this.textAnnotations = [];      // Text annotations
    this.shapes = [];               // Shape objects
    this.currentTool = null;        // Active tool
    this.history = [];              // Action history for undo
    this.historyIndex = -1;         // Current position in history
    this.backgroundImage = null;    // Background image element
    this.backgroundText = null;     // Background text content
    
    // Predicted points (for latency compensation)
    this.predictedPoints = new Map();
    
    // Performance optimization: cache completed strokes in offscreen canvas
    this.completedStrokesCanvas = null;
    this.completedStrokesCtx = null;
    this.completedStrokesNeedRedraw = true;
    
    // Bind render method
    this.canvasEngine.setRenderCallback(this.render.bind(this));
    
    // Initial render
    this.canvasEngine.requestRedraw();
  }
  
  /**
   * Set active tool
   */
  setTool(tool) {
    if (this.currentTool) {
      this.currentTool.onDeactivate?.();
    }
    
    this.currentTool = tool;
    
    if (this.currentTool) {
      this.currentTool.onActivate?.();
    }
  }
  
  /**
   * Handle stroke start from input
   */
  handleStrokeStart(point, pointerId) {
    if (this.currentTool) {
      this.currentTool.onStrokeStart?.(point, pointerId);
    }
  }
  
  /**
   * Handle stroke update from input
   */
  handleStrokeUpdate(points, pointerId) {
    if (this.currentTool) {
      this.currentTool.onStrokeUpdate?.(points, pointerId);
    }
    this.canvasEngine.requestRedraw();
  }
  
  /**
   * Handle predicted points (latency compensation)
   */
  handlePredictedPoints(points, pointerId) {
    this.predictedPoints.set(pointerId, points);
    if (this.currentTool) {
      this.currentTool.onPredictedPoints?.(points, pointerId);
    }
  }
  
  /**
   * Handle stroke end from input
   */
  handleStrokeEnd(points, pointerId) {
    this.predictedPoints.delete(pointerId);
    if (this.currentTool) {
      this.currentTool.onStrokeEnd?.(points, pointerId);
    }
    this.canvasEngine.requestRedraw();
  }
  
  /**
   * Handle stroke cancel from input
   */
  handleStrokeCancel(pointerId) {
    this.predictedPoints.delete(pointerId);
    if (this.currentTool) {
      this.currentTool.onStrokeCancel?.(pointerId);
    }
    this.canvasEngine.requestRedraw();
  }
  
  /**
   * Add stroke to drawing
   */
  addStroke(stroke) {
    // Trim redo history if we're not at the end
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    
    this.strokes.push(stroke);
    this.history.push({ type: 'stroke', data: stroke });
    this.historyIndex++;
    
    // Limit undo history size (but keep all strokes on canvas)
    // Only limit the history array for memory management
    if (this.history.length > 100) {
      this.history.shift();
      this.historyIndex--;
      // Note: We do NOT remove from this.strokes
      // Old strokes remain drawable, just not undoable beyond 100 actions
    }
    
    this.completedStrokesNeedRedraw = true;
    this.canvasEngine.requestRedraw();
  }
  
  /**
   * Add text annotation
   */
  addTextAnnotation(annotation) {
    // Trim redo history
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    
    this.textAnnotations.push(annotation);
    this.history.push({ type: 'text', data: annotation });
    this.historyIndex++;
    
    this.completedStrokesNeedRedraw = true;
    this.canvasEngine.requestRedraw();
  }
  
  /**
   * Add shape
   */
  addShape(shape) {
    // Trim redo history
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    
    this.shapes.push(shape);
    this.history.push({ type: 'shape', data: shape });
    this.historyIndex++;
    
    this.completedStrokesNeedRedraw = true;
    this.canvasEngine.requestRedraw();
  }
  
  /**
   * Undo last action
   */
  undo() {
    if (this.historyIndex < 0) return false;
    
    const action = this.history[this.historyIndex];
    
    switch (action.type) {
      case 'stroke':
        // Find and remove the specific stroke by reference
        const strokeIndex = this.strokes.indexOf(action.data);
        if (strokeIndex !== -1) {
          this.strokes.splice(strokeIndex, 1);
        }
        break;
      case 'text':
        const textIndex = this.textAnnotations.indexOf(action.data);
        if (textIndex !== -1) {
          this.textAnnotations.splice(textIndex, 1);
        }
        break;
      case 'shape':
        const shapeIndex = this.shapes.indexOf(action.data);
        if (shapeIndex !== -1) {
          this.shapes.splice(shapeIndex, 1);
        }
        break;
      case 'clear':
        // Restore cleared items
        this.strokes = [...action.data.strokes];
        this.textAnnotations = [...action.data.textAnnotations];
        this.shapes = [...action.data.shapes];
        break;
    }
    
    this.historyIndex--;
    this.completedStrokesNeedRedraw = true;
    this.canvasEngine.requestRedraw();
    return true;
  }
  
  /**
   * Redo previously undone action
   */
  redo() {
    if (this.historyIndex >= this.history.length - 1) return false;
    
    this.historyIndex++;
    const action = this.history[this.historyIndex];
    
    switch (action.type) {
      case 'stroke':
        this.strokes.push(action.data);
        break;
      case 'text':
        this.textAnnotations.push(action.data);
        break;
      case 'shape':
        this.shapes.push(action.data);
        break;
      case 'clear':
        this.strokes = [];
        this.textAnnotations = [];
        this.shapes = [];
        break;
    }
    
    this.completedStrokesNeedRedraw = true;
    this.canvasEngine.requestRedraw();
    return true;
  }
  
  /**
   * Clear all drawings
   */
  clear() {
    if (this.strokes.length === 0 && this.textAnnotations.length === 0 && this.shapes.length === 0) {
      return;
    }
    
    // Save current state for undo
    this.history.push({
      type: 'clear',
      data: {
        strokes: [...this.strokes],
        textAnnotations: [...this.textAnnotations],
        shapes: [...this.shapes]
      }
    });
    this.historyIndex++;
    
    this.strokes = [];
    this.textAnnotations = [];
    this.shapes = [];
    
    this.completedStrokesNeedRedraw = true;
    this.canvasEngine.requestRedraw();
  }
  
  /**
   * Set background image
   */
  setBackgroundImage(image) {
    this.backgroundImage = image;
    this.backgroundText = null;
    this.canvasEngine.requestRedraw();
  }
  
  /**
   * Set background text
   */
  setBackgroundText(text) {
    this.backgroundText = text;
    this.backgroundImage = null;
    this.canvasEngine.requestRedraw();
  }
  
  /**
   * Main render function with performance optimization
   */
  render(ctx, timestamp) {
    const { width, height } = this.canvasEngine.getDimensions();
    
    // Clear canvas
    this.canvasEngine.clear();
    
    // Draw background (image or text)
    if (this.backgroundImage) {
      ctx.drawImage(this.backgroundImage, 0, 0, width, height);
    } else if (this.backgroundText) {
      this.renderTextBackground(ctx);
    }
    
    // Initialize cache canvas if needed
    if (!this.completedStrokesCanvas) {
      this.completedStrokesCanvas = document.createElement('canvas');
      this.completedStrokesCanvas.width = this.canvasEngine.canvas.width;
      this.completedStrokesCanvas.height = this.canvasEngine.canvas.height;
      this.completedStrokesCtx = this.completedStrokesCanvas.getContext('2d');
      this.completedStrokesNeedRedraw = true;
    }
    
    // Check if cache canvas needs resizing
    if (this.completedStrokesCanvas.width !== this.canvasEngine.canvas.width ||
        this.completedStrokesCanvas.height !== this.canvasEngine.canvas.height) {
      this.completedStrokesCanvas.width = this.canvasEngine.canvas.width;
      this.completedStrokesCanvas.height = this.canvasEngine.canvas.height;
      this.completedStrokesCtx = this.completedStrokesCanvas.getContext('2d');
      this.completedStrokesNeedRedraw = true;
    }
    
    // Redraw completed strokes to cache only when needed (major performance boost!)
    if (this.completedStrokesNeedRedraw) {
      this.completedStrokesCtx.clearRect(0, 0, this.completedStrokesCanvas.width, this.completedStrokesCanvas.height);
      this.completedStrokesCtx.save();
      this.completedStrokesCtx.scale(this.canvasEngine.dpr, this.canvasEngine.dpr);
      
      // Temporarily point strokeRenderer to cache canvas
      const originalCtx = this.strokeRenderer.ctx;
      this.strokeRenderer.ctx = this.completedStrokesCtx;
      
      // Draw all completed strokes to cache
      this.strokes.forEach(stroke => {
        this.strokeRenderer.renderStroke(stroke.points, stroke.style);
      });
      
      // Draw text annotations to cache
      this.textAnnotations.forEach(textAnnotation => {
        this.strokeRenderer.renderText(textAnnotation);
      });
      
      // Draw shapes to cache
      this.shapes.forEach(shape => {
        this.strokeRenderer.renderShape(shape);
      });
      
      // Restore strokeRenderer context
      this.strokeRenderer.ctx = originalCtx;
      this.completedStrokesCtx.restore();
      this.completedStrokesNeedRedraw = false;
    }
    
    // Draw cached completed strokes (very fast!)
    // Reset transform to avoid double-scaling (cache is already in physical pixels)
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Identity matrix
    ctx.drawImage(this.completedStrokesCanvas, 0, 0);
    ctx.restore();
    
    // Draw current tool's active strokes/UI (not cached - redrawn every frame)
    if (this.currentTool && this.currentTool.renderUI) {
      this.currentTool.renderUI(ctx, this.strokeRenderer);
    }
  }
  
  /**
   * Render text background
   */
  renderTextBackground(ctx) {
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.font = '16px Georgia, serif';
    
    const lines = this.backgroundText.split('\n');
    const lineHeight = 24;
    let y = 20;
    
    lines.forEach(line => {
      ctx.fillText(line, 20, y);
      y += lineHeight;
    });
    
    ctx.restore();
  }
  
  /**
   * Export to PNG
   */
  exportToPNG() {
    return this.canvasEngine.getCanvas().toDataURL('image/png');
  }
  
  /**
   * Get all drawing data for persistence
   */
  getDrawingData() {
    return {
      strokes: this.strokes,
      textAnnotations: this.textAnnotations,
      shapes: this.shapes,
      metadata: {
        strokeCount: this.strokes.length,
        textCount: this.textAnnotations.length,
        shapeCount: this.shapes.length,
        modified: Date.now()
      }
    };
  }
  
  /**
   * Load drawing data from persistence
   */
  loadDrawingData(data) {
    this.strokes = data.strokes || [];
    this.textAnnotations = data.textAnnotations || [];
    this.shapes = data.shapes || [];
    this.completedStrokesNeedRedraw = true;
    
    // Rebuild history
    this.history = [];
    this.historyIndex = -1;
    
    this.strokes.forEach(stroke => {
      this.history.push({ type: 'stroke', data: stroke });
      this.historyIndex++;
    });
    
    this.textAnnotations.forEach(text => {
      this.history.push({ type: 'text', data: text });
      this.historyIndex++;
    });
    
    this.shapes.forEach(shape => {
      this.history.push({ type: 'shape', data: shape });
      this.historyIndex++;
    });
    
    this.canvasEngine.requestRedraw();
  }
  
  /**
   * Enable drawing
   */
  enable() {
    this.inputHandler.enable();
  }
  
  /**
   * Disable drawing
   */
  disable() {
    this.inputHandler.disable();
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    this.inputHandler.destroy();
    this.canvasEngine.destroy();
    
    this.strokes = [];
    this.textAnnotations = [];
    this.shapes = [];
    this.history = [];
    this.currentTool = null;
  }
}

export default DrawingManager;
