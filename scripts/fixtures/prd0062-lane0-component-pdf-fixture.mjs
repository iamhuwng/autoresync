import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const PRD0062_LANE0_COMPONENT_PDF_ROOT = 'prd0062-lane0-component-pdf';
export const PRD0062_LANE0_COMPONENT_PDF_COUNT = 2;

const LOCAL_ENVIRONMENTS = new Set(['local', 'test']);
const COMPONENTS = Object.freeze([
  Object.freeze({ key: 'component-a', order: 1, label: 'Component A' }),
  Object.freeze({ key: 'component-b', order: 2, label: 'Component B' }),
]);
const CASE_ID = /^AC-[A-Z]{2}-\d{3}$/u;

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const normalized = (value) => path.resolve(value).replace(/[\\/]+$/u, '');
const isWithin = (parent, candidate) => {
  const relative = path.relative(normalized(parent), normalized(candidate));
  return relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
};

const assertNoTraversalSegments = (value) => {
  const segments = String(value).split(/[\\/]+/u);
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error('prd0062_lane0_fixture_path_traversal_denied');
  }
};

const assertNoReparsePath = async (target) => {
  const resolved = normalized(target);
  let current = resolved;
  const existing = [];
  while (true) {
    try {
      await fs.lstat(current);
      existing.push(current);
      break;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  while (existing.length > 0) {
    const candidate = existing.pop();
    const stats = await fs.lstat(candidate);
    if (stats.isSymbolicLink()) {
      throw new Error('prd0062_lane0_fixture_reparse_traversal_denied');
    }
    await fs.realpath(candidate);
  }
};

const assertLocalOnly = async (root, environment) => {
  if (!LOCAL_ENVIRONMENTS.has(environment)) {
    throw new Error('prd0062_lane0_fixture_local_only_required');
  }
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    throw new Error('prd0062_lane0_fixture_root_invalid');
  }
  assertNoTraversalSegments(root);
  const resolved = normalized(root);
  const temp = normalized(os.tmpdir());
  if (!isWithin(temp, resolved) || path.basename(resolved) !== PRD0062_LANE0_COMPONENT_PDF_ROOT) {
    throw new Error('prd0062_lane0_fixture_root_not_allowlisted');
  }
  await assertNoReparsePath(path.dirname(resolved));
  await assertNoReparsePath(resolved);
  return resolved;
};

const fixtureDirectory = (root, fixtureId) => path.join(root, fixtureId);
const componentDirectory = (root, fixtureId) => path.join(fixtureDirectory(root, fixtureId), 'components');

const pdfBytes = (sourceVersionId, label) => Buffer.from(
  `%PDF-1.4\n% PRD0062 Lane 0 disposable component\n`
  + '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  + '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'
  + '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n'
  + `% ${label} ${sourceVersionId}\n%%EOF\n`,
  'utf8',
);

const freezeFixture = (fixture) => Object.freeze({
  ...fixture,
  components: Object.freeze(fixture.components.map((component) => Object.freeze(component))),
});

const validateInput = (input) => {
  const caseId = input?.caseId;
  if (!CASE_ID.test(caseId ?? '')) throw new Error('prd0062_lane0_fixture_case_id_invalid');
  return caseId;
};

const manifestForCase = (caseId) => {
  const seed = `prd0062-lane0-component-pdf:${caseId}:v1`;
  const components = COMPONENTS.map((component) => {
    const sourceVersionId = `source-${digest(`${seed}:${component.key}`).slice(0, 24)}`;
    const bytes = pdfBytes(sourceVersionId, component.label);
    return {
      sourceKey: component.key,
      sourceVersionId,
      sourceOrder: component.order,
      fileName: `${String(component.order).padStart(2, '0')}-${component.key}.pdf`,
      relativePath: `components/${String(component.order).padStart(2, '0')}-${component.key}.pdf`,
      checksum: digest(bytes),
      byteSize: bytes.byteLength,
      physicalPageCount: 1,
    };
  });
  return {
    schemaVersion: 1,
    kind: 'prd0062-lane0-component-pdf-fixture',
    seed,
    caseId,
    fixtureId: `fixture-${digest(seed).slice(0, 24)}`,
    allowlistedRoot: PRD0062_LANE0_COMPONENT_PDF_ROOT,
    cleanupRoot: `${PRD0062_LANE0_COMPONENT_PDF_ROOT}/fixture-${digest(seed).slice(0, 24)}`,
    componentPdfCount: PRD0062_LANE0_COMPONENT_PDF_COUNT,
    components,
  };
};

const componentBytes = (component) => pdfBytes(
  component.sourceVersionId,
  COMPONENTS[component.sourceOrder - 1].label,
);

export const createPrd0062Lane0ComponentPdfFixture = async ({
  root,
  caseId = 'AC-LN-001',
  environment = process.env.NODE_ENV ?? 'test',
} = {}) => {
  const resolvedRoot = await assertLocalOnly(root, environment);
  const validCaseId = validateInput({ caseId });
  const fixture = freezeFixture(manifestForCase(validCaseId));
  const directory = fixtureDirectory(resolvedRoot, fixture.fixtureId);
  const componentsPath = componentDirectory(resolvedRoot, fixture.fixtureId);
  try {
    await assertNoReparseTree(directory);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(componentsPath, { recursive: true });
  await assertNoReparsePath(directory);
  await assertNoReparsePath(componentsPath);
  for (const component of fixture.components) {
    const target = path.join(resolvedRoot, fixture.fixtureId, component.relativePath);
    await fs.writeFile(target, componentBytes(component), { flag: 'wx' });
  }
  return fixture;
};

const assertFixtureShape = (fixture) => {
  if (!fixture || !CASE_ID.test(fixture.caseId ?? '')) {
    throw new Error('prd0062_lane0_fixture_shape_invalid');
  }
  const expected = manifestForCase(fixture.caseId);
  if (!isDeepStrictEqual(fixture, expected)) throw new Error('prd0062_lane0_fixture_shape_invalid');
  return expected;
};

export const validatePrd0062Lane0ComponentPdfFixture = async ({
  root,
  fixture,
  environment = process.env.NODE_ENV ?? 'test',
} = {}) => {
  const resolvedRoot = await assertLocalOnly(root, environment);
  assertFixtureShape(fixture);
  const directory = fixtureDirectory(resolvedRoot, fixture.fixtureId);
  const componentsPath = componentDirectory(resolvedRoot, fixture.fixtureId);
  await assertNoReparseTree(directory);
  const entries = await fs.readdir(componentsPath, { withFileTypes: true });
  if (entries.length !== PRD0062_LANE0_COMPONENT_PDF_COUNT
    || entries.some((entry) => !entry.isFile())) {
    throw new Error('prd0062_lane0_fixture_component_count_invalid');
  }
  for (const component of fixture.components) {
    const target = path.join(resolvedRoot, fixture.fixtureId, component.relativePath);
    await assertNoReparsePath(target);
    const bytes = await fs.readFile(target);
    if (bytes.toString('utf8', 0, 8) !== '%PDF-1.4'
      || !bytes.includes(Buffer.from('/Count 1'))
      || bytes.byteLength !== component.byteSize
      || digest(bytes) !== component.checksum
      || !bytes.equals(componentBytes(component))) {
      throw new Error('prd0062_lane0_fixture_component_integrity_invalid');
    }
  }
  return Object.freeze({ valid: true, fixtureId: fixture.fixtureId, componentPdfCount: entries.length });
};

const assertNoReparseTree = async (directory) => {
  const stats = await fs.lstat(directory);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error('prd0062_lane0_fixture_reparse_traversal_denied');
  }
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(directory, entry.name);
    await assertNoReparsePath(child);
    if (entry.isDirectory()) await assertNoReparseTree(child);
  }
};

