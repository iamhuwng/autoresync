/**
 * EraserTool - Remove previously drawn strokes
 * Priority 3 - Uses destination-out blending
 */

import BaseTool from './BaseTool.js';

class EraserTool extends BaseTool {
  constructor() {
    super('Eraser', 'eraser');
    
    // Eraser options
    this.options = {
      size: 20,            // 3x larger than default pen
      thinning: 0.1,       // Minimal pressure effect
      smoothing: 0.5,
      streamline: 0.3
    };
    
    // Active eraser strokes
    this.currentStrokes = new Map();
  }
  
  onActivate() {
    super.onActivate();
    // Change cursor to indicate eraser mode
    if (this.manager && this.manager.canvasEngine) {
      const canvas = this.manager.canvasEngine.getCanvas();
      if (canvas) {
        canvas.style.cursor = 'cell'; // Cell icon suggests eraser
      }
    }
  }
  
  onDeactivate() {
    super.onDeactivate();
    this.currentStrokes.clear();
  }
  
  onStrokeStart(point, pointerId) {
    // Start new eraser stroke
    this.currentStrokes.set(pointerId, {
      points: [point],
      style: {
        color: '#000000',        // Color doesn't matter for destination-out
        size: this.options.size,
        thinning: this.options.thinning,
        smoothing: this.options.smoothing,
        streamline: this.options.streamline,
        opacity: 1.0,
        blendMode: 'destination-out' // Erases pixels
      }
    });
  }
  
  onStrokeUpdate(points, pointerId) {
    const stroke = this.currentStrokes.get(pointerId);
    if (stroke) {
      stroke.points.push(...points);
    }
  }
  
  onStrokeEnd(points, pointerId) {
    const stroke = this.currentStrokes.get(pointerId);
    if (stroke && this.manager) {
      // Finalize eraser stroke and add to drawing
      const finalStroke = {
        id: `eraser_${Date.now()}_${pointerId}`,
        tool: 'eraser',
        points: stroke.points,
        style: stroke.style,
        timestamp: Date.now()
      };
      
      this.manager.addStroke(finalStroke);
    }
    
    this.currentStrokes.delete(pointerId);
  }
  
  onStrokeCancel(pointerId) {
    this.currentStrokes.delete(pointerId);
  }
  
  renderUI(ctx, strokeRenderer) {
    // Render active eraser strokes
    this.currentStrokes.forEach(stroke => {
      if (stroke.points.length > 0) {
        strokeRenderer.renderEraser(stroke.points, stroke.style.size);
      }
    });
  }
  
  getSettingsPanel() {
    return {
      fields: [
        {
          type: 'slider',
          label: 'Eraser Size',
          min: 10,
          max: 40,
          step: 2,
          value: this.options.size,
          onChange: (value) => this.updateOptions({ size: value })
        }
      ]
    };
  }
}

export default EraserTool;
