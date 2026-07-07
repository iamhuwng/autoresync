import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const SOURCE_FILE_PATTERN = /^src\/.+\.(?:js|jsx|ts|tsx)$/u;

export const selectRelevantSourceFiles = (files) =>
  [...new Set(files
    .map((file) => file.trim().replaceAll('\\', '/'))
    .filter((file) => SOURCE_FILE_PATTERN.test(file)))]
    .sort();

export const findMantineImports = (source, fileName) => {
  const scriptKind = fileName.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : fileName.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : fileName.endsWith('.ts')
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const imports = [];

  const visit = (node) => {
    let moduleSpecifier;

    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      moduleSpecifier = node.moduleSpecifier.text;
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      (
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')
      )
    ) {
      moduleSpecifier = node.arguments[0].text;
    }

    if (moduleSpecifier?.startsWith('@mantine/')) {
      imports.push({
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        module: moduleSpecifier,
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return imports;
};

const runGit = (args) => {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }
  return result.stdout.split(/\r?\n/u).filter(Boolean);
};

const collectChangedFiles = (base) => {
  if (base) {
    return runGit(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`]);
  }

  return [
    ...runGit(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']),
    ...runGit(['ls-files', '--others', '--exclude-standard']),
  ];
};

const parseArguments = (args) => {
  const baseIndex = args.indexOf('--base');
  const filesIndex = args.indexOf('--files');

  if (baseIndex >= 0) {
    const base = args[baseIndex + 1];
    if (!base) {
      throw new Error('--base requires a Git revision.');
    }
    return { base };
  }
  if (filesIndex >= 0) {
    return { files: args.slice(filesIndex + 1) };
  }
  return {};
};

const main = () => {
  const options = parseArguments(process.argv.slice(2));
  const files = selectRelevantSourceFiles(
    options.files ?? collectChangedFiles(options.base),
  ).filter((file) => existsSync(file));
  const violations = files.flatMap((file) =>
    findMantineImports(readFileSync(file, 'utf8'), file)
      .map((entry) => ({ file, ...entry })));

  if (violations.length > 0) {
    console.error('Mantine boundary failed: touched source must use native/shared primitives.');
    violations.forEach(({ file, line, module }) => {
      console.error(`- ${file}:${line} imports ${module}`);
    });
    process.exitCode = 1;
    return;
  }

  console.log(`Mantine boundary passed: ${files.length} changed source file(s) checked.`);
};

const isDirectRun = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main();
}