export const cleanupPrd0062Lane0ComponentPdfFixture = async ({
  root,
  fixture,
  mode = 'dry-run',
  environment = process.env.NODE_ENV ?? 'test',
} = {}) => {
  const resolvedRoot = await assertLocalOnly(root, environment);
  assertFixtureShape(fixture);
  if (!['apply', 'dry-run'].includes(mode)) throw new Error('prd0062_lane0_fixture_cleanup_mode_invalid');
  const directory = fixtureDirectory(resolvedRoot, fixture.fixtureId);
  const parent = path.dirname(resolvedRoot);
  if (mode === 'dry-run') {
    try {
      await assertNoReparseTree(directory);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return Object.freeze({
          mode,
          target: directory,
          alreadyAbsent: true,
          preservedRoot: resolvedRoot,
          preservedParent: parent,
        });
      }
      throw error;
    }
    return Object.freeze({ mode, target: directory, alreadyAbsent: false, preservedRoot: resolvedRoot, preservedParent: parent });
  }
  try {
    await assertNoReparseTree(directory);
    await fs.rm(directory, { recursive: true, force: false });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  try {
    await fs.lstat(directory);
    throw new Error('prd0062_lane0_fixture_cleanup_absence_invalid');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const rootStats = await fs.lstat(resolvedRoot);
  const parentStats = await fs.lstat(parent);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()
    || !parentStats.isDirectory() || parentStats.isSymbolicLink()) {
    throw new Error('prd0062_lane0_fixture_cleanup_preservation_invalid');
  }
  return Object.freeze({
    mode,
    target: directory,
    absent: true,
    preservedRoot: resolvedRoot,
    preservedParent: parent,
  });
};
