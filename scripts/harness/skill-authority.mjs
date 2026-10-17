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

export function repositorySkillCollisions(repositoryRoot, name = 'run-windows-arm64-tools') {
  return repositorySkills(fs.realpathSync.native(repositoryRoot)).filter((skill) => skill.name === name);
}

function stringsIn(value, strings = []) {
  if (typeof value === 'string') strings.push(value);
  else if (Array.isArray(value)) for (const item of value) stringsIn(item, strings);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) stringsIn(item, strings);
  return strings;
}

export function skillSourcesFromPromptInput(promptInput, name) {
  const prefix = `- ${name}:`;
  const { strings, aliases } = promptSkillContext(promptInput);
  const sources = new Set();
  for (const text of strings) {
    for (const line of text.split(/\r?\n/u)) {
      if (!line.startsWith(prefix)) continue;
      const source = line.match(/\(file:\s*(.+?)\)$/u)?.[1];
      if (!source) continue;
      if (path.isAbsolute(source)) sources.add(path.resolve(source));
      else {
        const alias = source.match(/^([^/\\]+)[/\\](.+)$/u);
        if (alias && aliases.has(alias[1])) sources.add(path.resolve(aliases.get(alias[1]), alias[2]));
      }
    }
  }
  return [...sources];
}

function promptSkillContext(promptInput) {
  const strings = stringsIn(promptInput);
  const aliases = new Map();
  for (const text of strings) {
    for (const line of text.split(/\r?\n/u)) {
      const match = line.match(/^\s*-\s+`([^`]+)`\s*=\s*`([^`]+)`\s*$/u);
      if (match && path.isAbsolute(match[2])) aliases.set(match[1], match[2]);
    }
  }
  return { strings, aliases };
}

function skillEntriesFromPromptInput(promptInput) {
  const { strings, aliases } = promptSkillContext(promptInput);
  const entries = new Map();
  for (const text of strings) {
    for (const line of text.split(/\r?\n/u)) {
      const match = line.match(/^- (.+?): .*?\(file:\s*(.+?)\)$/u);
      if (!match) continue;
      const [, name, advertisedSource] = match;
      let source = null;
      if (path.isAbsolute(advertisedSource)) source = path.resolve(advertisedSource);
      else {
        const alias = advertisedSource.match(/^([^/\\]+)[/\\](.+)$/u);
        if (alias && aliases.has(alias[1])) source = path.resolve(aliases.get(alias[1]), alias[2]);
      }
      const key = `${name}\0${source ?? advertisedSource}`;
      entries.set(key, { name, advertisedSource, source });
    }
  }
  return [...entries.values()];
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
    auditSourceMode: tool.auditSourceMode,
  };
}

export function repositoryAuthorityReport(repositoryRoot, toolName) {
  const authoritativeCheckoutRoot = fs.realpathSync.native(repositoryRoot);
  return {
    authoritativeCheckoutRoot,
    repositorySkillCollisions: repositorySkillCollisions(authoritativeCheckoutRoot),
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
  if (result.status !== 0) {
    return { ...report, skillDiscovery: { available: false, error: (result.stderr || result.error?.message || `exit ${result.status}`).trim() } };
  }
  let promptInput;
  try { promptInput = JSON.parse(result.stdout); }
  catch (error) {
    return { ...report, skillDiscovery: { available: false, error: `invalid JSON: ${error.message}` } };
  }
  const genericSkillName = HARNESS_CONTRACT.authority.genericSkill?.name ?? 'run-windows-arm64-tools';
  const discovered = skillEntriesFromPromptInput(promptInput);
  return {
    ...report,
    skillDiscovery: {
      available: true,
      policy: 'informational',
      genericSkillName,
      discovered: discovered.map(({ name, advertisedSource, source }) => {
        if (!source) return { name, advertisedSource, readable: false };
        try {
          const identity = skillIdentity(source);
          const relative = path.relative(report.authoritativeCheckoutRoot, identity.source);
          const repositoryScoped = relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
          return { ...identity, repositoryScoped };
        }
        catch { return { name, advertisedSource, source, readable: false }; }
      }),
    },
  };
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
