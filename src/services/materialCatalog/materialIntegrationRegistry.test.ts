import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { MATERIAL_CATALOG_MATERIAL_KINDS } from '../../types/materialCatalog.types';
import {
  MATERIAL_KIND_TAXONOMY_REGISTRY,
  MATERIAL_PRODUCER_REGISTRY,
  MaterialIntegrationRegistryContractError,
  getMaterialProducerRegistration,
  listMaterialProducerRegistrations,
  validateMaterialProducerRegistry,
} from './materialIntegrationRegistry';

const SUMMARY_PORT_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  'legacyTestMaterialSummary.service': ['createLegacyTestMaterialSummary'],
  'materialSummaryAdapters.service': [
    'createMaterialBookSummary',
    'createReadingV2MaterialSummary',
  ],
  'materialSummaryPort.service': [
    'buildMaterialSummaryIndexPlan',
    'buildMaterialSummaryUpdatePayload',
    'synchronizeMaterialSummary',
  ],
  'readingV2FirebasePublishAdapter.service': [
    'commitReadingV2PublishPlanToFirebase',
  ],
  'readingV2PublishPipeline.service': ['publishReadingV2Material'],
};

const matchingSummaryPortImport = (moduleSpecifier: string) =>
  Object.entries(SUMMARY_PORT_IMPORTS).find(([moduleSuffix]) =>
    moduleSpecifier.replace(/\\/g, '/').endsWith(moduleSuffix));

const collectLifecyclePortImports = (source: ts.SourceFile) => {
  const namedImports = new Set<string>();
  const namespaceImports = new Map<string, ReadonlySet<string>>();

  source.statements.forEach((statement) => {
    if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) {
      return;
    }
    if (!ts.isStringLiteral(statement.moduleSpecifier)) {
      return;
    }
    const match = matchingSummaryPortImport(statement.moduleSpecifier.text);
    if (!match) {
      return;
    }

    const [, allowedImports] = match;
    const allowed = new Set(allowedImports);
    const bindings = statement.importClause?.namedBindings;
    if (!bindings) {
      return;
    }
    if (ts.isNamespaceImport(bindings)) {
      namespaceImports.set(bindings.name.text, allowed);
      return;
    }
    bindings.elements.forEach((element) => {
      if (element.isTypeOnly) {
        return;
      }
      const importedName = element.propertyName?.text ?? element.name.text;
      if (allowed.has(importedName)) {
        namedImports.add(element.name.text);
      }
    });
  });

  return { namedImports, namespaceImports };
};

const callReferencesLifecyclePort = (
  expression: ts.Expression,
  imports: ReturnType<typeof collectLifecyclePortImports>,
): boolean => {
  if (ts.isIdentifier(expression)) {
    return imports.namedImports.has(expression.text);
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return (
      ts.isIdentifier(expression.expression) &&
      imports.namespaceImports.get(expression.expression.text)?.has(
        expression.name.text,
      ) === true
    );
  }

  return false;
};

