import { execFile } from 'node:child_process';
import { access, open, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const toolingDoctor = fileURLToPath(new URL('./tooling-doctor.mjs', import.meta.url));

export async function checkReleaseCheckout(cwd) {
  const git = async (...args) => (await exec('git', ['--no-optional-locks', ...args], {
    cwd, windowsHide: true, timeout: 3500,
  })).stdout.trim();
  const checks = [];
  try {
    const [status, paths] = await Promise.all([
      git('status', '--porcelain=v1', '--untracked-files=all'),
      git('rev-parse', '--path-format=absolute', '--git-path', 'index', '--git-path', 'rebase-merge',
        '--git-path', 'rebase-apply', '--git-path', 'MERGE_HEAD', '--git-path', 'CHERRY_PICK_HEAD', '--git-path', 'REVERT_HEAD'),
    ]);
    checks.push(status ? ['BLOCKED', 'Checkout has tracked or untracked changes.'] : ['OK', 'Checkout is clean.']);
    const [index, ...operationPaths] = paths.split(/\r?\n/u);
    const operations = await Promise.all(operationPaths.map(async file => {
      try { await access(file); return true; }
      catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    }));
    if (operations.some(Boolean)) checks.push(['BLOCKED', 'A Git integration operation is in progress.']);
    try {
      const handle = await open(index, 'r+');
      await handle.close();
      checks.push(['OK', 'Existing Git index opens for update. Lock creation has not been tested.']);
    } catch (error) {
      const code = ['EACCES', 'EPERM', 'ENOENT', 'EROFS'].includes(error.code) ? error.code : 'unknown';
      checks.push(['ADVISORY', `Git index update access is unverified (${code}). For an authorized Git write, use the host CLI with scoped approval if the sandbox requires it.`]);
    }
  } catch {
    checks.push(['BLOCKED', 'Git checkout or operation state could not be read.']);
  }
  return checks;
}

async function checkCommand(command, args, success, failure) {
  try {
    await exec(command, args, { cwd: root, windowsHide: true, timeout: 5000 });
    return ['OK', success];
  } catch { return ['BLOCKED', failure]; }
}

async function main() {
  const pin = (await readFile(new URL('../.node-version', import.meta.url), 'utf8')).trim();
  const runtime = process.versions.node === pin
    ? ['OK', `Using pinned Node ${pin}.`]
    : ['BLOCKED', `Use pinned Node ${pin}; current runtime is ${process.versions.node}.`];
  const [checkout, tools, github] = await Promise.all([
    checkReleaseCheckout(root),
    checkCommand(process.execPath, [toolingDoctor], 'Checkout-owned Hosting tools are present.',
      'Checkout-owned Hosting tools are missing or unreadable. Run npm run tooling:doctor for details.'),
    checkCommand('gh', ['api', '--hostname', 'github.com', 'user', '--silent'], 'GitHub CLI authentication responds.',
      'GitHub CLI authentication did not respond. Check gh auth status and network access in the intended session.'),
  ]);
  const checks = [runtime, ...checkout, tools, github];
  for (const [status, message] of checks) console.log(`[${status}] ${message}`);
  console.log('Local precheck only. Use Release Promotion health for federated provider access.');
  return checks.some(([status]) => status === 'BLOCKED') ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = await main(); }
  catch {
    console.error('Local release readiness could not determine the pinned runtime.');
    process.exitCode = 1;
  }
}
