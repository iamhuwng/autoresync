/**
 * PenTool - Standard drawing pen with pressure sensitivity
 * Priority 2 (default tool)
 */

import BaseTool from './BaseTool.js';

class PenTool extends BaseTool {
  constructor() {
    super('Pen', 'pen');
    
    // Default pen options
    this.options = {
      size: 4,              // Base size in pixels
      color: '#000000',     // Black default
      thinning: 0.6,        // Pressure sensitivity
      smoothing: 0.5,       // Curve smoothing
      streamline: 0.3       // Input smoothing
    };
    
    // Active strokes being drawn
    this.currentStrokes = new Map();
  }
  
  onActivate() {
    super.onActivate();
    // Change cursor to crosshair
    if (this.manager && this.manager.canvasEngine) {
      const canvas = this.manager.canvasEngine.getCanvas();
      if (canvas) {
        canvas.style.cursor = 'crosshair';
      }
    }
  }
  
  onDeactivate() {
    super.onDeactivate();
    // Clear any ongoing strokes
    this.currentStrokes.clear();
  }
  
  onStrokeStart(point, pointerId) {
    // Start new stroke
    this.currentStrokes.set(pointerId, {
      points: [point],
      style: {
        color: this.options.color,
        size: this.options.size,
        thinning: this.options.thinning,
        smoothing: this.options.smoothing,
        streamline: this.options.streamline,
        opacity: 1.0,
        blendMode: 'source-over'
      }
    });
  }
  
  onStrokeUpdate(points, pointerId) {
    const stroke = this.currentStrokes.get(pointerId);
    if (stroke) {
      // Add new points to current stroke
      stroke.points.push(...points);
    }
  }
  
  onStrokeEnd(points, pointerId) {
    const stroke = this.currentStrokes.get(pointerId);
    if (stroke && this.manager) {
      // Finalize stroke and add to drawing
      const finalStroke = {
        id: `pen_${Date.now()}_${pointerId}`,
        tool: 'pen',
        points: stroke.points,
        style: stroke.style,
        timestamp: Date.now()
      };
      
      this.manager.addStroke(finalStroke);
    }
    
    // Clear current stroke
    this.currentStrokes.delete(pointerId);
  }
  
  onStrokeCancel(pointerId) {
    // Just remove the stroke
    this.currentStrokes.delete(pointerId);
  }
  
  renderUI(ctx, strokeRenderer) {
    // Render any strokes currently being drawn
    this.currentStrokes.forEach(stroke => {
      if (stroke.points.length > 0) {
        strokeRenderer.renderStroke(stroke.points, stroke.style);
      }
    });
  }
  
  getSettingsPanel() {
    return {
      fields: [
        {
          type: 'slider',
          label: 'Size',
          min: 2,
          max: 10,
          step: 1,
          value: this.options.size,
          onChange: (value) => this.updateOptions({ size: value })
        },
        {
          type: 'color',
          label: 'Color',
          presets: ['#000000', '#3b82f6', '#ef4444', '#10b981', '#8b5cf6'],
          value: this.options.color,
          onChange: (value) => this.updateOptions({ color: value })
        },
        {
          type: 'slider',
          label: 'Pressure Effect',
          min: 0,
          max: 1,
          step: 0.1,
          value: this.options.thinning,
          onChange: (value) => this.updateOptions({ thinning: value })
        }
      ]
    };
  }
}

export default PenTool;
