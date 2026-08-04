import {
  BOOK_CONTEXT_ADAPTER_CONTRACT_VERSION,
  BOOK_CONTEXT_ADAPTER_INPUT_VERSION,
  BOOK_CONTEXT_ADAPTER_OUTPUT_VERSION,
} from './bookContextAdapter.types';
import type {
  BookContextAdapterDeclaration,
  BookContextAdapterRegistry,
  BookContextAdapterInputField,
  BookContextKind,
  BookSourceReplacementCapability,
} from './bookContextAdapter.types';
import type { BookImpactEffect } from './bookImpactClassification.service';

const adapterIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const contextKinds = new Set<BookContextKind>(['course', 'class', 'public-reference']);
const inputFields = new Set<BookContextAdapterInputField>([
  'frozen-placement-binding',
  'book-impact-classification',
]);
const effects = new Set<BookImpactEffect>([
  'unchanged', 'display-only', 'regrade', 'redo-required', 'added', 'removed',
  'reordered', 'moved', 'mapping-source-context', 'successor', 'invalidation',
  'unsupported',
]);
const sourceReplacementModes = new Set<BookSourceReplacementCapability>([
  'invalidation-only', 'owner-adopts-replacement',
]);

export class BookContextAdapterDeclarationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookContextAdapterDeclarationError';
  }
}

function assertExactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new BookContextAdapterDeclarationError(`${label} must be a plain object.`);
  }
  const actual = Reflect.ownKeys(value).sort((left, right) => String(left).localeCompare(String(right)));
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new BookContextAdapterDeclarationError(`${label} must contain exactly: ${expected.join(', ')}.`);
  }
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) {
      throw new BookContextAdapterDeclarationError(`${label}.${key} must be a data field.`);
    }
  }
}

const assertVersion = (value: unknown, label: string): void => {
  if (value !== BOOK_CONTEXT_ADAPTER_CONTRACT_VERSION) {
    throw new BookContextAdapterDeclarationError(`${label} is incompatible with contract version ${BOOK_CONTEXT_ADAPTER_CONTRACT_VERSION}.`);
  }
};

const assertStringArray = <T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  label: string,
): readonly T[] => {
  if (!Array.isArray(value) || value.length === 0 || Object.keys(value).length !== value.length) {
    throw new BookContextAdapterDeclarationError(`${label} must be a nonempty dense array.`);
  }
  const result: T[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item as T) || result.includes(item as T)) {
      throw new BookContextAdapterDeclarationError(`${label} contains an unsupported or duplicate value.`);
    }
    result.push(item as T);
  }
  return Object.freeze(result);
};

