import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = 'C:/Users/The Lord/Desktop/luyentap-writing-import-rebased';
const outputDir = path.join(root, 'output/playwright/prd0052-visual-similarity');
const refs = {
  live: 'http://localhost:5173/',
  prd0050Mockup: `file:///${root.replaceAll('\\', '/')}/documentation/tasks/0033-prd-teacher-lobby-refactor/design/teacher-lobby-materials-list-view/teacher-lobby-materials-list-view-mockups.html`,
  prd0050Components: `file:///${root.replaceAll('\\', '/')}/documentation/tasks/0033-prd-teacher-lobby-refactor/design/teacher-lobby-materials-list-view/teacher-lobby-materials-list-view-components.html`,
  prd0052Candidate: `file:///${root.replaceAll('\\', '/')}/.superpowers/brainstorm/prd0052-20260601-023550/content/teacher-materials-live-faithful-v4.html`,
  prd0052V5: `file:///${root.replaceAll('\\', '/')}/.superpowers/brainstorm/prd0052-20260601-023550/content/teacher-materials-prd0050-derived-v5.html`,
};

const viewports = [
  { name: '848', width: 848, height: 791 },
  { name: '1366', width: 1366, height: 900 },
  { name: '1586', width: 1586, height: 992 },
];

const selectorMap = {
  header: ['.teacher-header', 'header', '[class*="TeacherHeader"]'],
  nav: ['.teacher-nav', 'nav', '[class*="TeacherNavigation"]'],
  main: ['main', '.page', '.app-main', '.lt-main'],
  pageTitle: ['.page-title', 'h1', '.lt-title'],
  subtitle: ['.subtitle', '.lt-subtitle', 'p'],
  tabs: ['.tabs', '.content-tabs', '.lt-tabs', '[role="tablist"]'],
  activeTab: ['.tabs .btn-primary', '.content-tab.active', '.lt-tab.active', '[aria-selected="true"]'],
  toolbar: ['.toolbar', '.search-filter-bar', '.lt-toolbar'],
  search: ['.search input', '.search-filter-input', 'input[type="search"]', 'input[placeholder*="Search"]'],
  primaryCta: ['.toolbar .btn-primary', '.search-filter-create-button', '.lt-create'],
  typeModule: ['.lt-type-grid', '.test-type-grid', '.type-grid'],
  typeCard: ['.lt-type-card', '.test-type-card', '.type-card'],
  list: ['.materials-list', '.material-list-view', '.lt-list'],
  listRow: ['.material-list-row', '.lt-list-row'],
  bookGrid: ['.book-grid', '.lt-book-grid'],
  bookCard: ['.book-card', '.lt-book-card'],
};

async function ensureTeacherLobby(page) {
  await page.goto(refs.live, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1200);
  const title = await page.title().catch(() => '');
  const body = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  if (/login/i.test(body) || /sign in/i.test(body)) {
    const quick = page.getByRole('button', { name: /show dev quick login/i });
    if (await quick.count()) {
      await quick.click();
      await page.waitForTimeout(200);
    }
    const teacher = page.locator('#dev-login-teacher').or(page.getByRole('button', { name: /^Teacher$/i }));
    if (await teacher.count()) {
      await teacher.first().click();
      await page.waitForTimeout(4000);
    }
  }
  if (!/teacher-lobby/.test(page.url())) {
    await page.goto('http://localhost:5173/teacher-lobby', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  if (await page.getByRole('button', { name: /^Materials$/i }).count()) {
    await page.getByRole('button', { name: /^Materials$/i }).first().click().catch(() => {});
    await page.waitForTimeout(800);
  }
  return { title, url: page.url() };
}

async function firstMatch(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      const visible = await locator.isVisible().catch(() => false);
      if (visible) return { selector, locator };
    }
  }
  return null;
}

async function extractElement(page, selectors) {
  const match = await firstMatch(page, selectors);
  if (!match) return null;
  return match.locator.evaluate((el, selector) => {
    const cs = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const pick = [
      'display', 'position', 'gridTemplateColumns', 'flexDirection', 'alignItems', 'justifyContent',
      'gap', 'width', 'height', 'minHeight', 'maxWidth', 'padding', 'margin', 'borderRadius',
      'backgroundColor', 'backgroundImage', 'border', 'boxShadow', 'color', 'fontFamily',
      'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'overflow', 'whiteSpace',
    ];
    const style = {};
    for (const key of pick) style[key] = cs[key];
    return {
      selector,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      style,
    };
  }, match.selector);
}

async function extractPage(page, name, viewport) {
  const extracted = {
    name,
    viewport,
    url: page.url(),
    title: await page.title().catch(() => ''),
    document: await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyText: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 500),
    })),
    elements: {},
  };
  for (const [key, selectors] of Object.entries(selectorMap)) {
    extracted.elements[key] = await extractElement(page, selectors);
  }
  return extracted;
}

