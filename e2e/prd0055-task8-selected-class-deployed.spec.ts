import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DEPLOYED_ORIGIN = 'https://kahut1.web.app';
const DEFAULT_PROOF_PATH = 'output/prd0055-task9-live-readback/prd0055-selected-class-live-1782839029713.json';
const SELECTED_CLASS_PROOF_PATH = process.env.PRD0055_SELECTED_CLASS_PROOF || DEFAULT_PROOF_PATH;
const PROOF = JSON.parse(fs.readFileSync(path.resolve(SELECTED_CLASS_PROOF_PATH), 'utf8')) as {
  proofId: string;
  fixture: {
    sessionCode: string;
    classId: string;
    testId: string;
    versionId: string;
    assetId: string;
  };
};
const ARTIFACT_DIR = path.resolve('output/prd0055-task9-live-readback', `${PROOF.proofId}-browser`);

type DeliveryEvent = {
  label: string;
  type: 'requestfailed' | 'response';
  method?: string;
  status?: number;
  url: string;
  failure?: string;
};

function isBenignMediaAbort(event: DeliveryEvent): boolean {
  return event.type === 'requestfailed'
    && event.method === 'GET'
    && event.url.includes('/listening-delivery/content')
    && event.failure === 'net::ERR_ABORTED';
}

const redactUrl = (url: string): string => url.replace(/token=[^&]+/g, 'token=[redacted]');

async function quickLogin(page: Page, role: 'teacher' | 'student') {
  await page.goto(`${DEPLOYED_ORIGIN}/login`);
  await page.getByRole('button', { name: /show dev quick login/i }).click();
  await page.locator(role === 'teacher' ? '#dev-login-teacher' : '#dev-login-student').click();
  await expect(page).toHaveURL(role === 'teacher' ? /\/lobby/ : /\/student/, { timeout: 60_000 });
}

function attachDeliveryEvents(page: Page, label: string, events: DeliveryEvent[]) {
  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('/listening-delivery/')) return;
    events.push({
      label,
      type: 'response',
      method: response.request().method(),
      status: response.status(),
      url: redactUrl(url),
    });
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!url.includes('/listening-delivery/')) return;
    events.push({
      label,
      type: 'requestfailed',
      method: request.method(),
      url: redactUrl(url),
      failure: request.failure()?.errorText,
    });
  });
}

async function readAudioState(page: Page) {
  await page.locator('audio').first().waitFor({ state: 'attached', timeout: 30_000 });
  return page.locator('audio').first().evaluate((audio) => {
    const element = audio as HTMLAudioElement;
    return {
      currentTime: Number(element.currentTime.toFixed(3)),
      duration: Number.isFinite(element.duration) ? Number(element.duration.toFixed(3)) : null,
      networkState: element.networkState,
      paused: element.paused,
      readyState: element.readyState,
      src: element.currentSrc || element.src,
      error: element.error?.message ?? null,
    };
  }).then((state) => ({
    ...state,
    src: redactUrl(state.src),
  }));
}

async function readTeacherProgressVisualState(page: Page) {
  const [audioState, fillStyleWidth, sliderState, timeLabel, boxes] = await Promise.all([
    readAudioState(page),
    page.getByTestId('audio-section-progress-fill-1').evaluate((element) => (
      (element as HTMLElement).style.width
    )),
    page.getByRole('slider', { name: /seek section 1/i }).evaluate((element) => {
      const input = element as HTMLInputElement;
      return {
        value: Number(input.value),
        max: Number(input.max),
      };
    }),
    page.getByRole('button', { name: /edit current audio time/i }).textContent(),
    Promise.all([
      page.getByTestId('audio-section-progress-bar').boundingBox(),
      page.getByTestId('audio-section-progress-fill-1').boundingBox(),
    ]).then(([bar, fill]) => ({
      barWidth: bar?.width ?? null,
      fillWidth: fill?.width ?? null,
    })),
  ]);
  const fillStylePercent = Number(fillStyleWidth.replace('%', ''));
  const fillPixelPercent = boxes.barWidth && boxes.fillWidth
    ? Number(((boxes.fillWidth / boxes.barWidth) * 100).toFixed(2))
    : null;
  const sliderPercent = sliderState.max > 0
    ? Number(((sliderState.value / sliderState.max) * 100).toFixed(2))
    : null;

  return {
    audioState,
    fillStyleWidth,
    fillStylePercent,
    fillPixelPercent,
    sliderState,
    sliderPercent,
    timeLabel: timeLabel?.trim() ?? null,
  };
}

async function expectPrivateAudioReady(page: Page) {
  await expect.poll(async () => {
    const state = await readAudioState(page);
    return {
      hasPrivateContentUrl: state.src.includes('/listening-delivery/content?token='),
      readyStateAtLeastMetadata: state.readyState >= 1,
      error: state.error,
    };
  }, {
    timeout: 45_000,
    message: 'audio element resolves deployed private content URL',
  }).toEqual({
    hasPrivateContentUrl: true,
    readyStateAtLeastMetadata: true,
    error: null,
  });
}

