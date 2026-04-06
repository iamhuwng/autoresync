function getVisibleViewportLane(
    viewportRect: DOMRect,
    paddingTop: number,
    paddingBottom: number,
) {
    const viewportTop = typeof window !== 'undefined'
        ? window.visualViewport?.offsetTop ?? 0
        : 0;
    const viewportHeight = typeof window !== 'undefined'
        ? window.visualViewport?.height ?? window.innerHeight
        : viewportRect.height;
    const viewportBottom = viewportTop + viewportHeight;

    const top = Math.max(viewportRect.top + paddingTop, viewportTop + paddingTop);
    const bottom = Math.min(viewportRect.bottom - paddingBottom, viewportBottom - paddingBottom);

    return {
        top,
        bottom,
        height: Math.max(bottom - top, 0),
    };
}

export function getVisibleRailLaneBounds({
    viewportElement,
    paddingTop = 0,
    paddingBottom = 0,
}: {
    viewportElement: HTMLElement;
    paddingTop?: number;
    paddingBottom?: number;
}) {
    return getVisibleViewportLane(
        viewportElement.getBoundingClientRect(),
        paddingTop,
        paddingBottom,
    );
}

export function getAlignedRailTranslateY({
    viewportElement,
    stackElement,
    headerElement,
    fitElement,
    anchorViewportTop,
    paddingTop,
    paddingBottom,
}: {
    viewportElement: HTMLElement;
    stackElement: HTMLElement;
    headerElement: HTMLElement;
    fitElement?: HTMLElement | null;
    anchorViewportTop: number;
    paddingTop: number;
    paddingBottom: number;
}): number {
    const viewportRect = viewportElement.getBoundingClientRect();
    const stackRect = stackElement.getBoundingClientRect();
    const headerRect = headerElement.getBoundingClientRect();
    const fittingElement = fitElement ?? headerElement;
    const fitRect = fittingElement.getBoundingClientRect();
    const fitHeight = fitRect.height || fittingElement.offsetHeight || 0;
    const headerOffsetWithinFit = headerRect.top - fitRect.top;
    const { top: visibleTop, bottom: visibleBottom } = getVisibleViewportLane(
        viewportRect,
        paddingTop,
        paddingBottom,
    );
    const headerHeight = headerRect.height || headerElement.offsetHeight || 0;
    const minHeaderTop = visibleTop + headerOffsetWithinFit;
    const maxHeaderTop = visibleBottom - Math.max(fitHeight - headerOffsetWithinFit, headerHeight);
    const desiredHeaderTop = maxHeaderTop >= minHeaderTop
        ? Math.min(Math.max(anchorViewportTop, minHeaderTop), maxHeaderTop)
        : minHeaderTop;
    const headerOffsetWithinStack = headerRect.top - stackRect.top;
    const desiredHeaderTopWithinViewport = desiredHeaderTop - viewportRect.top - paddingTop;

    return desiredHeaderTopWithinViewport - headerOffsetWithinStack;
}

export function revealRailItemInViewport({
    viewportElement,
    itemElement,
    paddingTop = 0,
    paddingBottom = 0,
}: {
    viewportElement: HTMLElement;
    itemElement: HTMLElement;
    paddingTop?: number;
    paddingBottom?: number;
}) {
    const viewportRect = viewportElement.getBoundingClientRect();
    const itemRect = itemElement.getBoundingClientRect();
    const { top: visibleTop, bottom: visibleBottom } = getVisibleViewportLane(
        viewportRect,
        paddingTop,
        paddingBottom,
    );

    if (itemRect.top < visibleTop) {
        viewportElement.scrollTop += itemRect.top - visibleTop;
        return;
    }

    if (itemRect.bottom > visibleBottom) {
        viewportElement.scrollTop += itemRect.bottom - visibleBottom;
    }
}
