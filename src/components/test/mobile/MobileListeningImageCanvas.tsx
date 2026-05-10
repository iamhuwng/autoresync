/**
 * MobileListeningImageCanvas — Mobile image presenter for Listening image-mode
 *
 * Displays question images with touch-based pinch-zoom and pan.
 * Renders inside the scaffold's main content area (row 4).
 *
 * Zoom rules (PRD-0045 Task 4.8):
 *   - Pinch zoom on image area only
 *   - Double-tap zoom is disabled
 *   - Pan is clamped to image frame
 *   - No fullscreen image viewer
 *   - Switching parts resets zoom to default
 *   - Opening/closing sheet for same part preserves zoom
 *   - Active pinch/pan captures gesture exclusively (no page scroll fight)
 *   - After gesture release, normal vertical page scroll resumes
 *
 * No @mantine imports. No Firebase. No storage/router hooks.
 * @see PRD-0045 Task 4.1, 4.8, 4.9
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { MOBILE_LISTENING_LAYER_Z_INDEX } from './mobileListeningLayering';

// ── Types ──────────────────────────────────────────────────────────────────

export interface QuestionImage {
  sectionNumber: number;
  imageUrl: string;
  imageCaption?: string;
  questionRange?: { start: number; end: number };
}

export interface AudioSection {
  number: number;
  name: string;
  startQuestion: number;
  endQuestion: number;
}

export interface ImageZoomState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface MobileListeningImageCanvasProps {
  /** All question images for this test */
  questionImages: QuestionImage[];
  /** Audio sections (for deriving viewing section from currentQuestionNumber) */
  audioSections: AudioSection[];
  /** Currently viewed part number (1-based, derived from currentQuestionNumber by host) */
  viewedPartNumber: number;
  /** Current question number (for auto-selecting active image) */
  currentQuestionNumber: number;
  /** Per-part zoom state, keyed by part number string ('1', '2', etc.) */
  zoomByPart: Record<string, ImageZoomState>;
  /** Callback to update zoom state for a part */
  onZoomChange: (partNumber: number, zoom: ImageZoomState) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const DEFAULT_ZOOM: ImageZoomState = { scale: 1, offsetX: 0, offsetY: 0 };

// ── Styles ─────────────────────────────────────────────────────────────────

const canvasRootStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  background: '#1e293b',
  touchAction: 'pan-y', // default: allow vertical scroll, override during pinch
};

const imageContainerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
};

const resetButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  zIndex: 10, // Within the image area only
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 32,
  padding: '0 12px',
  border: 'none',
  borderRadius: 16,
  background: 'rgba(15, 23, 42, 0.75)',
  color: '#ffffff',
  fontSize: '0.75rem',
  fontWeight: 600,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  WebkitTapHighlightColor: 'transparent',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
};

const emptyStateStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#94a3b8',
  padding: '2rem',
  textAlign: 'center',
};

const imageNavigationStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  zIndex: 10,
};

const imageNavDotStyle = (active: boolean): React.CSSProperties => ({
  width: active ? 24 : 8,
  height: 8,
  borderRadius: 4,
  background: active ? '#3b82f6' : 'rgba(255, 255, 255, 0.4)',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  WebkitTapHighlightColor: 'transparent',
});


// ── Helpers ────────────────────────────────────────────────────────────────

/** Clamp a value between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Distance between two touch points */
function getTouchDistance(t1: React.Touch, t2: React.Touch): number {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Midpoint of two touch points */
function getTouchMidpoint(t1: React.Touch, t2: React.Touch): { x: number; y: number } {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  };
}

/** Calculate clamped pan offset so image edges don't leave the viewport */
function clampOffset(
  offset: number,
  scale: number,
  containerSize: number,
  imageSize: number,
): number {
  if (scale <= 1) return 0;
  const scaledImageSize = imageSize * scale;
  if (scaledImageSize <= containerSize) return 0;
  const maxOffset = (scaledImageSize - containerSize) / 2;
  return clamp(offset, -maxOffset, maxOffset);
}


// ── Component ──────────────────────────────────────────────────────────────

