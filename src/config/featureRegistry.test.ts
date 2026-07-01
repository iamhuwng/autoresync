import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FEATURE_IDS,
  FEATURE_REGISTRY,
  resolveFeatureFromRoute,
  validateFeatureId,
} from './featureRegistry';

describe('featureRegistry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveFeatureFromRoute', () => {
    it('maps known student test routes to testTaking', () => {
      expect(resolveFeatureFromRoute('/student-test/ABC123')).toBe('testTaking');
    });

    it('maps known homework routes to homework', () => {
      expect(resolveFeatureFromRoute('/teacher/homework')).toBe('homework');
    });

    it('maps Reading V2 studio routes to readingV2Studio', () => {
      expect(resolveFeatureFromRoute('/teacher/reading-v2/create')).toBe('readingV2Studio');
      expect(resolveFeatureFromRoute('/teacher/reading-v2/import')).toBe('readingV2Studio');
      expect(resolveFeatureFromRoute('/teacher/reading-v2/drafts/draft-123')).toBe('readingV2Studio');
      expect(resolveFeatureFromRoute('/teacher/reading-v2/materials/material-123/revise')).toBe('readingV2Studio');
      expect(resolveFeatureFromRoute('/teacher/materials/books/book-123')).toBe('readingV2Studio');
    });

    it('maps wildcard admin routes to adminPanel', () => {
      expect(resolveFeatureFromRoute('/admin/dashboard')).toBe('adminPanel');
    });

    it('maps result routes without params to results', () => {
      expect(resolveFeatureFromRoute('/guest-results')).toBe('results');
      expect(resolveFeatureFromRoute('/teacher/results')).toBe('results');
      expect(resolveFeatureFromRoute('/submission-complete')).toBe('results');
      expect(resolveFeatureFromRoute('/profile/complete')).toBe('results');
    });

    it('returns null for unknown routes', () => {
      expect(resolveFeatureFromRoute('/unknown/page')).toBeNull();
    });
  });

  it('registers Reading V2 master modal workflow actions', () => {
    const readingV2Studio = FEATURE_REGISTRY.find((feature) => feature.id === FEATURE_IDS.readingV2Studio);

    expect(readingV2Studio?.actions).toEqual(expect.arrayContaining([
      'reading_v2_master_edit_opened',
      'reading_v2_master_metadata_saved',
      'reading_v2_master_passage_reordered',
      'reading_v2_master_passage_added',
      'reading_v2_master_passage_removed',
      'reading_v2_master_passage_clone_requested',
      'reading_v2_master_passage_cloned',
      'reading_v2_master_clone_requested',
      'reading_v2_master_publish_submitted',
      'reading_v2_master_publish_completed',
      'reading_v2_master_publish_failed',
      'reading_v2_library_passage_clone_requested',
      'reading_v2_library_passage_cloned',
      'reading_v2_master_broken_refs_viewed',
      'reading_v2_master_ref_repair_started',
      'reading_v2_master_ref_repaired_existing',
      'reading_v2_master_ref_removed',
      'reading_v2_master_ref_remake_started',
      'reading_v2_master_repair_publish_submitted',
      'reading_v2_single_passage_version_published',
      'reading_v2_update_references_opened',
      'reading_v2_update_references_skipped',
      'reading_v2_update_references_submitted',
      'reading_v2_update_references_partial_failed',
      'startReadingV2ExistingPassages',
    ]));
  });

  describe('validateFeatureId', () => {
    it('returns true for a known feature id', () => {
      expect(validateFeatureId('testTaking')).toBe(true);
    });

    it('returns false for an unknown feature id', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(validateFeatureId('nonexistent')).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('FEATURE_REGISTRY', () => {
    it('ensures every feature entry has the required fields', () => {
      FEATURE_REGISTRY.forEach((feature) => {
        expect(feature.id).toEqual(expect.any(String));
        expect(feature.name).toEqual(expect.any(String));
        expect(feature.routes).toEqual(expect.any(Array));
        expect(feature.actions).toEqual(expect.any(Array));
        expect(feature.description).toEqual(expect.any(String));
      });
    });

    it('registers integrity detail actions for homework and results workflows', () => {
      const homework = FEATURE_REGISTRY.find((feature) => feature.id === 'homework');
      const liveSessions = FEATURE_REGISTRY.find((feature) => feature.id === 'liveSessions');
      const results = FEATURE_REGISTRY.find((feature) => feature.id === 'results');
      const antiCheat = FEATURE_REGISTRY.find((feature) => feature.id === 'antiCheat');
      const readingV2Studio = FEATURE_REGISTRY.find((feature) => feature.id === 'readingV2Studio');
      const testTaking = FEATURE_REGISTRY.find((feature) => feature.id === 'testTaking');
      const testCreation = FEATURE_REGISTRY.find((feature) => feature.id === 'testCreation');
      const adminPanel = FEATURE_REGISTRY.find((feature) => feature.id === 'adminPanel');

      expect(homework?.actions).toContain('viewIntegrityDetails');
      expect(homework?.actions).toEqual(expect.arrayContaining([
        'reading_v2_master_homework_assigned',
        'reading_v2_assignment_refresh_opened',
        'reading_v2_assignment_refresh_submitted',
        'reading_v2_assignment_refresh_blocked_started',
      ]));
      expect(liveSessions?.actions).toContain('viewIntegrityDetails');
      expect(results?.actions).toContain('viewIntegrityDetails');
      expect(readingV2Studio?.actions).toEqual(
        expect.arrayContaining([
          'openStudio',
          'startBlankMaterial',
          'startImportMaterial',
          'resumeDraft',
          'revisePublishedMaterial',
          'operationalStateAction',
          'openFromTeacherLobbyCard',
          'openFromTeacherLobbyDraft',
          'openCreateBookModal',
          'createBook',
          'openBook',
          'editBookMetadata',
          'archiveBook',
          'changeBookScope',
          'teacher_materials_book_node_added',
          'teacher_materials_book_node_reordered',
          'teacher_materials_book_node_deleted',
          'teacher_materials_book_material_attached',
          'teacher_materials_book_material_removed',
        ]),
      );
      expect(testCreation?.actions).toEqual(
        expect.arrayContaining([
          'teacher_materials_tab_changed',
          'teacher_materials_test_type_filter_selected',
          'teacher_materials_test_type_filter_cleared',
          'teacher_materials_test_type_preferences_opened',
          'teacher_materials_test_type_preferences_saved',
          'teacher_materials_book_create_opened',
          'teacher_materials_book_created',
          'teacher_materials_book_updated',
          'teacher_materials_book_public_review_requested',
          'teacher_materials_reading_passage_assigned',
          'teacher_materials_reading_passage_set_assigned',
          'openCreateBookModal',
          'createBook',
          'openBook',
          'editBookMetadata',
          'archiveBook',
          'changeBookScope',
          'selectListeningSkill',
          'startListeningCreationMode',
          'listeningAuthoringStepNext',
          'listeningAuthoringStepBack',
          'listeningPublishReadinessChecked',
          'listeningPublishReadinessFailed',
          'listeningAutosaveFailure',
          'listeningRevisionCreated',
          'listeningCommitFailure',
          'listeningOrphanGrowthObserved',
          'listeningLegacyTransition',
        ]),
      );
      expect(testTaking?.actions).toEqual(
        expect.arrayContaining([
          'launchReadingV2Runtime',
          'launchReadingPassageHomeworkRuntime',
          'readingV2LaunchBlocked',
          'submitReadingV2Attempt',
          'teacher_materials_reading_passage_homework_launched',
          'teacher_materials_reading_passage_homework_submitted',
          'reading_v2_assignment_payload_missing',
          'reading_v2_frozen_runtime_launched',
        ]),
      );
      expect(results?.actions).toEqual(
        expect.arrayContaining([
          'openReadingV2Review',
          'teacher_materials_reading_passage_result_viewed',
          'reading_v2_frozen_result_review_opened',
          'submitReadingV2Feedback',
          'createReadingV2Regrade',
          'readingV2OperationalError',
        ]),
      );
      expect(antiCheat?.actions).toEqual(
        expect.arrayContaining([
          'initializeProtection',
          'recordViolation',
          'flushIntegrityLogs',
          'persistSessionIntegrity',
          'persistHomeworkIntegrity',
        ]),
      );
      expect(adminPanel?.actions).toEqual(
        expect.arrayContaining([
          'switchPublicBookReviewsSettingsSection',
          'retryPublicBookReviewQueue',
          'approvePublicBookReview',
          'rejectPublicBookReview',
          'returnPublicBookToPrivate',
        ]),
      );
    });

    it('tracks guest claim completion under results rather than profile', () => {
      const profile = FEATURE_REGISTRY.find((feature) => feature.id === 'profile');
      const results = FEATURE_REGISTRY.find((feature) => feature.id === 'results');

      expect(profile?.routes).not.toContain('/profile/complete');
      expect(results?.routes).toContain('/profile/complete');
    });

    it('keeps Reading V2 review ownership inside existing result surfaces', () => {
      const readingV2Studio = FEATURE_REGISTRY.find((feature) => feature.id === 'readingV2Studio');

      expect(readingV2Studio?.routes).not.toEqual(
        expect.arrayContaining([
          '/teacher/reading-v2/results/:resultId',
          '/student/reading-v2/results/:resultId',
        ]),
      );
    });
  });
});
