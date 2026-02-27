/**
 * ShapeTool - Draw basic geometric shapes
 * Priority 5 - Circle, Rectangle, Arrow, Line
 */

import BaseTool from './BaseTool.js';

class ShapeTool extends BaseTool {
  constructor() {
    super('Shape', 'shape');
    
    // Shape options
    this.options = {
      shapeType: 'circle',    // 'circle', 'rectangle', 'arrow', 'line'
      color: '#000000',
      strokeWidth: 2,
      filled: false           // Outline or filled
    };
    
    // Active shapes being drawn
    this.currentShapes = new Map();
  }
  
  onActivate() {
    super.onActivate();
    if (this.manager && this.manager.canvasEngine) {
      const canvas = this.manager.canvasEngine.getCanvas();
      if (canvas) {
        canvas.style.cursor = 'crosshair';
      }
    }
  }
  
  onDeactivate() {
    super.onDeactivate();
    this.currentShapes.clear();
  }
  
  onStrokeStart(point, pointerId) {
    // Record start point for shape
    this.currentShapes.set(pointerId, {
      startX: point.x,
      startY: point.y,
      endX: point.x,
      endY: point.y,
      type: this.options.shapeType,
      color: this.options.color,
      strokeWidth: this.options.strokeWidth,
      filled: this.options.filled
    });
  }
  
  onStrokeUpdate(points, pointerId) {
    const shape = this.currentShapes.get(pointerId);
    if (shape && points.length > 0) {
      // Update end point (use last point)
      const lastPoint = points[points.length - 1];
      shape.endX = lastPoint.x;
      shape.endY = lastPoint.y;
    }
  }
  
  onStrokeEnd(points, pointerId) {
    const shape = this.currentShapes.get(pointerId);
    if (shape && this.manager) {
      // Only add shape if it has meaningful size
      const width = Math.abs(shape.endX - shape.startX);
      const height = Math.abs(shape.endY - shape.startY);
      
      if (width > 5 || height > 5) {
        const finalShape = {
          id: `shape_${Date.now()}_${pointerId}`,
          tool: 'shape',
          ...shape,
          timestamp: Date.now()
        };
        
        this.manager.addShape(finalShape);
      }
    }
    
    this.currentShapes.delete(pointerId);
  }
  
  onStrokeCancel(pointerId) {
    this.currentShapes.delete(pointerId);
  }
  
  renderUI(ctx, strokeRenderer) {
    // Render preview of shapes being drawn
    this.currentShapes.forEach(shape => {
      strokeRenderer.renderShape(shape);
    });
  }
  
  getSettingsPanel() {
    return {
      fields: [
        {
          type: 'select',
          label: 'Shape Type',
          options: [
            { label: 'Circle', value: 'circle' },
            { label: 'Rectangle', value: 'rectangle' },
            { label: 'Arrow', value: 'arrow' },
            { label: 'Line', value: 'line' }
          ],
          value: this.options.shapeType,
          onChange: (value) => this.updateOptions({ shapeType: value })
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
          label: 'Stroke Width',
          min: 1,
          max: 5,
          step: 1,
          value: this.options.strokeWidth,
          onChange: (value) => this.updateOptions({ strokeWidth: value })
        },
        {
          type: 'checkbox',
          label: 'Fill Shape',
          value: this.options.filled,
          onChange: (value) => this.updateOptions({ filled: value })
        }
      ]
    };
  }
}

export default ShapeTool;
