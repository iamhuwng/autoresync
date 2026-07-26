import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const runtimeRoot = resolve(process.cwd(), 'src/services/book-activity/runtime');
const uiRoot = resolve(process.cwd(), 'src/components/book-runtime');
const ownedFiles = [
  resolve(runtimeRoot, 'activityResponseCodec.types.ts'),
  resolve(runtimeRoot, 'activityRenderer.types.ts'),
  resolve(runtimeRoot, 'activityRendererManifest.ts'),
  resolve(runtimeRoot, 'activityRendererRegistry.ts'),
  resolve(runtimeRoot, 'codecs/choiceResponseCodec.ts'),
  resolve(runtimeRoot, 'codecs/textEntryResponseCodec.ts'),
  resolve(runtimeRoot, 'registrations/activityRendererRegistrations.ts'),
  resolve(uiRoot, 'bookRuntimeFrame.types.ts'),
  resolve(uiRoot, 'BookRuntimeFrame.tsx'),
  resolve(uiRoot, 'interactions/ActivityRendererHost.tsx'),
  resolve(uiRoot, 'interactions/choice/ChoiceRenderer.tsx'),
  resolve(uiRoot, 'interactions/text-entry/TextEntryRenderer.tsx'),
];
const NON_LITERAL_MODULE_LOAD = '<nonliteral-module-load>';
const forbidden = /(?:<nonliteral-module-load>|firebase|cloudflare|(?:^|[/\\.-])worker(?:[/\\.-]|$)|activityRuntime\.browser|activityAuthoring|activityScoring|activityStorage|book-source-delivery|book-delivery|homework|course|class|notification|result(?:Owner|Ownership)?|trusted.?submit|autosave|scoreActivity)/iu;

const moduleSpecifiers = (source: string): string[] => {
  const parsed = ts.createSourceFile('boundary.ts', source, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    }
    if (ts.isCallExpression(node)) {
      const [argument] = node.arguments;
      const isModuleLoad = node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require');
      if (isModuleLoad) {
        specifiers.push(
          argument && ts.isStringLiteralLike(argument)
            ? argument.text
            : NON_LITERAL_MODULE_LOAD,
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return specifiers;
};

describe('Book Activity runtime dependency boundary', () => {
  it('keeps renderer seam free of delivery, persistence, scoring, and cross-feature imports', () => {
    for (const file of ownedFiles) {
      expect(moduleSpecifiers(readFileSync(file, 'utf8')), file).not.toContainEqual(expect.stringMatching(forbidden));
    }
  });

  it('detects static, re-export, require, and dynamic forbidden module edges', () => {
    const detected = moduleSpecifiers(`
      import 'firebase/app';
      export * from 'book-delivery/adapter';
      const worker = require('trusted-submit');
      void import('notification-service');
      void import('../../../cloudflare/src/book-worker');
      void import(runtimeModulePath);
    `);
    expect(detected).toEqual([
      'firebase/app',
      'book-delivery/adapter',
      'trusted-submit',
      'notification-service',
      '../../../cloudflare/src/book-worker',
      NON_LITERAL_MODULE_LOAD,
    ]);
    expect(detected.every((specifier) => forbidden.test(specifier))).toBe(true);
  });
});
