export interface OverlayPosition {
    top: number;
    left: number;
}

export type CommentTooltipPlacement = 'right' | 'left' | 'top' | 'bottom';

export interface CommentTooltipPosition extends OverlayPosition {
    placement: CommentTooltipPlacement;
}

interface TooltipRect {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

export function getCommentTooltipOverlayPosition(
    markRect: TooltipRect,
): CommentTooltipPosition {
    const tooltipWidth = 280;
    const tooltipHeight = 180;
    const margin = 16;
    const gap = 12;
    const verticalCenter = (markRect.top + markRect.bottom) / 2;
    const horizontalCenter = (markRect.left + markRect.right) / 2;
    const availableRight = window.innerWidth - markRect.right - margin;
    const availableLeft = markRect.left - margin;
    const availableBottom = window.innerHeight - markRect.bottom - margin;
    const availableTop = markRect.top - margin;

    let placement: CommentTooltipPlacement;
    let position: OverlayPosition;

    if (availableRight >= tooltipWidth + gap) {
        placement = 'right';
        position = {
            top: verticalCenter - tooltipHeight / 2,
            left: markRect.right + gap,
        };
    } else if (availableLeft >= tooltipWidth + gap) {
        placement = 'left';
        position = {
            top: verticalCenter - tooltipHeight / 2,
            left: markRect.left - tooltipWidth - gap,
        };
    } else if (availableBottom >= tooltipHeight + gap || availableBottom >= availableTop) {
        placement = 'bottom';
        position = {
            top: markRect.bottom + gap,
            left: horizontalCenter - tooltipWidth / 2,
        };
    } else {
        placement = 'top';
        position = {
            top: markRect.top - tooltipHeight - gap,
            left: horizontalCenter - tooltipWidth / 2,
        };
    }

    return {
        placement,
        ...clampOverlayToViewport(
            position,
            { width: tooltipWidth, height: tooltipHeight },
            margin,
        ),
    };
}

export function clampOverlayToViewport(
    position: OverlayPosition,
    size: { width: number; height: number },
    margin: number,
): OverlayPosition {
    if (typeof window === 'undefined') {
        return position;
    }

    return {
        top: Math.min(Math.max(position.top, margin), Math.max(margin, window.innerHeight - size.height - margin)),
        left: Math.min(Math.max(position.left, margin), Math.max(margin, window.innerWidth - size.width - margin)),
    };
}
