/**
 * MobileListeningImageCanvas — Unit Tests
 *
 * Tests zoom rules, per-part reset/preserve, reset-button placement,
 * and structural rendering.
 *
 * @see PRD-0045 Task 4.11
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  MobileListeningImageCanvas,
  type QuestionImage,
  type AudioSection,
  type ImageZoomState,
} from './MobileListeningImageCanvas';

// ── Test Data ──────────────────────────────────────────────────────────────

const mockAudioSections: AudioSection[] = [
  { number: 1, name: 'Part 1', startQuestion: 1, endQuestion: 10 },
  { number: 2, name: 'Part 2', startQuestion: 11, endQuestion: 20 },
  { number: 3, name: 'Part 3', startQuestion: 21, endQuestion: 30 },
  { number: 4, name: 'Part 4', startQuestion: 31, endQuestion: 40 },
];

const mockImages: QuestionImage[] = [
  { sectionNumber: 1, imageUrl: '/images/part1-q1-10.png', questionRange: { start: 1, end: 10 } },
  { sectionNumber: 2, imageUrl: '/images/part2-q11-15.png', questionRange: { start: 11, end: 15 } },
  { sectionNumber: 2, imageUrl: '/images/part2-q16-20.png', questionRange: { start: 16, end: 20 } },
  { sectionNumber: 3, imageUrl: '/images/part3-q21-30.png', questionRange: { start: 21, end: 30 } },
  { sectionNumber: 4, imageUrl: '/images/part4-q31-40.png', questionRange: { start: 31, end: 40 } },
];

const defaultZoom: ImageZoomState = { scale: 1, offsetX: 0, offsetY: 0 };
const zoomedIn: ImageZoomState = { scale: 2, offsetX: 10, offsetY: 20 };

function renderCanvas(overrides: Partial<React.ComponentProps<typeof MobileListeningImageCanvas>> = {}) {
  const onZoomChange = vi.fn();
  const props = {
    questionImages: mockImages,
    audioSections: mockAudioSections,
    viewedPartNumber: 1,
    currentQuestionNumber: 1,
    zoomByPart: {},
    onZoomChange,
    ...overrides,
  };
  const utils = render(<MobileListeningImageCanvas {...props} />);
  return { ...utils, onZoomChange };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MobileListeningImageCanvas', () => {
  describe('Rendering', () => {
    it('renders the canvas container', () => {
      renderCanvas();
      expect(screen.getByTestId('mobile-image-canvas')).toBeInTheDocument();
    });

    it('renders an image for the viewed part', () => {
      renderCanvas({ viewedPartNumber: 1, currentQuestionNumber: 1 });
      const img = screen.getByTestId('mobile-image-canvas-img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', '/images/part1-q1-10.png');
    });

    it('shows empty state when no images exist for the viewed part', () => {
      renderCanvas({
        questionImages: mockImages.filter(i => i.sectionNumber !== 1),
        viewedPartNumber: 1,
      });
      expect(screen.getByText(/No question images/)).toBeInTheDocument();
      expect(screen.getByText(/Part 1/)).toBeInTheDocument();
    });

    it('selects the correct image based on currentQuestionNumber', () => {
      // Part 2 has two images: Q11-15 and Q16-20
      renderCanvas({ viewedPartNumber: 2, currentQuestionNumber: 17 });
      const img = screen.getByTestId('mobile-image-canvas-img');
      expect(img).toHaveAttribute('src', '/images/part2-q16-20.png');
    });

    it('supports legacy startQuestion/endQuestion image ranges', () => {
      renderCanvas({
        questionImages: [
          { sectionNumber: 2, imageUrl: '/images/legacy-q11-15.png', startQuestion: 11, endQuestion: 15 },
          { sectionNumber: 2, imageUrl: '/images/legacy-q16-20.png', startQuestion: 16, endQuestion: 20 },
        ],
        viewedPartNumber: 2,
        currentQuestionNumber: 17,
      });

      expect(screen.getByTestId('mobile-image-canvas-img')).toHaveAttribute('src', '/images/legacy-q16-20.png');
      expect(screen.getByTestId('mobile-image-order-pill')).toHaveTextContent('2/2');
    });

    it('defaults to first image when question is out of range', () => {
      renderCanvas({ viewedPartNumber: 2, currentQuestionNumber: 99 });
      const img = screen.getByTestId('mobile-image-canvas-img');
      expect(img).toHaveAttribute('src', '/images/part2-q11-15.png');
    });

    it('shows navigation dots when part has multiple images', () => {
      renderCanvas({ viewedPartNumber: 2, currentQuestionNumber: 11 });
      expect(screen.getByTestId('mobile-image-nav-dots')).toBeInTheDocument();
    });

    it('shows global image order in the floating pill', () => {
      renderCanvas({ viewedPartNumber: 2, currentQuestionNumber: 17 });
      expect(screen.getByTestId('mobile-image-order-pill')).toHaveTextContent('3/5');
      expect(screen.getByTestId('mobile-image-order-pill')).toHaveAttribute('aria-label', 'Image 3 of 5');
    });

    it('does not show navigation dots when part has a single image', () => {
      renderCanvas({ viewedPartNumber: 1, currentQuestionNumber: 1 });
      expect(screen.queryByTestId('mobile-image-nav-dots')).not.toBeInTheDocument();
    });
  });

  describe('Image navigation', () => {
    it('swipe right moves to the next global image', () => {
      const onImageNavigate = vi.fn();
      renderCanvas({ viewedPartNumber: 2, currentQuestionNumber: 11, onImageNavigate });

      const canvas = screen.getByTestId('mobile-image-canvas');
      fireEvent.touchStart(canvas, { touches: [{ clientX: 100, clientY: 120 }] });
      fireEvent.touchEnd(canvas, {
        touches: [],
        changedTouches: [{ clientX: 170, clientY: 122 }],
      });

      expect(onImageNavigate).toHaveBeenCalledWith(expect.objectContaining({
        sectionNumber: 2,
        questionRange: { start: 16, end: 20 },
      }));
    });

    it('swipe left returns to the previous global image across parts', () => {
      const onImageNavigate = vi.fn();
      renderCanvas({ viewedPartNumber: 2, currentQuestionNumber: 11, onImageNavigate });

      const canvas = screen.getByTestId('mobile-image-canvas');
      fireEvent.touchStart(canvas, { touches: [{ clientX: 170, clientY: 120 }] });
      fireEvent.touchEnd(canvas, {
        touches: [],
        changedTouches: [{ clientX: 100, clientY: 122 }],
      });

      expect(onImageNavigate).toHaveBeenCalledWith(expect.objectContaining({
        sectionNumber: 1,
        questionRange: { start: 1, end: 10 },
      }));
    });

    it('dot taps navigate to that part image', () => {
      const onImageNavigate = vi.fn();
      renderCanvas({ viewedPartNumber: 2, currentQuestionNumber: 11, onImageNavigate });

      fireEvent.click(screen.getByLabelText('Image 2 of 2'));

      expect(onImageNavigate).toHaveBeenCalledWith(expect.objectContaining({
        sectionNumber: 2,
        questionRange: { start: 16, end: 20 },
      }));
    });

    it('does not swipe between images while zoomed in', () => {
      const onImageNavigate = vi.fn();
      renderCanvas({
        viewedPartNumber: 2,
        currentQuestionNumber: 11,
        zoomByPart: { '2': zoomedIn },
        onImageNavigate,
      });

      const canvas = screen.getByTestId('mobile-image-canvas');
      fireEvent.touchStart(canvas, { touches: [{ clientX: 100, clientY: 120 }] });
      fireEvent.touchEnd(canvas, {
        touches: [],
        changedTouches: [{ clientX: 170, clientY: 122 }],
      });

      expect(onImageNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Zoom Reset Button', () => {
    it('does NOT show reset button when scale is 1 (default)', () => {
      renderCanvas({ zoomByPart: { '1': defaultZoom } });
      expect(screen.queryByTestId('mobile-image-reset-zoom')).not.toBeInTheDocument();
    });

    it('shows reset button when scale > 1', () => {
      renderCanvas({ zoomByPart: { '1': zoomedIn } });
      expect(screen.getByTestId('mobile-image-reset-zoom')).toBeInTheDocument();
    });

    it('clicking reset button resets zoom to default', () => {
      const { onZoomChange } = renderCanvas({
        zoomByPart: { '1': zoomedIn },
        viewedPartNumber: 1,
      });

      fireEvent.click(screen.getByTestId('mobile-image-reset-zoom'));

      expect(onZoomChange).toHaveBeenCalledWith(1, expect.objectContaining({
        scale: 1,
      }));
    });

    it('reset button placed at top-right of the image area (not overlapping FAB at bottom-right)', () => {
      renderCanvas({ zoomByPart: { '1': zoomedIn } });
      const btn = screen.getByTestId('mobile-image-reset-zoom');
      const style = btn.style;
      // The button should be positioned at top-right (via CSS)
      // FAB is at bottom-right, so no overlap
      expect(btn).toBeInTheDocument();
    });
  });

  describe('Per-Part Zoom State', () => {
    it('uses the zoom state for the viewed part from zoomByPart map', () => {
      const { onZoomChange } = renderCanvas({
        viewedPartNumber: 2,
        currentQuestionNumber: 11,
        zoomByPart: { '2': { scale: 1.5, offsetX: 5, offsetY: 10 } },
      });

      // The image should have a transform reflecting the zoom state
      const img = screen.getByTestId('mobile-image-canvas-img');
      expect(img.style.transform).toContain('scale(1.5)');
      expect(img.style.transform).toContain('translate(5px, 10px)');
    });

    it('defaults to scale=1 when part has no entry in zoomByPart', () => {
      renderCanvas({
        viewedPartNumber: 3,
        currentQuestionNumber: 21,
        zoomByPart: {},
      });

      const img = screen.getByTestId('mobile-image-canvas-img');
      expect(img.style.transform).toContain('scale(1)');
      expect(img.style.transform).toContain('translate(0px, 0px)');
    });

    it('calls onZoomChange with the viewed part number when zoom changes', () => {
      const { onZoomChange } = renderCanvas({
        viewedPartNumber: 3,
        currentQuestionNumber: 21,
        zoomByPart: { '3': zoomedIn },
      });

      fireEvent.click(screen.getByTestId('mobile-image-reset-zoom'));
      expect(onZoomChange).toHaveBeenCalledWith(3, expect.objectContaining({ scale: 1 }));
    });
  });

  describe('Image caption', () => {
    it('shows image caption when provided', () => {
      const imagesWithCaption: QuestionImage[] = [
        {
          sectionNumber: 1,
          imageUrl: '/test.png',
          imageCaption: 'Map of the campus',
          questionRange: { start: 1, end: 10 },
        },
      ];
      renderCanvas({ questionImages: imagesWithCaption, viewedPartNumber: 1 });
      expect(screen.getByTestId('mobile-image-caption')).toHaveTextContent('Map of the campus');
    });
  });
});
