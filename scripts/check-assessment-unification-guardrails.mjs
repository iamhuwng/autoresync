#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SOURCE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const ASSESSMENT_PRODUCTION_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);
const FINDINGS_PATH = 'tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md';

const SHARED_BOUNDARY_ROOTS = 'components\\/reading-v2|services\\/reading-v2|skills\\/listening|services\\/listeningTestStorage|services\\/r2Storage|hooks\\/audio|hooks\\/monitor';
const LISTENING_READING_ROOTS = 'components\\/reading-v2|services\\/reading-v2|reading-v2';
const LISTENING_CYCLE_ROOTS = 'skills\\/listening\\/builders\\/ListeningTestBuilder|services\\/listeningTestStorage|services\\/r2Storage';

const SHARED_AUTHORITY_SYMBOLS = new Set([
  'audioCommand',
  'audioSections',
  'masterAudioState',
  'teacherSessionState',
  'hasAudio',
  'isReading',
  'isListening',
  'isLiveSession',
  'AudioPlayer',
  'ListeningTestPage',
  'ListeningPracticeView',
  'ReadingV2RuntimeShell',
  'useMasterAudioState',
  'useAudioSync',
  'useMonitorControls',
  'parser',
  'storage',
  'storagePath',
  'publishPayload',
  'publishedPayload',
  'published-payload',
]);

const LINE_BUDGET_EXCLUDED_PATH_PATTERNS = [
  /(?:^|\/)__fixtures__(?:\/|$)/,
  /(?:^|\/)fixtures(?:\/|$)/,
  /\.generated\./,
];

const GENERATED_HEADER_PATTERN = /^\s*(?:\/\/|\/\*+|<!--|#)\s*(?:@?generated\b|auto-generated\b|do not edit\b)/i;
const GENERATED_HEADER_WINDOW = 8;

const PLACEHOLDER_BUDGET_TEXT_PATTERN = /\b(?:TBD|TODO|placeholder|n\/a|none|unknown|misc(?:ellaneous)?|various|general|generic|as-is|for now)\b/i;
const GENERIC_BUDGET_TEXT_PATTERN = /\b(?:shared logic|assessment work|helper one|helper two|not good enough|also not good enough)\b/i;
const GIT_BASE_REF_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._/-]*$/;
const GIT_COMMIT_PATTERN = /^[0-9a-fA-F]{6,40}$/;

const PROTECTED_PATH_PATTERNS = [
  /^cloudflare\//,
  /^firebase\.(json|rc)$/,
  /^\.firebaserc$/,
  /^storage\.rules$/,
  /^database\.rules\.json$/,
  /^firestore\.rules$/,
  /^src\/services\/r2Storage\.ts$/,
  /^src\/services\/listeningTestStorage\.ts$/,
  /^src\/services\/reading-v2\//,
  /^src\/components\/reading-v2\/runtime\//,
  /^src\/skills\/listening\/components\/(?:AudioPlayer|ListeningTestPage)\.tsx$/,
  /^src\/components\/practice\/ListeningPracticeView\.tsx$/,
  /^src\/components\/test\/AudioProgressPanel\.tsx$/,
  /^src\/pages\/TeacherTestMonitorPage\.tsx$/,
  /^src\/hooks\/audio\//,
  /^src\/hooks\/monitor\/useMonitorControls\.tsx?$/,
  /^r2-backup-worker\//,
];

const ASSESSMENT_PRODUCTION_PATH_PATTERNS = [
  /^src\/features\/assessment\/shared\//,
  /^src\/features\/assessment\/listening\//,
  /^src\/components\/reading-v2\/studio\//,
  /^src\/skills\/listening\/builders\//,
];

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function toAbsolutePath(repoRoot, relativePath) {
  return path.join(repoRoot, ...normalizePath(relativePath).split('/'));
}

function readUtf8(filePath) {
  return readFileSync(filePath, 'utf8');
}

function isProductionSourceFile(filePath) {
  const normalized = normalizePath(filePath);
  return SOURCE_FILE_EXTENSIONS.has(path.extname(normalized))
    && !/\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs)$/.test(normalized);
}

function isSharedBoundaryFile(filePath) {
  const normalized = normalizePath(filePath);
  return ASSESSMENT_PRODUCTION_EXTENSIONS.has(path.extname(normalized))
    && !/\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs)$/.test(normalized);
}

