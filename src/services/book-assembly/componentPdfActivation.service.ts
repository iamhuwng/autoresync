import type { BookAssemblyManifestCandidate, SourceSetCandidate } from '../../types/bookAssembly.types';
import type { MaterialBookSetupActivation } from '../../types/materialCatalog.types';
import type { BookAssemblyBookAuthority, BookAssemblyCandidateRecord } from './unitAssembly.types';
import type { ComponentStudentDocument } from './componentStudentDocument.types';
import { canonicalActivityPayloadFingerprint } from './unitPreview.service';
import type { NormalizedActivity } from '../../types/bookActivity.types';

export const COMPONENT_PDF_ACTIVATION_RECEIPT_LIMIT = 32;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const HASH = /^(?:[a-f0-9]{64}|fnv1a64:[a-f0-9]{16})$/iu;

export interface ComponentPdfActivationInput {
  readonly operationId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly expectedBookRevision: number;
  readonly expectedSourceSetRevision: number;
  readonly sourceSet: SourceSetCandidate;
  readonly unitCandidates: MaterialBookSetupActivation['unitCandidates'];
  readonly studentDocument: MaterialBookSetupActivation['studentDocument'];
  readonly activities: MaterialBookSetupActivation['activities'];
  readonly activatedAt: string;
}

const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stable(row[key])}`).join(',')}}`;
};

const fingerprint = (value: unknown): string => {
  let hash = 0xcbf29ce484222325n;
  for (const character of stable(value)) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
};

export const fingerprintComponentPdfActivationValue = fingerprint;

export interface ComponentPdfActivationCommandInput {
  readonly operationId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly expectedBookRevision: number;
  readonly expectedSourceSetRevision: number;
  readonly sourceSet: SourceSetCandidate;
  readonly manifest: BookAssemblyManifestCandidate;
  readonly studentDocumentSourceVersionId: string;
  readonly activatedAt: string;
}

export interface ComponentPdfActivationActivitySnapshot {
  readonly activityId: string;
  readonly activityCandidateId: string;
  readonly activityCandidateRevision: number;
  readonly lifecycle: 'saved';
  readonly payload: NormalizedActivity;
}

export interface ComponentPdfActivationPorts {
  readonly readStudentDocument: (
    bookId: string,
    sourceVersionId: string,
  ) => Promise<ComponentStudentDocument | null>;
  readonly stageUnitCandidate: (input: {
    readonly operationId: string;
    readonly ownerId: string;
    readonly bookId: string;
    readonly unitKey: string;
    readonly candidateId: string;
    readonly bookRevision: number;
    readonly sourceSetRevision: number;
    readonly manifest: BookAssemblyManifestCandidate;
    readonly activatedAt: string;
  }) => Promise<BookAssemblyCandidateRecord>;
  readonly readActivity: (input: {
    readonly ownerId: string;
    readonly bookId: string;
    readonly unitKey: string;
    readonly activityKey: string;
  }) => Promise<ComponentPdfActivationActivitySnapshot | null>;
  /** The final and only visibility write. No required write may follow it. */
  readonly activateMaterialBook: (input: ComponentPdfActivationInput) => Promise<MaterialBookSetupActivation>;
}

const positiveRevision = (value: number): boolean => Number.isSafeInteger(value) && value >= 1;
const orderedUnique = <T>(items: readonly T[], key: (item: T) => string): boolean =>
  items.every((item, index) => ID.test(key(item)) && (index === 0 || key(items[index - 1]!) < key(item)));

export const fingerprintComponentPdfActivation = (input: ComponentPdfActivationInput): string => fingerprint({
  schemaVersion: 1,
  action: 'material-book-assembly-activate',
  operationId: input.operationId,
  ownerId: input.ownerId,
  bookId: input.bookId,
  expectedBookRevision: input.expectedBookRevision,
  expectedSourceSetRevision: input.expectedSourceSetRevision,
  sourceSet: input.sourceSet,
  unitCandidates: input.unitCandidates,
  studentDocument: input.studentDocument,
  activities: input.activities,
});