const normalizeDeclaration = (value: unknown): BookContextAdapterDeclaration => {
  assertExactRecord(value, [
    'adapterId', 'adapterVersion', 'classification', 'conformance', 'contextKind',
    'contractVersion', 'input', 'output', 'sourceReplacement',
  ], 'adapter declaration');
  if (typeof value.adapterId !== 'string' || !adapterIdPattern.test(value.adapterId)) {
    throw new BookContextAdapterDeclarationError('adapterId must be a safe nonempty identifier.');
  }
  if (!Number.isSafeInteger(value.adapterVersion) || (value.adapterVersion as number) <= 0) {
    throw new BookContextAdapterDeclarationError('adapterVersion must be a positive safe integer.');
  }
  if (typeof value.contextKind !== 'string' || !contextKinds.has(value.contextKind as BookContextKind)) {
    throw new BookContextAdapterDeclarationError('contextKind is unsupported.');
  }
  assertVersion(value.contractVersion, 'contractVersion');

  assertExactRecord(value.input, ['immutable', 'requiredFields', 'version'], 'input');
  if (value.input.version !== BOOK_CONTEXT_ADAPTER_INPUT_VERSION || value.input.immutable !== true) {
    throw new BookContextAdapterDeclarationError('input must declare immutable version 1 requirements.');
  }
  const requiredFields = assertStringArray(value.input.requiredFields, inputFields, 'input.requiredFields');

  assertExactRecord(value.classification, ['supportedEffects', 'version'], 'classification');
  assertVersion(value.classification.version, 'classification.version');
  const supportedEffects = assertStringArray(
    value.classification.supportedEffects, effects, 'classification.supportedEffects',
  );

  assertExactRecord(value.sourceReplacement, ['automaticUpdate', 'mode', 'version'], 'sourceReplacement');
  assertVersion(value.sourceReplacement.version, 'sourceReplacement.version');
  if (value.sourceReplacement.automaticUpdate !== false
    || typeof value.sourceReplacement.mode !== 'string'
    || !sourceReplacementModes.has(value.sourceReplacement.mode as BookSourceReplacementCapability)) {
    throw new BookContextAdapterDeclarationError('sourceReplacement must prohibit automatic update and use a supported mode.');
  }

  assertExactRecord(value.output, ['fields', 'version'], 'output');
  if (value.output.version !== BOOK_CONTEXT_ADAPTER_OUTPUT_VERSION
    || !Array.isArray(value.output.fields)
    || value.output.fields.length !== 1
    || value.output.fields[0] !== 'impact-summary') {
    throw new BookContextAdapterDeclarationError('output must be version 1 impact-summary only.');
  }

  assertExactRecord(value.conformance, ['contractVersion', 'status', 'verifiedAdapterVersion'], 'conformance');
  assertVersion(value.conformance.contractVersion, 'conformance.contractVersion');
  if (value.conformance.status !== 'verified') {
    throw new BookContextAdapterDeclarationError('conformance status must be verified; uncertain declarations are rejected.');
  }
  if (value.conformance.verifiedAdapterVersion !== value.adapterVersion) {
    throw new BookContextAdapterDeclarationError('conformance is stale for adapterVersion.');
  }

  return Object.freeze({
    adapterId: value.adapterId,
    adapterVersion: value.adapterVersion as number,
    contextKind: value.contextKind as BookContextKind,
    contractVersion: BOOK_CONTEXT_ADAPTER_CONTRACT_VERSION,
    input: Object.freeze({ version: BOOK_CONTEXT_ADAPTER_INPUT_VERSION, immutable: true as const, requiredFields }),
    classification: Object.freeze({ version: BOOK_CONTEXT_ADAPTER_CONTRACT_VERSION, supportedEffects }),
    sourceReplacement: Object.freeze({
      version: BOOK_CONTEXT_ADAPTER_CONTRACT_VERSION,
      mode: value.sourceReplacement.mode as BookSourceReplacementCapability,
      automaticUpdate: false as const,
    }),
    output: Object.freeze({
      version: BOOK_CONTEXT_ADAPTER_OUTPUT_VERSION,
      fields: Object.freeze(['impact-summary']) as readonly ['impact-summary'],
    }),
    conformance: Object.freeze({
      status: 'verified' as const,
      contractVersion: BOOK_CONTEXT_ADAPTER_CONTRACT_VERSION,
      verifiedAdapterVersion: value.adapterVersion as number,
    }),
  });
};

/** Pure validation/registration only. It neither activates nor mutates any adapter. */
export const createBookContextAdapterRegistry = (
  declarations: readonly unknown[],
): BookContextAdapterRegistry => {
  const ids = new Set<string>();
  const normalized = declarations.map((declaration) => {
    const value = normalizeDeclaration(declaration);
    if (ids.has(value.adapterId)) {
      throw new BookContextAdapterDeclarationError(`duplicate adapterId: ${value.adapterId}.`);
    }
    ids.add(value.adapterId);
    return value;
  });
  const frozenDeclarations = Object.freeze(normalized);
  const byId = new Map(frozenDeclarations.map((declaration) => [declaration.adapterId, declaration]));

  return Object.freeze({
    contractVersion: BOOK_CONTEXT_ADAPTER_CONTRACT_VERSION,
    declarations: frozenDeclarations,
    get: (adapterId: string) => byId.get(adapterId),
  });
};
