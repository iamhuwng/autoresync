import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const issue = (issues, code, pathName, message) => {
  issues.push({ code, path: pathName, message });
};

export const validateHarnessContract = ({ rootDir = process.cwd() } = {}) => {
  const issues = [];
  const dispatcherPath = path.join(rootDir, 'scripts/harness/run-tool.mjs');
  const x64WrapperPath = path.join(rootDir, 'scripts/harness/run-x64.ps1');
  let dispatcher = '';
  let x64Wrapper = '';
  try {
    dispatcher = fs.readFileSync(dispatcherPath, 'utf8');
  } catch (error) {
    issue(issues, 'harness-contract-missing', '$.harness.dispatcher', error instanceof Error ? error.message : String(error));
  }
  try {
    x64Wrapper = fs.readFileSync(x64WrapperPath, 'utf8');
  } catch (error) {
    issue(issues, 'harness-contract-missing', '$.harness.x64Wrapper', error instanceof Error ? error.message : String(error));
  }
  if (dispatcher && !/new Set\(\['playwright',[\s\S]*'vite-node'/u.test(dispatcher)) issue(issues, 'harness-playwright-unsupported', '$.harness.dispatcher', 'Dispatcher must declare Playwright alongside the existing tools.');
  if (dispatcher && !/playwright:\s*path\.join\(projectRoot, 'node_modules', '@playwright', 'test', 'cli\.js'\)/u.test(dispatcher)) issue(issues, 'harness-playwright-entrypoint-missing', '$.harness.dispatcher', 'Dispatcher must use the installed @playwright/test CLI entrypoint.');
  if (x64Wrapper && !/\[ValidateSet\('playwright',[\s\S]*'vite-node'/u.test(x64Wrapper)) issue(issues, 'harness-playwright-unsupported', '$.harness.x64Wrapper', 'x64 wrapper must declare Playwright alongside the existing tools.');
  if (x64Wrapper && !/'playwright'\s*\{\s*Join-Path \$cacheRoot 'node_modules\\@playwright\\test\\cli\.js'/u.test(x64Wrapper)) issue(issues, 'harness-playwright-entrypoint-missing', '$.harness.x64Wrapper', 'x64 wrapper must use the installed @playwright/test CLI entrypoint.');
  return issues;
};
