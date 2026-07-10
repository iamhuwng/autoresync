import {
  MATERIAL_CATALOG_MATERIAL_KINDS,
  type MaterialCatalogMaterialKind,
} from '../../types/materialCatalog.types';
import type { MaterialSummarySurfaceFamily } from './materialSummaryPort.service';

export type MaterialIntegrationMode =
  | 'legacy-bridge'
  | 'legacy-index'
  | 'summary-v1';

export interface MaterialKindTaxonomyEntry {
  readonly surfaceFamily: MaterialSummarySurfaceFamily;
  readonly publicEligible: boolean;
}

interface MaterialProducerRegistrationBase {
  readonly producerId: string;
  readonly canonicalFamily: string;
  readonly materialKinds: readonly MaterialCatalogMaterialKind[];
  readonly surfaceFamilies: readonly MaterialSummarySurfaceFamily[];
  readonly skillIds: readonly string[];
  readonly lifecycleOwner: string;
  readonly canonicalRootPaths: readonly string[];
}

interface MaterialProducerSummaryV1Registration
  extends MaterialProducerRegistrationBase {
  readonly integrationMode: 'summary-v1';
  readonly summaryContractVersion: 1;
  readonly lifecycleEntrypoints: readonly string[];
  readonly reconciliationSource:
    'tests'
    | 'reading_v2/material_metadata'
    | 'material_catalog/books';
}

interface MaterialProducerLegacyRegistration
  extends MaterialProducerRegistrationBase {
  readonly integrationMode: 'legacy-bridge' | 'legacy-index';
  readonly summaryContractVersion?: never;
}

export type MaterialProducerRegistration =
  | MaterialProducerLegacyRegistration
  | MaterialProducerSummaryV1Registration;

export class MaterialIntegrationRegistryContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaterialIntegrationRegistryContractError';
  }
}

const MATERIAL_SUMMARY_SURFACE_FAMILIES = [
  'assessment',
  'passage',
  'activity',
  'book',
  'draft',
  'resource',
] as const satisfies readonly MaterialSummarySurfaceFamily[];

const MATERIAL_SUMMARY_SURFACE_FAMILY_SET = new Set<string>(
  MATERIAL_SUMMARY_SURFACE_FAMILIES,
);
const MATERIAL_KIND_SET = new Set<string>(MATERIAL_CATALOG_MATERIAL_KINDS);

const MATERIAL_KIND_TAXONOMY = {
  'full-test': {
    surfaceFamily: 'assessment',
    publicEligible: true,
  },
  'reading-passage': {
    surfaceFamily: 'passage',
    publicEligible: true,
  },
  book: {
    surfaceFamily: 'book',
    publicEligible: true,
  },
  draft: {
    surfaceFamily: 'draft',
    publicEligible: false,
  },
  'listening-part': {
    surfaceFamily: 'assessment',
    publicEligible: true,
  },
  'writing-prompt': {
    surfaceFamily: 'assessment',
    publicEligible: true,
  },
  'vocabulary-set': {
    surfaceFamily: 'resource',
    publicEligible: false,
  },
  'grammar-worksheet': {
    surfaceFamily: 'resource',
    publicEligible: false,
  },
  'interactive-activity': {
    surfaceFamily: 'activity',
    publicEligible: false,
  },
  video: {
    surfaceFamily: 'resource',
    publicEligible: false,
  },
  'file-attachment': {
    surfaceFamily: 'resource',
    publicEligible: false,
  },
  'thcs-thpt-test': {
    surfaceFamily: 'assessment',
    publicEligible: true,
  },
} as const satisfies Readonly<
  Record<MaterialCatalogMaterialKind, MaterialKindTaxonomyEntry>
>;

export const MATERIAL_KIND_TAXONOMY_REGISTRY:
  Readonly<Record<MaterialCatalogMaterialKind, MaterialKindTaxonomyEntry>> =
    MATERIAL_KIND_TAXONOMY;

