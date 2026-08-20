import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { HARNESS_CONTRACT } from './contract.mjs';

const failure = (code, message) => Object.assign(new Error(message), { code });

function skillFrontmatter(contents) {
  return contents.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1] ?? null;
}

function unquote(value) {
  return value?.replace(/^(?:"(.*)"|'(.*)')$/u, '$1$2') ?? null;
}

function skillName(contents) {
  const frontmatter = skillFrontmatter(contents);
  const value = frontmatter?.match(/^name:\s*(.+?)\s*$/mu)?.[1];
  return unquote(value);
}

export function skillIdentity(file) {
  const contents = fs.readFileSync(file, 'utf8');
  const frontmatter = skillFrontmatter(contents);
  const revision = frontmatter?.match(/^\s{2}revision:\s*(.+?)\s*$/mu)?.[1];
  return { name: skillName(contents), revision: unquote(revision), source: path.resolve(file) };
}

export function repositorySkills(repositoryRoot) {
  const root = path.join(repositoryRoot, '.agents', 'skills');
  if (!fs.existsSync(root)) return [];
  const files = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(candidate);
      else if (entry.isFile() && entry.name === 'SKILL.md') files.push(candidate);
    }
  }
  return files.map((file) => ({ name: skillName(fs.readFileSync(file, 'utf8')), file: path.resolve(file) }));
}

export function assertRepositorySkillAuthority(repositoryRoot, authority = HARNESS_CONTRACT.authority) {
  const root = fs.realpathSync.native(repositoryRoot);
  const skills = repositorySkills(root);
  const genericCollisions = skills.filter((skill) => skill.name === authority.genericSkill.name);
  if (genericCollisions.length) {
    throw failure('HARNESS_CONTRACT_MISMATCH', `repository skill collides with the user-scoped generic skill ${authority.genericSkill.name}: ${genericCollisions.map((skill) => skill.file).join(', ')}`);
  }
  const expectedAdapter = path.resolve(root, authority.repositoryGuidance.path);
  const adapters = skills.filter((skill) => skill.name === authority.repositoryGuidance.name);
  if (adapters.length !== 1 || adapters[0].file !== expectedAdapter) {
    throw failure('HARNESS_CONTRACT_MISMATCH', `repository guidance must be exactly ${authority.repositoryGuidance.name} at ${expectedAdapter}`);
  }
  return { authoritativeCheckoutRoot: root, genericSkill: authority.genericSkill, repositoryGuidance: { ...authority.repositoryGuidance, source: expectedAdapter } };
}

function stringsIn(value, strings = []) {
  if (typeof value === 'string') strings.push(value);
  else if (Array.isArray(value)) for (const item of value) stringsIn(item, strings);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) stringsIn(item, strings);
  return strings;
}

export function skillSourcesFromPromptInput(promptInput, name) {
  const prefix = `- ${name}:`;
  const sources = [];
  for (const text of stringsIn(promptInput)) {
    for (const line of text.split(/\r?\n/u)) {
      if (!line.startsWith(prefix)) continue;
      const source = line.match(/\(file:\s*(.+?)\)$/u)?.[1];
      if (source) sources.push(path.resolve(source));
    }
  }
  return [...new Set(sources)];
}

export function assertActiveGenericSkill(sources, repositoryRoot, expected = HARNESS_CONTRACT.authority.genericSkill) {
  if (sources.length !== 1) throw failure('HARNESS_CONTRACT_MISMATCH', `expected one active generic skill, found ${sources.length}: ${sources.join(', ')}`);
  const identity = skillIdentity(sources[0]);
  if (identity.name !== expected.name || identity.revision !== expected.revision) {
    throw failure('HARNESS_CONTRACT_MISMATCH', `active generic skill identity/revision mismatch at ${identity.source}`);
  }
  const relative = path.relative(fs.realpathSync.native(repositoryRoot), identity.source);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw failure('HARNESS_CONTRACT_MISMATCH', `generic skill must be user-scoped outside the repository: ${identity.source}`);
  }
  return { ...expected, source: identity.source };
}