function tokenDiff(reference, candidate) {
  const rows = [];
  for (const key of Object.keys(selectorMap)) {
    const ref = reference?.elements?.[key];
    const cand = candidate?.elements?.[key];
    if (!ref && !cand) continue;
    if (!ref || !cand) {
      rows.push({ area: key, status: 'missing', reference: Boolean(ref), candidate: Boolean(cand) });
      continue;
    }
    const rectDiff = {
      x: cand.rect.x - ref.rect.x,
      y: cand.rect.y - ref.rect.y,
      width: cand.rect.width - ref.rect.width,
      height: cand.rect.height - ref.rect.height,
    };
    const styleKeys = ['fontSize', 'fontWeight', 'borderRadius', 'backgroundColor', 'color', 'boxShadow', 'padding', 'gap', 'gridTemplateColumns'];
    const styleDiff = {};
    for (const styleKey of styleKeys) {
      if (ref.style[styleKey] !== cand.style[styleKey]) {
        styleDiff[styleKey] = { reference: ref.style[styleKey], candidate: cand.style[styleKey] };
      }
    }
    rows.push({ area: key, rectDiff, styleDiff });
  }
  return rows;
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { refs, viewports, captures: {}, diffs: {} };

for (const viewport of viewports) {
  for (const [name, url] of Object.entries(refs)) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const consoleMessages = [];
    page.on('console', (msg) => {
      if (['error', 'warning'].includes(msg.type())) consoleMessages.push({ type: msg.type(), text: msg.text().slice(0, 400) });
    });
    if (name === 'live') {
      await ensureTeacherLobby(page);
    } else {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(700);
    }
    const key = `${name}-${viewport.name}`;
    const screenshot = path.join(outputDir, `${key}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    report.captures[key] = await extractPage(page, name, viewport);
    report.captures[key].screenshot = screenshot;
    report.captures[key].consoleMessages = consoleMessages;
    await page.close();
  }
  report.diffs[`candidate-vs-prd0050-${viewport.name}`] = tokenDiff(
    report.captures[`prd0050Mockup-${viewport.name}`],
    report.captures[`prd0052Candidate-${viewport.name}`],
  );
  report.diffs[`candidate-vs-live-${viewport.name}`] = tokenDiff(
    report.captures[`live-${viewport.name}`],
    report.captures[`prd0052Candidate-${viewport.name}`],
  );
  report.diffs[`v5-vs-prd0050-${viewport.name}`] = tokenDiff(
    report.captures[`prd0050Mockup-${viewport.name}`],
    report.captures[`prd0052V5-${viewport.name}`],
  );
}

await browser.close();
await fs.writeFile(path.join(outputDir, 'style-extract.json'), JSON.stringify(report, null, 2), 'utf8');

const diffRows = [];
const diff = report.diffs['candidate-vs-prd0050-1586'] || [];
let i = 1;
for (const row of diff) {
  const hasRect = row.rectDiff && Object.values(row.rectDiff).some((v) => Math.abs(v) > 12);
  const hasStyle = row.styleDiff && Object.keys(row.styleDiff).length > 0;
  const missing = row.status === 'missing';
  if (!hasRect && !hasStyle && !missing) continue;
  diffRows.push(`| D-${String(i).padStart(3, '0')} | ${row.area} | PRD-0050 mockup | PRD-0052 v4 | ${missing ? `Element presence mismatch ref=${row.reference} candidate=${row.candidate}` : `Rect ${JSON.stringify(row.rectDiff)}; style keys ${Object.keys(row.styleDiff || {}).join(', ') || 'none'}`} | Rebuild from PRD-0050/live source for this area | Open |`);
  i += 1;
}

const md = `# PRD-0052 Visual Difference Register

Generated: ${new Date().toISOString()}

Reference: PRD-0050 full-page mockup at 1586px.
Candidate: PRD-0052 live-faithful-v4 at 1586px.

| ID | Area | Reference | Candidate | Difference | Required Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
${diffRows.join('\n') || '| D-000 | None | PRD-0050 | Candidate | No material diff detected | None | Closed |'}

## Evidence Files

- \`style-extract.json\`
- \`live-848.png\`, \`live-1366.png\`, \`live-1586.png\`
- \`prd0050Mockup-848.png\`, \`prd0050Mockup-1366.png\`, \`prd0050Mockup-1586.png\`
- \`prd0050Components-848.png\`, \`prd0050Components-1366.png\`, \`prd0050Components-1586.png\`
- \`prd0052Candidate-848.png\`, \`prd0052Candidate-1366.png\`, \`prd0052Candidate-1586.png\`
`;

await fs.writeFile(path.join(outputDir, 'difference-register.md'), md, 'utf8');
console.log(JSON.stringify({
  outputDir,
  captures: Object.keys(report.captures).length,
  diffs: Object.keys(report.diffs).length,
  differenceRows: diffRows.length,
}, null, 2));
