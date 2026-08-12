import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARNESS_CONTRACT, toolNames } from './contract.mjs';

const harnessDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(harnessDirectory, '..', '..');

if (process.argv[2] === '--contract') {
  process.stdout.write(`${JSON.stringify(HARNESS_CONTRACT, null, 2)}\n`);
  process.exit(0);
}

const doctorMode = process.argv[2] === '--doctor';
const [tool, projectArgument, ...toolArguments] = doctorMode
  ? ['doctor', process.argv[3], ...process.argv.slice(4)]
  : process.argv.slice(2);
if (!tool || !projectArgument) {
  process.stderr.write(`harness dispatcher: expected ${HARNESS_CONTRACT.grammar}\n`);
  process.exit(2);
}
if (!doctorMode && !toolNames.includes(tool)) {
  process.stderr.write(`harness dispatcher: unsupported tool ${JSON.stringify(tool)}; supported: ${toolNames.join(', ')}\n`);
  process.exit(2);
}

const projectRoot = path.resolve(process.cwd(), projectArgument);
const relativeProjectPath = path.relative(repositoryRoot, projectRoot) || '.';
const outsideRepository = relativeProjectPath === '..' || relativeProjectPath.startsWith(`..${path.sep}`) || path.isAbsolute(relativeProjectPath);
if (outsideRepository || !fs.existsSync(path.join(projectRoot, 'package.json')) || !fs.existsSync(path.join(projectRoot, 'package-lock.json'))) {
  process.stderr.write(`harness dispatcher: project must be an explicit package/lockfile root inside ${repositoryRoot}: ${projectRoot}\n`);
  process.exit(2);
}

const environment = {
  ...process.env,
  CODEX_HARNESS_INVOCATION_B64: Buffer.from(JSON.stringify({
    mode: doctorMode ? 'doctor' : 'run', tool, relativeProjectPath, toolArguments,
  }), 'utf8').toString('base64'),
};
const isolatedRunner = path.join(harnessDirectory, 'run-isolated.mjs');
let command = process.execPath;
let args = [isolatedRunner];
let cwd = repositoryRoot;

const doctorNeedsX64 = doctorMode && (toolArguments.length === 0 || toolArguments.some((name) => HARNESS_CONTRACT.tools[name]?.runtime === 'windows-x64'));
if (process.platform === 'win32' && (doctorNeedsX64 || HARNESS_CONTRACT.tools[tool]?.runtime === 'windows-x64')) {
  const powershell = process.env.ComSpec
    ? path.join(path.dirname(process.env.ComSpec), 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
  command = powershell;
  args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(harnessDirectory, 'run-x64.ps1')];
}

const result = spawnSync(command, args, { cwd, env: environment, stdio: 'inherit', shell: false });
if (result.error) {
  process.stderr.write(`harness dispatcher: ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