export const createComponentPdfActivationReceipt = (
  input: ComponentPdfActivationInput,
): MaterialBookSetupActivation => {
  if (!ID.test(input.operationId) || !ID.test(input.ownerId) || !ID.test(input.bookId)
    || !Number.isSafeInteger(input.expectedBookRevision) || input.expectedBookRevision < 0
    || !Number.isSafeInteger(input.expectedSourceSetRevision) || input.expectedSourceSetRevision < 0
    || input.unitCandidates.length === 0
    || !orderedUnique(input.unitCandidates, (item) => item.unitKey)
    || !orderedUnique(input.activities, (item) => `${item.unitKey}:${item.activityKey}`)
    || input.unitCandidates.some((item) => !ID.test(item.candidateId)
      || !positiveRevision(item.candidateRevision) || !HASH.test(item.manifestFingerprint))
    || input.activities.some((item) => !ID.test(item.activityId) || !ID.test(item.activityCandidateId)
      || !positiveRevision(item.activityCandidateRevision) || !HASH.test(item.activityPayloadFingerprint))
    || !ID.test(input.studentDocument.sourceVersionId)
    || input.studentDocument.descriptorRevision !== input.expectedSourceSetRevision + 1
    || !HASH.test(input.studentDocument.descriptorFingerprint)
    || !Number.isFinite(Date.parse(input.activatedAt))) throw new Error('invalid_component_pdf_activation');

  const unitKeys = new Set(input.unitCandidates.map((item) => item.unitKey));
  if (input.activities.some((item) => !unitKeys.has(item.unitKey))) {
    throw new Error('invalid_component_pdf_activation_activity_unit');
  }
  return Object.freeze({
    schemaVersion: 1,
    operationId: input.operationId,
    inputFingerprint: fingerprintComponentPdfActivation(input),
    ownerId: input.ownerId,
    bookId: input.bookId as MaterialBookSetupActivation['bookId'],
    bookRevision: input.expectedBookRevision + 1,
    sourceSetRevision: input.expectedSourceSetRevision + 1,
    sourceSet: structuredClone(input.sourceSet),
    unitCandidates: structuredClone(input.unitCandidates),
    studentDocument: structuredClone(input.studentDocument),
    activities: structuredClone(input.activities),
    activatedAt: input.activatedAt,
  });
};

export const appendComponentPdfActivationReceipt = (
  receipts: readonly MaterialBookSetupActivation[] | undefined,
  receipt: MaterialBookSetupActivation,
): readonly MaterialBookSetupActivation[] => Object.freeze([
  ...(receipts ?? []).slice(-(COMPONENT_PDF_ACTIVATION_RECEIPT_LIMIT - 1)),
  structuredClone(receipt),
]);

export const activeComponentPdfActivation = (book: {
  readonly ownerId?: string;
  readonly bookId?: string;
  readonly bookRevision?: number;
  readonly sourceSetRevision?: number;
  readonly sourceSet?: SourceSetCandidate;
  readonly setupActivations?: readonly MaterialBookSetupActivation[];
}): MaterialBookSetupActivation | null => {
  const history = book.setupActivations;
  if (!history || history.length === 0 || history.length > COMPONENT_PDF_ACTIVATION_RECEIPT_LIMIT) return null;
  const valid = history.every((receipt) => {
    try {
      if (receipt.schemaVersion !== 1 || receipt.ownerId !== book.ownerId || receipt.bookId !== book.bookId
        || receipt.bookRevision < 1 || receipt.sourceSetRevision < 1
        || receipt.studentDocument.descriptorRevision !== receipt.sourceSetRevision
        || !orderedUnique(receipt.unitCandidates, (item) => item.unitKey)
        || receipt.unitCandidates.length === 0
        || !orderedUnique(receipt.activities, (item) => `${item.unitKey}:${item.activityKey}`)) return false;
      const expected = createComponentPdfActivationReceipt({
        operationId: receipt.operationId, ownerId: receipt.ownerId, bookId: receipt.bookId,
        expectedBookRevision: receipt.bookRevision - 1,
        expectedSourceSetRevision: receipt.sourceSetRevision - 1,
        sourceSet: receipt.sourceSet, unitCandidates: receipt.unitCandidates,
        studentDocument: receipt.studentDocument, activities: receipt.activities,
        activatedAt: receipt.activatedAt,
      });
      return expected.inputFingerprint === receipt.inputFingerprint;
    } catch { return false; }
  });
  if (!valid) return null;
  const receipt = history.at(-1)!;
  return receipt.bookRevision === book.bookRevision
    && receipt.sourceSetRevision === book.sourceSetRevision
    && stable(receipt.sourceSet) === stable(book.sourceSet) ? receipt : null;
};

export const resolveMaterialQualifiedAssemblyCandidate = (
  authority: BookAssemblyBookAuthority,
  unitKey: string,
  candidates: Readonly<Record<string, BookAssemblyCandidateRecord>> | undefined,
): BookAssemblyCandidateRecord | null => {
  const activation = activeComponentPdfActivation(authority);
  const reference = activation?.unitCandidates.find((item) => item.unitKey === unitKey);
  const candidate = reference ? candidates?.[reference.candidateId] : undefined;
  if (!activation || !reference || !candidate || candidate.lifecycle !== 'validated' || !candidate.manifest
    || candidate.ownerId !== authority.ownerId || candidate.bookId !== authority.bookId
    || candidate.unitKey !== unitKey || candidate.revision !== reference.candidateRevision
    || candidate.bookRevision !== authority.bookRevision
    || candidate.sourceSetRevision !== authority.sourceSetRevision
    || fingerprint(candidate.manifest) !== reference.manifestFingerprint
    || stable(candidate.manifest.sourceSet) !== stable(authority.sourceSet)) return null;
  return structuredClone(candidate);
};

