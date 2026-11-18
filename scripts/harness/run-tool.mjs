import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARNESS_CONTRACT, toolNames } from './contract.mjs';

const harnessDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(harnessDirectory, '..', '..');

const auditMode = process.argv[2] === '--audit';
const argumentOffset = auditMode ? 3 : 2;

if (process.argv[argumentOffset] === '--contract') {
  process.stdout.write(`${JSON.stringify(HARNESS_CONTRACT, null, 2)}\n`);
  process.exit(0);
}

const doctorMode = process.argv[argumentOffset] === '--doctor';
if (!auditMode && !doctorMode) {
  process.stderr.write('harness dispatcher: ordinary execution uses scripts/tooling-where.mjs --exec <tool> [...args]; the evidence harness requires --audit\n');
  process.exit(2);
}
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
if (process.platform === 'win32') {
  if (process.arch !== 'x64') {
    process.stderr.write('HARNESS_FAILURE X64_NODE_PREREQUISITE_MISSING\nStart the audit with native Windows x64 Node.\n');
    process.exit(2);
  }
  const pathKey = Object.keys(environment).find((key) => key.toUpperCase() === 'PATH') || 'Path';
  environment[pathKey] = [path.dirname(process.execPath), environment[pathKey]].filter(Boolean).join(path.delimiter);
  environment.CODEX_HARNESS_X64_DISCOVERY_B64 = Buffer.from(JSON.stringify({
    selected: process.execPath,
    reason: 'native-windows-x64-runtime',
  }), 'utf8').toString('base64');
}

const selectedRunner = path.join(harnessDirectory, 'run-isolated.mjs');
const result = spawnSync(process.execPath, [selectedRunner], {
  cwd: repositoryRoot, env: environment, stdio: 'inherit', shell: false,
});
if (result.error) {
  process.stderr.write(`harness dispatcher: ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
