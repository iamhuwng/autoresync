/**
 * CanvasEngine - High-performance canvas setup and render loop
 * Optimized for Surface Pro 11 with 120Hz display
 */

class CanvasEngine {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.canvas = null;
    this.ctx = null;
    this.dpr = window.devicePixelRatio || 1;
    this.animationFrameId = null;
    this.needsRedraw = false;
    this.isDestroyed = false;
    
    // Canvas context options
    this.options = {
      alpha: true,              // Enable transparency for overlay
      desynchronized: true,     // Low-latency mode (<50ms)
      willReadFrequently: false, // Write-optimized (not reading pixels)
      ...options
    };
    
    // Render callback
    this.onRender = null;
    
    this.initialize();
  }
  
  /**
   * Initialize canvas with optimal settings
   */
  initialize() {
    // Create canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.style.touchAction = 'none'; // Disable default touch behavior
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'auto';
    this.canvas.style.zIndex = '10'; // Above passage content
    
    // Setup context with optimizations
    this.ctx = this.canvas.getContext('2d', this.options);
    
    if (!this.ctx) {
      throw new Error('Failed to get 2D context');
    }
    
    // Configure for high-quality rendering
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    
    // Add to container
    this.container.appendChild(this.canvas);
    
    // Setup dimensions
    this.resize();
    
    // Start render loop
    this.startRenderLoop();
    
    // Listen for window resize
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(this.container);
  }
  
  /**
   * Resize canvas to match container with high-DPI scaling
   */
  resize() {
    const rect = this.container.getBoundingClientRect();
    
    // Scale canvas to physical pixels
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    
    // CSS dimensions (logical pixels)
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    
    // Scale context for logical pixel operations
    this.ctx.scale(this.dpr, this.dpr);
    
    // Re-apply context settings after resize
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    
    this.needsRedraw = true;
  }
  
  /**
   * Start requestAnimationFrame render loop
   */
  startRenderLoop() {
    const render = (timestamp) => {
      if (this.isDestroyed) return;
      
      if (this.needsRedraw) {
        this.render(timestamp);
        this.needsRedraw = false;
      }
      
      this.animationFrameId = requestAnimationFrame(render);
    };
    
    this.animationFrameId = requestAnimationFrame(render);
  }
  
  /**
   * Request a redraw on next frame
   */
  requestRedraw() {
    this.needsRedraw = true;
  }
  
  /**
   * Render function - override via setRenderCallback or subclass
   */
  render(timestamp) {
    if (this.onRender) {
      this.onRender(this.ctx, timestamp);
    }
  }
  
  /**
   * Set custom render callback
   */
  setRenderCallback(callback) {
    this.onRender = callback;
  }
  
  /**
   * Clear canvas
   */
  clear() {
    // Temporarily reset transform for clearing
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }
  
  /**
   * Get logical dimensions (not physical pixels)
   */
  getDimensions() {
    const rect = this.container.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height
    };
  }
  
  /**
   * Get canvas element
   */
  getCanvas() {
    return this.canvas;
  }
  
  /**
   * Get context
   */
  getContext() {
    return this.ctx;
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    this.isDestroyed = true;
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    
    this.canvas = null;
    this.ctx = null;
    this.onRender = null;
  }
}

export default CanvasEngine;