function listFiles(repoRoot, relativeDir, predicate) {
  const absoluteDir = toAbsolutePath(repoRoot, relativeDir);
  if (!existsSync(absoluteDir)) {
    return [];
  }

  const files = [];
  const stack = [absoluteDir];

  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = normalizePath(path.relative(repoRoot, absolutePath));
      if (predicate(relativePath)) {
        files.push(relativePath);
      }
    }
  }

  return files.sort();
}

function listSourceFiles(repoRoot, relativeDir) {
  return listFiles(repoRoot, relativeDir, isProductionSourceFile);
}

function scriptKindFor(file) {
  const extension = path.extname(file);
  if (extension === '.tsx') {
    return ts.ScriptKind.TSX;
  }
  if (extension === '.ts') {
    return ts.ScriptKind.TS;
  }
  if (extension === '.jsx') {
    return ts.ScriptKind.JSX;
  }
  return ts.ScriptKind.JS;
}

function walkAst(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => {
    walkAst(child, visit);
  });
}

function stringValue(node) {
  if (node && ts.isLiteralTypeNode(node)) {
    return stringValue(node.literal);
  }
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
    return node.text;
  }
  return undefined;
}

function isAuthorityLiteralContext(node) {
  const parent = node.parent;
  if (!parent) {
    return false;
  }

  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) {
    return true;
  }

  if (
    (ts.isPropertyAssignment(parent)
      || ts.isPropertySignature(parent)
      || ts.isPropertyDeclaration(parent)
      || ts.isMethodDeclaration(parent)
      || ts.isGetAccessorDeclaration(parent)
      || ts.isSetAccessorDeclaration(parent)
      || ts.isBindingElement(parent))
    && parent.name !== undefined
    && parent.name === node
  ) {
    return true;
  }

  if (ts.isBindingElement(parent) && parent.propertyName === node) {
    return true;
  }

  if (ts.isComputedPropertyName(parent) && parent.expression === node) {
    return true;
  }

  return false;
}

function moduleSpecifierFromNode(node) {
  if (
    ts.isImportDeclaration(node)
    || ts.isExportDeclaration(node)
  ) {
    return stringValue(node.moduleSpecifier);
  }
  if (ts.isImportTypeNode(node)) {
    return stringValue(node.argument);
  }
  if (ts.isCallExpression(node)) {
    const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
    const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
    if (isDynamicImport || isRequire) {
      return stringValue(node.arguments[0]);
    }
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return stringValue(node.moduleReference.expression);
  }
  return undefined;
}

function isNonLiteralModuleSpecifier(node) {
  if (!ts.isCallExpression(node)) {
    return false;
  }

  const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
  const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
  if (!isDynamicImport && !isRequire) {
    return false;
  }

  return node.arguments.length === 0 || stringValue(node.arguments[0]) === undefined;
}

function parseSourceFile(repoRoot, file) {
  const absolutePath = toAbsolutePath(repoRoot, file);
  const content = readUtf8(absolutePath);
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(file),
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    const diagnostic = sourceFile.parseDiagnostics[0];
    const error = new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    if (typeof diagnostic.start === 'number') {
      error.scanLine = sourceFile.getLineAndCharacterOfPosition(diagnostic.start).line + 1;
    }
    throw error;
  }
  return sourceFile;
}

function sourceLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function sourceScanError(file, error) {
  return {
    rule: 'source-scan-error',
    file,
    line: error.scanLine ?? 1,
    message: `Unable to read or parse scanned production source: ${error.message}`,
  };
}

function scanImports(repoRoot, files, rootAlternatives, rule, message, options = {}) {
  const rootPattern = new RegExp(`(?:${rootAlternatives})`);
  const violations = [];
  const failOnNonLiteralModuleSpecifiers = options.failOnNonLiteralModuleSpecifiers ?? true;

  for (const file of files) {
    try {
      const sourceFile = parseSourceFile(repoRoot, file);
      walkAst(sourceFile, (node) => {
        if (failOnNonLiteralModuleSpecifiers && isNonLiteralModuleSpecifier(node)) {
          violations.push({
            rule,
            file,
            line: sourceLine(sourceFile, node),
            message: 'Scanned production code must use a string-literal module specifier for dynamic import() and require() because dependency target cannot be proven structurally.',
          });
          return;
        }

        const specifier = moduleSpecifierFromNode(node);
        if (specifier && rootPattern.test(specifier)) {
          violations.push({
            rule,
            file,
            line: sourceLine(sourceFile, node),
            message,
          });
        }
      });
    } catch (error) {
      violations.push(sourceScanError(file, error));
    }
  }

  return violations;
}

