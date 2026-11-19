import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const issue = (issues, code, pathName, message) => {
  issues.push({ code, path: pathName, message });
};

export const validateHarnessContract = ({ rootDir = process.cwd() } = {}) => {
  const issues = [];
  const dispatcherPath = path.join(rootDir, 'scripts/harness/run-tool.mjs');
  const runnerPath = path.join(rootDir, 'scripts/harness/run-isolated.mjs');
  const contractPath = path.join(rootDir, 'scripts/harness/contract.mjs');
  let dispatcher = '';
  let contract = '';
  try {
    dispatcher = fs.readFileSync(dispatcherPath, 'utf8');
  } catch (error) {
    issue(issues, 'harness-contract-missing', '$.harness.dispatcher', error instanceof Error ? error.message : String(error));
  }
  try {
    fs.accessSync(runnerPath, fs.constants.R_OK);
  } catch (error) {
    issue(issues, 'harness-contract-missing', '$.harness.runner', error instanceof Error ? error.message : String(error));
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
  if (dispatcher && (!/run-isolated\.mjs/u.test(dispatcher) || !/spawnSync\(process\.execPath,/u.test(dispatcher))) {
    issue(issues, 'harness-playwright-entrypoint-missing', '$.harness.dispatcher', 'The dispatcher must invoke the isolated runner with native Node.');
  }
  return issues;
};
