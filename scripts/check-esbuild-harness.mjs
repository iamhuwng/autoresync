import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const repoPackageJson = path.join(repoRoot, 'package.json');
const requireFromRepo = createRequire(repoPackageJson);
const failures = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isWithin(rootPath, candidatePath) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath));
}

function resolvePackage(packageName) {
  try {
    return requireFromRepo.resolve(`${packageName}/package.json`);
  } catch (error) {
    failures.push(`Cannot resolve ${packageName}/package.json from ${repoRoot}: ${error.code ?? error.message}`);
    return null;
  }
}

function addFailure(message) {
  failures.push(message);
}

if (!fs.existsSync(repoPackageJson)) {
  addFailure(`Repository package.json is missing: ${repoPackageJson}`);
}

const hostPackagePath = resolvePackage('esbuild');
const hostPackage = hostPackagePath ? readJson(hostPackagePath) : null;
const nativePackageName = `@esbuild/${process.platform}-${process.arch}`;
const nativePackagePath = resolvePackage(nativePackageName);
const nativePackage = nativePackagePath ? readJson(nativePackagePath) : null;
const expectedNodeModules = path.join(repoRoot, 'node_modules');
const expectedBinaryName = process.platform === 'win32' ? 'esbuild.exe' : 'esbuild';
const expectedBinaryPath = nativePackagePath
  ? path.join(path.dirname(nativePackagePath), expectedBinaryName)
  : null;
const configuredBinaryPath = process.env.ESBUILD_BINARY_PATH || null;

if (hostPackagePath && !isWithin(repoRoot, hostPackagePath)) {
  addFailure(`esbuild JavaScript package resolves outside this repository: ${hostPackagePath}`);
}

if (nativePackagePath && !isWithin(repoRoot, nativePackagePath)) {
  addFailure(`${nativePackageName} resolves outside this repository: ${nativePackagePath}`);
}

if (hostPackage && nativePackage && hostPackage.version !== nativePackage.version) {
  addFailure(`esbuild host/native version mismatch: host ${hostPackage.version}; native package ${nativePackage.version}`);
}

if (nativePackage && !nativePackage.os?.includes(process.platform)) {
  addFailure(`${nativePackageName} declares OS ${JSON.stringify(nativePackage.os)} but Node platform is ${process.platform}`);
}

if (nativePackage && !nativePackage.cpu?.includes(process.arch)) {
  addFailure(`${nativePackageName} declares CPU ${JSON.stringify(nativePackage.cpu)} but Node architecture is ${process.arch}`);
}

if (configuredBinaryPath) {
  const configuredResolvedPath = path.resolve(configuredBinaryPath);
  if (!expectedBinaryPath || configuredResolvedPath.toLowerCase() !== path.resolve(expectedBinaryPath).toLowerCase()) {
    addFailure(`ESBUILD_BINARY_PATH overrides the repository native binary: ${configuredBinaryPath}`);
  }
}

let nativeBinaryVersion = null;
if (expectedBinaryPath && fs.existsSync(expectedBinaryPath)) {
  const binaryResult = spawnSync(expectedBinaryPath, ['--version'], { encoding: 'utf8', windowsHide: true });
  if (binaryResult.error) {
    addFailure(`Cannot execute native esbuild binary ${expectedBinaryPath}: ${binaryResult.error.message}`);
  } else if (binaryResult.status !== 0) {
    addFailure(`Native esbuild binary failed --version (${binaryResult.status}): ${(binaryResult.stderr || binaryResult.stdout).trim()}`);
  } else {
    nativeBinaryVersion = binaryResult.stdout.trim();
    if (hostPackage && nativeBinaryVersion !== hostPackage.version) {
      addFailure(`esbuild host/native binary version mismatch: host ${hostPackage.version}; binary ${nativeBinaryVersion}`);
    }
  }
} else {
  addFailure(`Native esbuild binary is missing: ${expectedBinaryPath ?? path.join(expectedNodeModules, nativePackageName, expectedBinaryName)}`);
}

let handshake = 'not-run';
if (failures.length === 0) {
  try {
    const esbuild = requireFromRepo('esbuild');
    if (hostPackage && esbuild.version !== hostPackage.version) {
      addFailure(`Loaded esbuild host version differs from package.json: loaded ${esbuild.version}; package ${hostPackage.version}`);
    }
    esbuild.transformSync('const harnessCheck = 1', { loader: 'js' });
    handshake = 'ok';
  } catch (error) {
    addFailure(`esbuild host/native handshake failed: ${error.message}`);
    handshake = 'failed';
  }
}

const report = {
  repoRoot,
  node: {
    version: process.version,
    platform: process.platform,
    architecture: process.arch,
    executable: process.execPath,
  },
  expectedNodeModules,
  esbuild: {
    hostPackage: hostPackagePath,
    hostVersion: hostPackage?.version ?? null,
    nativePackage: nativePackagePath,
    nativePackageName,
    nativePackageVersion: nativePackage?.version ?? null,
    nativePackageOS: nativePackage?.os ?? null,
    nativePackageCPU: nativePackage?.cpu ?? null,
    nativeBinary: expectedBinaryPath,
    nativeBinaryVersion,
    configuredBinaryPath,
    handshake,
  },
  status: failures.length === 0 ? 'ok' : 'failed',
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;
