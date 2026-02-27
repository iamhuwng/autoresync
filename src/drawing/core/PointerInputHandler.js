/**
 * PointerInputHandler - Capture pen/stylus input with maximum fidelity
 * Optimized for Surface Slim Pen 2 (4,096 pressure levels)
 */

class PointerInputHandler {
  constructor(canvas, callbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks || {};
    this.activePointers = new Map();
    this.isEnabled = true;
    
    this.setupEventListeners();
  }
  
  /**
   * Setup pointer event listeners
   */
  setupEventListeners() {
    this.boundHandlers = {
      pointerdown: this.handlePointerDown.bind(this),
      pointermove: this.handlePointerMove.bind(this),
      pointerup: this.handlePointerUp.bind(this),
      pointercancel: this.handlePointerCancel.bind(this),
      pointerleave: this.handlePointerLeave.bind(this)
    };
    
    // Use pointer events for unified input handling
    this.canvas.addEventListener('pointerdown', this.boundHandlers.pointerdown);
    this.canvas.addEventListener('pointermove', this.boundHandlers.pointermove);
    this.canvas.addEventListener('pointerup', this.boundHandlers.pointerup);
    this.canvas.addEventListener('pointercancel', this.boundHandlers.pointercancel);
    this.canvas.addEventListener('pointerleave', this.boundHandlers.pointerleave);
    
    // Prevent default touch behaviors
    this.canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }
  
  /**
   * Handle pointer down (stroke start)
   */
  handlePointerDown(event) {
    if (!this.isEnabled) return;
    
    // Accept all pointer types (pen, mouse, touch)
    // Pen gets pressure sensitivity, mouse/touch get default pressure
    
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    
    const point = this.extractPointData(event);
    this.activePointers.set(event.pointerId, {
      startPoint: point,
      points: [point],
      pointerType: event.pointerType
    });
    
    if (this.callbacks.onStrokeStart) {
      this.callbacks.onStrokeStart(point, event.pointerId);
    }
  }
  
  /**
   * Handle pointer move (stroke update)
   */
  handlePointerMove(event) {
    if (!this.isEnabled) return;
    if (!this.activePointers.has(event.pointerId)) return;
    
    event.preventDefault();
    
    // Get coalesced events for maximum fidelity (captures all 4,096 pressure levels)
    const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
    const points = events.map(e => this.extractPointData(e));
    
    // Add to stroke data
    const pointerData = this.activePointers.get(event.pointerId);
    pointerData.points.push(...points);
    
    if (this.callbacks.onStrokeUpdate) {
      this.callbacks.onStrokeUpdate(points, event.pointerId);
    }
    
    // Get predicted events for latency compensation (10-20ms reduction)
    if (event.getPredictedEvents && this.callbacks.onPredictedPoints) {
      const predictedEvents = event.getPredictedEvents();
      if (predictedEvents.length > 0) {
        const predictedPoints = predictedEvents.map(e => this.extractPointData(e));
        this.callbacks.onPredictedPoints(predictedPoints, event.pointerId);
      }
    }
  }
  
  /**
   * Handle pointer up (stroke end)
   */
  handlePointerUp(event) {
    if (!this.isEnabled) return;
    if (!this.activePointers.has(event.pointerId)) return;
    
    event.preventDefault();
    
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    
    const pointerData = this.activePointers.get(event.pointerId);
    const finalPoint = this.extractPointData(event);
    pointerData.points.push(finalPoint);
    
    if (this.callbacks.onStrokeEnd) {
      this.callbacks.onStrokeEnd(pointerData.points, event.pointerId);
    }
    
    this.activePointers.delete(event.pointerId);
  }
  
  /**
   * Handle pointer cancel (interrupted stroke)
   */
  handlePointerCancel(event) {
    if (!this.isEnabled) return;
    if (!this.activePointers.has(event.pointerId)) return;
    
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    
    if (this.callbacks.onStrokeCancel) {
      this.callbacks.onStrokeCancel(event.pointerId);
    }
    
    this.activePointers.delete(event.pointerId);
  }
  
  /**
   * Handle pointer leave (pen left canvas bounds)
   */
  handlePointerLeave(event) {
    if (!this.isEnabled) return;
    if (this.activePointers.has(event.pointerId)) {
      // Treat as stroke end
      this.handlePointerUp(event);
    }
  }
  
  /**
   * Extract point data from pointer event
   */
  extractPointData(event) {
    const rect = this.canvas.getBoundingClientRect();
    
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pressure: event.pressure || 0.5, // Normalized 0-1
      tiltX: event.tiltX || 0,         // -90 to 90 degrees
      tiltY: event.tiltY || 0,         // -90 to 90 degrees
      altitudeAngle: event.altitudeAngle || Math.PI / 2, // Pen angle from surface
      azimuthAngle: event.azimuthAngle || 0,             // Pen rotation
      timestamp: event.timeStamp,
      pointerType: event.pointerType
    };
  }
  
  /**
   * Enable input handling
   */
  enable() {
    this.isEnabled = true;
  }
  
  /**
   * Disable input handling
   */
  disable() {
    this.isEnabled = false;
  }
  
  /**
   * Clean up event listeners
   */
  destroy() {
    if (this.boundHandlers) {
      this.canvas.removeEventListener('pointerdown', this.boundHandlers.pointerdown);
      this.canvas.removeEventListener('pointermove', this.boundHandlers.pointermove);
      this.canvas.removeEventListener('pointerup', this.boundHandlers.pointerup);
      this.canvas.removeEventListener('pointercancel', this.boundHandlers.pointercancel);
      this.canvas.removeEventListener('pointerleave', this.boundHandlers.pointerleave);
    }
    
    this.activePointers.clear();
    this.callbacks = {};
  }
}

export default PointerInputHandler;
