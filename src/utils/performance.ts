/**
 * Performance Monitoring Utilities
 * Tracks API latency, parsing duration, and UI render performance
 */

export interface PerformanceMetric {
  label: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 100; // Keep last 100 metrics

  /**
   * Start timing an operation
   */
  startTiming(label: string): void {
    if (typeof performance === 'undefined') return;
    performance.mark(`${label}-start`);
  }

  /**
   * End timing and record metric
   */
  endTiming(label: string, metadata?: Record<string, any>): number {
    if (typeof performance === 'undefined') return 0;

    const startMark = `${label}-start`;
    const endMark = `${label}-end`;

    try {
      performance.mark(endMark);
      performance.measure(label, startMark, endMark);

      const measures = performance.getEntriesByName(label);
      const measure = measures[measures.length - 1] as PerformanceEntry;
      const duration = measure.duration;

      // Record metric
      this.recordMetric({
        label,
        duration,
        timestamp: Date.now(),
        metadata,
      });

      // Cleanup marks and measures
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
      performance.clearMeasures(label);

      // Log performance
      this.logPerformance(label, duration, metadata);

      return duration;
    } catch (error) {
      console.error('[Performance] Error measuring:', error);
      return 0;
    }
  }

  /**
   * Track an async operation
   */
  async track<T>(
    label: string,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    this.startTiming(label);
    try {
      const result = await operation();
      this.endTiming(label, { ...metadata, success: true });
      return result;
    } catch (error) {
      this.endTiming(label, { ...metadata, success: false, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Track AI API request
   */
  async trackAIRequest<T>(
    provider: string,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const label = `AI-${provider}-${Date.now()}`;
    return this.track(label, operation, { provider, ...metadata });
  }

  /**
   * Track parsing operation
   */
  async trackParsing<T>(
    parserType: string,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const label = `Parse-${parserType}`;
    return this.track(label, operation, { parserType, ...metadata });
  }

  /**
   * Track file upload
   */
  async trackFileUpload<T>(
    fileType: string,
    fileSize: number,
    operation: () => Promise<T>
  ): Promise<T> {
    const label = `Upload-${fileType}`;
    return this.track(label, operation, {
      fileType,
      fileSize,
      fileSizeMB: (fileSize / 1024 / 1024).toFixed(2),
    });
  }

  /**
   * Track Firebase operation
   */
  async trackFirebase<T>(
    operationType: string,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const label = `Firebase-${operationType}`;
    return this.track(label, operation, { operationType, ...metadata });
  }

  /**
   * Record a metric
   */
  private recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);

    // Keep only last N metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * Log performance with warnings
   */
  private logPerformance(
    label: string,
    duration: number,
    metadata?: Record<string, any>
  ): void {
    const durationMs = duration.toFixed(2);
    const metadataStr = metadata ? ` ${JSON.stringify(metadata)}` : '';

    // Warning thresholds
    const thresholds = {
      'AI-': 15000, // 15s for AI requests
      'Parse-': 5000, // 5s for parsing
      'Upload-': 10000, // 10s for uploads
      'Firebase-': 3000, // 3s for Firebase
    };

    // Find matching threshold
    const thresholdKey = Object.keys(thresholds).find((key) => label.startsWith(key));
    const threshold = thresholdKey ? thresholds[thresholdKey as keyof typeof thresholds] : 1000;

    if (duration > threshold) {
      console.warn(`[Performance] SLOW: ${label} took ${durationMs}ms${metadataStr}`);
    } else {
      console.log(`[Performance] ${label}: ${durationMs}ms${metadataStr}`);
    }

    // TODO: Send to analytics service
    // Example: analytics.track('performance', { label, duration, ...metadata });
  }

  /**
   * Get all recorded metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get metrics by label pattern
   */
  getMetricsByPattern(pattern: string): PerformanceMetric[] {
    return this.metrics.filter((m) => m.label.includes(pattern));
  }

  /**
   * Get average duration for a label pattern
   */
  getAverageDuration(pattern: string): number {
    const metrics = this.getMetricsByPattern(pattern);
    if (metrics.length === 0) return 0;

    const total = metrics.reduce((sum, m) => sum + m.duration, 0);
    return total / metrics.length;
  }

  /**
   * Get performance summary
   */
  getSummary(): {
    totalMetrics: number;
    averageAI: number;
    averageParsing: number;
    averageUpload: number;
    averageFirebase: number;
  } {
    return {
      totalMetrics: this.metrics.length,
      averageAI: this.getAverageDuration('AI-'),
      averageParsing: this.getAverageDuration('Parse-'),
      averageUpload: this.getAverageDuration('Upload-'),
      averageFirebase: this.getAverageDuration('Firebase-'),
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Export metrics as JSON
   */
  exportMetrics(): string {
    return JSON.stringify(this.metrics, null, 2);
  }
}

/**
 * Singleton instance
 */
export const performanceMonitor = new PerformanceMonitor();

/**
 * React component render tracking
 */
export function useRenderTracking(componentName: string): void {
  if (process.env.NODE_ENV === 'development') {
    const renderCount = React.useRef(0);
    
    React.useEffect(() => {
      renderCount.current++;
      console.log(`[Render] ${componentName} rendered ${renderCount.current} times`);
    });
  }
}

/**
 * Track component mount time
 */
export function useMountTime(componentName: string): void {
  React.useEffect(() => {
    const mountTime = Date.now();
    
    return () => {
      const unmountTime = Date.now();
      const lifetime = unmountTime - mountTime;
      console.log(`[Lifecycle] ${componentName} lived for ${lifetime}ms`);
    };
  }, [componentName]);
}

/**
 * Memory usage monitoring (if available)
 */
export function getMemoryUsage(): {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
} {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
    };
  }
  return {};
}

/**
 * Log memory usage
 */
export function logMemoryUsage(): void {
  const memory = getMemoryUsage();
  if (memory.usedJSHeapSize) {
    const usedMB = (memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
    const totalMB = (memory.totalJSHeapSize! / 1024 / 1024).toFixed(2);
    console.log(`[Memory] Used: ${usedMB}MB / Total: ${totalMB}MB`);
  }
}

// For React hooks
import * as React from 'react';
