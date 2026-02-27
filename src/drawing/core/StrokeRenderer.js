/**
 * StrokeRenderer - Render smooth, pressure-sensitive strokes
 * Uses perfect-freehand library for professional-quality output
 */

import { getStroke } from 'perfect-freehand';

class StrokeRenderer {
  constructor(ctx) {
    this.ctx = ctx;
    
    // Default stroke options
    this.defaultOptions = {
      size: 8,                    // Base stroke size in pixels
      thinning: 0.6,              // Effect of pressure on size (0-1)
      smoothing: 0.5,             // Curve smoothing (0-1)
      streamline: 0.3,            // Input smoothing for prediction (0-1)
      easing: (t) => t,           // Pressure easing function
      start: {                    // Tapering at stroke start
        taper: 0,
        cap: true
      },
      end: {                      // Tapering at stroke end
        taper: 0,
        cap: true
      },
      simulatePressure: false,    // Don't simulate - we have real pressure
      last: false                 // Not the last point
    };
  }
  
  /**
   * Render a complete stroke with pressure sensitivity
   * @param {Array} points - Array of {x, y, pressure} points
   * @param {Object} style - Stroke style options
   */
  renderStroke(points, style = {}) {
    if (points.length === 0) return;
    
    // Single point - render as circle
    if (points.length === 1) {
      this.renderPoint(points[0], style);
      return;
    }
    
    // Convert points to perfect-freehand format [x, y, pressure]
    const inputPoints = points.map(p => [p.x, p.y, p.pressure]);
    
    // Merge style with defaults
    const options = {
      ...this.defaultOptions,
      size: style.size || this.defaultOptions.size,
      thinning: style.thinning ?? this.defaultOptions.thinning,
      smoothing: style.smoothing ?? this.defaultOptions.smoothing,
      streamline: style.streamline ?? this.defaultOptions.streamline
    };
    
    // Get stroke outline points from perfect-freehand
    const outlinePoints = getStroke(inputPoints, options);
    
    if (outlinePoints.length === 0) return;
    
    // Render the stroke
    this.ctx.save();
    
    // Apply style
    this.ctx.fillStyle = style.color || '#000000';
    this.ctx.globalAlpha = style.opacity ?? 1.0;
    this.ctx.globalCompositeOperation = style.blendMode || 'source-over';
    
    // Create path from outline points
    this.ctx.beginPath();
    this.ctx.moveTo(outlinePoints[0][0], outlinePoints[0][1]);
    
    for (let i = 1; i < outlinePoints.length; i++) {
      this.ctx.lineTo(outlinePoints[i][0], outlinePoints[i][1]);
    }
    
    this.ctx.closePath();
    this.ctx.fill();
    
    this.ctx.restore();
  }
  
  /**
   * Render a single point as a circle
   * @param {Object} point - {x, y, pressure}
   * @param {Object} style - Style options
   */
  renderPoint(point, style = {}) {
    this.ctx.save();
    
    this.ctx.fillStyle = style.color || '#000000';
    this.ctx.globalAlpha = style.opacity ?? 1.0;
    this.ctx.globalCompositeOperation = style.blendMode || 'source-over';
    
    const size = style.size || 8;
    const radius = (size * (point.pressure || 0.5)) / 2;
    
    this.ctx.beginPath();
    this.ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.restore();
  }
  
  /**
   * Render eraser stroke (removes content)
   * @param {Array} points - Array of points
   * @param {Number} size - Eraser size
   */
  renderEraser(points, size = 20) {
    this.renderStroke(points, {
      size: size,
      color: '#000000',
      thinning: 0.1,              // Less pressure sensitivity for eraser
      blendMode: 'destination-out' // Erase mode
    });
  }
  
  /**
   * Render highlighter stroke (semi-transparent, larger)
   * @param {Array} points - Array of points
   * @param {String} color - Highlighter color
   * @param {Number} size - Base size
   */
  renderHighlighter(points, color = '#FFFF00', size = 20) {
    this.renderStroke(points, {
      size: size,
      color: color,
      opacity: 0.3,                // Semi-transparent
      thinning: 0.2,               // Less pressure effect
      smoothing: 0.6               // Smoother for highlighting
    });
  }
  
  /**
   * Render text annotation
   * @param {Object} textAnnotation - {text, x, y, size, color}
   */
  renderText(textAnnotation) {
    this.ctx.save();
    
    const fontSize = textAnnotation.size || 16;
    const color = textAnnotation.color || '#000000';
    
    // Set font
    this.ctx.font = `${fontSize}px Arial, sans-serif`;
    this.ctx.textBaseline = 'top';
    
    // Draw stroke outline for visibility on any background
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 1;
    this.ctx.lineJoin = 'round';
    this.ctx.miterLimit = 2;
    
    // Draw text with outline
    this.ctx.strokeText(textAnnotation.text, textAnnotation.x, textAnnotation.y);
    
    // Fill text
    this.ctx.fillStyle = color;
    this.ctx.fillText(textAnnotation.text, textAnnotation.x, textAnnotation.y);
    
    this.ctx.restore();
  }
  
  /**
   * Render a shape
   * @param {Object} shape - Shape definition
   */
  renderShape(shape) {
    this.ctx.save();
    
    this.ctx.strokeStyle = shape.color || '#000000';
    this.ctx.fillStyle = shape.color || '#000000';
    this.ctx.lineWidth = shape.strokeWidth || 2;
    this.ctx.globalAlpha = shape.opacity ?? 1.0;
    
    this.ctx.beginPath();
    
    switch (shape.type) {
      case 'circle':
        this.renderCircle(shape);
        break;
      case 'rectangle':
        this.renderRectangle(shape);
        break;
      case 'arrow':
        this.renderArrow(shape);
        break;
      case 'line':
        this.renderLine(shape);
        break;
    }
    
    if (shape.filled) {
      this.ctx.fill();
    } else {
      this.ctx.stroke();
    }
    
    this.ctx.restore();
  }
  
  /**
   * Render circle shape
   */
  renderCircle(shape) {
    const radius = Math.sqrt(
      Math.pow(shape.endX - shape.startX, 2) + 
      Math.pow(shape.endY - shape.startY, 2)
    );
    this.ctx.arc(shape.startX, shape.startY, radius, 0, Math.PI * 2);
  }
  
  /**
   * Render rectangle shape
   */
  renderRectangle(shape) {
    const width = shape.endX - shape.startX;
    const height = shape.endY - shape.startY;
    this.ctx.rect(shape.startX, shape.startY, width, height);
  }
  
  /**
   * Render line shape
   */
  renderLine(shape) {
    this.ctx.moveTo(shape.startX, shape.startY);
    this.ctx.lineTo(shape.endX, shape.endY);
  }
  
  /**
   * Render arrow shape
   */
  renderArrow(shape) {
    const headLength = 10;
    const headAngle = Math.PI / 6;
    
    const dx = shape.endX - shape.startX;
    const dy = shape.endY - shape.startY;
    const angle = Math.atan2(dy, dx);
    
    // Draw line
    this.ctx.moveTo(shape.startX, shape.startY);
    this.ctx.lineTo(shape.endX, shape.endY);
    
    // Draw arrowhead
    this.ctx.lineTo(
      shape.endX - headLength * Math.cos(angle - headAngle),
      shape.endY - headLength * Math.sin(angle - headAngle)
    );
    this.ctx.moveTo(shape.endX, shape.endY);
    this.ctx.lineTo(
      shape.endX - headLength * Math.cos(angle + headAngle),
      shape.endY - headLength * Math.sin(angle + headAngle)
    );
  }
}

export default StrokeRenderer;