export function selectedExecutionBoundary(repositoryRoot, toolName, contract = HARNESS_CONTRACT) {
  if (!toolName) return null;
  const tool = contract.tools[toolName];
  if (!tool) throw failure('TOOL_UNSUPPORTED', `unsupported authority-report tool: ${toolName}`);
  return {
    tool: toolName,
    authoritativeCheckoutRoot: fs.realpathSync.native(repositoryRoot),
    sourceAuthority: contract.authority.sourceAuthority,
    runtime: tool.runtime,
    sourceMode: tool.sourceMode,
    ...(tool.runtime === 'wsl' ? { wslRole: contract.authority.wsl.role, wslSourcePolicy: contract.authority.wsl.sourcePolicy } : {}),
  };
}

export function repositoryAuthorityReport(repositoryRoot, toolName) {
  const authority = assertRepositorySkillAuthority(repositoryRoot);
  return {
    ...authority,
    harness: {
      name: HARNESS_CONTRACT.name,
      version: HARNESS_CONTRACT.version,
      protocolVersion: HARNESS_CONTRACT.protocolVersion,
      dependencyCacheProtocolVersion: HARNESS_CONTRACT.dependencyCacheProtocolVersion,
      grammar: HARNESS_CONTRACT.grammar,
    },
    selectedExecutionBoundary: selectedExecutionBoundary(repositoryRoot, toolName),
  };
}

export function actualSkillAuthorityReport(repositoryRoot, toolName, options = {}) {
  const report = repositoryAuthorityReport(repositoryRoot, toolName);
  const installedCodexEntrypoint = process.platform === 'win32' && process.env.APPDATA
    ? path.join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
    : null;
  const command = options.codexCommand ?? (installedCodexEntrypoint && fs.existsSync(installedCodexEntrypoint) ? process.execPath : 'codex');
  const commandArguments = options.codexArguments ?? (command === process.execPath ? [installedCodexEntrypoint] : []);
  const result = spawnSync(command, [...commandArguments, 'debug', 'prompt-input', 'skill authority probe'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw failure('HARNESS_CONTRACT_MISMATCH', `Codex skill discovery failed: ${(result.stderr || result.error?.message || `exit ${result.status}`).trim()}`);
  let promptInput;
  try { promptInput = JSON.parse(result.stdout); }
  catch (error) { throw failure('HARNESS_CONTRACT_MISMATCH', `Codex skill discovery returned invalid JSON: ${error.message}`); }
  const genericSources = skillSourcesFromPromptInput(promptInput, HARNESS_CONTRACT.authority.genericSkill.name);
  const adapterSources = skillSourcesFromPromptInput(promptInput, HARNESS_CONTRACT.authority.repositoryGuidance.name);
  if (adapterSources.length !== 1 || adapterSources[0] !== report.repositoryGuidance.source) throw failure('HARNESS_CONTRACT_MISMATCH', `Codex did not resolve the expected repository guidance: ${adapterSources.join(', ')}`);
  return { ...report, activeGenericSkill: assertActiveGenericSkill(genericSources, report.authoritativeCheckoutRoot) };
}

async function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const toolIndex = process.argv.indexOf('--tool');
  if (toolIndex !== -1 && !process.argv[toolIndex + 1]) throw failure('HARNESS_CONTRACT_MISMATCH', '--tool requires a tool name');
  const toolName = toolIndex === -1 ? null : process.argv[toolIndex + 1];
  process.stdout.write(`${JSON.stringify(actualSkillAuthorityReport(repositoryRoot, toolName), null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (error) {
    process.stderr.write(`HARNESS_FAILURE ${error.code ?? 'HARNESS_CONTRACT_MISMATCH'}\n${error.message}\n`);
    process.exit(2);
  }
}
