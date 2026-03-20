import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadBreadcrumbModule() {
  vi.resetModules();
  return import('./useBreadcrumbs');
}

describe('useBreadcrumbs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T00:00:00.000Z'));
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps only the last 10 breadcrumb entries', async () => {
    const { addBreadcrumb, getBreadcrumbs } = await loadBreadcrumbModule();

    for (let index = 0; index < 12; index += 1) {
      addBreadcrumb('click', `button-${index}`);
      vi.advanceTimersByTime(10);
    }

    const breadcrumbs = getBreadcrumbs();

    expect(breadcrumbs).toHaveLength(10);
    expect(breadcrumbs[0]?.target).toBe('button-2');
    expect(breadcrumbs[9]?.target).toBe('button-11');
  });

  it('captures delegated click and submit events only once after init', async () => {
    const { getBreadcrumbs, initBreadcrumbs } = await loadBreadcrumbModule();

    document.body.innerHTML = `
      <button id="save-button">Save changes</button>
      <form id="profile-form"></form>
    `;

    initBreadcrumbs();
    initBreadcrumbs();

    document
      .getElementById('save-button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document
      .getElementById('profile-form')
      ?.dispatchEvent(new Event('submit', { bubbles: true }));

    const breadcrumbs = getBreadcrumbs();

    expect(breadcrumbs).toHaveLength(2);
    expect(breadcrumbs[0]).toMatchObject({
      type: 'click',
      target: 'Save changes',
    });
    expect(breadcrumbs[1]).toMatchObject({
      type: 'submit',
      target: 'profile-form',
    });
  });

  it('resets the page-load timer after a navigation breadcrumb', async () => {
    const { addBreadcrumb, addNavigationBreadcrumb, getBreadcrumbs } =
      await loadBreadcrumbModule();

    vi.advanceTimersByTime(500);
    addNavigationBreadcrumb('/student-test/ABC123');

    vi.advanceTimersByTime(250);
    addBreadcrumb('click', 'Next');

    const breadcrumbs = getBreadcrumbs();

    expect(breadcrumbs[0]).toMatchObject({
      type: 'navigation',
      target: '/student-test/ABC123',
      timeSincePageLoad: 500,
    });
    expect(breadcrumbs[1]).toMatchObject({
      type: 'click',
      target: 'Next',
      timeSincePageLoad: 250,
    });
  });
});
