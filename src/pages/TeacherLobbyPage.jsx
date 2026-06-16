// TeacherLobbyPage composition layer (PRD-0033 refactor)
import React, { Suspense, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { get, ref, remove, set, update as updateDb } from 'firebase/database';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import { buildRoute } from '../constants/routes';
import {
  getTeacherMaterialsCapabilities,
  isReadingV2Payload,
} from '../config/readingV2FeatureFlags';
import { lazyWithRetry } from '../utils/lazyWithRetry.ts';
import {
  getTeacherMaterialsDiagnosticTime,
  getTeacherMaterialsElapsedMs,
  logTeacherMaterialsDiagnostic,
} from '../utils/teacherMaterialsDiagnostics';
import { Card, CardBody, toast } from '../components/modern';
import { TeacherHeader } from '../components/navigation';
import {
  createMaterialTestTypeConfigRepository,
  DEFAULT_MATERIAL_TEST_TYPES,
  listTeacherSelectableTestTypes,
} from '../services/materialCatalog/testTypeConfig.service';
import {
  createTeacherTestTypePreferenceRepository,
  getPinnedTestTypesForTeacher,
} from '../services/materialCatalog/teacherTestTypePreferences.service';
import {
  createBookDraft,
  createMaterialBooksRepository,
  listTeacherBooks,
  updateBookMetadata,
} from '../services/materialCatalog/materialBooks.service';
import { database } from '../services/firebase';
import {
  archiveReadingV2PassageMaterial,
  listTeacherReadingPassages,
} from '../services/reading-v2/readingV2PassageLibrary.service';
import { restoreReadingV2PassageMaterial } from '../services/reading-v2/readingV2PassageArchive.service';
import { writeReadingV2AuditEvent } from '../services/reading-v2/readingV2AuditTrail.service';
import { cloneReadingV2PublicPassageToTeacherLibrary } from '../services/reading-v2/readingV2PassageClone.service';
import { shouldShowReadingV2TeacherLobbyItem } from '../services/reading-v2/readingV2TeacherLobbyIntegration.service';
import {
  createReadingV2TeacherSelectedPassageDraft,
  publishReadingV2TeacherSelectedPassageCompositionEdit,
  removeReadingV2MasterComposition,
} from '../services/reading-v2/readingV2TeacherComposition.service';
import { buildReadingV2ExtractedFullTestCompositionId } from '../services/reading-v2/readingV2PassageExtraction.service';
import { readingV2StoragePaths } from '../services/reading-v2/readingV2StoragePaths.service';
import { ReadingV2MasterEditModal } from '../components/reading-v2/master/ReadingV2MasterEditModal';
import {
  isTeacherMaterialsVisualFixturesEnabled,
  listTeacherMaterialsFixtureBooks,
  listTeacherMaterialsFixtureReadingPassages,
} from './teacherMaterialsVisualFixtures';

// Extracted hooks
import { useModalManager } from '../hooks/useModalManager';
import { useTeacherTests } from '../hooks/test/useTeacherTests';
import { useTeacherDrafts } from '../hooks/thcs/useTeacherDrafts';
import { useSessionManager } from '../hooks/session/useSessionManager';
import { useTestFilters } from '../hooks/test/useTestFilters';

// Extracted components
import DraftCard from '../components/modern/DraftCard';
import ContentTabs from '../components/modern/ContentTabs';
import SearchFilterBar from '../components/modern/SearchFilterBar';
import TestTypeBlockModule from '../components/modern/TestTypeBlockModule';
import TestTypePreferenceModal from '../components/modern/TestTypePreferenceModal';
import MaterialListView from '../components/modern/MaterialListView';
import BookCardGrid from '../components/modern/BookCardGrid';
import { buildTestMaterialListRow, toReadingPassageRowModel } from '../components/modern/materialListAdapter';
import SessionBanner from '../components/SessionBanner';
import ClassSelectionModal from '../components/ClassSelectionModal';
import UseAsIsModal from '../components/UseAsIsModal';
import { HomeworkCreateModal } from '../components/homework/HomeworkCreateModal';
import CreateBookModal from '../components/books/CreateBookModal';
import BookEditorModal from '../components/books/BookEditorModal';
import './TeacherLobbyPage.css';

// Modals kept as direct imports (heavy components)
// NOTE: QuizEditor removed — no legacy quiz items remain (PRD-0033 Task 2)
const TestEditor = lazyWithRetry(() => import('../components/TestEditor.tsx'));
const TestCreationModal = lazyWithRetry(() => import('../components/test-creation/TestCreationModal'));
const THCSTestEditorModal = lazyWithRetry(() => import('../components/thcs-editor/THCSTestEditorModal'));
const WritingTestEditModal = lazyWithRetry(() => import('../components/writing/WritingTestEditModal'));

const THCSHomeworkAssignDialog = lazyWithRetry(() => import('../components/thcs-editor/THCSHomeworkAssignDialog'));
const BOOK_EDITOR_DISABLED_NOTICE = 'book-editor-disabled';

const readingV2AutoPipelineLaneFromParam = (value) => {
  if (value === 'v4-full-doc') {
    return value;
  }

  return undefined;
};

const normalizeTestTypeToken = (value) => String(value ?? '').trim().toLowerCase();

const appendTestTypeTokens = (tokens, value) => {
  if (Array.isArray(value)) {
    value.forEach((item) => appendTestTypeTokens(tokens, item));
    return;
  }

  const normalized = normalizeTestTypeToken(value);
  if (!normalized) {
    return;
  }

  tokens.add(normalized);
  normalized
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .forEach((part) => tokens.add(part));
};

const collectMaterialTestTypeTokens = (material) => {
  const tokens = new Set();
  appendTestTypeTokens(tokens, material?.primaryTestTypeId);
  appendTestTypeTokens(tokens, material?.testTypeIds);
  appendTestTypeTokens(tokens, material?.testType);
  appendTestTypeTokens(tokens, material?.metadata?.primaryTestTypeId);
  appendTestTypeTokens(tokens, material?.metadata?.testTypeIds);
  appendTestTypeTokens(tokens, material?.metadata?.testType);
  return tokens;
};

const isReadingV2MasterMaterial = (material) => {
  if (!isReadingV2Payload(material)) {
    return false;
  }

  const materialKind = String(material?.materialKind || material?.metadata?.materialKind || '').toLowerCase();
  const hasCompositionIdentity = Boolean(material?.compositionId || material?.fullTestCompositionId);
  const isPassageKind = materialKind.includes('passage') && !materialKind.includes('full-test');

  return !isPassageKind && (hasCompositionIdentity || materialKind.includes('full-test'));
};

const isPublishedReadingV2MasterMaterial = (material) => (
  isReadingV2MasterMaterial(material)
  && (
    material?.state === 'published'
    || material?.status === 'published'
    || Boolean(material?.publishedVersionId || material?.publishedSnapshotVersionId)
  )
);

const deriveReadingV2SelectedPassageCompositionId = (materialId) => {
  if (typeof materialId !== 'string' || !materialId.startsWith('composition-')) {
    return undefined;
  }

  return materialId.slice('composition-'.length) || undefined;
};

const toReadingV2MasterModalRecord = (material) => {
  const materialId = material?.materialId || material?.id || material?.testMaterialId;
  const publishedVersionId =
    material?.publishedVersionId ||
    material?.publishedSnapshotVersionId ||
    material?.metadata?.publishedVersionId ||
    material?.metadata?.publishedSnapshotVersionId;
  const compositionId =
    material?.compositionId ||
    material?.fullTestCompositionId ||
    material?.metadata?.compositionId ||
    deriveReadingV2SelectedPassageCompositionId(materialId) ||
    (
      materialId && publishedVersionId
        ? buildReadingV2ExtractedFullTestCompositionId(materialId, publishedVersionId)
        : undefined
    );

  return {
    ...material,
    materialId,
    testMaterialId: material?.testMaterialId || materialId,
    compositionId,
    publishedVersionId,
  };
};

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const resolveReadingV2MasterModalRecord = async (material, repository) => {
  const base = toReadingV2MasterModalRecord(material);
  const compositionId = base.compositionId;
  const existingRefs = Array.isArray(base.passageRefs) ? base.passageRefs : base.passages;

  if (!compositionId || (Array.isArray(existingRefs) && existingRefs.length > 0) || !repository?.read) {
    return {
      ...base,
      compositionLoadState: Array.isArray(existingRefs) && existingRefs.length > 0 ? 'ready' : 'not-required',
    };
  }

  try {
    const composition = await repository.read(readingV2StoragePaths.fullTestCompositions(compositionId));
    if (!isRecord(composition) || !Array.isArray(composition.passageRefs)) {
      return {
        ...base,
        compositionLoadState: 'missing-composition',
      };
    }

    return {
      ...base,
      ...composition,
      materialId: base.materialId,
      testMaterialId: composition.testMaterialId || base.testMaterialId,
      compositionId,
      publishedVersionId: composition.publishedVersionId || base.publishedVersionId,
      passageRefs: composition.passageRefs,
      compositionLoadState: 'ready',
    };
  } catch (error) {
    return {
      ...base,
      compositionLoadState: 'load-failed',
      compositionLoadError: error instanceof Error ? error.message : String(error),
    };
  }
};

const getReadingV2MasterTitle = (master) =>
  master?.title || master?.metadata?.title || 'Untitled Reading V2 master';

const getReadingV2MasterRemovalNotice = ({ master, includeLinkedPassages, passageCount }) => {
  const title = getReadingV2MasterTitle(master);
  if (!passageCount) {
    return `Removed "${title}".`;
  }

  if (!includeLinkedPassages) {
    return `Removed "${title}". Linked Reading Passages were kept.`;
  }

  const passageLabel = passageCount === 1 ? 'Reading Passage was archived' : 'Reading Passages were archived';
  return `Removed "${title}". ${passageCount} linked ${passageLabel}.`;
};

const getReadingV2MasterPassageRefs = (master) => {
  if (Array.isArray(master?.passageRefs)) {
    return master.passageRefs;
  }
  if (Array.isArray(master?.passages)) {
    return master.passages;
  }
  return [];
};

const getReadingV2MasterPassageId = (passageRef) =>
  passageRef?.passageMaterialId || passageRef?.materialId || passageRef?.id || '';

const getReadingV2MasterPassageTitle = (passageRef, index) =>
  passageRef?.title || passageRef?.titleSnapshot || `Reading Passage ${index + 1}`;

const toReadingV2MasterArchivePassage = (passageRef, master, index) => {
  const materialId = getReadingV2MasterPassageId(passageRef);
  const ownerId = passageRef?.ownerId || master?.ownerId;
  const versionId = passageRef?.currentVersionId || passageRef?.snapshotVersionId || passageRef?.publishedSnapshotVersionId;

  return {
    materialId,
    ownerId,
    title: getReadingV2MasterPassageTitle(passageRef, index),
    visibility: passageRef?.visibility || master?.visibility || 'private',
    materialKind: 'reading-passage',
    testTypeIds: passageRef?.testTypeIds || passageRef?.testTypeIdsSnapshot || master?.testTypeIds || [],
    sourceFullTestId: passageRef?.source?.sourceFullTestId || master?.testMaterialId || master?.materialId || master?.id,
    updatedAt: passageRef?.updatedAt || master?.updatedAt || new Date().toISOString(),
    currentVersionId: versionId,
    publishedSnapshotVersionId: versionId,
    questionCount: passageRef?.questionCount ?? passageRef?.questionCountSnapshot,
  };
};

const getConfigTokensForTestType = (activeTestTypeId, testTypeConfigs = DEFAULT_MATERIAL_TEST_TYPES) => {
  const activeId = normalizeTestTypeToken(activeTestTypeId);
  const tokens = new Set();
  appendTestTypeTokens(tokens, activeId);

  const config = testTypeConfigs.find(
    (testType) => normalizeTestTypeToken(testType.testTypeId) === activeId,
  );

  if (config) {
    appendTestTypeTokens(tokens, config.canonicalKey);
    appendTestTypeTokens(tokens, config.label);
    appendTestTypeTokens(tokens, config.shortLabel);
    appendTestTypeTokens(tokens, config.aliases);
  }

  return tokens;
};

const matchesActiveTestType = (material, activeTestTypeId, testTypeConfigs) => {
  if (!activeTestTypeId) {
    return true;
  }

  const materialTokens = collectMaterialTestTypeTokens(material);
  const activeTokens = getConfigTokensForTestType(activeTestTypeId, testTypeConfigs);

  return [...materialTokens].some((token) => activeTokens.has(token));
};

const overlayFallbackStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 2200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem',
  background: 'rgba(15, 23, 42, 0.55)',
  backdropFilter: 'blur(8px)',
};

const overlayCardStyle = {
  width: 'min(420px, 100%)',
  padding: '1.5rem',
  borderRadius: '1.25rem',
  background: 'rgba(255, 255, 255, 0.98)',
  border: '1px solid rgba(226, 232, 240, 0.9)',
  boxShadow: '0 24px 70px rgba(15,23,42,0.28)',
  textAlign: 'center',
  color: '#334155',
  fontWeight: 600,
};

function OverlayLoader({ label }) {
  return (
    <div style={overlayFallbackStyle}>
      <div style={overlayCardStyle}>
        {label}
      </div>
    </div>
  );
}