export const MobileListeningImageCanvas: React.FC<MobileListeningImageCanvasProps> = ({
  questionImages,
  audioSections,
  viewedPartNumber,
  currentQuestionNumber,
  zoomByPart,
  onZoomChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // ── Pinch/pan gesture tracking refs ────────────────────────────────────
  const isPinching = useRef(false);
  const isPanning = useRef(false);
  const initialDistance = useRef(0);
  const initialScale = useRef(1);
  const lastPanPoint = useRef({ x: 0, y: 0 });
  const gestureActive = useRef(false);

  // Track image natural dimensions for pan clamping
  const [imageDims, setImageDims] = useState({ width: 0, height: 0 });

  // ── Derive current zoom from per-part map ──────────────────────────────
  const partKey = String(viewedPartNumber);
  const currentZoom = zoomByPart[partKey] || DEFAULT_ZOOM;

  // ── Filter images for viewed part ──────────────────────────────────────
  const sectionImages = questionImages
    .filter(img => img.sectionNumber === viewedPartNumber)
    .sort((a, b) => (a.questionRange?.start || 0) - (b.questionRange?.start || 0));

  // Find the image index that covers the current question
  const activeImageIndex = (() => {
    for (let i = 0; i < sectionImages.length; i++) {
      const img = sectionImages[i];
      if (img?.questionRange) {
        if (
          currentQuestionNumber >= img.questionRange.start &&
          currentQuestionNumber <= img.questionRange.end
        ) {
          return i;
        }
      }
    }
    return 0;
  })();

  const currentImage = sectionImages[activeImageIndex] || sectionImages[0];

  // ── Update zoom with pan clamping ──────────────────────────────────────
  const setZoom = useCallback(
    (next: ImageZoomState) => {
      const container = containerRef.current;
      const image = imageRef.current;
      if (container && image && imageDims.width > 0) {
        const containerRect = container.getBoundingClientRect();
        // Calculate the rendered image size (fit within container)
        const aspectRatio = imageDims.width / imageDims.height;
        const containerAspect = containerRect.width / containerRect.height;
        let renderedW: number;
        let renderedH: number;
        if (aspectRatio > containerAspect) {
          renderedW = containerRect.width;
          renderedH = containerRect.width / aspectRatio;
        } else {
          renderedH = containerRect.height;
          renderedW = containerRect.height * aspectRatio;
        }

        next = {
          scale: clamp(next.scale, MIN_SCALE, MAX_SCALE),
          offsetX: clampOffset(next.offsetX, next.scale, containerRect.width, renderedW),
          offsetY: clampOffset(next.offsetY, next.scale, containerRect.height, renderedH),
        };
      } else {
        next = { ...next, scale: clamp(next.scale, MIN_SCALE, MAX_SCALE) };
      }
      onZoomChange(viewedPartNumber, next);
    },
    [onZoomChange, viewedPartNumber, imageDims],
  );

  // ── Reset zoom ─────────────────────────────────────────────────────────
  const handleResetZoom = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
  }, [setZoom]);

  // ── Touch event handlers ───────────────────────────────────────────────

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2) {
        // Pinch start
        e.preventDefault();
        e.stopPropagation();
        isPinching.current = true;
        gestureActive.current = true;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        initialDistance.current = getTouchDistance(t1, t2);
        initialScale.current = currentZoom.scale;

        // Set touch-action to none to prevent browser scroll during pinch
        if (containerRef.current) {
          containerRef.current.style.touchAction = 'none';
        }
      } else if (e.touches.length === 1 && currentZoom.scale > 1) {
        // Pan start (only when zoomed in)
        isPanning.current = true;
        gestureActive.current = true;
        const t = e.touches[0];
        lastPanPoint.current = { x: t.clientX, y: t.clientY };

        // Prevent page scroll during pan on zoomed image
        if (containerRef.current) {
          containerRef.current.style.touchAction = 'none';
        }
      }
    },
    [currentZoom.scale],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (isPinching.current && e.touches.length === 2) {
        e.preventDefault();
        e.stopPropagation();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const newDistance = getTouchDistance(t1, t2);
        const scaleFactor = newDistance / initialDistance.current;
        const newScale = clamp(initialScale.current * scaleFactor, MIN_SCALE, MAX_SCALE);

        // Calculate midpoint for zoom origin
        const mid = getTouchMidpoint(t1, t2);
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          // Adjust offset to zoom toward the pinch center
          const scaleChange = newScale / currentZoom.scale;
          const newOffsetX = currentZoom.offsetX * scaleChange + (mid.x - rect.left - centerX) * (1 - scaleChange);
          const newOffsetY = currentZoom.offsetY * scaleChange + (mid.y - rect.top - centerY) * (1 - scaleChange);

          setZoom({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY });
        }
      } else if (isPanning.current && e.touches.length === 1) {
        e.preventDefault();
        const t = e.touches[0];
        const dx = t.clientX - lastPanPoint.current.x;
        const dy = t.clientY - lastPanPoint.current.y;
        lastPanPoint.current = { x: t.clientX, y: t.clientY };

        setZoom({
          scale: currentZoom.scale,
          offsetX: currentZoom.offsetX + dx,
          offsetY: currentZoom.offsetY + dy,
        });
      }
    },
    [currentZoom, setZoom],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 0) {
        isPinching.current = false;
        isPanning.current = false;
        gestureActive.current = false;

        // Restore normal page scroll
        if (containerRef.current) {
          containerRef.current.style.touchAction = currentZoom.scale > 1 ? 'none' : 'pan-y';
        }
      } else if (e.touches.length === 1 && isPinching.current) {
        // Transitioned from pinch to single-touch: start pan
        isPinching.current = false;
        if (currentZoom.scale > 1) {
          isPanning.current = true;
          const t = e.touches[0];
          lastPanPoint.current = { x: t.clientX, y: t.clientY };
        }
      }
    },
    [currentZoom.scale],
  );

  // ── Disable double-tap zoom ────────────────────────────────────────────
  // Prevent default on double-tap which would trigger browser zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastTapTime = 0;
    const handler = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTapTime < 300) {
        e.preventDefault(); // Block double-tap zoom
      }
      lastTapTime = now;
    };

    container.addEventListener('touchend', handler, { passive: false });
    return () => container.removeEventListener('touchend', handler);
  }, []);

  // ── Track image dimensions for pan clamping ────────────────────────────
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDims({ width: img.naturalWidth, height: img.naturalHeight });
  }, []);

  // ── When zoomed out (scale=1), restore normal scroll ───────────────────
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.touchAction = currentZoom.scale > 1 ? 'none' : 'pan-y';
    }
  }, [currentZoom.scale]);

  // ── Render ─────────────────────────────────────────────────────────────

  if (sectionImages.length === 0) {
    return (
      <div data-testid="mobile-image-canvas" style={{ ...canvasRootStyle, height: '100%' }}>
        <div style={emptyStateStyle}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🖼️</div>
          <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#cbd5e1' }}>
            No question images
          </div>
          <div style={{ fontSize: '0.8125rem', marginTop: '0.25rem', color: '#64748b' }}>
            Images for Part {viewedPartNumber} have not been uploaded
          </div>
        </div>
      </div>
    );
  }

  const imageTransform = `translate(${currentZoom.offsetX}px, ${currentZoom.offsetY}px) scale(${currentZoom.scale})`;

  return (
    <div
      ref={containerRef}
      data-testid="mobile-image-canvas"
      style={canvasRootStyle}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Reset zoom button — only when zoomed in (Task 4.9) */}
      {currentZoom.scale > 1 && (
        <button
          data-testid="mobile-image-reset-zoom"
          style={resetButtonStyle}
          onClick={handleResetZoom}
          type="button"
          aria-label="Reset zoom"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M7 1.75C4.1 1.75 1.75 4.1 1.75 7S4.1 12.25 7 12.25 12.25 9.9 12.25 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M12.25 1.75v3.5h-3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Reset
        </button>
      )}

      {/* Image display area */}
      <div style={imageContainerStyle}>
        {currentImage ? (
          <img
            ref={imageRef}
            src={currentImage.imageUrl}
            alt={currentImage.imageCaption || `Part ${viewedPartNumber} Questions`}
            data-testid="mobile-image-canvas-img"
            onLoad={handleImageLoad}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              transform: imageTransform,
              transformOrigin: 'center center',
              transition: gestureActive.current ? 'none' : 'transform 0.15s ease-out',
              willChange: 'transform',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              pointerEvents: 'none', // Prevent image long-press context menu
            }}
            draggable={false}
          />
        ) : null}
      </div>

      {/* Multi-image navigation dots (when part has multiple images) */}
      {sectionImages.length > 1 && (
        <div style={imageNavigationStyle} data-testid="mobile-image-nav-dots">
          {sectionImages.map((_img, idx) => (
            <button
              key={idx}
              style={imageNavDotStyle(idx === activeImageIndex)}
              aria-label={`Image ${idx + 1} of ${sectionImages.length}`}
              type="button"
              onClick={() => {
                // Navigate to the first question of the clicked image
                const img = sectionImages[idx];
                if (img?.questionRange) {
                  // The host handles question changes; we can't directly
                  // set question number. The dots are informational.
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Image caption (subtle, below image) */}
      {currentImage?.imageCaption && (
        <div
          data-testid="mobile-image-caption"
          style={{
            position: 'absolute',
            bottom: sectionImages.length > 1 ? 32 : 8,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: '0.75rem',
            color: 'rgba(255, 255, 255, 0.6)',
            padding: '0 1rem',
          }}
        >
          {currentImage.imageCaption}
        </div>
      )}
    </div>
  );
};

export default MobileListeningImageCanvas;