test.describe('PRD-0055 selected-class deployed live private delivery', () => {
  test('teacher and selected student load deployed private audio from selected class fixture', async ({ browser }) => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const contexts: BrowserContext[] = [];
    const deliveryEvents: DeliveryEvent[] = [];
    const states: Record<string, unknown> = {
      proofPath: SELECTED_CLASS_PROOF_PATH,
      proofId: PROOF.proofId,
      fixture: PROOF.fixture,
      deployedOrigin: DEPLOYED_ORIGIN,
    };

    try {
      const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      contexts.push(teacherContext);
      const teacherPage = await teacherContext.newPage();
      attachDeliveryEvents(teacherPage, 'teacher-desktop', deliveryEvents);
      await quickLogin(teacherPage, 'teacher');
      await teacherPage.goto(`${DEPLOYED_ORIGIN}/teacher-test/${PROOF.fixture.sessionCode}`);
      await expect(teacherPage.getByText('Audio Control Panel')).toBeVisible({ timeout: 60_000 });
      await expect(teacherPage.getByText(`Session: ${PROOF.fixture.sessionCode}`)).toBeVisible({ timeout: 60_000 });
      await expectPrivateAudioReady(teacherPage);
      await teacherPage.getByRole('button', { name: 'Resume All Audio' }).last().click();
      await expect.poll(async () => {
        const state = await readAudioState(teacherPage);
        return state.currentTime;
      }, {
        timeout: 15_000,
        message: 'teacher private audio advances after browser gesture',
      }).toBeGreaterThan(0);
      states.teacherDesktop = await readAudioState(teacherPage);
      await teacherPage.screenshot({
        path: path.join(ARTIFACT_DIR, 'teacher-desktop-selected-class.png'),
        fullPage: true,
      });
      states.teacherProgressVisual = await readTeacherProgressVisualState(teacherPage);

      const studentDesktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      contexts.push(studentDesktopContext);
      const studentDesktop = await studentDesktopContext.newPage();
      attachDeliveryEvents(studentDesktop, 'student-desktop', deliveryEvents);
      await quickLogin(studentDesktop, 'student');
      await studentDesktop.goto(`${DEPLOYED_ORIGIN}/student-wait/${PROOF.fixture.sessionCode}`);
      await expect(studentDesktop).toHaveURL(new RegExp(`/student-test/${PROOF.fixture.sessionCode}`), { timeout: 60_000 });
      await expect(studentDesktop.getByText(/Complete the note|Question 1|Section 1/i).first()).toBeVisible({ timeout: 60_000 });
      await expect(studentDesktop.getByText(/Audio Error/i)).toHaveCount(0);
      await expectPrivateAudioReady(studentDesktop);
      states.studentDesktop = await readAudioState(studentDesktop);
      await studentDesktop.screenshot({
        path: path.join(ARTIFACT_DIR, 'student-desktop-selected-class.png'),
        fullPage: true,
      });

      const studentMobileContext = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
      contexts.push(studentMobileContext);
      const studentMobile = await studentMobileContext.newPage();
      attachDeliveryEvents(studentMobile, 'student-mobile-375', deliveryEvents);
      await quickLogin(studentMobile, 'student');
      await studentMobile.goto(`${DEPLOYED_ORIGIN}/student-wait/${PROOF.fixture.sessionCode}`);
      await expect(studentMobile).toHaveURL(new RegExp(`/student-test/${PROOF.fixture.sessionCode}`), { timeout: 60_000 });
      await expect(studentMobile.getByText(/Complete the note|Question 1|Section 1/i).first()).toBeVisible({ timeout: 60_000 });
      await expect(studentMobile.getByText(/Audio Error/i)).toHaveCount(0);
      await expectPrivateAudioReady(studentMobile);
      states.studentMobile375 = await readAudioState(studentMobile);
      await studentMobile.screenshot({
        path: path.join(ARTIFACT_DIR, 'student-mobile-375-selected-class.png'),
        fullPage: true,
      });

      states.deliveryEvents = deliveryEvents;
      states.benignMediaAborts = deliveryEvents.filter(isBenignMediaAbort);
      states.blockingDeliveryFailures = deliveryEvents.filter((event) => (
        event.type === 'requestfailed' && !isBenignMediaAbort(event)
      ));
      expect(deliveryEvents.some((event) => (
        event.type === 'response'
        && event.method === 'POST'
        && event.status === 200
        && event.url.includes('/listening-delivery/live')
      ))).toBe(true);
      expect(states.blockingDeliveryFailures).toEqual([]);
    } finally {
      states.deliveryEvents = deliveryEvents;
      fs.writeFileSync(
        path.join(ARTIFACT_DIR, 'selected-class-browser-proof.json'),
        `${JSON.stringify({
          createdAt: new Date().toISOString(),
          ...states,
        }, null, 2)}\n`,
        'utf8',
      );
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