const MATERIAL_PRODUCER_REGISTRATIONS = [
  {
    producerId: 'reading-v2-full-test',
    canonicalFamily: 'reading-v2-full-test',
    materialKinds: ['full-test'],
    surfaceFamilies: ['assessment'],
    skillIds: ['reading'],
    lifecycleOwner: 'reading-v2',
    canonicalRootPaths: ['reading_v2/material_metadata', 'reading_v2/full_test_compositions'],
    integrationMode: 'summary-v1',
    summaryContractVersion: 1,
    lifecycleEntrypoints: [
      'src/services/reading-v2/readingV2FirebasePublishAdapter.service.ts',
      'src/services/reading-v2/readingV2StudioWorkflow.service.ts',
      'src/services/reading-v2/readingV2TeacherComposition.service.ts',
    ],
    reconciliationSource: 'reading_v2/material_metadata',
  },
  {
    producerId: 'reading-v2-passage',
    canonicalFamily: 'reading-v2-passage',
    materialKinds: ['reading-passage'],
    surfaceFamilies: ['passage'],
    skillIds: ['reading'],
    lifecycleOwner: 'reading-v2',
    canonicalRootPaths: ['reading_v2/material_metadata', 'reading_v2/reading_passage_materials'],
    integrationMode: 'summary-v1',
    summaryContractVersion: 1,
    lifecycleEntrypoints: [
      'src/services/reading-v2/readingV2FirebasePublishAdapter.service.ts',
      'src/services/reading-v2/readingV2PassageArchive.service.ts',
      'src/services/reading-v2/readingV2PassageClone.service.ts',
    ],
    reconciliationSource: 'reading_v2/material_metadata',
  },
  {
    producerId: 'material-book',
    canonicalFamily: 'material-book',
    materialKinds: ['book'],
    surfaceFamilies: ['book'],
    skillIds: ['reading', 'listening', 'writing', 'thcs'],
    lifecycleOwner: 'material-catalog',
    canonicalRootPaths: ['material_catalog/books'],
    integrationMode: 'summary-v1',
    summaryContractVersion: 1,
    lifecycleEntrypoints: [
      'src/services/materialCatalog/materialBooks.service.ts',
    ],
    reconciliationSource: 'material_catalog/books',
  },
  {
    producerId: 'writing',
    canonicalFamily: 'writing',
    materialKinds: ['writing-prompt'],
    surfaceFamilies: ['assessment'],
    skillIds: ['writing'],
    lifecycleOwner: 'writing',
    canonicalRootPaths: ['writing_drafts', 'tests'],
    integrationMode: 'summary-v1',
    summaryContractVersion: 1,
    lifecycleEntrypoints: ['src/services/writingTestService.ts'],
    reconciliationSource: 'tests',
  },
  {
    producerId: 'thcs-thpt',
    canonicalFamily: 'thcs-thpt',
    materialKinds: ['thcs-thpt-test'],
    surfaceFamilies: ['assessment'],
    skillIds: ['thcs'],
    lifecycleOwner: 'thcs-thpt',
    canonicalRootPaths: ['thcs_drafts', 'tests'],
    integrationMode: 'summary-v1',
    summaryContractVersion: 1,
    lifecycleEntrypoints: ['src/services/thcsTestStorage.ts'],
    reconciliationSource: 'tests',
  },
  {
    producerId: 'generic-test',
    canonicalFamily: 'generic-test',
    materialKinds: [
      'full-test',
      'draft',
      'vocabulary-set',
      'grammar-worksheet',
      'video',
      'file-attachment',
    ],
    surfaceFamilies: ['assessment', 'draft', 'resource'],
    skillIds: ['reading', 'listening', 'writing'],
    lifecycleOwner: 'legacy-tests',
    canonicalRootPaths: ['tests'],
    integrationMode: 'summary-v1',
    summaryContractVersion: 1,
    lifecycleEntrypoints: [
      'src/services/testStorage.ts',
      'src/services/materialLinkManager.ts',
      'src/components/TestEditor.tsx',
    ],
    reconciliationSource: 'tests',
  },
  {
    producerId: 'book-activity',
    canonicalFamily: 'book-activity',
    materialKinds: ['interactive-activity'],
    surfaceFamilies: ['activity'],
    skillIds: ['reading', 'listening', 'writing', 'thcs'],
    lifecycleOwner: 'book-activity',
    canonicalRootPaths: ['book_activity/materials', 'book_activity/versions'],
    integrationMode: 'legacy-bridge',
  },
  {
    producerId: 'listening',
    canonicalFamily: 'listening',
    materialKinds: ['listening-part'],
    surfaceFamilies: ['assessment'],
    skillIds: ['listening'],
    lifecycleOwner: 'listening',
    canonicalRootPaths: ['listening_authoring', 'tests'],
    integrationMode: 'summary-v1',
    summaryContractVersion: 1,
    lifecycleEntrypoints: ['src/services/listeningTestStorage.ts'],
    reconciliationSource: 'tests',
  },
] as const satisfies readonly MaterialProducerRegistration[];

