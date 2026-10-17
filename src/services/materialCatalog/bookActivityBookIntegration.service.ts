import type {
  MaterialBookMaterialRef,
} from '../../types/materialCatalog.types';
import { getMaterialKindCapabilities } from './materialCapabilityRegistry.service';

export interface BookActivityBookPlacementRef {
  readonly bookId: string;
  readonly nodeId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly ref: MaterialBookMaterialRef;
}

export class BookActivityBookIntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookActivityBookIntegrationError';
  }
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const validateBookActivityBookIntegration = (
  input: BookActivityBookPlacementRef,
): BookActivityBookPlacementRef => {
  if (!isNonEmptyString(input.bookId) || !isNonEmptyString(input.nodeId) || !isNonEmptyString(input.placementId)) {
    throw new BookActivityBookIntegrationError('Book Activity placement requires bookId, nodeId, and placementId.');
  }

  if (!isNonEmptyString(input.activityId) || !isNonEmptyString(input.activityVersionId)) {
    throw new BookActivityBookIntegrationError('Book Activity placement requires activityId and activityVersionId.');
  }

  if (input.ref.materialKind !== 'interactive-activity') {
    throw new BookActivityBookIntegrationError('Book Activity refs must use interactive-activity material kind.');
  }

  if (input.ref.materialId !== input.activityId) {
    throw new BookActivityBookIntegrationError('Book Activity ref materialId must match activityId.');
  }

  if (input.ref.snapshotVersionId !== input.activityVersionId) {
    throw new BookActivityBookIntegrationError('Book Activity ref snapshotVersionId must match activityVersionId.');
  }

  if (input.ref.availability !== 'available' || input.ref.updateState !== 'current') {
    throw new BookActivityBookIntegrationError('Book Activity refs must be available and current.');
  }

  const capabilities = getMaterialKindCapabilities(input.ref.materialKind);
  if (!capabilities.embeddableInBook || !capabilities.supportsPlacementScopedProgress) {
    throw new BookActivityBookIntegrationError('Book Activity material kind lacks Book placement capabilities.');
  }

  return input;
};