const hasLifecycleSummaryPortCall = (sourceText: string): boolean => {
  const source = ts.createSourceFile(
    'entrypoint.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const imports = collectLifecyclePortImports(source);
  let hasCall = false;

  const visit = (node: ts.Node): void => {
    if (hasCall) {
      return;
    }
    if (
      ts.isCallExpression(node) &&
      callReferencesLifecyclePort(node.expression, imports)
    ) {
      hasCall = true;
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return hasCall;
};

describe('materialIntegrationRegistry', () => {
  it('keeps migrated and legacy integration modes truthful', () => {
    const registrations = Object.fromEntries(
      listMaterialProducerRegistrations().map((registration) => [
        registration.producerId,
        registration,
      ]),
    );

    expect(registrations['reading-v2-passage']?.integrationMode).toBe('summary-v1');
    expect(registrations['material-book']?.integrationMode).toBe('summary-v1');
    expect(registrations['reading-v2-full-test']?.integrationMode).toBe('summary-v1');
    expect(registrations.writing?.integrationMode).toBe('summary-v1');
    expect(registrations['thcs-thpt']?.integrationMode).toBe('summary-v1');
    expect(registrations['generic-test']?.integrationMode).toBe('summary-v1');
    expect(registrations.listening?.integrationMode).toBe('summary-v1');

    expect(registrations['reading-v2-passage']?.summaryContractVersion).toBe(1);
    expect(registrations['material-book']?.summaryContractVersion).toBe(1);
  });

  it('keeps producer registrations unique and self-validating', () => {
    const producerIds = MATERIAL_PRODUCER_REGISTRY.map(
      (registration) => registration.producerId,
    );

    expect(new Set(producerIds).size).toBe(MATERIAL_PRODUCER_REGISTRY.length);
    expect(() => validateMaterialProducerRegistry()).not.toThrow();
  });

  it('requires summary-v1 lifecycle entrypoints to use the shared port', () => {
    MATERIAL_PRODUCER_REGISTRY.forEach((registration) => {
      if (registration.integrationMode !== 'summary-v1') {
        return;
      }
      expect(registration.lifecycleEntrypoints.length).toBeGreaterThan(0);
      registration.lifecycleEntrypoints.forEach((entrypoint) => {
        expect(existsSync(entrypoint), entrypoint).toBe(true);
        expect(
          hasLifecycleSummaryPortCall(readFileSync(entrypoint, 'utf8')),
          `${registration.producerId}:${entrypoint}`,
        ).toBe(true);
      });
    });
  });

  it('does not accept comments, strings, or unused imports as port evidence', () => {
    expect(hasLifecycleSummaryPortCall(`
      import { buildMaterialSummaryUpdatePayload } from './materialSummaryPort.service';
      const text = 'buildMaterialSummaryUpdatePayload';
      // buildMaterialSummaryUpdatePayload();
    `)).toBe(false);

    expect(hasLifecycleSummaryPortCall(`
      import { buildMaterialSummaryUpdatePayload } from './materialSummaryPort.service';
      buildMaterialSummaryUpdatePayload(summary);
    `)).toBe(true);
  });

  it('covers every material kind in taxonomy with expected public boundaries', () => {
    expect(Object.keys(MATERIAL_KIND_TAXONOMY_REGISTRY).sort()).toEqual(
      [...MATERIAL_CATALOG_MATERIAL_KINDS].sort(),
    );

    expect(MATERIAL_KIND_TAXONOMY_REGISTRY['full-test']).toMatchObject({
      surfaceFamily: 'assessment',
      publicEligible: true,
    });
    expect(MATERIAL_KIND_TAXONOMY_REGISTRY.draft).toMatchObject({
      surfaceFamily: 'draft',
      publicEligible: false,
    });
    expect(MATERIAL_KIND_TAXONOMY_REGISTRY['file-attachment']).toMatchObject({
      surfaceFamily: 'resource',
      publicEligible: false,
    });
  });

  it('throws typed contract error for unknown producer ids', () => {
    expect(() => getMaterialProducerRegistration('missing-producer')).toThrow(
      MaterialIntegrationRegistryContractError,
    );
    expect(() =>
      getMaterialProducerRegistration('missing-producer'),
    ).toThrow(/unknown material producer registration/i);
  });

  it('fails invalid summary-v1 declarations loudly', () => {
    const { summaryContractVersion: _version, ...withoutVersion } =
      MATERIAL_PRODUCER_REGISTRY[0] as any;
    const missingVersion = [
      ...MATERIAL_PRODUCER_REGISTRY,
      {
        ...withoutVersion,
        producerId: 'broken-summary-v1',
        integrationMode: 'summary-v1',
      },
    ] as any;

    expect(() => validateMaterialProducerRegistry(missingVersion)).toThrow(
      /summarycontractversion 1/i,
    );

    const forbiddenVersion = [
      ...MATERIAL_PRODUCER_REGISTRY,
      {
        ...MATERIAL_PRODUCER_REGISTRY[0],
        producerId: 'broken-legacy-version',
        integrationMode: 'legacy-bridge',
        summaryContractVersion: 1,
      },
    ] as any;

    expect(() => validateMaterialProducerRegistry(forbiddenVersion)).toThrow(
      /must not declare summarycontractversion outside summary-v1/i,
    );
  });
});
