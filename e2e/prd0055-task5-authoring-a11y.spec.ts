import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = path.resolve('output/playwright/prd0055-task5-batch-e');

const viewports = [
  { name: 'desktop', width: 1366, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
] as const;

async function writeAccessibilityTree(page: Page, name: string) {
  const session = await page.context().newCDPSession(page);
  const tree = await session.send('Accessibility.getFullAXTree');
  const artifactPath = path.join(ARTIFACT_DIR, `a11y-${name}.json`);
  fs.writeFileSync(artifactPath, JSON.stringify(tree, null, 2), 'utf8');
  return tree.nodes as Array<{ role?: { value?: string }; name?: { value?: string } }>;
}

function expectAxNode(
  nodes: Array<{ role?: { value?: string }; name?: { value?: string } }>,
  role: string,
  namePattern: RegExp,
) {
  const found = nodes.some((node) => (
    node.role?.value === role && namePattern.test(node.name?.value ?? '')
  ));
  expect(found, `AX node ${role} ${namePattern}`).toBe(true);
}

async function loginAsTeacher(page: Page) {
  await page.goto('http://localhost:5173/login');
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator('#dev-login-teacher').click();
  await expect(page).toHaveURL(/\/lobby/);
}

test.describe('PRD-0055 Task 5 authoring browser/a11y gate', () => {
  for (const viewport of viewports) {
    test(`teacher Listening authoring keyboard and a11y proof - ${viewport.name}`, async ({ page }) => {
      fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await loginAsTeacher(page);
      await page.goto('http://localhost:5173/create-test?skill=Listening');

      await expect(page.getByRole('heading', { name: /Create Listening Test/ })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Choose Display Mode' })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Display mode options' })).toBeVisible();

      const textMode = page.getByRole('button', { name: /IELTS Text Format/ });
      const imageMode = page.getByRole('button', { name: /Image Mode/ });
      const nextButton = page.getByRole('button', { name: /Next/ }).last();
      const saveDraftButton = page.getByRole('button', { name: /^Save draft$/ });
      const publishButton = page.getByRole('button', { name: /^Publish$/ });

      await expect(textMode).toBeVisible();
      await expect(imageMode).toBeVisible();
      await expect(saveDraftButton).toBeVisible();
      await expect(publishButton).toBeVisible();

      await textMode.focus();
      await expect(textMode).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(textMode).toHaveAttribute('aria-pressed', 'true');

      await imageMode.focus();
      await expect(imageMode).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(imageMode).toHaveAttribute('aria-pressed', 'true');

      await nextButton.focus();
      await expect(nextButton).toBeFocused();

      const axNodes = await writeAccessibilityTree(page, viewport.name);
      expectAxNode(axNodes, 'heading', /Create Listening Test/);
      expectAxNode(axNodes, 'heading', /Choose Display Mode/);
      expectAxNode(axNodes, 'button', /IELTS Text Format/);
      expectAxNode(axNodes, 'button', /Image Mode/);
      expectAxNode(axNodes, 'button', /^Save draft$/);
      expectAxNode(axNodes, 'button', /^Publish$/);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `authoring-${viewport.name}.png`),
        fullPage: true,
      });
    });
  }
});