function scanAuthoritySymbols(repoRoot, files) {
  const violations = [];

  for (const file of files) {
    try {
      const sourceFile = parseSourceFile(repoRoot, file);
      walkAst(sourceFile, (node) => {
        let symbol;

        if (ts.isIdentifier(node)) {
          symbol = node.text;
        } else if (isAuthorityLiteralContext(node)) {
          symbol = stringValue(node);
        }

        if (!SHARED_AUTHORITY_SYMBOLS.has(symbol)) {
          return;
        }
        violations.push({
          rule: 'shared-boundary',
          file,
          line: sourceLine(sourceFile, node),
          message: `Neutral shared assessment code contains prohibited authority symbol: ${symbol}`,
        });
      });
    } catch (error) {
      if (!violations.some((violation) => violation.file === file && violation.rule === 'source-scan-error')) {
        violations.push(sourceScanError(file, error));
      }
    }
  }

  return violations;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskCssBlock(value) {
  return value.replace(/[^\r\n]/g, ' ');
}

function stripCssComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, (match) => maskCssBlock(match));
}

function stripCssQuotedText(content) {
  let result = '';
  let index = 0;

  while (index < content.length) {
    const char = content[index];
    if (char !== '\'' && char !== '"') {
      result += char;
      index += 1;
      continue;
    }

    const quote = char;
    result += ' ';
    index += 1;
    while (index < content.length) {
      const inner = content[index];
      if (inner === '\\') {
        result += ' ';
        if (index + 1 < content.length) {
          result += content[index + 1] === '\n' ? '\n' : ' ';
          index += 2;
          continue;
        }
      }

      if (inner === quote) {
        result += ' ';
        index += 1;
        break;
      }

      result += inner === '\n' ? '\n' : ' ';
      index += 1;
    }
  }

  return result;
}

