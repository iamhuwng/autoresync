/**
 * HighlighterTool - Semi-transparent highlighting for emphasis
 * Priority 4 - 30% opacity, larger strokes
 */

import BaseTool from './BaseTool.js';

class HighlighterTool extends BaseTool {
  constructor() {
    super('Highlighter', 'highlighter');
    
    // Highlighter options
    this.options = {
      size: 20,             // 2x larger than pen
      color: '#FFFF00',     // Yellow default
      opacity: 0.3,         // Semi-transparent
      thinning: 0.2,        // Less pressure sensitivity
      smoothing: 0.6,       // Smoother for highlighting
      streamline: 0.3
    };
    
    // Active highlighter strokes
    this.currentStrokes = new Map();
  }
  
  onActivate() {
    super.onActivate();
    // Change cursor
    if (this.manager && this.manager.canvasEngine) {
      const canvas = this.manager.canvasEngine.getCanvas();
      if (canvas) {
        canvas.style.cursor = 'text'; // Text cursor suggests highlighting
      }
    }
  }
  
  onDeactivate() {
    super.onDeactivate();
    this.currentStrokes.clear();
  }
  
  onStrokeStart(point, pointerId) {
    // Start new highlighter stroke
    this.currentStrokes.set(pointerId, {
      points: [point],
      style: {
        color: this.options.color,
        size: this.options.size,
        thinning: this.options.thinning,
        smoothing: this.options.smoothing,
        streamline: this.options.streamline,
        opacity: this.options.opacity,
        blendMode: 'source-over'
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
      // Finalize highlighter stroke
      const finalStroke = {
        id: `highlighter_${Date.now()}_${pointerId}`,
        tool: 'highlighter',
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
    // Render active highlighter strokes
    this.currentStrokes.forEach(stroke => {
      if (stroke.points.length > 0) {
        strokeRenderer.renderHighlighter(
          stroke.points,
          stroke.style.color,
          stroke.style.size
        );
      }
    });
  }
  
  getSettingsPanel() {
    return {
      fields: [
        {
          type: 'slider',
          label: 'Size',
          min: 15,
          max: 30,
          step: 2,
          value: this.options.size,
          onChange: (value) => this.updateOptions({ size: value })
        },
        {
          type: 'color',
          label: 'Color',
          presets: ['#FFFF00', '#00FF00', '#FF69B4', '#00BFFF'],
          value: this.options.color,
          onChange: (value) => this.updateOptions({ color: value })
        }
      ]
    };
  }
}

export default HighlighterTool;