const safeListDiagnostic = ({ scope, rows, durationMs, searchTerm, activeTestTypeId }) => ({
  scope,
  count: rows.length,
  durationMs,
  searchActive: String(searchTerm || '').trim().length > 0,
  testTypeFilterActive: Boolean(activeTestTypeId),
});

const normalizeSearchValue = (value) => String(value || '').trim().toLowerCase();

const draftMatchesSearchTerm = (draft, searchTerm) => {
  const query = normalizeSearchValue(searchTerm);

  if (!query) {
    return true;
  }

  const metadata = draft?.metadata || {};
  const searchableText = [
    metadata.title,
    metadata.description,
    metadata.gradeLevel,
    metadata.examType,
    metadata.format,
    metadata.duration,
    draft?.title,
    draft?.testType,
    draft?.skill,
    draft?.status,
    draft?.draftKind,
  ]
    .filter(Boolean)
    .map(normalizeSearchValue)
    .join(' ');

  return searchableText.includes(query);
};

const TeacherLobbyPage = () => {
  const { navigateTo } = useNavigation('teacher');
  const { sessionCode } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, profile, logout } = useAuth();
  const { trackAction } = useFeatureTracking(FEATURE_IDS.testCreation);
  const readingV2AutoPipelineLane = import.meta.env.DEV || import.meta.env.MODE === 'test'
    ? readingV2AutoPipelineLaneFromParam(searchParams.get('readingV2AutoPipeline'))
    : undefined;
  const teacherMaterialsCapabilities = useMemo(() => getTeacherMaterialsCapabilities(), []);
  const teacherMaterialsNotice = location.state?.teacherMaterialsNotice === BOOK_EDITOR_DISABLED_NOTICE
    ? 'Book editing is disabled for this rollout.'
    : null;

  // ---------- Local UI State ----------
  const [contentFilter, setContentFilter] = useState('my'); // 'my' | 'public' | 'drafts' | 'reading-passage' | 'book'
  const [searchTerm, setSearchTerm] = useState('');
  const [testTypeFilter, setTestTypeFilter] = useState('all');
  const [activeTestTypeId, setActiveTestTypeId] = useState(null);
  const [testTypeConfigs, setTestTypeConfigs] = useState(DEFAULT_MATERIAL_TEST_TYPES);
  const [pinnedTestTypeIds, setPinnedTestTypeIds] = useState(null);
  const [testTypePreferencesOpen, setTestTypePreferencesOpen] = useState(false);
  const [readingPassageScope, setReadingPassageScope] = useState('private');
  const [readingPassageRows, setReadingPassageRows] = useState([]);
  const [readingPassageLoading, setReadingPassageLoading] = useState(false);
  const [readingPassageError, setReadingPassageError] = useState(null);
  const [selectedReadingPassageIds, setSelectedReadingPassageIds] = useState([]);
  const [readingV2MasterModalState, setReadingV2MasterModalState] = useState({
    open: false,
    mode: 'published',
    master: null,
  });
  const [readingV2MasterRemoveRequest, setReadingV2MasterRemoveRequest] = useState(null);
  const [readingV2MasterRemoveAcknowledged, setReadingV2MasterRemoveAcknowledged] = useState(false);
  const [readingV2MasterRemoveError, setReadingV2MasterRemoveError] = useState(null);
  const [readingV2MasterRemoveStatus, setReadingV2MasterRemoveStatus] = useState('idle');
  const [readingV2ExistingPassageDraftMetadata, setReadingV2ExistingPassageDraftMetadata] = useState(null);
  const [readingPassageFullTestCreateState, setReadingPassageFullTestCreateState] = useState({
    status: 'idle',
    message: null,
  });
  const [readingPassageHomeworkRequest, setReadingPassageHomeworkRequest] = useState(null);
  const [readingPassageArchiveRequest, setReadingPassageArchiveRequest] = useState(null);
  const [readingPassageArchiveAcknowledged, setReadingPassageArchiveAcknowledged] = useState(false);
  const [readingPassageRestoreRequest, setReadingPassageRestoreRequest] = useState(null);
  const [bookScope, setBookScope] = useState('private');
  const [bookRows, setBookRows] = useState([]);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState(null);
  const [bookListVersion, setBookListVersion] = useState(0);
  const [createBookModalOpen, setCreateBookModalOpen] = useState(false);
  const [bookEditorOpen, setBookEditorOpen] = useState(false);
  const [bookEditorBookId, setBookEditorBookId] = useState(null);
  const [bookEditorDirty, setBookEditorDirty] = useState(false);
  const [thcsGradeFilter, setThcsGradeFilter] = useState('all');
  const [thcsExamTypeFilter, setThcsExamTypeFilter] = useState('all');
  const [editingWritingDraft, setEditingWritingDraft] = useState(null);
  const testTypeConfigsRef = useRef(DEFAULT_MATERIAL_TEST_TYPES);
  const consumedRouteBookOpenRef = useRef(null);
  const bookEditorLauncherRef = useRef(null);

  // ---------- Hooks ----------
  const modals = useModalManager();
  const shouldLoadTeacherTests = contentFilter === 'my' || contentFilter === 'public';
  const { tests, loading: contentLoading, loadedScope, deleteTest, refresh: refreshTests } = useTeacherTests({
    enabled: shouldLoadTeacherTests,
    ownerId: user?.uid,
    userRole: profile?.role,
    contentFilter,
  });
  const { drafts, loading: draftsLoading, error: draftsError, deleteDraft, refreshDrafts } = useTeacherDrafts({
    userId: user?.uid || '',
    enabled: contentFilter === 'drafts',
  });

  const session = useSessionManager({
    sessionCode,
    userId: user?.uid || '',
    userRole: profile?.role || '',
    tests,
    navigateTo,
  });

  const { filteredTests } = useTestFilters(tests, {
    userId: user?.uid || '',
    userRole: profile?.role || '',
    contentFilter,
    searchTerm,
    testTypeFilter,
    thcsGradeFilter,
    thcsExamTypeFilter,
  });
  const visibleTests = filteredTests
    .filter((test) => shouldShowReadingV2TeacherLobbyItem(test))
    .filter((test) => {
      if (!activeTestTypeId) {
        return true;
      }

      return matchesActiveTestType(test, activeTestTypeId, testTypeConfigs);
    });
  const visibleDrafts = drafts
    .filter((draft) => !isReadingV2Payload(draft))
    .filter((draft) => draftMatchesSearchTerm(draft, searchTerm));
  const visibleReadingV2Count = visibleTests.filter((test) => test?.deliveryEngine === 'reading-v2').length;
  const activeTestScope = contentFilter === 'public'
    ? 'public'
    : profile?.role === 'super_admin' && contentFilter === 'my'
      ? 'all'
      : 'owned';
  const shouldLogTestGridRender = contentFilter === 'my' || contentFilter === 'public';
  const teacherTestTypePreferenceRepository = useMemo(() => createTeacherTestTypePreferenceRepository({
    read: async (path) => {
      const snapshot = await get(ref(database, path));
      return snapshot.val();
    },
    write: async (path, value) => {
      await set(ref(database, path), value);
    },
  }), []);
  const materialTestTypeConfigRepository = useMemo(() => createMaterialTestTypeConfigRepository({
    read: async (path) => {
      const snapshot = await get(ref(database, path));
      return snapshot.val();
    },
    write: async (path, value) => {
      await set(ref(database, path), value);
    },
  }), []);
  const materialBooksRepository = useMemo(() => createMaterialBooksRepository({
    read: async (path) => {
      const snapshot = await get(ref(database, path));
      return snapshot.val();
    },
    write: async (path, value) => {
      await set(ref(database, path), value);
    },
    remove: async (path) => {
      await remove(ref(database, path));
    },
    update: async (payload) => {
      await updateDb(ref(database), payload);
    },
  }), []);
  const activeBookEditorBook = useMemo(
    () => bookRows.find((book) => (book.bookId || book.id) === bookEditorBookId) ?? null,
    [bookEditorBookId, bookRows],
  );
  const readingV2CompositionRepository = useMemo(() => ({
    read: async (path) => {
      const snapshot = await get(ref(database, path));
      return snapshot.val();
    },
    write: async (path, value) => {
      await set(ref(database, path), value);
    },
    remove: async (path) => {
      await remove(ref(database, path));
    },
    update: async (updates) => {
      await updateDb(ref(database), updates);
    },
  }), []);
  const readingV2PassageArchiveRepository = useMemo(() => ({
    read: async (path) => {
      const snapshot = await get(ref(database, path));
      return snapshot.val();
    },
    write: async (path, value) => {
      await set(ref(database, path), value);
    },
    remove: async (path) => {
      await remove(ref(database, path));
    },
    update: async (updates) => {
      await updateDb(ref(database), updates);
    },
  }), []);
  const writeReadingV2MasterRepairAudit = useCallback((sourceFeatureId, brokenRef, after) => {
    const master = readingV2MasterModalState.master;
    if (!master || !user?.uid) {
      return;
    }

    const createdAt = new Date().toISOString();
    const compositionId = master.compositionId || master.id || master.materialId || master.testMaterialId || 'unknown-master';
    const eventId = `${compositionId}:reading_master_broken_ref_repaired:${brokenRef.refId || brokenRef.passageMaterialId || brokenRef.materialId || 'ref'}:${Date.now()}`;

    void writeReadingV2AuditEvent({
      eventId,
      createdAt,
      actorUserId: user.uid,
      actorRole: profile?.role === 'super_admin' ? 'super_admin' : 'teacher',
      action: 'reading_master_broken_ref_repaired',
      entityType: 'reading-master',
      entityId: compositionId,
      ownerId: master.ownerId || user.uid,
      materialId: master.testMaterialId || master.materialId,
      versionId: master.publishedVersionId,
      titleSnapshot: master.title || master.metadata?.title,
      before: {
        refId: brokenRef.refId,
        materialId: brokenRef.passageMaterialId || brokenRef.materialId,
        snapshotVersionId: brokenRef.snapshotVersionId,
        reason: brokenRef.reason,
      },
      after,
      correlationId: eventId,
      sourceFeatureId,
      sourceRoute: '/lobby',
    }).catch(() => undefined);
  }, [profile?.role, readingV2MasterModalState.master, user?.uid]);

  useEffect(() => {
    testTypeConfigsRef.current = testTypeConfigs;
  }, [testTypeConfigs]);

  useEffect(() => {
    if (!teacherMaterialsCapabilities.canUseTestTypeBlocks) {
      if (testTypeConfigsRef.current !== DEFAULT_MATERIAL_TEST_TYPES) {
        setTestTypeConfigs(DEFAULT_MATERIAL_TEST_TYPES);
      }
      return undefined;
    }

    let cancelled = false;
    const startedAt = getTeacherMaterialsDiagnosticTime();

    listTeacherSelectableTestTypes(materialTestTypeConfigRepository)
      .then((configs) => {
        if (cancelled) {
          return;
        }

        if (configs.length > 0) {
          setTestTypeConfigs(configs);
          testTypeConfigsRef.current = configs;
          logTeacherMaterialsDiagnostic('test_type_config_resolved', {
            source: 'live-admin-config',
            count: configs.length,
            fallbackUsed: false,
            durationMs: getTeacherMaterialsElapsedMs(startedAt),
          });
          return;
        }

        if (testTypeConfigsRef.current !== DEFAULT_MATERIAL_TEST_TYPES) {
          setTestTypeConfigs(DEFAULT_MATERIAL_TEST_TYPES);
          testTypeConfigsRef.current = DEFAULT_MATERIAL_TEST_TYPES;
        }
        logTeacherMaterialsDiagnostic('test_type_config_resolved', {
          source: 'fallback-default-empty',
          count: DEFAULT_MATERIAL_TEST_TYPES.length,
          fallbackUsed: true,
          caveat: 'material_catalog/test_types empty',
          durationMs: getTeacherMaterialsElapsedMs(startedAt),
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        if (testTypeConfigsRef.current !== DEFAULT_MATERIAL_TEST_TYPES) {
          setTestTypeConfigs(DEFAULT_MATERIAL_TEST_TYPES);
          testTypeConfigsRef.current = DEFAULT_MATERIAL_TEST_TYPES;
        }
        logTeacherMaterialsDiagnostic('test_type_config_load_failed', {
          message: error instanceof Error ? error.message : String(error),
          fallbackUsed: true,
          durationMs: getTeacherMaterialsElapsedMs(startedAt),
        });
        console.warn('Failed to load Test Type config:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [materialTestTypeConfigRepository, teacherMaterialsCapabilities.canUseTestTypeBlocks]);

  useEffect(() => {
    if (!user?.uid) {
      setPinnedTestTypeIds(null);
      return undefined;
    }

    let cancelled = false;
    const startedAt = getTeacherMaterialsDiagnosticTime();

    getPinnedTestTypesForTeacher(user.uid, {
      activeTestTypes: testTypeConfigs,
      preferenceRepository: teacherTestTypePreferenceRepository,
    })
      .then((result) => {
        if (!cancelled) {
          logTeacherMaterialsDiagnostic('test_type_preference_resolved', {
            source: result.source,
            warning: result.warning,
            pinnedCount: result.testTypes.length,
            fallbackUsed: result.source !== 'teacher-preference',
            durationMs: getTeacherMaterialsElapsedMs(startedAt),
          });
          if (result.source === 'teacher-preference' || result.source === 'teacher-preference-repaired') {
            setPinnedTestTypeIds(result.testTypes.map((testType) => testType.testTypeId));
          }
        }
      })
      .catch((error) => {
        logTeacherMaterialsDiagnostic('test_type_preference_load_failed', {
          message: error instanceof Error ? error.message : String(error),
          durationMs: getTeacherMaterialsElapsedMs(startedAt),
        });
        console.warn('Failed to load Test Type preferences:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [teacherTestTypePreferenceRepository, testTypeConfigs, user?.uid]);

  useEffect(() => {
    if (contentFilter === 'reading-passage' && !teacherMaterialsCapabilities.canUseReadingPassageLibrary) {
      setContentFilter('my');
      setReadingPassageRows([]);
      setSelectedReadingPassageIds([]);
      return;
    }

    if (contentFilter === 'book' && !teacherMaterialsCapabilities.canUseMaterialBooks) {
      setContentFilter('my');
      setBookRows([]);
    }
  }, [
    contentFilter,
    teacherMaterialsCapabilities.canUseMaterialBooks,
    teacherMaterialsCapabilities.canUseReadingPassageLibrary,
  ]);

  useEffect(() => {
    if (contentFilter !== 'reading-passage') {
      return undefined;
    }

    if (!teacherMaterialsCapabilities.canUseReadingPassageLibrary) {
      setReadingPassageRows([]);
      setSelectedReadingPassageIds([]);
      return undefined;
    }

    if (!user?.uid) {
      setReadingPassageRows([]);
      return undefined;
    }

    let cancelled = false;
    const startedAt = getTeacherMaterialsDiagnosticTime();
    setReadingPassageLoading(true);
    setReadingPassageError(null);
    logTeacherMaterialsDiagnostic('reading_passage_list_requested', {
      scope: readingPassageScope,
      searchActive: searchTerm.trim().length > 0,
      testTypeFilterActive: Boolean(activeTestTypeId),
    });

    if (isTeacherMaterialsVisualFixturesEnabled()) {
      const rows = listTeacherMaterialsFixtureReadingPassages({
        teacherId: user.uid,
        scope: readingPassageScope,
        searchTerm,
        testTypeId: activeTestTypeId,
      });
      setReadingPassageRows(rows);
      setReadingPassageLoading(false);
      logTeacherMaterialsDiagnostic('reading_passage_list_succeeded', {
        ...safeListDiagnostic({
          scope: readingPassageScope,
          rows,
          durationMs: getTeacherMaterialsElapsedMs(startedAt),
          searchTerm,
          activeTestTypeId,
        }),
        source: 'visual-fixture',
      });
      return undefined;
    }

    listTeacherReadingPassages({
      teacherId: user.uid,
      scope: readingPassageScope,
      searchTerm,
      testTypeId: activeTestTypeId,
      testTypeConfigs,
    })
      .then((rows) => {
        if (!cancelled) {
          setReadingPassageRows(rows);
          logTeacherMaterialsDiagnostic('reading_passage_list_succeeded', safeListDiagnostic({
            scope: readingPassageScope,
            rows,
            durationMs: getTeacherMaterialsElapsedMs(startedAt),
            searchTerm,
            activeTestTypeId,
          }));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to load Reading Passages:', error);
          setReadingPassageRows([]);
          setReadingPassageError('Failed to load Reading Passages.');
          logTeacherMaterialsDiagnostic('reading_passage_list_failed', {
            scope: readingPassageScope,
            durationMs: getTeacherMaterialsElapsedMs(startedAt),
            message: error instanceof Error ? error.message : String(error),
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReadingPassageLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeTestTypeId,
    contentFilter,
    readingPassageScope,
    searchTerm,
    teacherMaterialsCapabilities.canUseReadingPassageLibrary,
    testTypeConfigs,
    user?.uid,
  ]);

  useEffect(() => {
    if (contentFilter !== 'book') {
      return undefined;
    }

    if (!teacherMaterialsCapabilities.canUseMaterialBooks) {
      setBookRows([]);
      return undefined;
    }

    if (!user?.uid) {
      setBookRows([]);
      return undefined;
    }

    let cancelled = false;
    const startedAt = getTeacherMaterialsDiagnosticTime();
    setBookLoading(true);
    setBookError(null);
    logTeacherMaterialsDiagnostic('book_list_requested', {
      scope: bookScope,
      searchActive: searchTerm.trim().length > 0,
      testTypeFilterActive: Boolean(activeTestTypeId),
    });

    if (isTeacherMaterialsVisualFixturesEnabled()) {
      const rows = listTeacherMaterialsFixtureBooks({
        teacherId: user.uid,
        scope: bookScope,
        searchTerm,
        testTypeId: activeTestTypeId,
      });
      setBookRows(rows);
      setBookLoading(false);
      logTeacherMaterialsDiagnostic('book_list_succeeded', {
        ...safeListDiagnostic({
          scope: bookScope,
          rows,
          durationMs: getTeacherMaterialsElapsedMs(startedAt),
          searchTerm,
          activeTestTypeId,
        }),
        source: 'visual-fixture',
      });
      return undefined;
    }

    listTeacherBooks({
      teacherId: user.uid,
      scope: bookScope,
      searchTerm,
      testTypeId: activeTestTypeId,
      repository: materialBooksRepository,
      testTypeConfigs,
    })
      .then((rows) => {
        if (!cancelled) {
          setBookRows(rows);
          logTeacherMaterialsDiagnostic('book_list_succeeded', safeListDiagnostic({
            scope: bookScope,
            rows,
            durationMs: getTeacherMaterialsElapsedMs(startedAt),
            searchTerm,
            activeTestTypeId,
          }));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to load Books:', error);
          setBookRows([]);
          setBookError('Failed to load Books.');
          logTeacherMaterialsDiagnostic('book_list_failed', {
            scope: bookScope,
            durationMs: getTeacherMaterialsElapsedMs(startedAt),
            message: error instanceof Error ? error.message : String(error),
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBookLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeTestTypeId,
    bookListVersion,
    bookScope,
    contentFilter,
    materialBooksRepository,
    searchTerm,
    teacherMaterialsCapabilities.canUseMaterialBooks,
    testTypeConfigs,
    user?.uid,
  ]);

  useEffect(() => {
    const routeBookId = location.state?.teacherMaterialsOpenBookId;

    if (!routeBookId || consumedRouteBookOpenRef.current === routeBookId) {
      return;
    }

    consumedRouteBookOpenRef.current = routeBookId;
    setContentFilter('book');
    setBookScope('private');
    setBookEditorBookId(routeBookId);
    bookEditorLauncherRef.current = null;
    setBookEditorOpen(true);
    trackAction('openBook', {
      bookId: routeBookId,
      source: location.state?.teacherMaterialsOpenBookSource || 'legacy-book-route',
    });
    trackAction('teacher_materials_book_editor_opened', {
      bookId: routeBookId,
      source: location.state?.teacherMaterialsOpenBookSource || 'legacy-book-route',
    });
    navigateTo('LOBBY', {}, {
      reason: 'teacher_materials_book_route_state_consumed',
      replace: true,
      force: true,
      state: {},
    });
  }, [
    location.state?.teacherMaterialsOpenBookId,
    location.state?.teacherMaterialsOpenBookSource,
    navigateTo,
    trackAction,
  ]);

  const handleContentFilterChange = useCallback((nextTab) => {
    setContentFilter((currentTab) => {
      if (currentTab !== nextTab) {
        trackAction('teacher_materials_tab_changed', {
          from: currentTab,
          to: nextTab,
        });
      }

      return nextTab;
    });
  }, [trackAction]);

  const handleTestTypeFilterChange = useCallback((nextFilter) => {
    setTestTypeFilter(nextFilter);
    trackAction(
      nextFilter === 'all'
        ? 'teacher_materials_test_type_filter_cleared'
        : 'teacher_materials_test_type_filter_selected',
      {
        source: 'teacher_materials_search_filter_bar',
        testTypeId: nextFilter === 'all' ? null : nextFilter,
      },
    );
  }, [trackAction]);

  const handleActiveTestTypeChange = useCallback((nextTestTypeId) => {
    setActiveTestTypeId(nextTestTypeId);
    trackAction(
      nextTestTypeId
        ? 'teacher_materials_test_type_filter_selected'
        : 'teacher_materials_test_type_filter_cleared',
      {
        source: 'teacher_materials_test_type_block',
        testTypeId: nextTestTypeId,
      },
    );
  }, [trackAction]);

  useEffect(() => {
    if (contentFilter !== 'reading-passage') {
      setSelectedReadingPassageIds([]);
      setReadingPassageFullTestCreateState({ status: 'idle', message: null });
      return;
    }

    const visibleIds = new Set(readingPassageRows.map((row) => row.materialId || row.id));
    setSelectedReadingPassageIds((currentIds) => currentIds.filter((id) => visibleIds.has(id)));
  }, [contentFilter, readingPassageRows]);

  useEffect(() => {
    if (!shouldLogTestGridRender || contentLoading || loadedScope !== activeTestScope) {
      return;
    }

    logTeacherMaterialsDiagnostic('grid_rendered', {
      tab: contentFilter,
      dataScope: loadedScope,
      viewMode: 'list',
      loadedCount: tests.length,
      filteredCount: filteredTests.length,
      visibleCount: visibleTests.length,
      visibleReadingV2Count,
      searchActive: searchTerm.trim().length > 0,
      testTypeFilter,
      thcsGradeFilter,
      thcsExamTypeFilter,
      activeTestTypeId,
    });
  }, [
    activeTestScope,
    activeTestTypeId,
    contentFilter,
    contentLoading,
    filteredTests.length,
    loadedScope,
    searchTerm,
    tests.length,
    testTypeFilter,
    thcsExamTypeFilter,
    thcsGradeFilter,
    visibleReadingV2Count,
    visibleTests.length,
    shouldLogTestGridRender,
  ]);

  const handleOpenTestCreation = useCallback(() => {
    trackAction('createTest', { source: 'teacher_lobby' });
    modals.openTestCreation();
  }, [modals.openTestCreation, trackAction]);

  const handleOpenCreateBookModal = useCallback(() => {
    trackAction('openCreateBookModal', { source: 'teacher_lobby_book_tab' });
    trackAction('teacher_materials_book_create_opened', { source: 'teacher_lobby_book_tab' });
    setCreateBookModalOpen(true);
  }, [trackAction]);

  const handleOpenCreateAction = useCallback(() => {
    if (contentFilter === 'book') {
      handleOpenCreateBookModal();
      return;
    }

    handleOpenTestCreation();
  }, [contentFilter, handleOpenCreateBookModal, handleOpenTestCreation]);

  const handleCloseTestCreation = useCallback(() => {
    modals.closeTestCreation();
  }, [modals.closeTestCreation]);

  const handleStartReadingV2ExistingPassages = useCallback((metadata) => {
    setReadingV2ExistingPassageDraftMetadata(metadata);
    setContentFilter('reading-passage');
  }, []);

  const handleCloseReadingV2MasterModal = useCallback(() => {
    setReadingV2MasterModalState({
      open: false,
      mode: 'published',
      master: null,
    });
  }, []);

  const handleOpenReadingV2PassageStudio = useCallback((request) => {
    const routePath = buildRoute(request.routeName, request.params);
    if (request.target === 'new-tab' && typeof window !== 'undefined' && window.open) {
      window.open(routePath, '_blank', 'noopener,noreferrer');
      return;
    }

    navigateTo(request.routeName, request.params, { reason: 'reading_v2_master_open_passage_studio' });
  }, [navigateTo]);

  const handleCloseCreateBookModal = useCallback(() => {
    setCreateBookModalOpen(false);
  }, []);

  const bookValidationContext = useMemo(() => ({
    actorId: user?.uid || '',
    actorRole: profile?.role || 'teacher',
    testTypeConfigs,
  }), [profile?.role, testTypeConfigs, user?.uid]);

  const handleOpenTestTypePreferences = useCallback(({ testTypeId }) => {
    trackAction('openTestTypePreferences', {
      source: 'teacher_materials_test_type_block',
      testTypeId,
    });
    trackAction('teacher_materials_test_type_preferences_opened', {
      source: 'teacher_materials_test_type_block',
      testTypeId,
    });
    setTestTypePreferencesOpen(true);
  }, [trackAction]);

  const openWritingDraftEditor = useCallback((draft, source) => {
    trackAction('editTest', {
      source,
      skill: 'writing',
      draftId: draft?.id || null,
      publishedTestId: draft?.publishedTestId || null,
      status: draft?.status || null,
    });
    setEditingWritingDraft(draft);
  }, [trackAction]);

  const closeWritingDraftEditor = useCallback(() => {
    setEditingWritingDraft(null);
  }, []);

  // ---------- Handlers ----------
  const handleLogout = async () => {
    try {
      await logout();
      navigateTo('LOGIN', {}, { reason: 'teacher_logout', replace: true });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleEditTest = useCallback((test) => {
    const isWritingTest = test?.testType === 'IELTS' && String(test?.skill || '').toLowerCase() === 'writing';
    const readingV2MaterialId = isReadingV2Payload(test) ? test?.materialId || test?.id : null;

    if (readingV2MaterialId) {
      if (isPublishedReadingV2MasterMaterial(test)) {
        const master = {
          ...toReadingV2MasterModalRecord(test),
          compositionLoadState: 'loading',
        };
        trackAction('reading_v2_master_edit_opened', {
          source: 'teacher_lobby_test_card',
          skill: 'reading-v2',
          testId: master.materialId,
          materialId: master.materialId,
          compositionId: master.compositionId || null,
          publishedVersionId: master.publishedVersionId || null,
        });
        if (master.hasBrokenRefs || master.brokenRefSummary?.hasBrokenRefs) {
          trackAction('reading_v2_master_broken_refs_viewed', {
            source: 'teacher_lobby_test_card',
            materialId: master.materialId,
            brokenRefCount: master.brokenRefCount || master.brokenRefSummary?.brokenRefCount || 0,
          });
        }
        setReadingV2MasterModalState({
          open: true,
          mode: 'published',
          master,
        });
        void resolveReadingV2MasterModalRecord(test, readingV2CompositionRepository)
          .then((resolvedMaster) => {
            setReadingV2MasterModalState((current) => (
              current.open && current.master?.materialId === master.materialId
                ? {
                    ...current,
                    master: resolvedMaster,
                  }
                : current
            ));
            logTeacherMaterialsDiagnostic('reading_v2_master_composition_resolved', {
              materialId: resolvedMaster.materialId,
              compositionId: resolvedMaster.compositionId || null,
              passageRefCount: Array.isArray(resolvedMaster.passageRefs) ? resolvedMaster.passageRefs.length : 0,
              compositionLoadState: resolvedMaster.compositionLoadState,
            });
          });
        return;
      }

      trackAction('editTest', {
        source: 'teacher_lobby_test_card',
        skill: 'reading-v2',
        testId: readingV2MaterialId,
      });
      navigateTo(
        'TEACHER_READING_V2_REVISE',
        { materialId: readingV2MaterialId },
        { reason: 'teacher_lobby_edit_reading_v2_material' }
      );
      return;
    }

    if (test.testType === 'THCS-THPT') {
      trackAction('editTest', {
        source: 'teacher_lobby_test_card',
        skill: 'thcs',
        testId: test.id,
      });
      modals.openEditThcsTest(test);
      return;
    }

    if (isWritingTest) {
      if (!user?.uid) {
        alert('You must be signed in to edit this writing test.');
        return;
      }

      import('../services/writingTestService')
        .then(async ({ ensureWritingEditableDraft, getWritingDraft }) => {
          const result = await ensureWritingEditableDraft(test, user.uid);
          if (!result.success || !result.draftId) {
            throw new Error(result.error || 'Failed to prepare writing draft');
          }

          const draftResult = await getWritingDraft(result.draftId);
          if (!draftResult.success || !draftResult.data) {
            throw new Error(draftResult.error || 'Failed to load writing draft');
          }

          openWritingDraftEditor(draftResult.data, 'teacher_lobby_test_card');
        })
        .catch((error) => {
          console.error('Failed to open writing editor:', error);
          alert(error instanceof Error ? error.message : 'Failed to open writing editor.');
        });
      return;
    }

    trackAction('editTest', {
      source: 'teacher_lobby_test_card',
      skill: String(test?.skill || '').toLowerCase() || null,
      testId: test.id,
    });
    modals.openEditTest(test);
  }, [modals.openEditThcsTest, modals.openEditTest, navigateTo, openWritingDraftEditor, readingV2CompositionRepository, trackAction, user?.uid]);

  const handleDeleteTest = useCallback(async (test) => {
    if (isReadingV2MasterMaterial(test)) {
      const master = await resolveReadingV2MasterModalRecord(test, readingV2CompositionRepository);
      setReadingV2MasterRemoveRequest(master);
      setReadingV2MasterRemoveAcknowledged(false);
      setReadingV2MasterRemoveError(null);
      setReadingV2MasterRemoveStatus('idle');
      trackAction('master_delete_requested', {
        materialId: master?.testMaterialId || master?.materialId || master?.id,
        compositionId: master?.compositionId,
        source: 'teacher_materials_test_card',
      });
      return;
    }

    const isThcs = test.testType === 'THCS-THPT';
    const isWritingTest = test?.testType === 'IELTS' && String(test?.skill || '').toLowerCase() === 'writing';
    const testTitle = isThcs || isWritingTest ? test.metadata?.title : test.title;
    if (window.confirm(`Are you sure you want to delete "${testTitle || 'this test'}"?`)) {
      await deleteTest(test);
    }
  }, [deleteTest, readingV2CompositionRepository, trackAction]);

  const handleCancelReadingV2MasterRemove = useCallback(() => {
    setReadingV2MasterRemoveRequest(null);
    setReadingV2MasterRemoveAcknowledged(false);
    setReadingV2MasterRemoveError(null);
    setReadingV2MasterRemoveStatus('idle');
  }, []);

  const handleConfirmReadingV2MasterRemove = useCallback(async ({ includeLinkedPassages }) => {
    const master = readingV2MasterRemoveRequest;
    if (!master || !user?.uid || readingV2MasterRemoveStatus === 'removing') {
      return;
    }

    const passageRefs = getReadingV2MasterPassageRefs(master);
    const nonOwnedRefs = passageRefs.filter((passageRef) => {
      const ownerId = passageRef?.ownerId || master.ownerId;
      return ownerId && ownerId !== user.uid;
    });
    if (includeLinkedPassages && (nonOwnedRefs.length > 0 || !readingV2MasterRemoveAcknowledged)) {
      return;
    }

    setReadingV2MasterRemoveStatus('removing');
    setReadingV2MasterRemoveError(null);

    try {
      if (includeLinkedPassages) {
        trackAction('master_linked_passages_remove_requested', {
          materialId: master.testMaterialId || master.materialId || master.id,
          compositionId: master.compositionId,
          passageCount: passageRefs.length,
          source: 'teacher_materials_master_delete_modal',
        });

        for (const [index, passageRef] of passageRefs.entries()) {
          const archivePassage = toReadingV2MasterArchivePassage(passageRef, master, index);
          if (!archivePassage.materialId || !archivePassage.ownerId) {
            throw new Error('Linked Reading Passage is missing archive identity.');
          }
          await archiveReadingV2PassageMaterial({
            actorUserId: user.uid,
            actorRole: profile?.role === 'super_admin' ? 'super_admin' : 'teacher',
            teacherId: user.uid,
            passage: archivePassage,
            repository: readingV2PassageArchiveRepository,
            usageSummary: {
              usedElsewhere: true,
              usageCategories: ['master'],
            },
            correlationId: `${user.uid}:${master.compositionId || master.testMaterialId}:linked:${archivePassage.materialId}`,
            sourceFeatureId: 'teacher_materials_reading_master_and_linked_passages_removed',
            sourceRoute: '/lobby',
          });
        }
      }

      await removeReadingV2MasterComposition({
        actorUserId: user.uid,
        actorRole: profile?.role === 'super_admin' ? 'super_admin' : 'teacher',
        composition: {
          ...master,
          ownerId: master.ownerId || user.uid,
          testMaterialId: master.testMaterialId || master.materialId || master.id,
          title: getReadingV2MasterTitle(master),
          visibility: master.visibility || 'private',
          testTypeIds: master.testTypeIds || [],
          updatedAt: master.updatedAt || new Date().toISOString(),
          passageRefs,
        },
        repository: readingV2CompositionRepository,
        correlationId: `${user.uid}:${master.compositionId || master.testMaterialId}:remove`,
        sourceFeatureId: includeLinkedPassages
          ? 'teacher_materials_reading_master_and_linked_passages_removed'
          : 'teacher_materials_reading_master_removed',
        sourceRoute: '/lobby',
      });

      trackAction(
        includeLinkedPassages
          ? 'teacher_materials_reading_master_and_linked_passages_removed'
          : 'teacher_materials_reading_master_removed',
        {
          materialId: master.testMaterialId || master.materialId || master.id,
          compositionId: master.compositionId,
          passageCount: passageRefs.length,
          source: 'teacher_materials_master_delete_modal',
        },
      );
      logTeacherMaterialsDiagnostic('reading_v2_master_removed', {
        materialId: master.testMaterialId || master.materialId || master.id,
        compositionId: master.compositionId,
        linkedPassagesArchived: includeLinkedPassages,
        passageCount: passageRefs.length,
      });
      toast.success(getReadingV2MasterRemovalNotice({
        master,
        includeLinkedPassages,
        passageCount: passageRefs.length,
      }));
      setReadingV2MasterRemoveRequest(null);
      setReadingV2MasterRemoveAcknowledged(false);
      setReadingV2MasterRemoveStatus('idle');
      await refreshTests();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove Reading V2 master.';
      console.error('Failed to remove Reading V2 master:', error);
      setReadingV2MasterRemoveError(message);
      setReadingV2MasterRemoveStatus('failed');
      logTeacherMaterialsDiagnostic('reading_v2_master_remove_failed', {
        materialId: master.testMaterialId || master.materialId || master.id,
        compositionId: master.compositionId,
        linkedPassagesRequested: includeLinkedPassages,
        message,
      });
    }
  }, [
    profile?.role,
    readingV2CompositionRepository,
    readingV2MasterRemoveAcknowledged,
    readingV2MasterRemoveRequest,
    readingV2MasterRemoveStatus,
    readingV2PassageArchiveRepository,
    refreshTests,
    trackAction,
    user?.uid,
  ]);

  const handleDeleteDraft = useCallback(async (draft) => {
    const draftTitle = draft.metadata?.title || 'Untitled Draft';
    if (!window.confirm(`Delete draft "${draftTitle}"? This cannot be undone.`)) return;
    await deleteDraft(draft.id);
  }, [deleteDraft]);

  const handleStartTest = useCallback((testId) => {
    session.startSession(testId, 'test');
  }, [session.startSession]);

  const handleCloneTest = useCallback(async (test) => {
    try {
      const { cloneFromPublicTest } = await import('../services/thcsDraftService');
      const result = await cloneFromPublicTest(test.id, user.uid);
      if (result.success && result.data) {
        navigateTo('TEACHER_THCS_EDIT', { draftId: result.data.draftId }, { reason: 'teacher_lobby_clone_public_test' });
      } else {
        alert('Failed to clone test: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Clone failed:', err);
      alert('Failed to clone test. Please try again.');
    }
  }, [navigateTo, user?.uid]);

  const handleUseAsIsStartLive = useCallback((test) => {
    modals.closeUseAsIs();
    session.startSession(test.id, 'test');
  }, [modals.closeUseAsIs, session.startSession]);

  const handleUseAsIsAssignHW = useCallback((test) => {
    modals.closeUseAsIs();
    modals.openHwDialog(test);
  }, [modals.closeUseAsIs, modals.openHwDialog]);

  const getReadingPassageId = useCallback((passage) => (
    String(passage?.materialId || passage?.id || '')
  ), []);

  const handleToggleReadingPassageSelection = useCallback((passage) => {
    const passageId = getReadingPassageId(passage);
    if (!passageId) {
      return;
    }

    setSelectedReadingPassageIds((currentIds) => (
      currentIds.includes(passageId)
        ? currentIds.filter((id) => id !== passageId)
        : [...currentIds, passageId]
    ));
  }, [getReadingPassageId]);

  const handleOpenReadingPassage = useCallback((passage) => {
    const materialId = getReadingPassageId(passage);
    trackAction('openReadingPassage', { materialId, source: 'teacher_materials_reading_passage_row' });
    navigateTo(
      'TEACHER_READING_V2_REVISE',
      { materialId },
      { reason: 'teacher_materials_open_reading_passage' },
    );
  }, [getReadingPassageId, navigateTo, trackAction]);

  const handleReviseReadingPassage = useCallback((passage) => {
    const materialId = getReadingPassageId(passage);
    trackAction('reviseReadingPassage', { materialId, source: 'teacher_materials_reading_passage_row' });
    navigateTo(
      'TEACHER_READING_V2_REVISE',
      { materialId },
      { reason: 'teacher_materials_revise_reading_passage' },
    );
  }, [getReadingPassageId, navigateTo, trackAction]);

  const handleAssignReadingPassage = useCallback((passage) => {
    const materialId = getReadingPassageId(passage);
    trackAction('assignReadingPassageHomework', { materialId, source: 'teacher_materials_reading_passage_row' });
    trackAction('teacher_materials_reading_passage_assigned', {
      materialId,
      source: 'teacher_materials_reading_passage_row',
    });
    setReadingPassageHomeworkRequest({
      mode: 'single',
      passages: [passage],
    });
  }, [getReadingPassageId, trackAction]);

  const handleArchiveReadingPassage = useCallback(async (passage) => {
    const materialId = getReadingPassageId(passage);
    if (!materialId || !user?.uid) {
      return;
    }

    setReadingPassageArchiveRequest(passage);
    setReadingPassageArchiveAcknowledged(false);
    trackAction('reading_passage_removed_from_library_requested', {
      materialId,
      source: 'teacher_materials_reading_passage_row',
    });
  }, [getReadingPassageId, trackAction, user?.uid]);

  const handleCancelArchiveReadingPassage = useCallback(() => {
    setReadingPassageArchiveRequest(null);
    setReadingPassageArchiveAcknowledged(false);
  }, []);

  const getReadingPassageUsageCounts = useCallback((passage) => ({
    masterRefCount: Number(passage?.masterRefCount ?? passage?.usageSummary?.masterRefCount ?? 0),
    bookRefCount: Number(passage?.bookRefCount ?? passage?.usageSummary?.bookRefCount ?? 0),
    activeHomeworkCount: Number(passage?.activeHomeworkCount ?? passage?.usageSummary?.activeHomeworkCount ?? 0),
  }), []);

  const handleConfirmArchiveReadingPassage = useCallback(async () => {
    const passage = readingPassageArchiveRequest;
    const materialId = getReadingPassageId(passage);
    if (!materialId || !user?.uid) {
      return;
    }

    const usageCounts = getReadingPassageUsageCounts(passage);
    const usedElsewhere = usageCounts.masterRefCount > 0 || usageCounts.bookRefCount > 0 || usageCounts.activeHomeworkCount > 0;
    if (usedElsewhere && !readingPassageArchiveAcknowledged) {
      return;
    }

    trackAction('reading_passage_removed_from_library', { materialId, source: 'teacher_materials_reading_passage_row' });
    try {
      await archiveReadingV2PassageMaterial({
        teacherId: user.uid,
        passage: {
          materialId,
          ownerId: passage.ownerId,
          title: passage.title || 'Untitled Reading Passage',
          visibility: passage.visibility || passage.scope || 'private',
          materialKind: 'reading-passage',
          testTypeIds: passage.testTypeIds || passage.testTypes?.map((testType) => testType.testTypeId).filter(Boolean) || [],
          sourceFullTestId: passage.sourceFullTestId,
          updatedAt: passage.updatedAt || new Date().toISOString(),
          publishedSnapshotVersionId: passage.publishedSnapshotVersionId || passage.currentVersionId,
          questionCount: passage.questionCount,
        },
        repository: readingV2PassageArchiveRepository,
        usageSummary: {
          usedElsewhere,
          usageCategories: [
            usageCounts.masterRefCount ? 'master' : null,
            usageCounts.bookRefCount ? 'book' : null,
            usageCounts.activeHomeworkCount ? 'homework' : null,
          ].filter(Boolean),
        },
      });
      setReadingPassageRows((currentRows) => currentRows.filter((row) => getReadingPassageId(row) !== materialId));
      setSelectedReadingPassageIds((currentIds) => currentIds.filter((id) => id !== materialId));
      setReadingPassageArchiveRequest(null);
      setReadingPassageArchiveAcknowledged(false);
      trackAction('teacher_materials_reading_passage_archived', {
        materialId,
        source: 'teacher_materials_reading_passage_row',
      });
      logTeacherMaterialsDiagnostic('reading_passage_archived', {
        materialId,
        source: 'teacher_materials_reading_passage_row',
      });
    } catch (error) {
      console.error('Failed to archive Reading Passage:', error);
      setReadingPassageError('Failed to archive Reading Passage.');
      logTeacherMaterialsDiagnostic('reading_passage_archive_failed', {
        materialId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [
    getReadingPassageId,
    getReadingPassageUsageCounts,
    readingPassageArchiveAcknowledged,
    readingPassageArchiveRequest,
    readingV2PassageArchiveRepository,
    trackAction,
    user?.uid,
  ]);

  const handleRestoreReadingPassage = useCallback((passage) => {
    const materialId = getReadingPassageId(passage);
    if (!materialId || !user?.uid) {
      return;
    }
    setReadingPassageRestoreRequest(passage);
    trackAction('reading_passage_restore_requested', {
      materialId,
      source: 'teacher_materials_reading_passage_archive_row',
    });
  }, [getReadingPassageId, trackAction, user?.uid]);

  const handleCancelRestoreReadingPassage = useCallback(() => {
    setReadingPassageRestoreRequest(null);
  }, []);

  const handleConfirmRestoreReadingPassage = useCallback(async (restoreVisibility) => {
    const passage = readingPassageRestoreRequest;
    const materialId = getReadingPassageId(passage);
    if (!materialId || !user?.uid) {
      return;
    }

    try {
      await restoreReadingV2PassageMaterial({
        actorUserId: user.uid,
        actorRole: 'teacher',
        passage: {
          materialId,
          ownerId: passage.ownerId,
          title: passage.title || 'Untitled Reading Passage',
          visibility: passage.visibility || 'private',
          materialKind: 'reading-passage',
          testTypeIds: passage.testTypeIds || passage.testTypes?.map((testType) => testType.testTypeId).filter(Boolean) || [],
          sourceFullTestId: passage.sourceFullTestId,
          updatedAt: passage.updatedAt || new Date().toISOString(),
          currentVersionId: passage.currentVersionId || passage.publishedSnapshotVersionId,
          publishedSnapshotVersionId: passage.publishedSnapshotVersionId || passage.currentVersionId,
          questionCount: passage.questionCount,
        },
        repository: readingV2PassageArchiveRepository,
        restoreVisibility,
        correlationId: `${user.uid}:${materialId}:${restoreVisibility}:restore`,
        sourceFeatureId: 'teacher_materials_reading_passage_restore',
        sourceRoute: '/lobby',
      });
      setReadingPassageRows((currentRows) => currentRows.filter((row) => getReadingPassageId(row) !== materialId));
      setReadingPassageRestoreRequest(null);
      setReadingPassageScope(restoreVisibility);
      trackAction('reading_passage_restored', {
        materialId,
        restoreVisibility,
        source: 'teacher_materials_reading_passage_archive_row',
      });
      logTeacherMaterialsDiagnostic('reading_passage_restored', {
        materialId,
        restoreVisibility,
        source: 'teacher_materials_reading_passage_archive_row',
      });
    } catch (error) {
      console.error('Failed to restore Reading Passage:', error);
      setReadingPassageError('Failed to restore Reading Passage.');
      logTeacherMaterialsDiagnostic('reading_passage_restore_failed', {
        materialId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [getReadingPassageId, readingPassageRestoreRequest, readingV2PassageArchiveRepository, trackAction, user?.uid]);

  const addClonedReadingPassageRow = useCallback((result) => {
    setReadingPassageRows((currentRows) => {
      const clonedRow = {
        id: result.material.passageMaterialId,
        materialId: result.material.passageMaterialId,
        ownerId: user?.uid,
        deliveryEngine: 'reading-v2',
        title: result.material.title,
        materialKind: 'reading-passage',
        skill: 'Reading',
        skillType: 'reading-v2',
        questionCount: result.passageRef.questionCount,
        duration: result.material.durationMinutes || 0,
        durationMinutes: result.material.durationMinutes || 0,
        updatedAt: result.material.updatedAt,
        visibility: 'private',
        scope: 'private',
        isOwner: true,
        selectable: true,
        primaryTestTypeId: result.material.primaryTestTypeId,
        testTypeIds: result.material.testTypeIds || [],
        testTypes: [],
        sourceOrderDisplay: result.material.sourceOrder?.displaySnapshot,
        sourceQuestionRange: result.material.sourceQuestionRange,
        sourceFullTestId: result.material.sourceFullTestId,
        sourceFullTestTitle: result.material.sourceTitleSnapshot,
        publishedSnapshotVersionId: result.material.currentSnapshotVersionId,
        currentVersionId: result.material.currentSnapshotVersionId,
        hasStudentSafeProjection: true,
        accessible: true,
        archived: false,
        actions: [
          { key: 'open', label: 'Open' },
          { key: 'assign-homework', label: 'Assign homework' },
          { key: 'revise', label: 'Revise', ownerOnly: true },
          { key: 'archive', label: 'Remove from library', ownerOnly: true },
        ],
        metadata: {
          title: result.material.title,
          tags: [],
          visibility: 'private',
          materialKind: 'reading-passage',
          deliveryEngine: 'reading-v2',
          productLabel: 'Reading V2',
          sourceOrderDisplay: result.material.sourceOrder?.displaySnapshot,
          sourceQuestionRange: result.material.sourceQuestionRange,
          sourceFullTestTitle: result.material.sourceTitleSnapshot,
          publishedSnapshotVersionId: result.material.currentSnapshotVersionId,
        },
      };
      return [
        clonedRow,
        ...currentRows.filter((row) => getReadingPassageId(row) !== result.material.passageMaterialId),
      ];
    });
  }, [getReadingPassageId, user?.uid]);

  const handleCloneReadingV2MasterPassage = useCallback(async ({ master, passageRef }) => {
    if (!user?.uid) {
      throw new Error('You must be signed in to clone a Reading Passage.');
    }

    const sourceMaterialId = passageRef?.passageMaterialId || passageRef?.materialId || passageRef?.id;
    const sourceSnapshotVersionId = passageRef?.snapshotVersionId || passageRef?.currentVersionId;
    if (!sourceMaterialId || !sourceSnapshotVersionId) {
      throw new Error('This Reading Passage is missing a pinned version and cannot be cloned.');
    }

    trackAction('reading_v2_master_passage_clone_requested', {
      source: 'teacher_lobby_master_modal',
      masterMaterialId: master?.testMaterialId || master?.materialId,
      sourceMaterialId,
    });

    const result = await cloneReadingV2PublicPassageToTeacherLibrary({
      sourceMaterialId,
      sourceSnapshotVersionId,
      actorTeacherId: user.uid,
      repository: readingV2CompositionRepository,
    });

    addClonedReadingPassageRow(result);

    trackAction('reading_v2_master_passage_cloned', {
      source: 'teacher_lobby_master_modal',
      masterMaterialId: master?.testMaterialId || master?.materialId,
      sourceMaterialId,
      clonedMaterialId: result.material.passageMaterialId,
    });
    logTeacherMaterialsDiagnostic('reading_v2_master_passage_cloned', {
      masterMaterialId: master?.testMaterialId || master?.materialId,
      sourceMaterialId,
      clonedMaterialId: result.material.passageMaterialId,
    });

    return result.passageRef;
  }, [
    addClonedReadingPassageRow,
    getReadingPassageId,
    readingV2CompositionRepository,
    trackAction,
    user?.uid,
  ]);

  const handleCloneReadingV2LibraryPassage = useCallback(async (passage) => {
    if (!user?.uid) {
      return;
    }

    const sourceMaterialId = getReadingPassageId(passage);
    const sourceSnapshotVersionId = passage?.publishedSnapshotVersionId || passage?.currentVersionId;
    if (!sourceMaterialId || !sourceSnapshotVersionId) {
      setReadingPassageError('This Reading Passage is missing a pinned version and cannot be cloned.');
      return;
    }

    trackAction('reading_v2_library_passage_clone_requested', {
      source: 'teacher_materials_reading_passage_row',
      sourceMaterialId,
    });

    try {
      const result = await cloneReadingV2PublicPassageToTeacherLibrary({
        sourceMaterialId,
        sourceSnapshotVersionId,
        actorTeacherId: user.uid,
        repository: readingV2CompositionRepository,
      });
      addClonedReadingPassageRow(result);
      trackAction('reading_v2_library_passage_cloned', {
        source: 'teacher_materials_reading_passage_row',
        sourceMaterialId,
        clonedMaterialId: result.material.passageMaterialId,
      });
    } catch (error) {
      console.error('Failed to clone Reading Passage:', error);
      setReadingPassageError(error instanceof Error ? error.message : 'Failed to clone Reading Passage.');
    }
  }, [
    addClonedReadingPassageRow,
    getReadingPassageId,
    readingV2CompositionRepository,
    trackAction,
    user?.uid,
  ]);

  const handlePublishReadingV2MasterEdit = useCallback(async (payload) => {
    if (!user?.uid || !payload?.master) {
      return;
    }

    trackAction(
      payload.master?.hasBrokenRefs
        ? 'reading_v2_master_repair_publish_submitted'
        : 'reading_v2_master_publish_submitted',
      {
        source: 'teacher_lobby_master_modal',
        mode: payload.mode,
        passageCount: payload.passageRefs.length,
      },
    );

    try {
      const result = await publishReadingV2TeacherSelectedPassageCompositionEdit({
        teacherId: user.uid,
        composition: payload.master,
        passages: payload.passageRefs.map((passageRef) => ({
          materialId: passageRef.passageMaterialId || passageRef.materialId || passageRef.id,
          ownerId: passageRef.ownerId,
          title: passageRef.title || passageRef.titleSnapshot,
          questionCount: passageRef.questionCount ?? passageRef.questionCountSnapshot,
          durationMinutes: passageRef.durationMinutes ?? passageRef.durationSnapshot,
          publishedSnapshotVersionId: passageRef.snapshotVersionId || passageRef.currentVersionId,
          currentVersionId: passageRef.currentVersionId || passageRef.snapshotVersionId,
          sourceOrderDisplay: passageRef.sourceOrderDisplaySnapshot,
          sourceQuestionRange: passageRef.questionRangeSnapshot,
          primaryTestTypeId: passageRef.primaryTestTypeId,
          testTypeIds: passageRef.testTypeIdsSnapshot || passageRef.testTypeIds || [],
          visibility: passageRef.visibility || 'private',
          state: 'published',
          accessible: true,
          selectable: true,
        })),
        repository: readingV2CompositionRepository,
        metadata: {
          title: payload.title,
          visibility: payload.visibility,
        },
      });

      const publishedMaster = {
        ...payload.master,
        ...result.composition,
        compositionLoadState: 'ready',
        brokenRefSummary: null,
        hasBrokenRefs: false,
        brokenRefCount: 0,
        brokenRefReasons: [],
        brokenRefs: [],
      };
      const isDraftPublish = payload.mode === 'draft';
      const publishedTitle = publishedMaster.title || payload.title || 'Selected Reading Passages';
      const visibilityLabel = publishedMaster.visibility === 'public' ? 'Public' : 'Private';
      setReadingV2MasterModalState((current) => ({
        ...(isDraftPublish
          ? {
            open: false,
          }
          : current),
        mode: 'published',
        master: {
          ...current.master,
          ...publishedMaster,
        },
      }));
      await refreshTests();
      if (isDraftPublish) {
        setContentFilter('my');
        setSelectedReadingPassageIds([]);
        toast.success(
          `Published "${publishedTitle}". It is now visible in My Content.`,
        );
      } else {
        toast.success(
          `Published changes to "${publishedTitle}". Visibility is now ${visibilityLabel}.`,
        );
      }
      trackAction('reading_v2_master_publish_completed', {
        source: 'teacher_lobby_master_modal',
        materialId: result.composition.testMaterialId,
        compositionId: result.composition.compositionId,
        publishedVersionId: result.composition.publishedVersionId,
      });
    } catch (error) {
      console.error('Failed to publish Reading V2 master edit:', error);
      setReadingPassageError(error instanceof Error ? error.message : 'Failed to publish Reading V2 master edit.');
      trackAction('reading_v2_master_publish_failed', {
        source: 'teacher_lobby_master_modal',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [
    readingV2CompositionRepository,
    refreshTests,
    trackAction,
    user?.uid,
  ]);

  const handleReadingPassageScopeChange = useCallback((scope) => {
    setReadingPassageScope(scope);
    trackAction('changeReadingPassageScope', {
      scope,
      source: 'teacher_materials_reading_passage_tab',
    });
  }, [trackAction]);

  const handleBookScopeChange = useCallback((scope) => {
    setBookScope(scope);
    trackAction('changeBookScope', { scope, source: 'teacher_materials_book_tab' });
  }, [trackAction]);

  const handleSaveBook = useCallback(async (value) => {
    if (!user?.uid) {
      throw new Error('You must be signed in to create a Book.');
    }

    const createdBook = await createBookDraft(
      {
        ...value,
        ownerId: user.uid,
      },
      materialBooksRepository,
      bookValidationContext,
    );
    trackAction('createBook', {
      source: 'teacher_materials_book_modal',
      testTypeIds: value.testTypeIds,
      visibility: value.visibility,
    });
    trackAction('teacher_materials_book_created', {
      bookId: createdBook.bookId,
      source: 'teacher_materials_book_modal',
      testTypeCount: value.testTypeIds.length,
      visibility: value.visibility,
    });

    setCreateBookModalOpen(false);
    setContentFilter('book');
    setBookScope(value.visibility === 'private' ? 'private' : 'public');
    setBookListVersion((version) => version + 1);
  }, [bookValidationContext, materialBooksRepository, trackAction, user?.uid]);

  const handleOpenBook = useCallback((book, launcher) => {
    const bookId = book?.bookId || book?.id;
    if (!bookId) {
      return;
    }

    if (!teacherMaterialsCapabilities.canUseMaterialBookEditor) {
      return;
    }

    trackAction('openBook', { bookId, source: 'teacher_materials_book_card' });
    trackAction('teacher_materials_book_editor_opened', { bookId, source: 'teacher_materials_book_card' });
    setContentFilter('book');
    setBookEditorBookId(bookId);
    bookEditorLauncherRef.current = launcher || null;
    setBookEditorOpen(true);
  }, [teacherMaterialsCapabilities.canUseMaterialBookEditor, trackAction]);

  const handleCloseBookEditor = useCallback(() => {
    setBookEditorDirty(false);
    setBookEditorOpen(false);
  }, []);

  const handleArchiveBook = useCallback(async (book) => {
    const bookId = book?.bookId || book?.id;
    if (!bookId) {
      return;
    }

    if (!window.confirm(`Archive "${book.title || 'this Book'}"?`)) {
      return;
    }

    await updateBookMetadata(
      bookId,
      { status: 'archived' },
      materialBooksRepository,
      bookValidationContext,
    );
    trackAction('archiveBook', { bookId, source: 'teacher_materials_book_card' });
    setBookListVersion((version) => version + 1);
  }, [bookValidationContext, materialBooksRepository, trackAction]);

  const selectedReadingPassages = useMemo(() => {
    const selectedIds = new Set(selectedReadingPassageIds);
    return readingPassageRows.filter((row) => selectedIds.has(getReadingPassageId(row)));
  }, [getReadingPassageId, readingPassageRows, selectedReadingPassageIds]);
  const isCreatingReadingPassageFullTest = readingPassageFullTestCreateState.status === 'creating';
  const readingPassageFullTestCreateError =
    readingPassageFullTestCreateState.status === 'failed'
      ? readingPassageFullTestCreateState.message
      : null;
  const readingPassageFullTestCreateLabel =
    readingPassageFullTestCreateState.status === 'creating'
      ? 'Creating full test...'
      : readingPassageFullTestCreateState.status === 'failed'
        ? 'Retry create full test'
        : 'Create full test from selected';

  const handleAssignSelectedReadingPassages = useCallback(() => {
    if (selectedReadingPassages.length === 0) {
      return;
    }

    trackAction('assignSelectedReadingPassages', {
      passageIds: selectedReadingPassages.map((passage) => getReadingPassageId(passage)),
      source: 'teacher_materials_reading_passage_selection_toolbar',
    });
    trackAction(
      selectedReadingPassages.length === 1
        ? 'teacher_materials_reading_passage_assigned'
        : 'teacher_materials_reading_passage_set_assigned',
      {
        passageCount: selectedReadingPassages.length,
        source: 'teacher_materials_reading_passage_selection_toolbar',
      },
    );
    setReadingPassageHomeworkRequest({
      mode: selectedReadingPassages.length === 1 ? 'single' : 'set',
      passages: selectedReadingPassages,
    });
  }, [getReadingPassageId, selectedReadingPassages, trackAction]);

  const handleCreateFullTestFromSelectedReadingPassages = useCallback(async () => {
    if (isCreatingReadingPassageFullTest || !user?.uid || selectedReadingPassages.length === 0) {
      return;
    }

    const passageIds = selectedReadingPassages.map((passage) => getReadingPassageId(passage));
    setReadingPassageFullTestCreateState({ status: 'creating', message: null });
    trackAction('createReadingFullTestFromSelectedPassages', {
      passageIds,
      source: 'teacher_materials_reading_passage_selection_toolbar',
    });

    try {
      const result = await createReadingV2TeacherSelectedPassageDraft({
        teacherId: user.uid,
        passages: selectedReadingPassages,
        repository: readingV2CompositionRepository,
        metadata: readingV2ExistingPassageDraftMetadata
          ? {
            title: readingV2ExistingPassageDraftMetadata.title || undefined,
            durationMinutes: readingV2ExistingPassageDraftMetadata.durationMinutes,
            visibility: 'private',
          }
          : undefined,
      });

      trackAction('teacher_materials_reading_full_test_composition_created', {
        compositionId: result.draft.compositionId,
        materialId: result.draft.testMaterialId,
        passageCount: selectedReadingPassages.length,
        source: 'teacher_materials_reading_passage_selection_toolbar',
        mode: 'draft',
      });
      logTeacherMaterialsDiagnostic('reading_passage_full_test_composition_created', {
        compositionId: result.draft.compositionId,
        materialId: result.draft.testMaterialId,
        passageCount: selectedReadingPassages.length,
        questionCount: result.draft.questionCount,
        mode: 'draft',
      });
      setReadingPassageFullTestCreateState({ status: 'idle', message: null });
      setSelectedReadingPassageIds([]);
      setReadingV2ExistingPassageDraftMetadata(null);
      setReadingV2MasterModalState({
        open: true,
        mode: 'draft',
        master: result.draft,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create Reading full test.';
      console.error('Failed to create Reading full-test composition:', error);
      setReadingPassageFullTestCreateState({
        status: 'failed',
        message,
      });
      logTeacherMaterialsDiagnostic('reading_passage_full_test_composition_failed', {
        passageCount: selectedReadingPassages.length,
        message,
      });
    }
  }, [
    getReadingPassageId,
    isCreatingReadingPassageFullTest,
    readingV2CompositionRepository,
    readingV2ExistingPassageDraftMetadata,
    selectedReadingPassages,
    trackAction,
    user?.uid,
  ]);

  const toReadingPassageHomeworkCandidate = useCallback((passage) => ({
    materialId: getReadingPassageId(passage),
    title: passage?.title || 'Untitled Reading Passage',
    questionCount: passage?.questionCount ?? 0,
    testTypeIds: passage?.testTypeIds ?? passage?.testTypes?.map((testType) => testType.testTypeId) ?? [],
    sourceOrderDisplay: passage?.sourceOrderDisplay,
    sourceFullTestTitle: passage?.sourceFullTestTitle,
    publishedSnapshotVersionId: passage?.publishedSnapshotVersionId ?? passage?.metadata?.publishedSnapshotVersionId,
    hasStudentSafeProjection: passage?.hasStudentSafeProjection === true,
    accessible: passage?.accessible === true &&
      Boolean(passage?.publishedSnapshotVersionId ?? passage?.metadata?.publishedSnapshotVersionId) &&
      passage?.hasStudentSafeProjection === true &&
      passage?.archived !== true,
    archived: passage?.archived === true,
  }), [getReadingPassageId]);

  const readingPassageHomeworkModalProps = useMemo(() => {
    if (!readingPassageHomeworkRequest) {
      return null;
    }

    if (readingPassageHomeworkRequest.mode === 'set') {
      return {
        preselectedReadingPassageSet: {
          title: 'Selected Reading Passages',
          passages: readingPassageHomeworkRequest.passages.map(toReadingPassageHomeworkCandidate),
        },
      };
    }

    return {
      preselectedReadingPassage: toReadingPassageHomeworkCandidate(
        readingPassageHomeworkRequest.passages[0],
      ),
    };
  }, [readingPassageHomeworkRequest, toReadingPassageHomeworkCandidate]);

  // ---------- Helpers ----------
  const isOwner = useCallback((item) => {
    if (!user) return false;
    return item.ownerId === user.uid || item.createdBy === user.uid || (!item.ownerId && !item.createdBy);
  }, [user]);

  const canEdit = useCallback((item) => {
    return isOwner(item) || profile?.role === 'super_admin';
  }, [isOwner, profile]);

  const materialListRows = visibleTests.map((test, index) => buildTestMaterialListRow(test, {
    index,
    canEdit: canEdit(test),
    isOwner: isOwner(test),
    isPublicLibrary: contentFilter === 'public',
    handlers: {
      onEdit: handleEditTest,
      onDelete: handleDeleteTest,
      onStartTest: handleStartTest,
      onUseAsIs: modals.openUseAsIs,
      onClone: handleCloneTest,
      onAssignHw: modals.openHwDialog,
    },
  }));
  const readingPassageListRows = readingPassageRows.map((passage) => toReadingPassageRowModel(passage, {
    selected: selectedReadingPassageIds.includes(getReadingPassageId(passage)),
    handlers: {
      onOpenReadingPassage: handleOpenReadingPassage,
      onAssignReadingPassage: handleAssignReadingPassage,
      onCloneReadingPassage: handleCloneReadingV2LibraryPassage,
      onReviseReadingPassage: handleReviseReadingPassage,
      onArchiveReadingPassage: handleArchiveReadingPassage,
      onRestoreReadingPassage: handleRestoreReadingPassage,
      onToggleReadingPassageSelection: handleToggleReadingPassageSelection,
    },
  }));
  const createLabel = contentFilter === 'book' ? 'Create New Book' : 'Create New Test';
  const showCreateButton = contentFilter !== 'reading-passage';

  // ---------- Render ----------
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
      backgroundAttachment: 'fixed',
    }}>
      <TeacherHeader
        pageTitle="Materials"
        userId={user?.uid}
        userRole={profile?.role}
        userDisplayName={profile?.displayName || user?.displayName || user?.email}
        userEmail={profile?.email || user?.email}
        userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
        onLogout={handleLogout}
      />

      <main>
          {/* Session Loading State */}
          {sessionCode && session.sessionLoading && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', minHeight: '50vh', gap: '1rem',
            }}>
              <div style={{
                width: '48px', height: '48px',
                border: '4px solid rgba(139, 92, 246, 0.2)',
                borderTop: '4px solid #8b5cf6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              <p style={{ color: '#64748b', fontSize: '1rem' }}>Loading session {sessionCode}...</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Session Error State */}
          {sessionCode && session.sessionError && !session.sessionLoading && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', minHeight: '50vh', gap: '1rem',
            }}>
              <div style={{ fontSize: '3rem' }}>⚠️</div>
              <h2 style={{ color: '#ef4444', fontSize: '1.25rem', fontWeight: 600 }}>{session.sessionError}</h2>
              <p style={{ color: '#64748b' }}>Redirecting to session management...</p>
            </div>
          )}

          {/* Main Content */}
          {(!sessionCode || (!session.sessionLoading && !session.sessionError)) && (
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1rem' }}>
              {/* Page Header */}
              <div
                className="teacher-lobby-page-header"
                style={{ animation: 'slideDown 0.5s ease-out' }}
              >
                <div className="teacher-lobby-page-subhead">
                  <div className="teacher-lobby-title-block">
                    <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>
                      Test Dashboard
                    </h1>
                    <p className="teacher-lobby-page-subtitle">
                      Manage your tests and start formal assessment sessions
                    </p>
                  </div>
                  <div className="teacher-lobby-header-controls" aria-label="Teacher Materials controls">
                    <div className="teacher-lobby-test-type-dock">
                      <TestTypeBlockModule
                        testTypes={testTypeConfigs}
                        pinnedTestTypeIds={pinnedTestTypeIds}
                        activeTestTypeId={activeTestTypeId}
                        onActiveTestTypeChange={handleActiveTestTypeChange}
                        onOpenPreferences={handleOpenTestTypePreferences}
                      />
                    </div>
                    <div className="teacher-lobby-content-tab-dock">
                      <ContentTabs
                        activeTab={contentFilter}
                        onTabChange={handleContentFilterChange}
                        capabilities={teacherMaterialsCapabilities}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Session Banner */}
              <SessionBanner
                sessionCode={sessionCode}
                sessionData={session.sessionData}
                onBackToSessions={() => navigateTo('SESSIONS', {}, { reason: 'lobby_back_to_sessions' })}
                onReturnToMonitor={(code) => navigateTo('TEACHER_TEST_MONITOR', { sessionCode: code }, { reason: 'lobby_return_monitor' })}
                onReturnToQuiz={(code) => navigateTo('TEACHER_WAITING', { gameSessionId: code }, { reason: 'lobby_return_quiz' })}
              />

              {[teacherMaterialsNotice].filter(Boolean).map((notice) => (
                <div className="teacher-materials-route-notice" role="status" key={notice}>
                  {notice}
                </div>
              ))}

              {/* Drafts Tab */}
              {contentFilter === 'drafts' ? (
                <div>
                  <Card
                    variant="glass"
                    hover={false}
                    className="teacher-materials-search-card"
                    style={{ animation: 'slideUp 0.5s ease-out 0.1s backwards' }}
                  >
                    <CardBody className="teacher-materials-search-card__body">
                      <SearchFilterBar
                        searchTerm={searchTerm}
                        onSearchChange={setSearchTerm}
                        contentFilter={contentFilter}
                        testTypeFilter={testTypeFilter}
                        onTestTypeFilterChange={handleTestTypeFilterChange}
                        thcsGradeFilter={thcsGradeFilter}
                        onThcsGradeFilterChange={setThcsGradeFilter}
                        thcsExamTypeFilter={thcsExamTypeFilter}
                        onThcsExamTypeFilterChange={setThcsExamTypeFilter}
                        onCreateNew={handleOpenCreateAction}
                        showCreateButton={false}
                      />
                    </CardBody>
                  </Card>

                  {draftsLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                      <div style={{
                        width: '40px', height: '40px',
                        border: '4px solid rgba(139, 92, 246, 0.2)',
                        borderTop: '4px solid #8b5cf6',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }} />
                    </div>
                  ) : draftsError ? (
                    <Card variant="glass" style={{ padding: '2rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
                      <p style={{ color: '#ef4444', fontWeight: 600 }}>{draftsError}</p>
                    </Card>
                  ) : visibleDrafts.length === 0 ? (
                    <Card variant="glass" style={{ padding: '3rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                        No Drafts Yet
                      </h3>
                      <p style={{ color: '#64748b' }}>
                        Create a new THCS or IELTS writing test to start saving drafts
                      </p>
                    </Card>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                      gap: '1.5rem',
                    }}>
                      {visibleDrafts.map((draft, index) => (
                        <DraftCard
                          key={draft.id}
                          draft={draft}
                          index={index}
                          onResume={(draftToResume) => {
                            if (draftToResume?.draftKind === 'writing') {
                              openWritingDraftEditor(draftToResume, 'teacher_lobby_draft_card');
                              return;
                            }
                            navigateTo('TEACHER_THCS_EDIT', { draftId: draftToResume.id }, { reason: 'teacher_lobby_resume_thcs_draft' });
                          }}
                          onDelete={handleDeleteDraft}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Tests Tab (My Content / Public Library) */
                <>
                  <Card
                    variant="glass"
                    hover={false}
                    className="teacher-materials-search-card"
                    style={{ animation: 'slideUp 0.5s ease-out 0.1s backwards' }}
                  >
                    <CardBody className="teacher-materials-search-card__body">
                      <SearchFilterBar
                        searchTerm={searchTerm}
                        onSearchChange={setSearchTerm}
                        contentFilter={contentFilter}
                        testTypeFilter={testTypeFilter}
                        onTestTypeFilterChange={handleTestTypeFilterChange}
                        thcsGradeFilter={thcsGradeFilter}
                        onThcsGradeFilterChange={setThcsGradeFilter}
                        thcsExamTypeFilter={thcsExamTypeFilter}
                        onThcsExamTypeFilterChange={setThcsExamTypeFilter}
                        onCreateNew={handleOpenCreateAction}
                        createLabel={createLabel}
                        showCreateButton={showCreateButton}
                        visibilityScope={
                          contentFilter === 'reading-passage'
                            ? readingPassageScope
                            : contentFilter === 'book'
                              ? bookScope
                              : undefined
                        }
                        onVisibilityScopeChange={
                          contentFilter === 'reading-passage'
                            ? handleReadingPassageScopeChange
                            : contentFilter === 'book'
                              ? handleBookScopeChange
                              : undefined
                        }
                        visibilityLabel={
                          contentFilter === 'reading-passage'
                            ? 'Reading Passage visibility'
                            : contentFilter === 'book'
                              ? 'Book visibility'
                              : undefined
                        }
                        visibilityScopeOptions={
                          contentFilter === 'reading-passage'
                            ? [
                                { value: 'private', label: 'Private' },
                                { value: 'public', label: 'Public' },
                                { value: 'archived', label: 'Archive' },
                              ]
                            : undefined
                        }
                      />
                    </CardBody>
                  </Card>

                  {contentFilter === 'reading-passage' && selectedReadingPassages.length > 0 && (
                    <div className="reading-passage-library-tools">
                      <div className="reading-passage-selection-toolbar" aria-label="Reading Passage selection actions">
                        <span>{selectedReadingPassages.length} selected</span>
                        <button
                          type="button"
                          onClick={handleAssignSelectedReadingPassages}
                        >
                          Assign selected
                        </button>
                        <button
                          type="button"
                          onClick={handleCreateFullTestFromSelectedReadingPassages}
                          disabled={isCreatingReadingPassageFullTest}
                        >
                          {readingPassageFullTestCreateLabel}
                        </button>
                        {readingPassageFullTestCreateError && (
                          <span className="reading-passage-selection-toolbar__error" role="status">
                            {readingPassageFullTestCreateError}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Content Loading */}
                  {contentFilter === 'reading-passage' ? (
                    readingPassageLoading ? (
                      <div style={{
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        padding: '4rem', flexDirection: 'column', gap: '1rem',
                      }}>
                        <div style={{
                          width: '48px', height: '48px',
                          border: '4px solid rgba(139, 92, 246, 0.2)',
                          borderTop: '4px solid #8b5cf6',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                        }} />
                        <p style={{ color: '#64748b' }}>Loading Reading Passages...</p>
                      </div>
                    ) : readingPassageError ? (
                      <Card variant="glass" style={{ padding: '3rem', textAlign: 'center', marginTop: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#991b1b', marginBottom: '0.5rem' }}>
                          Reading Passages unavailable
                        </h3>
                        <p style={{ color: '#64748b' }}>{readingPassageError}</p>
                      </Card>
                    ) : readingPassageRows.length === 0 ? (
                      <Card variant="glass" style={{ padding: '3rem', textAlign: 'center', marginTop: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                          No Reading Passages yet
                        </h3>
                        <p style={{ color: '#64748b' }}>
                          Passages will appear after Reading V2 full tests are published or imported.
                        </p>
                      </Card>
                    ) : (
                      <MaterialListView
                        rows={readingPassageListRows}
                        itemLabel="Reading Passages"
                      />
                    )
                  ) : contentFilter === 'book' ? (
                    bookLoading ? (
                      <div style={{
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        padding: '4rem', flexDirection: 'column', gap: '1rem',
                      }}>
                        <div style={{
                          width: '48px', height: '48px',
                          border: '4px solid rgba(139, 92, 246, 0.2)',
                          borderTop: '4px solid #8b5cf6',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                        }} />
                        <p style={{ color: '#64748b' }}>Loading Books...</p>
                      </div>
                    ) : bookError ? (
                      <Card variant="glass" style={{ padding: '3rem', textAlign: 'center', marginTop: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#991b1b', marginBottom: '0.5rem' }}>
                          Books unavailable
                        </h3>
                        <p style={{ color: '#64748b' }}>{bookError}</p>
                      </Card>
                    ) : (
                      <BookCardGrid
                        books={bookRows}
                        emptyTitle={bookScope === 'public' ? 'No public Books found' : 'No Books yet'}
                        emptyDescription={bookScope === 'public' ? 'No public Books match this view.' : 'Create a Book draft to start organizing materials.'}
                        canOpenBookEditor={teacherMaterialsCapabilities.canUseMaterialBookEditor}
                        onOpenBook={handleOpenBook}
                        onArchiveBook={handleArchiveBook}
                      />
                    )
                  ) : contentLoading ? (
                    <div style={{
                      display: 'flex', justifyContent: 'center', alignItems: 'center',
                      padding: '4rem', flexDirection: 'column', gap: '1rem',
                    }}>
                      <div style={{
                        width: '48px', height: '48px',
                        border: '4px solid rgba(139, 92, 246, 0.2)',
                        borderTop: '4px solid #8b5cf6',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }} />
                      <p style={{ color: '#64748b' }}>Loading tests...</p>
                    </div>
                  ) : visibleTests.length === 0 ? (
                    <Card variant="glass" style={{ padding: '3rem', textAlign: 'center', marginTop: '1.5rem' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                        {contentFilter === 'public' ? '🌐' : '📝'}
                      </div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                        {contentFilter === 'public' ? 'No public tests found' : 'No tests yet'}
                      </h3>
                      <p style={{ color: '#64748b' }}>
                        {contentFilter === 'public'
                          ? 'Check back later or create your own tests'
                          : 'Create your first test to get started'}
                      </p>
                    </Card>
                  ) : (
                    <MaterialListView
                      rows={materialListRows}
                      itemLabel={contentFilter === 'public' ? 'public tests' : 'tests'}
                    />
                  )}
                </>
              )}
            </div>
          )}
      </main>

        {/* ===== Modals ===== */}

        {/* Class Selection Modal */}
        <ClassSelectionModal
          opened={session.showClassModal}
          onClose={session.cancelSession}
          onConfirm={session.confirmSession}
          classes={session.classes}
          selectedClassId={session.selectedClassId}
          onClassChange={session.setSelectedClassId}
          isListening={session.pendingSession?.isListening}
          selectedAudioMode={session.selectedAudioMode}
          onAudioModeChange={(mode) => {
            session.setSelectedAudioMode(mode);
            session.setShowAudioModeError(false);
          }}
          lastUsedAudioMode={session.lastUsedAudioMode}
          showAudioModeError={session.showAudioModeError}
          examMode={session.examMode}
          onExamModeChange={session.setExamMode}
        />

        {/* IELTS Test Editor — QuizEditor removed (no legacy quiz items, PRD-0033) */}
        {modals.state.editTest.show && modals.state.editTest.test && (
          <Suspense fallback={<OverlayLoader label="Loading IELTS editor..." />}>
            <TestEditor
              show={modals.state.editTest.show}
              handleClose={modals.closeEditTest}
              test={modals.state.editTest.test}
            />
          </Suspense>
        )}

        {/* THCS Test Editor */}
        {modals.state.editThcsTest.show && modals.state.editThcsTest.test && (
          <Suspense fallback={<OverlayLoader label="Loading THCS editor..." />}>
            <THCSTestEditorModal
              show={modals.state.editThcsTest.show}
              handleClose={modals.closeEditThcsTest}
              test={modals.state.editThcsTest.test}
            />
          </Suspense>
        )}

        {/* Test Creation Modal */}
        {modals.state.testCreation.show && (
          <Suspense fallback={<OverlayLoader label="Loading test creation..." />}>
            <TestCreationModal
              opened={modals.state.testCreation.show}
              onClose={handleCloseTestCreation}
              onComplete={(draftId) => {
                handleCloseTestCreation();
                navigateTo('TEACHER_TEST_REVIEW', { draftId }, { reason: 'teacher_lobby_open_test_review' });
              }}
              onAction={(actionName, metadata) => trackAction(actionName, metadata)}
              onCreateReadingV2FromExistingPassages={handleStartReadingV2ExistingPassages}
              readingV2AutoPipelineLane={readingV2AutoPipelineLane}
            />
          </Suspense>
        )}

        <ReadingV2MasterEditModal
          open={readingV2MasterModalState.open}
          mode={readingV2MasterModalState.mode}
          master={readingV2MasterModalState.master}
          currentTeacherId={user?.uid || ''}
          brokenRefSummary={readingV2MasterModalState.master?.brokenRefSummary || (
            readingV2MasterModalState.master?.hasBrokenRefs
              ? {
                  hasBrokenRefs: true,
                  brokenRefCount: readingV2MasterModalState.master?.brokenRefCount || 0,
                  brokenRefReasons: readingV2MasterModalState.master?.brokenRefReasons || [],
                  brokenRefs: readingV2MasterModalState.master?.brokenRefs || [],
                }
              : null
          )}
          replacementPassages={readingPassageRows}
          onClose={handleCloseReadingV2MasterModal}
          onOpenPassageStudio={handleOpenReadingV2PassageStudio}
          onClonePassage={handleCloneReadingV2MasterPassage}
          onRepairWithExisting={({ brokenRef, replacement }) => {
            trackAction('reading_v2_master_ref_repaired_existing', {
              source: 'teacher_lobby_master_modal',
              brokenMaterialId: brokenRef.passageMaterialId || brokenRef.materialId,
              replacementMaterialId: replacement.materialId || replacement.id,
            });
            writeReadingV2MasterRepairAudit('reading_v2_master_ref_repaired_existing', brokenRef, {
              repairAction: 'replace-existing',
              replacementMaterialId: replacement.materialId || replacement.id,
            });
          }}
          onRemoveBrokenRef={(brokenRef) => {
            trackAction('reading_v2_master_ref_removed', {
              source: 'teacher_lobby_master_modal',
              materialId: brokenRef.passageMaterialId || brokenRef.materialId,
            });
            writeReadingV2MasterRepairAudit('reading_v2_master_ref_removed', brokenRef, {
              repairAction: 'remove-ref',
            });
          }}
          onRemakeBrokenRef={(brokenRef) => {
            trackAction('reading_v2_master_ref_remake_started', {
              source: 'teacher_lobby_master_modal',
              materialId: brokenRef.passageMaterialId || brokenRef.materialId,
            });
          }}
          onRestoreBrokenSource={(brokenRef) => {
            trackAction('reading_v2_master_ref_repair_started', {
              source: 'teacher_lobby_master_modal',
              action: 'restore',
              materialId: brokenRef.passageMaterialId || brokenRef.materialId,
            });
            writeReadingV2MasterRepairAudit('reading_v2_master_ref_repair_started', brokenRef, {
              repairAction: 'restore-source-started',
            });
            setReadingPassageRestoreRequest({
              materialId: brokenRef.passageMaterialId || brokenRef.materialId,
              ownerId: brokenRef.ownerId || user?.uid,
              title: brokenRef.titleSnapshot || brokenRef.title || 'Untitled Reading Passage',
              visibility: 'private',
              currentVersionId: brokenRef.snapshotVersionId || brokenRef.currentVersionId,
              publishedSnapshotVersionId: brokenRef.snapshotVersionId || brokenRef.currentVersionId,
              testTypeIds: brokenRef.testTypeIdsSnapshot || brokenRef.testTypeIds || [],
              materialKind: 'reading-passage',
            });
          }}
          onSaveDraft={(payload) => {
            trackAction('reading_v2_master_metadata_saved', {
              source: 'teacher_lobby_master_modal',
              mode: payload.mode,
              titleLength: payload.title.length,
              passageCount: payload.passageRefs.length,
            });
          }}
          onPublish={handlePublishReadingV2MasterEdit}
        />

        {readingPassageArchiveRequest && (
          <div className="teacher-materials-confirm-modal" role="presentation">
            <div className="teacher-materials-confirm-modal__scrim" onClick={handleCancelArchiveReadingPassage} />
            <section
              aria-label="Archive Reading Passage?"
              aria-modal="true"
              className="teacher-materials-confirm-modal__panel"
              role="dialog"
            >
              <h2>Archive Reading Passage?</h2>
              <p>
                {`"${readingPassageArchiveRequest.title || 'This Reading Passage'}" will leave active library surfaces and normal add-existing pickers.`}
              </p>
              {(() => {
                const usageCounts = getReadingPassageUsageCounts(readingPassageArchiveRequest);
                const usedElsewhere = usageCounts.masterRefCount > 0 || usageCounts.bookRefCount > 0 || usageCounts.activeHomeworkCount > 0;
                return (
                  <>
                    <div className="teacher-materials-confirm-modal__summary">
                      <span>{`${usageCounts.masterRefCount} affected ${usageCounts.masterRefCount === 1 ? 'master' : 'masters'}`}</span>
                      <span>{`${usageCounts.bookRefCount} affected ${usageCounts.bookRefCount === 1 ? 'Book' : 'Books'}`}</span>
                      <span>{`${usageCounts.activeHomeworkCount} active assignment ${usageCounts.activeHomeworkCount === 1 ? 'blocker' : 'blockers'}`}</span>
                    </div>
                    <p>Existing assigned work and saved results stay available from frozen snapshots.</p>
                    {usedElsewhere && (
                      <label className="teacher-materials-confirm-modal__check">
                        <input
                          type="checkbox"
                          checked={readingPassageArchiveAcknowledged}
                          onChange={(event) => setReadingPassageArchiveAcknowledged(event.target.checked)}
                        />
                        <span>I understand this passage is used elsewhere and those materials may need repair.</span>
                      </label>
                    )}
                    <div className="teacher-materials-confirm-modal__actions">
                      <button type="button" onClick={handleCancelArchiveReadingPassage}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={usedElsewhere && !readingPassageArchiveAcknowledged}
                        onClick={handleConfirmArchiveReadingPassage}
                      >
                        Remove from library
                      </button>
                    </div>
                  </>
                );
              })()}
            </section>
          </div>
        )}

        {readingV2MasterRemoveRequest && (
          <div className="teacher-materials-confirm-modal" role="presentation">
            <div className="teacher-materials-confirm-modal__scrim" onClick={handleCancelReadingV2MasterRemove} />
            <section
              aria-label="Remove Reading V2 master?"
              aria-modal="true"
              className="teacher-materials-confirm-modal__panel"
              role="dialog"
            >
              {(() => {
                const passageRefs = getReadingV2MasterPassageRefs(readingV2MasterRemoveRequest);
                const nonOwnedCount = passageRefs.filter((passageRef) => {
                  const ownerId = passageRef?.ownerId || readingV2MasterRemoveRequest.ownerId;
                  return ownerId && ownerId !== user?.uid;
                }).length;
                const linkedRemovalBlocked = nonOwnedCount > 0;
                const linkedRemovalDisabled =
                  linkedRemovalBlocked ||
                  !readingV2MasterRemoveAcknowledged ||
                  readingV2MasterRemoveStatus === 'removing';
                const passageCountLabel = `${passageRefs.length} linked Reading Passage${passageRefs.length === 1 ? '' : 's'}`;

                return (
                  <>
                    <h2>Remove Reading V2 master?</h2>
                    <p>
                      {`"${getReadingV2MasterTitle(readingV2MasterRemoveRequest)}" can be removed by itself, or with its owned linked Reading Passages.`}
                    </p>
                    <div className="teacher-materials-confirm-modal__summary">
                      <span>{passageCountLabel}</span>
                      <span>{`${nonOwnedCount} non-owned ${nonOwnedCount === 1 ? 'passage' : 'passages'}`}</span>
                    </div>
                    <p>Existing assigned work and saved results stay available from frozen snapshots.</p>
                    {linkedRemovalBlocked && (
                      <p className="reading-passage-selection-toolbar__error" role="status">
                        {`Linked passage removal is blocked because ${nonOwnedCount} ${nonOwnedCount === 1 ? 'passage is' : 'passages are'} not owned by you.`}
                      </p>
                    )}
                    <label className="teacher-materials-confirm-modal__check">
                      <input
                        type="checkbox"
                        checked={readingV2MasterRemoveAcknowledged}
                        onChange={(event) => setReadingV2MasterRemoveAcknowledged(event.target.checked)}
                      />
                      <span>I understand linked passages may be used by other masters, Books, or active assignment setup.</span>
                    </label>
                    {readingV2MasterRemoveError && (
                      <p className="reading-passage-selection-toolbar__error" role="status">
                        {readingV2MasterRemoveError}
                      </p>
                    )}
                    <div className="teacher-materials-confirm-modal__actions">
                      <button
                        type="button"
                        onClick={handleCancelReadingV2MasterRemove}
                        disabled={readingV2MasterRemoveStatus === 'removing'}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmReadingV2MasterRemove({ includeLinkedPassages: false })}
                        disabled={readingV2MasterRemoveStatus === 'removing'}
                      >
                        Remove master only
                      </button>
                      <button
                        type="button"
                        disabled={linkedRemovalDisabled}
                        onClick={() => handleConfirmReadingV2MasterRemove({ includeLinkedPassages: true })}
                      >
                        Remove master and linked passages
                      </button>
                    </div>
                  </>
                );
              })()}
            </section>
          </div>
        )}

        {readingPassageRestoreRequest && (
          <div className="teacher-materials-confirm-modal" role="presentation">
            <div className="teacher-materials-confirm-modal__scrim" onClick={handleCancelRestoreReadingPassage} />
            <section
              aria-label="Restore Reading Passage"
              aria-modal="true"
              className="teacher-materials-confirm-modal__panel"
              role="dialog"
            >
              <h2>Restore Reading Passage</h2>
              <p>
                {`"${readingPassageRestoreRequest.title || 'This Reading Passage'}" will return to active library surfaces with the same passage id and version.`}
              </p>
              <div className="teacher-materials-confirm-modal__actions">
                <button type="button" onClick={handleCancelRestoreReadingPassage}>
                  Cancel
                </button>
                <button type="button" onClick={() => handleConfirmRestoreReadingPassage('private')}>
                  Restore as Private
                </button>
                <button type="button" onClick={() => handleConfirmRestoreReadingPassage('public')}>
                  Restore as Public
                </button>
              </div>
            </section>
          </div>
        )}

        {readingPassageHomeworkModalProps && (
          <HomeworkCreateModal
            isOpen={Boolean(readingPassageHomeworkRequest)}
            onClose={() => setReadingPassageHomeworkRequest(null)}
            onSuccess={() => {
              setReadingPassageHomeworkRequest(null);
              setSelectedReadingPassageIds([]);
            }}
            {...readingPassageHomeworkModalProps}
          />
        )}

        <CreateBookModal
          opened={createBookModalOpen}
          title="Create Book"
          testTypes={testTypeConfigs}
          onClose={handleCloseCreateBookModal}
          onSave={handleSaveBook}
        />

        <BookEditorModal
          opened={bookEditorOpen}
          bookId={bookEditorBookId}
          initialBook={activeBookEditorBook}
          repository={materialBooksRepository}
          onClose={handleCloseBookEditor}
          onSaved={() => {
            setBookListVersion((version) => version + 1);
            setBookEditorDirty(false);
          }}
          onDirtyChange={setBookEditorDirty}
          returnFocusTo={bookEditorLauncherRef.current}
        />

        <TestTypePreferenceModal
          opened={testTypePreferencesOpen}
          teacherId={user?.uid || ''}
          context={{
            uid: user?.uid || '',
            role: profile?.role || 'teacher',
          }}
          testTypes={testTypeConfigs}
          pinnedTestTypeIds={pinnedTestTypeIds}
          preferenceRepository={teacherTestTypePreferenceRepository}
          onClose={() => setTestTypePreferencesOpen(false)}
          onSaved={(preference) => {
            trackAction('teacher_materials_test_type_preferences_saved', {
              pinnedCount: preference.pinnedTestTypeIds.length,
            });
            setPinnedTestTypeIds([...preference.pinnedTestTypeIds]);
          }}
          onTrackAction={(actionName, metadata) => trackAction(actionName, metadata)}
        />

        {editingWritingDraft && (
          <Suspense fallback={<OverlayLoader label="Loading writing editor..." />}>
            <WritingTestEditModal
              draft={editingWritingDraft}
              isOpen={Boolean(editingWritingDraft)}
              onClose={closeWritingDraftEditor}
              onSaved={() => {
                void refreshDrafts();
              }}
              onPublished={() => {
                void refreshDrafts();
                void refreshTests();
              }}
            />
          </Suspense>
        )}

        {/* THCS Homework Dialog */}
        {modals.state.hwDialog.show && modals.state.hwDialog.test && (
          <Suspense fallback={<OverlayLoader label="Loading homework assignment dialog..." />}>
            <THCSHomeworkAssignDialog
              isOpen={true}
              onClose={modals.closeHwDialog}
              onSuccess={modals.closeHwDialog}
              testId={modals.state.hwDialog.test.id}
              testTitle={modals.state.hwDialog.test.metadata?.title || 'Untitled THCS Test'}
              versionKey={modals.state.hwDialog.test._changelog ? Object.keys(modals.state.hwDialog.test._changelog).pop() : undefined}
              testMetadata={modals.state.hwDialog.test.metadata}
            />
          </Suspense>
        )}

        {/* Use-as-is Modal */}
        <UseAsIsModal
          test={modals.state.useAsIs.test}
          opened={modals.state.useAsIs.show}
          onClose={modals.closeUseAsIs}
          onStartLiveSession={handleUseAsIsStartLive}
          onAssignHomework={handleUseAsIsAssignHW}
          userId={user?.uid}
        />
    </div>
  );
};

export default TeacherLobbyPage;
