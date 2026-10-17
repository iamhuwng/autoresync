import type { BookImpactEffect } from './bookImpactClassification.service';

export const BOOK_CONTEXT_ADAPTER_CONTRACT_VERSION = 1 as const;
export const BOOK_CONTEXT_ADAPTER_INPUT_VERSION = 1 as const;
export const BOOK_CONTEXT_ADAPTER_OUTPUT_VERSION = 1 as const;

export type BookContextKind = 'course' | 'class' | 'public-reference';
export type BookContextAdapterInputField =
  | 'frozen-placement-binding'
  | 'book-impact-classification';
export type BookSourceReplacementCapability =
  | 'invalidation-only'
  | 'owner-adopts-replacement';

export interface BookContextAdapterInputRequirement {
  readonly version: typeof BOOK_CONTEXT_ADAPTER_INPUT_VERSION;
  readonly immutable: true;
  readonly requiredFields: readonly BookContextAdapterInputField[];
}

export interface BookContextAdapterClassificationCapability {
  readonly version: typeof BOOK_CONTEXT_ADAPTER_CONTRACT_VERSION;
  readonly supportedEffects: readonly BookImpactEffect[];
}

export interface BookContextAdapterSourceReplacementCapability {
  readonly version: typeof BOOK_CONTEXT_ADAPTER_CONTRACT_VERSION;
  readonly mode: BookSourceReplacementCapability;
  readonly automaticUpdate: false;
}

export interface BookContextAdapterOutputSchema {
  readonly version: typeof BOOK_CONTEXT_ADAPTER_OUTPUT_VERSION;
  readonly fields: readonly ['impact-summary'];
}

export interface BookContextAdapterConformance {
  readonly status: 'verified';
  readonly contractVersion: typeof BOOK_CONTEXT_ADAPTER_CONTRACT_VERSION;
  readonly verifiedAdapterVersion: number;
}

/**
 * Source-controlled metadata only. It intentionally has no context record,
 * authorization decision, private Solo detail, command, rollback, or
 * activation field.
 */
export interface BookContextAdapterDeclaration {
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly contextKind: BookContextKind;
  readonly contractVersion: typeof BOOK_CONTEXT_ADAPTER_CONTRACT_VERSION;
  readonly input: BookContextAdapterInputRequirement;
  readonly classification: BookContextAdapterClassificationCapability;
  readonly sourceReplacement: BookContextAdapterSourceReplacementCapability;
  readonly output: BookContextAdapterOutputSchema;
  readonly conformance: BookContextAdapterConformance;
}

export interface BookContextAdapterRegistry {
  readonly contractVersion: typeof BOOK_CONTEXT_ADAPTER_CONTRACT_VERSION;
  readonly declarations: readonly BookContextAdapterDeclaration[];
  get(adapterId: string): BookContextAdapterDeclaration | undefined;
}
