/**
 * BaseTool - Abstract base class for all drawing tools
 * Defines the interface that all tools must implement
 */

class BaseTool {
  constructor(name, icon) {
    this.name = name;
    this.icon = icon;
    this.isActive = false;
    
    // Tool-specific options (override in subclasses)
    this.options = {};
  }
  
  /**
   * Called when tool is activated/selected
   * Override to setup tool-specific state
   */
  onActivate() {
    this.isActive = true;
  }
  
  /**
   * Called when tool is deactivated/unselected
   * Override to cleanup tool-specific state
   */
  onDeactivate() {
    this.isActive = false;
  }
  
  /**
   * Called when a stroke starts (pointer down)
   * @param {Object} point - Point data {x, y, pressure, tiltX, tiltY, ...}
   * @param {Number} pointerId - Unique pointer identifier
   */
  onStrokeStart(point, pointerId) {
    // Override in subclass
  }
  
  /**
   * Called when a stroke updates (pointer move)
   * @param {Array} points - Array of point data
   * @param {Number} pointerId - Unique pointer identifier
   */
  onStrokeUpdate(points, pointerId) {
    // Override in subclass
  }
  
  /**
   * Called with predicted points for latency compensation
   * @param {Array} points - Array of predicted point data
   * @param {Number} pointerId - Unique pointer identifier
   */
  onPredictedPoints(points, pointerId) {
    // Override in subclass (optional)
  }
  
  /**
   * Called when a stroke ends (pointer up)
   * @param {Array} points - Complete array of point data
   * @param {Number} pointerId - Unique pointer identifier
   */
  onStrokeEnd(points, pointerId) {
    // Override in subclass
  }
  
  /**
   * Called when a stroke is cancelled (pointer cancel)
   * @param {Number} pointerId - Unique pointer identifier
   */
  onStrokeCancel(pointerId) {
    // Override in subclass
  }
  
  /**
   * Render tool-specific UI (active strokes, cursors, previews)
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {StrokeRenderer} strokeRenderer - Stroke renderer instance
   */
  renderUI(ctx, strokeRenderer) {
    // Override in subclass (optional)
  }
  
  /**
   * Get tool-specific settings panel configuration
   * Returns object describing UI controls for tool settings
   * @returns {Object|null} Settings panel config
   */
  getSettingsPanel() {
    // Override in subclass
    return null;
  }
  
  /**
   * Update tool options
   * @param {Object} newOptions - Options to update
   */
  updateOptions(newOptions) {
    this.options = {
      ...this.options,
      ...newOptions
    };
  }
  
  /**
   * Get current tool options
   * @returns {Object} Current options
   */
  getOptions() {
    return { ...this.options };
  }
  
  /**
   * Set drawing manager reference (for adding strokes, text, shapes)
   * @param {DrawingManager} manager - Drawing manager instance
   */
  setManager(manager) {
    this.manager = manager;
  }
}

export default BaseTool;
