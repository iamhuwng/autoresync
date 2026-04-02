import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import PassageRenderer from './PassageRenderer';

describe('PassageRenderer', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('creates highlights when the selection spans multiple paragraphs', () => {
    act(() => {
      root.render(
        <PassageRenderer
          passage={{
            type: 'text',
            content: 'First paragraph end.\n\nSecond paragraph start.',
          }}
          highlighterActive
          highlightColor="#ffeb3b"
        />
      );
    });

    const textContainers = container.querySelectorAll('[data-passage-text-start]');
    const firstTextNode = textContainers[0]?.firstChild;
    const secondTextNode = textContainers[1]?.firstChild;
    const passageContent = container.querySelector('[data-passage-content="true"]') as HTMLElement | null;

    expect(firstTextNode?.nodeType).toBe(Node.TEXT_NODE);
    expect(secondTextNode?.nodeType).toBe(Node.TEXT_NODE);
    expect(passageContent).toBeTruthy();

    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(firstTextNode as Text, 6);
    range.setEnd(secondTextNode as Text, 6);
    selection?.removeAllRanges();
    selection?.addRange(range);

    act(() => {
      passageContent?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(marks[0]?.textContent).toBe('paragraph end.');
    expect(marks[1]?.textContent).toBe('Second');
  });
});