function lineNumberForIndex(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function scanCssAuthoritySelectors(file, content, strippedContent, violations) {
  const selectorRegex = /([^{}]+)\{/g;
  let match;

  while ((match = selectorRegex.exec(strippedContent)) !== null) {
    const selectorText = match[1];
    const selectorStart = match.index;
    for (const symbol of SHARED_AUTHORITY_SYMBOLS) {
      const symbolRegex = new RegExp(`(^|[^A-Za-z0-9_-])(?:[.#])?${escapeRegExp(symbol)}(?=$|[^A-Za-z0-9_-])`, 'g');
      let symbolMatch;
      while ((symbolMatch = symbolRegex.exec(selectorText)) !== null) {
        const symbolIndex = selectorStart + symbolMatch.index + symbolMatch[1].length;
        violations.push({
          rule: 'shared-boundary',
          file,
          line: lineNumberForIndex(content, symbolIndex),
          message: `Neutral shared assessment CSS contains prohibited authority selector symbol: ${symbol}`,
        });
      }
    }
  }
}

function scanCssAuthorityDeclarations(file, content, strippedContent, violations) {
  const blockRegex = /\{([^{}]*)\}/g;
  let blockMatch;

  while ((blockMatch = blockRegex.exec(strippedContent)) !== null) {
    const declarations = blockMatch[1];
    const declarationStart = blockMatch.index + 1;
    const propertyRegex = /(--[A-Za-z0-9_-]+|[A-Za-z_][A-Za-z0-9_-]*)\s*:/g;
    let propertyMatch;

    while ((propertyMatch = propertyRegex.exec(declarations)) !== null) {
      const rawProperty = propertyMatch[1];
      const normalizedProperty = rawProperty.startsWith('--')
        ? rawProperty.slice(2)
        : rawProperty;
      if (!SHARED_AUTHORITY_SYMBOLS.has(normalizedProperty)) {
        continue;
      }

      violations.push({
        rule: 'shared-boundary',
        file,
        line: lineNumberForIndex(content, declarationStart + propertyMatch.index),
        message: rawProperty.startsWith('--')
          ? `Neutral shared assessment CSS contains prohibited authority custom property: ${normalizedProperty}`
          : `Neutral shared assessment CSS contains prohibited authority property: ${normalizedProperty}`,
      });
    }
  }
}

function scanSharedBoundaryCss(repoRoot, files) {
  const rootPattern = new RegExp(`(?:${SHARED_BOUNDARY_ROOTS})`);
  const violations = [];

  for (const file of files) {
    try {
      const content = readUtf8(toAbsolutePath(repoRoot, file));
      const commentStripped = stripCssComments(content);
      const stringStripped = stripCssQuotedText(commentStripped);
      const importRanges = [];

      const importRegex = /@import\s+(?:url\(\s*)?(?:'([^']+)'|"([^"]+)"|([^'")\s;]+))/gi;
      let importMatch;
      while ((importMatch = importRegex.exec(commentStripped)) !== null) {
        const specifier = importMatch[1] ?? importMatch[2] ?? importMatch[3];
        importRanges.push([importMatch.index, importRegex.lastIndex]);
        if (!specifier || !rootPattern.test(specifier)) {
          continue;
        }

        violations.push({
          rule: 'shared-boundary',
          file,
          line: lineNumberForIndex(content, importMatch.index),
          message: 'Neutral shared assessment CSS must not import Reading V2/Listening/runtime/storage internals via @import.',
        });
      }

      const urlRegex = /url\(\s*(?:'([^']+)'|"([^"]+)"|([^'")\s][^)]*?))\s*\)/gi;
      let urlMatch;
      while ((urlMatch = urlRegex.exec(commentStripped)) !== null) {
        if (importRanges.some(([start, end]) => urlMatch.index >= start && urlMatch.index < end)) {
          continue;
        }

        const specifier = (urlMatch[1] ?? urlMatch[2] ?? urlMatch[3] ?? '').trim();
        if (!specifier || !rootPattern.test(specifier)) {
          continue;
        }

        violations.push({
          rule: 'shared-boundary',
          file,
          line: lineNumberForIndex(content, urlMatch.index),
          message: 'Neutral shared assessment CSS must not reference Reading V2/Listening/runtime/storage internals via url().',
        });
      }

      scanCssAuthoritySelectors(file, content, stringStripped, violations);
      scanCssAuthorityDeclarations(file, content, stringStripped, violations);
    } catch (error) {
      violations.push(sourceScanError(file, error));
    }
  }

  return violations;
}

export function scanSharedBoundary(repoRoot = process.cwd()) {
  const files = listFiles(repoRoot, 'src/features/assessment/shared', isSharedBoundaryFile);
  const sourceFiles = files.filter((file) => SOURCE_FILE_EXTENSIONS.has(path.extname(file)));
  const cssFiles = files.filter((file) => path.extname(file) === '.css');
  const importViolations = scanImports(
    repoRoot,
    sourceFiles,
    SHARED_BOUNDARY_ROOTS,
    'shared-boundary',
    'Neutral shared assessment code must not import Reading V2/Listening/runtime/storage internals.',
  );
  const parseErrorFiles = new Set(
    importViolations
      .filter((violation) => violation.rule === 'source-scan-error')
      .map((violation) => violation.file),
  );

    return [
      ...importViolations,
      ...scanAuthoritySymbols(
        repoRoot,
        sourceFiles.filter((file) => !parseErrorFiles.has(file)),
      ),
      ...scanSharedBoundaryCss(repoRoot, cssFiles),
    ];
}

export function scanListeningDirection(repoRoot = process.cwd()) {
  const futureFeatureFiles = listSourceFiles(repoRoot, 'src/features/assessment/listening');
  const currentBuilderFiles = listSourceFiles(repoRoot, 'src/skills/listening/builders');
  const currentDirectionViolations = scanImports(
    repoRoot,
    [...futureFeatureFiles, ...currentBuilderFiles],
    LISTENING_READING_ROOTS,
    'listening-direction',
    'Listening assessment feature code must not import Reading V2 internals.',
  );
  const parseErrorFiles = new Set(
    currentDirectionViolations
      .filter((violation) => violation.rule === 'source-scan-error')
      .map((violation) => violation.file),
  );

  return [
    ...currentDirectionViolations,
    ...scanImports(
      repoRoot,
      futureFeatureFiles.filter((file) => !parseErrorFiles.has(file)),
      LISTENING_CYCLE_ROOTS,
      'listening-direction',
      'Listening assessment feature code must not import cycle-prone dependency roots.',
      { failOnNonLiteralModuleSpecifiers: false },
    ),
  ];
}

function isAssessmentProductionFile(filePath) {
  const normalized = normalizePath(filePath);
  if (!ASSESSMENT_PRODUCTION_EXTENSIONS.has(path.extname(normalized))) {
    return false;
  }
  if (/\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/.test(normalized)) {
    return false;
  }
  return ASSESSMENT_PRODUCTION_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isNamedBudgetApprover(value) {
  const normalized = value.trim();
  const letters = normalized.match(/\p{L}/gu) ?? [];
  const compactLetters = letters.join('').toLowerCase();
  return normalized.length >= 3
    && letters.length >= 3
    && !PLACEHOLDER_BUDGET_TEXT_PATTERN.test(normalized)
    && !GENERIC_BUDGET_TEXT_PATTERN.test(normalized)
    && !/^(\p{L})\1+$/u.test(compactLetters);
}

function isReviewerRole(value) {
  const normalized = value.trim();
  const letters = normalized.match(/\p{L}/gu) ?? [];
  return normalized.length >= 8
    && letters.length >= 8
    && /\breviewer\b/i.test(normalized)
    && !/^\s*reviewer\s*$/i.test(normalized)
    && !PLACEHOLDER_BUDGET_TEXT_PATTERN.test(normalized)
    && !GENERIC_BUDGET_TEXT_PATTERN.test(normalized);
}

function hasLineBudgetPathExemption(filePath) {
  return LINE_BUDGET_EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(filePath));
}

function hasGeneratedHeaderNearFileStart(content) {
  return content
    .split(/\r?\n/)
    .slice(0, GENERATED_HEADER_WINDOW)
    .some((line) => GENERATED_HEADER_PATTERN.test(line));
}

function shouldSkipLineBudget(filePath, content) {
  return hasLineBudgetPathExemption(filePath) || hasGeneratedHeaderNearFileStart(content);
}

function parseBudgetExceptionBlocks(findings) {
  const exceptions = [];
  const blockPattern = /<!-- assessment-line-budget-exception\r?\n([\s\S]*?)\r?\n-->/g;
  let match;

  while ((match = blockPattern.exec(findings)) !== null) {
    const lines = match[1].split(/\r?\n/);
    const fields = {};
    let valid = true;

    for (const line of lines) {
      const fieldMatch = /^([a-z-]+): (.+)$/.exec(line);
      if (!fieldMatch || Object.hasOwn(fields, fieldMatch[1])) {
        valid = false;
        break;
      }
      fields[fieldMatch[1]] = fieldMatch[2].trim();
    }

    const expectedKeys = [
      'path',
      'line-count',
      'responsibilities',
      'split-alternatives',
      'rejection-reason',
      'approver',
      'approver-role',
      'status',
    ];
    const responsibilities = fields.responsibilities?.split(';').map((entry) => entry.trim()).filter(Boolean) ?? [];
    const splitAlternatives = fields['split-alternatives']?.split(';').map((entry) => entry.trim()).filter(Boolean) ?? [];
    const rejectionReasons = fields['rejection-reason']?.split(';').map((entry) => entry.trim()).filter(Boolean) ?? [];
    const rejectionEntries = rejectionReasons.map((entry) => {
      const rejectionMatch = /^(.+?) => (.+)$/.exec(entry);
      if (!rejectionMatch) {
        return undefined;
      }

      return {
        alternative: rejectionMatch[1].trim(),
        reason: rejectionMatch[2].trim(),
      };
    });
    const alternativeSet = new Set(splitAlternatives);
    const rejectionAlternativeSet = new Set(rejectionEntries.filter(Boolean).map((entry) => entry.alternative));
    const hasStructuredText = (value) => value.length >= 8
      && !PLACEHOLDER_BUDGET_TEXT_PATTERN.test(value)
      && !GENERIC_BUDGET_TEXT_PATTERN.test(value);
    const path = fields.path ? normalizePath(fields.path) : undefined;
    const lineCount = /^[1-9]\d*$/.test(fields['line-count'])
      ? Number(fields['line-count'])
      : undefined;

    if (
      !valid
      || Object.keys(fields).length !== expectedKeys.length
      || !expectedKeys.every((key) => Object.hasOwn(fields, key))
      || !/^[1-9]\d*$/.test(fields['line-count'])
      || responsibilities.length < 1
      || new Set(responsibilities).size !== responsibilities.length
      || responsibilities.some((entry) => !hasStructuredText(entry))
      || splitAlternatives.length < 2
      || new Set(splitAlternatives).size !== splitAlternatives.length
      || splitAlternatives.some((entry) => !hasStructuredText(entry))
      || rejectionReasons.length !== splitAlternatives.length
      || rejectionEntries.some((entry) => !entry || !hasStructuredText(entry.reason))
      || rejectionAlternativeSet.size !== splitAlternatives.length
      || alternativeSet.size !== splitAlternatives.length
      || splitAlternatives.some((entry) => !rejectionAlternativeSet.has(entry))
      || !isNamedBudgetApprover(fields.approver)
      || !isReviewerRole(fields['approver-role'])
      || fields.status !== 'approved'
    ) {
      exceptions.push({
        path,
        lineCount,
        structured: false,
      });
      continue;
    }

    exceptions.push({
      path,
      lineCount,
      structured: true,
    });
  }

  return exceptions;
}

function findingsHasBudgetJustification(repoRoot, relativePath, lineCount) {
  const findingsPath = toAbsolutePath(repoRoot, FINDINGS_PATH);
  if (!existsSync(findingsPath)) {
    return false;
  }

  const matchingExceptions = parseBudgetExceptionBlocks(readUtf8(findingsPath)).filter(
    (exception) => exception.path === normalizePath(relativePath),
  );

  if (matchingExceptions.length !== 1) {
    return false;
  }

  const [exception] = matchingExceptions;
  return exception.structured && exception.lineCount === lineCount;
}

function countLogicalLines(content) {
  if (content.length === 0) {
    return 0;
  }

  const normalized = content.replace(/\r\n/g, '\n');
  const withoutFinalNewline = normalized.endsWith('\n')
    ? normalized.slice(0, -1)
    : normalized;

  if (withoutFinalNewline.length === 0) {
    return 1;
  }

  return withoutFinalNewline.split('\n').length;
}

export function evaluateLineBudget(repoRoot = process.cwd(), changedFiles = []) {
  const violations = [];

  for (const file of changedFiles.map(normalizePath).filter(isAssessmentProductionFile)) {
    const absolutePath = toAbsolutePath(repoRoot, file);
    if (!existsSync(absolutePath)) {
      continue;
    }

    const content = readUtf8(absolutePath);
    if (shouldSkipLineBudget(file, content)) {
      continue;
    }

    const lineCount = countLogicalLines(content);
    if (lineCount <= 400) {
      continue;
    }

    if (!findingsHasBudgetJustification(repoRoot, file, lineCount)) {
      violations.push({
        rule: 'assessment-line-budget',
        file,
        line: lineCount,
        message: `${file} has ${lineCount} lines and needs exactly one approved findings block for the 400-line soft budget: assessment-line-budget-exception with path, line-count, responsibilities, split-alternatives, rejection-reason, approver, approver-role, and status.`,
      });
    }
  }

  return violations;
}

export function findProtectedPathChanges(changedFiles = []) {
  return changedFiles
    .map(normalizePath)
    .filter((file) => PROTECTED_PATH_PATTERNS.some((pattern) => pattern.test(file)));
}

function validateGitBaseRef(baseRef) {
  if (!baseRef || GIT_BASE_REF_PATTERN.test(baseRef)) {
    return;
  }

  throw new Error(`Invalid Git base ref for changed-file discovery: ${baseRef}`);
}

function validateGitCommit(commit) {
  if (!commit || /^0+$/.test(commit) || GIT_COMMIT_PATTERN.test(commit)) {
    return;
  }

  throw new Error(`Invalid Git commit for changed-file discovery: ${commit}`);
}

function runGitChangedFiles(commandSpec, repoRoot = process.cwd()) {
  try {
    const output = execFileSync('git', commandSpec.args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output;
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    throw new Error(
      `Git changed-file discovery failed for "${commandSpec.description}"${stderr ? `: ${stderr}` : ''}`,
      { cause: error },
    );
  }
}

function parseGitNameStatus(output) {
  const tokens = output.split('\0').filter(Boolean);
  const files = [];

  for (let index = 0; index < tokens.length;) {
    const status = tokens[index];
    index += 1;
    if (/^[RC]/.test(status)) {
      files.push(normalizePath(tokens[index]), normalizePath(tokens[index + 1]));
      index += 2;
    } else {
      files.push(normalizePath(tokens[index]));
      index += 1;
    }
  }

  return files.filter(Boolean);
}

export function buildChangedFileCommands(
  baseRef = process.env.GITHUB_BASE_REF,
  eventBefore = process.env.GITHUB_EVENT_BEFORE,
) {
  validateGitBaseRef(baseRef);
  validateGitCommit(eventBefore);

  const commands = [];

  if (baseRef) {
    commands.push(`git diff --name-status -z --diff-filter=ACDMR origin/${baseRef}...HEAD`);
  } else if (eventBefore && !/^0+$/.test(eventBefore)) {
    commands.push(`git diff --name-status -z --diff-filter=ACDMR ${eventBefore}...HEAD`);
  }

  commands.push('git diff --name-status -z --diff-filter=ACDMR HEAD');
  commands.push('git diff --name-status -z --diff-filter=ACDMR HEAD~1...HEAD');

  return commands;
}

function buildChangedFileCommandSpecs(baseRef = process.env.GITHUB_BASE_REF, eventBefore = process.env.GITHUB_EVENT_BEFORE) {
  return buildChangedFileCommands(baseRef, eventBefore).map((description) => ({
    args: description.replace(/^git /, '').split(' '),
    description,
  }));
}

export function getChangedFilesFromGit(repoRoot = process.cwd()) {
  const changedFiles = new Set();
  let trackedProbeSucceeded = false;
  let firstTrackedError;

  for (const commandSpec of buildChangedFileCommandSpecs()) {
    try {
      const trackedFiles = parseGitNameStatus(runGitChangedFiles(commandSpec, repoRoot));
      trackedProbeSucceeded = true;
      trackedFiles.forEach((file) => changedFiles.add(file));
    } catch (error) {
      if (!firstTrackedError) {
        firstTrackedError = error;
      }
    }
  }

  if (!trackedProbeSucceeded) {
    throw firstTrackedError ?? new Error('Git changed-file discovery failed');
  }

  runGitChangedFiles(
    {
      args: ['ls-files', '--others', '--exclude-standard', '-z'],
      description: 'git ls-files --others --exclude-standard -z',
    },
    repoRoot,
  )
    .split('\0')
    .map(normalizePath)
    .filter(Boolean)
    .forEach((file) => changedFiles.add(file));

  return [...changedFiles].sort();
}

function parseCliArgs(argv) {
  const options = {
    repoRoot: process.cwd(),
    changedFiles: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo-root') {
      options.repoRoot = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--changed-files') {
      options.changedFiles = (argv[index + 1] ?? '')
        .split(',')
        .map((file) => file.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === '--changed-file') {
      options.changedFiles = [...(options.changedFiles ?? []), argv[index + 1]].filter(Boolean);
      index += 1;
    }
  }

  return options;
}

export function runAssessmentGuardrails(repoRoot = process.cwd(), options = {}) {
  const changedFiles = options.changedFiles ?? getChangedFilesFromGit(repoRoot);
  const violations = [
    ...scanSharedBoundary(repoRoot),
    ...scanListeningDirection(repoRoot),
    ...evaluateLineBudget(repoRoot, changedFiles),
  ];

  return {
    changedFiles: changedFiles.map(normalizePath),
    violations,
    protectedPathChanges: findProtectedPathChanges(changedFiles),
  };
}

function printResult(result) {
  console.log('[assessment-guardrails] changed files:', result.changedFiles.length);

  for (const protectedPath of result.protectedPathChanges) {
    console.log(`[assessment-guardrails] protected path changed for reviewer attention: ${protectedPath}`);
  }

  if (result.violations.length === 0) {
    console.log('[assessment-guardrails] OK');
    return;
  }

  for (const violation of result.violations) {
    console.error(`[assessment-guardrails] ${violation.file}:${violation.line} ${violation.rule}: ${violation.message}`);
  }
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const result = runAssessmentGuardrails(options.repoRoot, {
      changedFiles: options.changedFiles,
    });
    printResult(result);
    if (result.violations.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`[assessment-guardrails] fatal: ${error.message}`);
    process.exitCode = 1;
  }
}