export const MATERIAL_PRODUCER_REGISTRY: readonly MaterialProducerRegistration[] =
  MATERIAL_PRODUCER_REGISTRATIONS;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const assertNonEmptyString = (value: unknown, label: string): string => {
  if (!isNonEmptyString(value)) {
    throw new MaterialIntegrationRegistryContractError(
      `Material integration registry requires non-empty ${label}.`,
    );
  }

  return value.trim();
};

const assertNonEmptyStringArray = (
  values: readonly unknown[],
  label: string,
): readonly string[] => {
  if (!Array.isArray(values) || values.length === 0) {
    throw new MaterialIntegrationRegistryContractError(
      `Material integration registry requires non-empty ${label}.`,
    );
  }

  const normalized = values.map((value, index) =>
    assertNonEmptyString(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw new MaterialIntegrationRegistryContractError(
      `Material integration registry requires unique ${label}.`,
    );
  }

  return normalized;
};

const validateMaterialKindTaxonomyRegistry = (): void => {
  const taxonomyKinds = Object.keys(
    MATERIAL_KIND_TAXONOMY_REGISTRY,
  ) as MaterialCatalogMaterialKind[];

  const unknownKinds = taxonomyKinds.filter(
    (materialKind) => !MATERIAL_KIND_SET.has(materialKind),
  );
  if (unknownKinds.length > 0) {
    throw new MaterialIntegrationRegistryContractError(
      `Material kind taxonomy contains unknown kinds: ${unknownKinds.join(', ')}.`,
    );
  }

  const missingKinds = MATERIAL_CATALOG_MATERIAL_KINDS.filter(
    (materialKind) => !taxonomyKinds.includes(materialKind),
  );
  if (missingKinds.length > 0) {
    throw new MaterialIntegrationRegistryContractError(
      `Material kind taxonomy is missing coverage for: ${missingKinds.join(', ')}.`,
    );
  }

  for (const materialKind of MATERIAL_CATALOG_MATERIAL_KINDS) {
    const entry = MATERIAL_KIND_TAXONOMY_REGISTRY[materialKind];
    if (!entry) {
      throw new MaterialIntegrationRegistryContractError(
        `Material kind taxonomy is missing entry for ${materialKind}.`,
      );
    }
    if (!MATERIAL_SUMMARY_SURFACE_FAMILY_SET.has(entry.surfaceFamily)) {
      throw new MaterialIntegrationRegistryContractError(
        `Material kind taxonomy has invalid surface family for ${materialKind}.`,
      );
    }
  }
};

export const validateMaterialProducerRegistry = (
  registry: readonly MaterialProducerRegistration[] = MATERIAL_PRODUCER_REGISTRY,
): void => {
  validateMaterialKindTaxonomyRegistry();

  const seenProducerIds = new Set<string>();
  for (const registration of registry) {
    const producerId = assertNonEmptyString(
      registration.producerId,
      'producerId',
    );
    if (seenProducerIds.has(producerId)) {
      throw new MaterialIntegrationRegistryContractError(
        `Material integration registry contains duplicate producerId: ${producerId}.`,
      );
    }
    seenProducerIds.add(producerId);

    assertNonEmptyString(registration.canonicalFamily, 'canonicalFamily');
    assertNonEmptyString(registration.lifecycleOwner, 'lifecycleOwner');
    assertNonEmptyStringArray(
      registration.canonicalRootPaths,
      `${producerId}.canonicalRootPaths`,
    );

    const materialKinds = assertNonEmptyStringArray(
      registration.materialKinds,
      `${producerId}.materialKinds`,
    );
    const surfaceFamilies = assertNonEmptyStringArray(
      registration.surfaceFamilies,
      `${producerId}.surfaceFamilies`,
    );
    const skillIds = assertNonEmptyStringArray(
      registration.skillIds,
      `${producerId}.skillIds`,
    );

    for (const materialKind of materialKinds) {
      if (!MATERIAL_KIND_SET.has(materialKind)) {
        throw new MaterialIntegrationRegistryContractError(
          `Material integration registry contains unknown material kind ${materialKind} on ${producerId}.`,
        );
      }
      const taxonomy = MATERIAL_KIND_TAXONOMY_REGISTRY[
        materialKind as MaterialCatalogMaterialKind
      ];
      if (!surfaceFamilies.includes(taxonomy.surfaceFamily)) {
        throw new MaterialIntegrationRegistryContractError(
          `${producerId} does not declare taxonomy surface family ${taxonomy.surfaceFamily} for ${materialKind}.`,
        );
      }
    }

    for (const surfaceFamily of surfaceFamilies) {
      if (!MATERIAL_SUMMARY_SURFACE_FAMILY_SET.has(surfaceFamily)) {
        throw new MaterialIntegrationRegistryContractError(
          `Material integration registry contains invalid surface family ${surfaceFamily} on ${producerId}.`,
        );
      }
    }

    if (skillIds.some((skillId) => skillId.length === 0)) {
      throw new MaterialIntegrationRegistryContractError(
        `Material integration registry contains empty skillIds on ${producerId}.`,
      );
    }

    if (registration.integrationMode === 'summary-v1') {
      if (registration.summaryContractVersion !== 1) {
        throw new MaterialIntegrationRegistryContractError(
          `${producerId} must declare summaryContractVersion 1 for summary-v1 integration.`,
        );
      }
      assertNonEmptyStringArray(
        registration.lifecycleEntrypoints,
        `${producerId}.lifecycleEntrypoints`,
      );
      assertNonEmptyString(
        registration.reconciliationSource,
        `${producerId}.reconciliationSource`,
      );
      continue;
    }

    if ('summaryContractVersion' in registration) {
      throw new MaterialIntegrationRegistryContractError(
        `${producerId} must not declare summaryContractVersion outside summary-v1 integration.`,
      );
    }
  }
};

export const listMaterialProducerRegistrations = ():
  readonly MaterialProducerRegistration[] => MATERIAL_PRODUCER_REGISTRY;

export const getMaterialProducerRegistration = (
  producerId: string,
): MaterialProducerRegistration => {
  const normalizedProducerId = assertNonEmptyString(producerId, 'producerId');
  const registration = MATERIAL_PRODUCER_REGISTRY.find(
    (candidate) => candidate.producerId === normalizedProducerId,
  );

  if (!registration) {
    throw new MaterialIntegrationRegistryContractError(
      `Unknown material producer registration: ${normalizedProducerId}.`,
    );
  }

  return registration;
};

validateMaterialProducerRegistry();
