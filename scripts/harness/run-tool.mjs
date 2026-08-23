import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARNESS_CONTRACT, toolNames } from './contract.mjs';
import { assertRepositorySkillAuthority } from './skill-authority.mjs';

const harnessDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(harnessDirectory, '..', '..');
assertRepositorySkillAuthority(repositoryRoot);

const auditMode = process.argv[2] === '--audit';
const argumentOffset = auditMode ? 3 : 2;

if (process.argv[argumentOffset] === '--contract') {
  process.stdout.write(`${JSON.stringify(HARNESS_CONTRACT, null, 2)}\n`);
  process.exit(0);
}

const doctorMode = process.argv[argumentOffset] === '--doctor';
const [tool, projectArgument, ...toolArguments] = doctorMode
  ? ['doctor', process.argv[argumentOffset + 1], ...process.argv.slice(argumentOffset + 2)]
  : process.argv.slice(argumentOffset);
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
  CODEX_HARNESS_AUDIT: auditMode ? '1' : (process.env.CODEX_HARNESS_AUDIT || '0'),
  CODEX_HARNESS_INVOCATION_B64: Buffer.from(JSON.stringify({
    harness: { name: HARNESS_CONTRACT.name, version: HARNESS_CONTRACT.version, protocolVersion: HARNESS_CONTRACT.protocolVersion },
    mode: doctorMode ? 'doctor' : 'run', audit: auditMode, tool, relativeProjectPath, toolArguments,
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
