import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const harnessDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(harnessDirectory, '..', '..');
const [tool, projectArgument = '.', ...toolArguments] = process.argv.slice(2);

const tools = new Set(['playwright', 'vitest', 'vite', 'vite-node', 'wrangler']);
if (!tools.has(tool)) {
  console.error(`harness dispatcher: unsupported tool ${JSON.stringify(tool)}`);
  console.error(`supported tools: ${[...tools].join(', ')}`);
  process.exit(2);
}

const projectRoot = path.resolve(process.cwd(), projectArgument);
const relativeProjectPath = path.relative(repositoryRoot, projectRoot) || '.';
if (relativeProjectPath === '..' || relativeProjectPath.startsWith(`..${path.sep}`)) {
  console.error(`harness dispatcher: project must stay inside repository: ${projectRoot}`);
  process.exit(2);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
    ...options,
  });

  if (result.error) {
    console.error(`harness dispatcher: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

if (process.platform === 'win32') {
  const powershell = process.env.ComSpec
    ? path.join(path.dirname(process.env.ComSpec), 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
  const wrapper = path.join(repositoryRoot, 'scripts', 'harness', 'run-x64.ps1');
  const environment = { ...process.env };
  if (process.arch === 'x64' && !environment.CODEX_X64_NODE) {
    environment.CODEX_X64_NODE = process.execPath;
  }
  environment.CODEX_HARNESS_ARGUMENTS_B64 = Buffer
    .from(JSON.stringify(toolArguments), 'utf8')
    .toString('base64');

  const wrapperArguments = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    wrapper,
    '-Tool',
    tool,
    '-ProjectPath',
    relativeProjectPath,
  ];
  run(powershell, wrapperArguments, { cwd: repositoryRoot, env: environment });
}

const entryPoint = {
  playwright: path.join(projectRoot, 'node_modules', '@playwright', 'test', 'cli.js'),
  vitest: path.join(projectRoot, 'node_modules', 'vitest', 'vitest.mjs'),
  vite: path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
  'vite-node': path.join(projectRoot, 'node_modules', 'vite-node', 'vite-node.mjs'),
  wrangler: path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
}[tool];

run(process.execPath, [entryPoint, ...toolArguments]);
