import { describe, expect, it } from 'vitest';
import {
  BOOK_IMPACT_DISCOVERY_EFFECTS,
  createBookImpactDiscoveryConformanceRegistry,
} from './bookImpactDiscovery.types';
import type {
  BookImpactDiscoverySuccess,
  BookImpactSummary,
} from './bookImpactDiscovery.types';
import { BOOK_CLASS_IMPACT_ADAPTER_DECLARATION } from './bookClassImpactAdapter.service';
import { BOOK_COURSE_IMPACT_ADAPTER_DECLARATION } from './bookCourseImpactAdapter.service';
import { BOOK_HOMEWORK_IMPACT_ADAPTER_DECLARATION } from './bookHomeworkImpactAdapter.service';
import { BOOK_PUBLIC_IMPACT_ADAPTER_DECLARATION } from './bookPublicImpactAdapter.service';
import { BOOK_SOLO_IMPACT_ADAPTER_DECLARATION } from './bookSoloImpactAdapter.service';

type Assert<T extends true> = T;
type IsNever<T> = [T] extends [never] ? true : false;
type AssertNotNever<T> = Assert<IsNever<T> extends false ? true : false>;
type SummaryFor<TContextKind extends BookImpactSummary['contextKind']> = Extract<
  BookImpactSummary,
  { readonly contextKind: TContextKind }
>;
type SuccessFor<TContextKind extends BookImpactDiscoverySuccess['contextKind']> = Extract<
  BookImpactDiscoverySuccess,
  { readonly contextKind: TContextKind }
>;
type SoloSummaryIsConcrete = AssertNotNever<SummaryFor<'solo'>>;
type HomeworkSummaryIsConcrete = AssertNotNever<SummaryFor<'homework'>>;
type CourseSummaryIsConcrete = AssertNotNever<SummaryFor<'course'>>;
type ClassSummaryIsConcrete = AssertNotNever<SummaryFor<'class'>>;
type PublicSummaryIsConcrete = AssertNotNever<SummaryFor<'public-reference'>>;
type SoloSuccessImpactIsConcrete = AssertNotNever<SuccessFor<'solo'>['impacts'][number]>;
type HomeworkSuccessImpactIsConcrete = AssertNotNever<SuccessFor<'homework'>['impacts'][number]>;
type CourseSuccessImpactIsConcrete = AssertNotNever<SuccessFor<'course'>['impacts'][number]>;
type ClassSuccessImpactIsConcrete = AssertNotNever<SuccessFor<'class'>['impacts'][number]>;
type PublicSuccessImpactIsConcrete = AssertNotNever<SuccessFor<'public-reference'>['impacts'][number]>;
type SoloSummaryHasNoIdentity = Assert<
  SummaryFor<'solo'> extends { readonly identity?: never }
    ? true
    : false
>;
type PublicSummaryHasPublicIdentity = Assert<
  Extract<BookImpactSummary, { readonly contextKind: 'public-reference' }> extends {
    readonly identity: { readonly kind: 'public-reference'; readonly sourceOwnerId: string; readonly downstreamOwnerId: string };
  }
    ? true
    : false
>;
type HomeworkSummaryHasNoIdentity = Assert<
  SummaryFor<'homework'> extends { readonly identity?: never }
    ? true
    : false
>;
type CourseSuccessCarriesOnlyCourseImpacts = Assert<
  Extract<BookImpactDiscoverySuccess, { readonly contextKind: 'course' }> extends {
    readonly impacts: readonly Extract<BookImpactSummary, { readonly contextKind: 'course' }>[];
  }
    ? true
    : false
