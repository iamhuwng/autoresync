import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
    type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

type HorizontalAlign = 'start' | 'end';

interface AnchoredMenuPortalProps {
    open: boolean;
    anchorRef: RefObject<HTMLElement | null>;
    onClose: () => void;
    className: string;
    children: ReactNode;
    style?: CSSProperties;
    align?: HorizontalAlign;
    gap?: number;
    viewportMargin?: number;
    backdropClassName?: string;
}

interface MenuPosition {
    top: number;
    left: number;
    maxHeight: number;
}

export function AnchoredMenuPortal({
    open,
    anchorRef,
    onClose,
    className,
    children,
    style,
    align = 'end',
    gap = 6,
    viewportMargin = 8,
    backdropClassName,
}: AnchoredMenuPortalProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<MenuPosition | null>(null);

    const updatePosition = useCallback(() => {
        const anchor = anchorRef.current;
        const menu = menuRef.current;

        if (!anchor || !menu) {
            return;
        }

        const anchorRect = anchor.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;
        const measuredWidth = menuRect.width || menu.offsetWidth;
        const measuredHeight = menuRect.height || menu.offsetHeight;

        const desiredLeft = align === 'end'
            ? anchorRect.right - measuredWidth
            : anchorRect.left;
        const maxLeft = Math.max(viewportMargin, viewportWidth - measuredWidth - viewportMargin);
        const left = Math.min(Math.max(desiredLeft, viewportMargin), maxLeft);

        const availableBelow = Math.max(
            0,
            viewportHeight - anchorRect.bottom - gap - viewportMargin,
        );
        const availableAbove = Math.max(
            0,
            anchorRect.top - gap - viewportMargin,
        );
        const placeAbove = measuredHeight > availableBelow && availableAbove > availableBelow;
        const availableHeight = placeAbove ? availableAbove : availableBelow;
        const top = placeAbove
            ? Math.max(
                viewportMargin,
                anchorRect.top - gap - Math.min(measuredHeight, availableHeight),
            )
            : anchorRect.bottom + gap;

        setPosition({
            top,
            left,
            maxHeight: availableHeight,
        });
    }, [align, anchorRef, gap, viewportMargin]);

    useLayoutEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }

        updatePosition();

        const menu = menuRef.current;
        const anchor = anchorRef.current;
        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(updatePosition)
            : null;

        if (menu) {
            resizeObserver?.observe(menu);
        }
        if (anchor) {
            resizeObserver?.observe(anchor);
        }

        document.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);

        return () => {
            resizeObserver?.disconnect();
            document.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [anchorRef, open, updatePosition]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) {
                return;
            }
            onClose();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
                anchorRef.current?.focus();
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [anchorRef, onClose, open]);

    if (!open || typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <>
            {backdropClassName ? (
                <div className={backdropClassName} aria-hidden="true" onClick={onClose} />
            ) : null}
            <div
                ref={menuRef}
                className={className}
                style={{
                    ...style,
                    position: 'fixed',
                    top: position?.top ?? -10_000,
                    left: position?.left ?? -10_000,
                    right: 'auto',
                    bottom: 'auto',
                    maxHeight: position?.maxHeight,
                    overflowY: 'auto',
                    zIndex: 2200,
                }}
            >
                {children}
            </div>
        </>,
        document.body,
    );
}

export default AnchoredMenuPortal;
