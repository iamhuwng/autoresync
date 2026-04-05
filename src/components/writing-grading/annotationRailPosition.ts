export function getAlignedRailTranslateY({
    viewportElement,
    stackElement,
    headerElement,
    anchorViewportTop,
    paddingTop,
    paddingBottom,
}: {
    viewportElement: HTMLElement;
    stackElement: HTMLElement;
    headerElement: HTMLElement;
    anchorViewportTop: number;
    paddingTop: number;
    paddingBottom: number;
}): number {
    const viewportRect = viewportElement.getBoundingClientRect();
    const stackRect = stackElement.getBoundingClientRect();
    const headerRect = headerElement.getBoundingClientRect();
    const headerHeight = headerRect.height || headerElement.offsetHeight || 0;
    const desiredHeaderTop = Math.min(
        Math.max(anchorViewportTop, viewportRect.top + paddingTop),
        viewportRect.bottom - paddingBottom - headerHeight,
    );
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
    const visibleTop = viewportRect.top + paddingTop;
    const visibleBottom = viewportRect.bottom - paddingBottom;

    if (itemRect.top < visibleTop) {
        viewportElement.scrollTop += itemRect.top - visibleTop;
        return;
    }

    if (itemRect.bottom > visibleBottom) {
        viewportElement.scrollTop += itemRect.bottom - visibleBottom;
    }
}
