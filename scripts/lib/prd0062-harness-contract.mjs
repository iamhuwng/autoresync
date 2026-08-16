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
  const contractPath = path.join(rootDir, 'scripts/harness/contract.mjs');
  let dispatcher = '';
  let x64Wrapper = '';
  let contract = '';
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
  try {
    contract = fs.readFileSync(contractPath, 'utf8');
  } catch {
    // Temporary contract fixtures intentionally omit this file and are checked below.
  }
  if (dispatcher && (!contract || !/playwright:\s*Object\.freeze\(\{[\s\S]*?entry:\s*'@playwright\/test\/cli\.js'/u.test(contract))) {
    issue(issues, 'harness-playwright-unsupported', '$.harness.dispatcher', 'Dispatcher contract must declare Playwright.');
    issue(issues, 'harness-playwright-entrypoint-missing', '$.harness.dispatcher', 'Dispatcher contract must use the installed @playwright/test CLI entrypoint.');
  }
  if (x64Wrapper && !/run-isolated\.mjs/u.test(x64Wrapper)) {
    issue(issues, 'harness-playwright-unsupported', '$.harness.x64Wrapper', 'x64 wrapper must delegate to the versioned isolated runner.');
    issue(issues, 'harness-playwright-entrypoint-missing', '$.harness.x64Wrapper', 'x64 wrapper must use the versioned harness contract.');
  }
  return issues;
};