const activationCandidateId = (operationId: string, unitKey: string): string =>
  `activation-${fingerprint({ operationId, unitKey }).slice('fnv1a64:'.length)}`;

/**
 * Deep A0 command: prepare exact immutable records, then expose them with one
 * final Material Book CAS. Every port before activateMaterialBook is read or an
 * invisible immutable prepare; nothing durable is required afterward.
 */
export const activateComponentPdf = async (
  input: ComponentPdfActivationCommandInput,
  ports: ComponentPdfActivationPorts,
): Promise<MaterialBookSetupActivation> => {
  if (!ID.test(input.operationId) || !ID.test(input.ownerId) || !ID.test(input.bookId)
    || input.manifest.bookId !== input.bookId
    || stable(input.manifest.sourceSet) !== stable(input.sourceSet)
    || input.sourceSet.sourceStrategy !== 'component_pdfs') {
    throw new Error('invalid_component_pdf_activation_command');
  }
  const unitKeys = input.manifest.units.map((unit) => unit.unitKey).sort();
  if (unitKeys.length === 0 || new Set(unitKeys).size !== unitKeys.length) {
    throw new Error('invalid_component_pdf_activation_units');
  }

  const descriptor = await ports.readStudentDocument(input.bookId, input.studentDocumentSourceVersionId);
  if (!descriptor || descriptor.sourceVersionId !== input.studentDocumentSourceVersionId
    || descriptor.descriptorRevision !== input.expectedSourceSetRevision + 1
    || descriptor.studentSafeStatus !== 'ready') {
    throw new Error('component_pdf_activation_descriptor_unavailable');
  }

  const manifestFingerprint = fingerprint(input.manifest);
  const unitCandidates: Array<MaterialBookSetupActivation['unitCandidates'][number]> = [];
  for (const unitKey of unitKeys) {
    const candidateId = activationCandidateId(input.operationId, unitKey);
    const candidate = await ports.stageUnitCandidate({
      operationId: input.operationId,
      ownerId: input.ownerId,
      bookId: input.bookId,
      unitKey,
      candidateId,
      bookRevision: input.expectedBookRevision + 1,
      sourceSetRevision: input.expectedSourceSetRevision + 1,
      manifest: input.manifest,
      activatedAt: input.activatedAt,
    });
    if (candidate.candidateId !== candidateId || candidate.ownerId !== input.ownerId
      || candidate.bookId !== input.bookId || candidate.unitKey !== unitKey
      || candidate.lifecycle !== 'validated' || candidate.manifest === null
      || candidate.bookRevision !== input.expectedBookRevision + 1
      || candidate.sourceSetRevision !== input.expectedSourceSetRevision + 1
      || fingerprint(candidate.manifest) !== manifestFingerprint) {
      throw new Error('component_pdf_activation_candidate_mismatch');
    }
    unitCandidates.push({
      unitKey,
      candidateId,
      candidateRevision: candidate.revision,
      manifestFingerprint,
    });
  }

  const activities: Array<MaterialBookSetupActivation['activities'][number]> = [];
  for (const unit of [...input.manifest.units].sort((left, right) => left.unitKey.localeCompare(right.unitKey))) {
    for (const slot of [...unit.activitySlots].sort((left, right) => left.activityKey.localeCompare(right.activityKey))) {
      const activity = await ports.readActivity({
        ownerId: input.ownerId,
        bookId: input.bookId,
        unitKey: unit.unitKey,
        activityKey: slot.activityKey,
      });
      if (!activity || activity.lifecycle !== 'saved' || !ID.test(activity.activityId)
        || !ID.test(activity.activityCandidateId) || !positiveRevision(activity.activityCandidateRevision)) {
        throw new Error('component_pdf_activation_activity_unavailable');
      }
      activities.push({
        unitKey: unit.unitKey,
        activityKey: slot.activityKey,
        activityId: activity.activityId,
        activityCandidateId: activity.activityCandidateId,
        activityCandidateRevision: activity.activityCandidateRevision,
        activityPayloadFingerprint: canonicalActivityPayloadFingerprint(activity.payload),
      });
    }
  }

  const activation: ComponentPdfActivationInput = {
    operationId: input.operationId,
    ownerId: input.ownerId,
    bookId: input.bookId,
    expectedBookRevision: input.expectedBookRevision,
    expectedSourceSetRevision: input.expectedSourceSetRevision,
    sourceSet: input.sourceSet,
    unitCandidates,
    studentDocument: {
      sourceVersionId: descriptor.sourceVersionId,
      descriptorRevision: descriptor.descriptorRevision,
      descriptorFingerprint: fingerprint(descriptor),
    },
    activities,
    activatedAt: input.activatedAt,
  };
  const receipt = await ports.activateMaterialBook(activation);
  const expected = createComponentPdfActivationReceipt(activation);
  if (stable(receipt) !== stable(expected)) throw new Error('component_pdf_activation_readback_mismatch');
  return receipt;
};
