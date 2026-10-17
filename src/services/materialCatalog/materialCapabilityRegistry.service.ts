import {
  MATERIAL_CATALOG_MATERIAL_KINDS,
  type MaterialCatalogMaterialKind,
} from '../../types/materialCatalog.types';

export type MaterialCapabilityAdapterId =
  | 'book-activity-launch-v1'
  | 'book-activity-assignment-v1'
  | 'book-activity-result-v1'
  | 'book-activity-projection-v1'
  | 'unsupported';

export interface MaterialKindCapabilities {
  readonly materialKind: MaterialCatalogMaterialKind;
  readonly playable: boolean;
  readonly assignable: boolean;
  readonly embeddableInBook: boolean;
  readonly gradable: boolean;
  readonly supportsSourceContext: boolean;
  readonly supportsPlacementScopedProgress: boolean;
  readonly launchAdapterId: MaterialCapabilityAdapterId;
  readonly assignmentAdapterId: MaterialCapabilityAdapterId;
  readonly resultAdapterId: MaterialCapabilityAdapterId;
  readonly projectionAdapterId: MaterialCapabilityAdapterId;
}

export class MaterialCapabilityRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaterialCapabilityRegistryError';
  }
}

const unsupported = (
  materialKind: MaterialCatalogMaterialKind,
): MaterialKindCapabilities => ({
  materialKind,
  playable: false,
  assignable: false,
  embeddableInBook: false,
  gradable: false,
  supportsSourceContext: false,
  supportsPlacementScopedProgress: false,
  launchAdapterId: 'unsupported',
  assignmentAdapterId: 'unsupported',
  resultAdapterId: 'unsupported',
  projectionAdapterId: 'unsupported',
});

const MATERIAL_CAPABILITY_REGISTRY = {
  'full-test': {
    ...unsupported('full-test'),
    playable: true,
    assignable: true,
    gradable: true,
  },
  'reading-passage': unsupported('reading-passage'),
  book: {
    ...unsupported('book'),
    embeddableInBook: true,
  },
  draft: unsupported('draft'),
  'listening-part': {
    ...unsupported('listening-part'),
    playable: true,
    assignable: true,
    gradable: true,
  },
  'writing-prompt': {
    ...unsupported('writing-prompt'),
    playable: true,
    assignable: true,
    gradable: true,
  },
  'vocabulary-set': unsupported('vocabulary-set'),
  'grammar-worksheet': unsupported('grammar-worksheet'),
  'interactive-activity': {
    materialKind: 'interactive-activity',
    playable: true,
    assignable: true,
    embeddableInBook: true,
    gradable: true,
    supportsSourceContext: true,
    supportsPlacementScopedProgress: true,
    launchAdapterId: 'book-activity-launch-v1',
    assignmentAdapterId: 'book-activity-assignment-v1',
    resultAdapterId: 'book-activity-result-v1',
    projectionAdapterId: 'book-activity-projection-v1',
  },
  video: unsupported('video'),
  'file-attachment': unsupported('file-attachment'),
  'thcs-thpt-test': {
    ...unsupported('thcs-thpt-test'),
    playable: true,
    assignable: true,
    gradable: true,
  },
} as const satisfies Readonly<Record<MaterialCatalogMaterialKind, MaterialKindCapabilities>>;

export const getMaterialKindCapabilities = (
  materialKind: MaterialCatalogMaterialKind,
  registry: Readonly<Record<MaterialCatalogMaterialKind, MaterialKindCapabilities>> = MATERIAL_CAPABILITY_REGISTRY,
): MaterialKindCapabilities => {
  const capabilities = registry[materialKind];
  if (!capabilities) {
    throw new MaterialCapabilityRegistryError(`Missing capability registry entry for ${materialKind}.`);
  }

  return capabilities;
};

export const requireMaterialCapabilityAdapter = (
  materialKind: MaterialCatalogMaterialKind,
  adapter:
    | 'launchAdapterId'
    | 'assignmentAdapterId'
    | 'resultAdapterId'
    | 'projectionAdapterId',
  registry: Readonly<Record<MaterialCatalogMaterialKind, MaterialKindCapabilities>> = MATERIAL_CAPABILITY_REGISTRY,
): MaterialCapabilityAdapterId => {
  const adapterId = getMaterialKindCapabilities(materialKind, registry)[adapter];
  if (adapterId === 'unsupported') {
    throw new MaterialCapabilityRegistryError(`${materialKind} does not support ${adapter}.`);
  }

  return adapterId;
};

export const validateMaterialCapabilityRegistry = (
  registry: Readonly<Record<MaterialCatalogMaterialKind, MaterialKindCapabilities>> = MATERIAL_CAPABILITY_REGISTRY,
): void => {
  const missingKinds = MATERIAL_CATALOG_MATERIAL_KINDS.filter(
    (materialKind) => !registry[materialKind],
  );
  if (missingKinds.length > 0) {
    throw new MaterialCapabilityRegistryError(`Missing capability rows: ${missingKinds.join(', ')}.`);
  }

  Object.entries(registry).forEach(([materialKind, capabilities]) => {
    if (capabilities.materialKind !== materialKind) {
      throw new MaterialCapabilityRegistryError(`Capability row kind mismatch for ${materialKind}.`);
    }
  });
};

export const listMaterialCapabilityRows = ():
  readonly MaterialKindCapabilities[] => Object.values(MATERIAL_CAPABILITY_REGISTRY);