>;
void (0 as unknown as SoloSummaryHasNoIdentity);
void (0 as unknown as PublicSummaryHasPublicIdentity);
void (0 as unknown as HomeworkSummaryHasNoIdentity);
void (0 as unknown as CourseSuccessCarriesOnlyCourseImpacts);
void (0 as unknown as SoloSummaryIsConcrete);
void (0 as unknown as HomeworkSummaryIsConcrete);
void (0 as unknown as CourseSummaryIsConcrete);
void (0 as unknown as ClassSummaryIsConcrete);
void (0 as unknown as PublicSummaryIsConcrete);
void (0 as unknown as SoloSuccessImpactIsConcrete);
void (0 as unknown as HomeworkSuccessImpactIsConcrete);
void (0 as unknown as CourseSuccessImpactIsConcrete);
void (0 as unknown as ClassSuccessImpactIsConcrete);
void (0 as unknown as PublicSuccessImpactIsConcrete);

const declaration = (adapterId: string, contextKind: 'solo' | 'homework' | 'course' | 'class' | 'public-reference') => ({
  adapterId,
  adapterVersion: 1,
  contextKind,
  contractVersion: 1,
  input: {
    version: 1,
    immutable: true,
    requiredFields: ['frozen-placement-binding', 'book-impact-classification'],
  },
  classification: {
    version: 1,
    supportedEffects: [...BOOK_IMPACT_DISCOVERY_EFFECTS],
  },
  sourceReplacement: {
    version: 1,
    mode: 'owner-adopts-replacement',
    automaticUpdate: false,
  },
  output: { version: 1, fields: ['impact-summary'] },
  conformance: { status: 'verified', contractVersion: 1, verifiedAdapterVersion: 1 },
});

describe('39B impact discovery contract registration', () => {
  it('registers all canonical declarations without activation', () => {
    const registry = createBookImpactDiscoveryConformanceRegistry([
      BOOK_SOLO_IMPACT_ADAPTER_DECLARATION,
      BOOK_HOMEWORK_IMPACT_ADAPTER_DECLARATION,
      BOOK_COURSE_IMPACT_ADAPTER_DECLARATION,
      BOOK_CLASS_IMPACT_ADAPTER_DECLARATION,
      BOOK_PUBLIC_IMPACT_ADAPTER_DECLARATION,
    ]);
    expect(registry.declarations.map((item) => item.contextKind)).toEqual([
      'solo', 'homework', 'course', 'class', 'public-reference',
    ]);
    expect(registry.get('book-solo-impact-v1')?.adapterVersion).toBe(1);
    expect(Object.isFrozen(registry.declarations)).toBe(true);
    expect(JSON.stringify(registry)).not.toMatch(
      /authorization|mutation|rollback|activation|credential|privateObjectKey/iu,
    );
  });

  it('registers every closed 39A classification effect for conformance fixtures', () => {
    const registry = createBookImpactDiscoveryConformanceRegistry([
      declaration('book-solo-impact-v1', 'solo'),
    ]);
    const supported = registry.declarations[0]?.classification.supportedEffects ?? [];
    expect(supported).toEqual(BOOK_IMPACT_DISCOVERY_EFFECTS);
    expect(new Set(supported).size).toBe(12);
    expect(supported).toEqual(expect.arrayContaining([
      'unchanged',
      'display-only',
      'regrade',
      'redo-required',
      'added',
      'removed',
      'reordered',
      'moved',
      'mapping-source-context',
      'successor',
      'invalidation',
      'unsupported',
    ]));
  });

  it.each([
    ['uncertain conformance', { conformance: { status: 'uncertain', contractVersion: 1, verifiedAdapterVersion: 1 } }],
    ['stale conformance', { conformance: { status: 'verified', contractVersion: 1, verifiedAdapterVersion: 2 } }],
    ['wrong context', { contextKind: 'unsupported-context' }],
    ['extra authority field', { authorizationDecision: 'allow' }],
  ])('rejects %s', (_label, patch) => {
    expect(() => createBookImpactDiscoveryConformanceRegistry([
      { ...declaration('book-impact-v1', 'solo'), ...patch },
    ])).toThrow();
  });
});
