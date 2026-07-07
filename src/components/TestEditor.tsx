import React, { useState, useEffect, useMemo } from 'react';
import { EditorTab } from './test/editor/EditTestFrame';
import { ReadingEditorLayout } from './test/editor/layouts/ReadingEditorLayout';
import { ListeningEditorLayout } from './test/editor/layouts/ListeningEditorLayout';
import { isReadingV2Payload } from '../config/readingV2FeatureFlags';

// @ts-ignore
import QuestionEditorPanel from './QuestionEditorPanel';
// @ts-ignore
import SingleQuestionCreator from './SingleQuestionCreator';
// @ts-ignore
import BulkQuestionCreator from './BulkQuestionCreator';

import AnswerKeyPanel from './AnswerKeyPanel';
import MassAnswerImportPanel from './MassAnswerImportPanel';

import r2StorageService from '../services/r2Storage';
import { toast } from './modern/ToastNotification';
import { propagateTestMetadataToHomework } from '../services/homeworkManager';

import { QuestionList } from './test/editor/QuestionList';
import { database } from '../services/firebase';
import { ref, update } from 'firebase/database';
import { Button } from './modern';
import type { TestData, ContextResource } from '../services/testStorage';
import { ResourceManager } from './test/editor/ResourceManager';
import { adaptTestToResources, adaptResourcesToTest, linkQuestionsToResources } from './test/editor/resourceAdapters';
import { getGroupQuestions } from '../utils/summaryGroupUtils';
import { useAuth } from '../hooks/useAuth';
import { PracticeSettingsModal } from './PracticeSettingsModal';
import { createLegacyTestMaterialSummary } from '../services/materialCatalog/legacyTestMaterialSummary.service';
import { buildMaterialSummaryUpdatePayload } from '../services/materialCatalog/materialSummaryPort.service';

interface TestEditorProps {
  test: TestData;
  show: boolean;
  handleClose: () => void;
}

const TABLE_PRESENTATION_DIAG_PREFIX = '[Diag][TablePresentationAudit]';

const logTablePresentationDiag = (event: string, payload: Record<string, unknown>): void => {
  if (!import.meta.env.DEV) {
    return;
  }

  console.log(`${TABLE_PRESENTATION_DIAG_PREFIX} ${event}`, payload);
};

interface NativeModalProps {
  opened: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  size?: 'auto' | 'md' | string;
  padding?: number;
  withCloseButton?: boolean;
  centered?: boolean;
  styles?: {
    body?: React.CSSProperties;
    content?: React.CSSProperties;
    inner?: React.CSSProperties;
  };
  children: React.ReactNode;
}

const NativeModal: React.FC<NativeModalProps> = ({
  opened,
  onClose,
  title,
  size = 'auto',
  padding = 16,
  withCloseButton = true,
  centered = false,
  styles,
  children,
}) => {
  if (!opened) return null;

  const modalWidth = size === 'md'
    ? { width: 'min(92vw, 520px)' }
    : { width: 'auto', maxWidth: '96vw' };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: centered ? 'center' : 'flex-start',
        justifyContent: 'center',
        padding: centered ? '2rem 1rem' : '4rem 1rem 1rem',
        overflow: 'auto',
        background: 'rgba(15, 23, 42, 0.52)',
        ...styles?.inner,
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        style={{
          ...modalWidth,
          maxHeight: '92vh',
          overflow: 'auto',
          borderRadius: '8px',
          background: '#ffffff',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.25)',
          ...styles?.content,
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {(title || withCloseButton) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '1rem 1rem 0.5rem',
            }}
          >
            {title ? (
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                {title}
              </h2>
            ) : <span />}
            {withCloseButton && (
              <button
                type="button"
                aria-label="Close dialog"
                onClick={onClose}
                style={{
                  width: 32,
                  height: 32,
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  background: '#ffffff',
                  color: '#334155',
                  cursor: 'pointer',
                  lineHeight: 1,
                  fontSize: '1.25rem',
                }}
              >
                x
              </button>
            )}
          </div>
        )}
        <div style={{ padding, ...styles?.body }}>
          {children}
        </div>
      </div>
    </div>
  );
};

const TestEditor: React.FC<TestEditorProps> = (props) => {
  const { test } = props;

  if (isReadingV2Payload(test)) {
    // Reading V2 canonical payloads must route through ReadingV2StudioModalAdapter,
    // not the legacy flat-question TestEditor modal.
    console.warn('[TestEditor] Blocked Reading V2 payload from entering legacy editor.');
    return null;
  }

  return <LegacyTestEditor {...props} />;
};

const LegacyTestEditor: React.FC<TestEditorProps> = ({ test, show, handleClose }) => {
  const { user, isAdmin } = useAuth();

  // FR-OWN-02 / FR-77: Only the test owner or a super_admin may edit.
  // Public tests are viewable by all teachers but writable only by the owner.
  const isReadOnly = useMemo(() => {
    if (!test) return false;
    if (isAdmin) return false;           // super_admin bypasses ownership check
    const ownerId = (test as any).ownerId as string | undefined;
    if (!ownerId) return false;          // legacy test without ownerId — allow for now
    return ownerId !== user?.uid;        // non-owner teacher → read-only
  }, [test, user?.uid, isAdmin]);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editedQuestions, setEditedQuestions] = useState<Record<number, any>>({});
  const [modifiedQuestions, setModifiedQuestions] = useState<Set<number>>(new Set());
  const [showValidationPopup, setShowValidationPopup] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showPracticeSettings, setShowPracticeSettings] = useState(false);
  const [showAddOptions, setShowAddOptions] = useState(false);
  const [showSingleCreator, setShowSingleCreator] = useState(false);
  const [showBulkCreator, setShowBulkCreator] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDuration, setEditedDuration] = useState(0);
  const [editedIsPublic, setEditedIsPublic] = useState(false);
  const [titleModified, setTitleModified] = useState(false);
  const [isPublicModified, setIsPublicModified] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>('questions');
  const [resources, setResources] = useState<ContextResource[]>([]);
  const canonicalTableGroupMap = useMemo(
    () => new Map((test.questionGroups || []).map((group) => [group.groupId, group])),
    [test.questionGroups],
  );

  // Legacy states for backward compat while refactoring (will be replaced by resources)
  const [answerKeySubMode, setAnswerKeySubMode] = useState<'none' | 'manual' | 'massImport'>('none');

  const getStorageKey = () => `test_edit_${test?.id}`;

  useEffect(() => {
    if (test && show) {
      const storageKey = getStorageKey();
      const savedData = localStorage.getItem(storageKey);

      // DEBUG: Log what test data we receive
      console.log('📝 [TestEditor] Received test data:', {
        id: test.id,
        skill: (test as any).skill,
        hasQuestionImages: (test as any).questionImages?.length || 0,
      });

      const tableQuestionGroups = Array.isArray(test.questionGroups)
        ? test.questionGroups.filter((group) => group?.taskType === 'table-completion')
        : [];

      logTablePresentationDiag('editor_loaded', {
        testId: test.id,
        questionCount: Array.isArray(test.questions) ? test.questions.length : 0,
        questionGroupCount: Array.isArray(test.questionGroups) ? test.questionGroups.length : 0,
        tableGroupCount: tableQuestionGroups.length,
        tableGroups: tableQuestionGroups.map((group) => ({
          groupId: group.groupId,
          questionRange: group.questionRange,
          blankCount: Array.isArray(group.blanks) ? group.blanks.length : 0,
          rowCount: Array.isArray(group.rows) ? group.rows.length : 0,
          columnCount: Array.isArray(group.columns) ? group.columns.length : 0,
          caption: group.sharedContent?.caption || null,
        })),
      });

      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);

          // Check if cached resources are stale:
          // 1. Test has questionImages but cache has no image resources
          // 2. Test has questionImages but cache has wrong number (old grouped format vs new per-image format)
          const testQuestionImagesCount = (test as any).questionImages?.length || 0;
          const cachedImageResourcesCount = parsed.resources?.filter((r: any) => r.type === 'image').length || 0;
          const cacheIsStale = testQuestionImagesCount > 0 && cachedImageResourcesCount !== testQuestionImagesCount;

          if (cacheIsStale) {
            console.log('🔄 [TestEditor] Stale cache detected - regenerating resources:', {
              testQuestionImagesCount,
              cachedImageResourcesCount,
              reason: cachedImageResourcesCount === 0 ? 'no image resources' : 'count mismatch (grouped vs per-image format)'
            });
            localStorage.removeItem(storageKey);
            initializeFreshState();
            return;
          }

          setEditedQuestions(parsed.questions || {});
          setModifiedQuestions(new Set(parsed.modified || []));
          setEditedTitle(parsed.title || test.title);
          setEditedDuration(parsed.duration || test.duration || 0);
          setEditedIsPublic(parsed.isPublic ?? test.isPublic ?? false);
          setTitleModified(parsed.titleModified || false);
          setIsPublicModified(parsed.isPublicModified || false);

          if (parsed.resources) {
            setResources(parsed.resources);
          } else {
            setResources(adaptTestToResources(test));
          }

          // Legacy states - keeping them empty/synced just in case, but rely on resources

          setActiveTab(parsed.activeTab || 'questions');
        } catch (error) {
          console.error('Error loading from localStorage:', error);
          localStorage.removeItem(storageKey);
          initializeFreshState();
        }
      } else {
        initializeFreshState();
      }
    }
  }, [test, show]);

  const initializeFreshState = () => {
    const freshResources = adaptTestToResources(test);
    setResources(freshResources);

    // Link questions to resources (migration)
    const linkedQuestions = linkQuestionsToResources(test.questions, freshResources);

    const initial: Record<number, any> = {};
    linkedQuestions.forEach((q, index) => {
      const normalized = {
        ...q,
        question: q.question || '',
        answer: q.answer || '',
        type: q.type || 'multiple-choice',
        points: q.points || 1
      };
      initial[index] = normalized;
    });
    setEditedQuestions(initial);
    setModifiedQuestions(new Set());
    setEditedTitle(test.title);
    setEditedDuration(test.duration || 0);
    setEditedIsPublic(test.isPublic || false);
    setTitleModified(false);
    setIsPublicModified(false);


  };

  useEffect(() => {
    if (test && Object.keys(editedQuestions).length > 0) {
      const storageKey = getStorageKey();
      const dataToSave = {
        timestamp: new Date().toISOString(),
        questions: editedQuestions,
        modified: Array.from(modifiedQuestions),
        title: editedTitle,
        titleModified,
        isPublic: editedIsPublic,
        isPublicModified,
        resources,
        duration: editedDuration,
        activeTab,
      };
      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
    }
  }, [editedQuestions, modifiedQuestions, test, editedTitle, titleModified, editedIsPublic, isPublicModified, resources, editedDuration, activeTab]);

  useEffect(() => {
    if (selectedQuestionIndex !== null) {
      setShowEditor(true);
    } else {
      setShowEditor(false);
    }
  }, [selectedQuestionIndex]);

  const handleQuestionSelect = (index: number) => {
    setSelectedQuestionIndex(index);
  };

  const handleCloseEditor = () => {
    setSelectedQuestionIndex(null);
  };

  const handleQuestionUpdate = (index: number, updatedQuestion: any) => {
    const currentQuestion = editedQuestions[index] || test.questions[index];
    if (
      currentQuestion?.groupTaskType === 'table-completion' &&
      currentQuestion.groupId &&
      canonicalTableGroupMap.has(currentQuestion.groupId)
    ) {
      toast.error('Canonical table-completion groups are read-only after publish in Phase 1.');
      return;
    }

    setEditedQuestions(prev => ({
      ...prev,
      [index]: updatedQuestion
    }));
    setModifiedQuestions(prev => new Set([...prev, index]));
  };

  /**
   * Called by SummaryMasterBlock when any group-level change occurs
   * (paragraph text edit, word bank add/edit/delete, deletion guard auto-clear).
   * Receives the full updated group and applies ALL changes atomically in one setState call.
   *
   * @param updatedGroupQuestions - Array of updated group questions, in the same order as
   *                                they appear in groupQuestions (passed to QuestionEditorPanel).
   *                                Each element preserves its original .number field so we can
   *                                map it back to the correct index in editedQuestions.
   */
  const handleGroupUpdate = (updatedGroupQuestions: any[]) => {
    setEditedQuestions(prev => {
      const next = { ...prev };
      // For each updated question, find its index by matching question.number
      // against the indices in editedQuestions (question.number is 1-based, index is 0-based)
      updatedGroupQuestions.forEach(updatedQ => {
        // Find the index whose current question has the same number
        const index = Object.keys(next).find(
          key => next[Number(key)]?.number === updatedQ.number
        );
        if (index !== undefined) {
          next[Number(index)] = updatedQ;
        }
      });
      return next;
    });
    // Mark all indices in the group as modified
    setModifiedQuestions(prev => {
      const newSet = new Set(prev);
      updatedGroupQuestions.forEach(updatedQ => {
        const index = Object.keys(editedQuestions).find(
          key => editedQuestions[Number(key)]?.number === updatedQ.number
        );
        if (index !== undefined) newSet.add(Number(index));
      });
      return newSet;
    });
  };

  const handleResetQuestion = (index: number) => {
    const currentQuestion = editedQuestions[index] || test.questions[index];
    if (
      currentQuestion?.groupTaskType === 'table-completion' &&
      currentQuestion.groupId &&
      canonicalTableGroupMap.has(currentQuestion.groupId)
    ) {
      toast.error('Canonical table-completion groups are read-only after publish in Phase 1.');
      return;
    }

    if (window.confirm('Are you sure you want to reset this question to its original state?')) {
      const original = test.questions[index];
      setEditedQuestions(prev => ({
        ...prev,
        [index]: { ...original }
      }));
      setModifiedQuestions(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  };

  const handleDeleteQuestion = (index: number) => {
    const currentQuestion = editedQuestions[index] || test.questions[index];
    if (
      currentQuestion?.groupTaskType === 'table-completion' &&
      currentQuestion.groupId &&
      canonicalTableGroupMap.has(currentQuestion.groupId)
    ) {
      toast.error('Canonical table-completion groups are read-only after publish in Phase 1.');
      return;
    }

    const currentQuestionCount = Object.keys(editedQuestions).length;
    const newEditedQuestions = { ...editedQuestions };
    delete newEditedQuestions[index];

    const reindexed: Record<number, any> = {};
    let newIndex = 0;
    for (let i = 0; i < currentQuestionCount; i++) {
      if (i !== index && newEditedQuestions[i]) {
        reindexed[newIndex] = { ...newEditedQuestions[i], number: newIndex + 1 };
        newIndex++;
      }
    }

    setEditedQuestions(reindexed);
    setModifiedQuestions(new Set(Object.keys(reindexed).map(Number)));

    if (selectedQuestionIndex === index) {
      setSelectedQuestionIndex(null);
    } else if (selectedQuestionIndex !== null && selectedQuestionIndex > index) {
      setSelectedQuestionIndex(selectedQuestionIndex - 1);
    }
  };

  const handleAddQuestion = () => {
    setShowAddOptions(true);
    setSelectedQuestionIndex(null);
    setShowEditor(false);
  };

  const handleSelectSingleQuestion = () => {
    setShowAddOptions(false);
    setShowSingleCreator(true);
    setShowEditor(true);
  };

  const handleSelectBulkQuestions = () => {
    setShowAddOptions(false);
    setShowBulkCreator(true);
    setShowEditor(true);
  };

  const handleCancelAdd = () => {
    setShowAddOptions(false);
    setShowSingleCreator(false);
    setShowBulkCreator(false);
    setShowEditor(false);
  };

  const handleSaveSingleQuestion = (newQuestion: any) => {
    const newIndex = Object.keys(editedQuestions).length;
    const updatedQuestions = {
      ...editedQuestions,
      [newIndex]: newQuestion
    };
    setEditedQuestions(updatedQuestions);
    setModifiedQuestions(new Set([...modifiedQuestions, newIndex]));

    setShowSingleCreator(false);
    setSelectedQuestionIndex(newIndex);
    setShowEditor(false);

    setTimeout(() => {
      setShowEditor(true);
    }, 100);
  };

  const handleSaveBulkQuestions = (newQuestions: any[]) => {
    if (!newQuestions || newQuestions.length === 0) return;

    const startIndex = Object.keys(editedQuestions).length;
    const updatedQuestions = { ...editedQuestions };
    const newIndices: number[] = [];

    newQuestions.forEach((question, i) => {
      const index = startIndex + i;
      updatedQuestions[index] = {
        ...question,
        number: index + 1
      };
      newIndices.push(index);
    });

    setEditedQuestions(updatedQuestions);
    setModifiedQuestions(new Set([...modifiedQuestions, ...newIndices]));

    setShowBulkCreator(false);
    setSelectedQuestionIndex(startIndex);
    setShowEditor(false);

    setTimeout(() => {
      setShowEditor(true);
    }, 100);
  };

  const handleTitleChange = (newTitle: string) => {
    setEditedTitle(newTitle);
    setTitleModified(true);
  };

  // Handle answer key mode selection
  const handleManualAnswerEdit = () => {
    setAnswerKeySubMode('manual');
    setShowEditor(true);
  };

  const handleMassImportAnswers = () => {
    setAnswerKeySubMode('massImport');
    setShowEditor(true);
  };

  // Handle mass import apply
  const handleApplyMassImport = (answers: Record<number, string>) => {
    const updatedQuestions = { ...editedQuestions };
    const modifiedIndices: number[] = [];

    Object.entries(answers).forEach(([qNumStr, answer]) => {
      const qNum = parseInt(qNumStr);
      const index = qNum - 1; // Convert 1-based question number to 0-based index

      if (
        index >= 0 &&
        updatedQuestions[index] &&
        !(
          updatedQuestions[index]?.groupTaskType === 'table-completion' &&
          updatedQuestions[index]?.groupId &&
          canonicalTableGroupMap.has(updatedQuestions[index].groupId)
        )
      ) {
        updatedQuestions[index] = { ...updatedQuestions[index], answer };
        modifiedIndices.push(index);
      }
    });

    setEditedQuestions(updatedQuestions);
    setModifiedQuestions(prev => new Set([...prev, ...modifiedIndices]));
    setAnswerKeySubMode('none');
    setShowEditor(false);
  };

  // Handle answer key update from AnswerKeyPanel
  const handleAnswerKeyUpdate = (index: number, answer: string) => {
    const currentQuestion = editedQuestions[index] || test.questions[index];
    if (
      currentQuestion?.groupTaskType === 'table-completion' &&
      currentQuestion.groupId &&
      canonicalTableGroupMap.has(currentQuestion.groupId)
    ) {
      toast.error('Canonical table-completion groups are read-only after publish in Phase 1.');
      return;
    }

    const updated = { ...currentQuestion, answer };
    setEditedQuestions(prev => ({
      ...prev,
      [index]: updated
    }));
    setModifiedQuestions(prev => new Set([...prev, index]));
  };

  const validateQuestions = () => {
    const errors: string[] = [];

    // For listening tests with image display mode, question text is not required
    // because questions are displayed as images, not text
    const isListeningImageMode = (test as any)?.displayMode === 'image' &&
      (test as any)?.skill === 'Listening';

    Object.entries(editedQuestions).forEach(([index, question]) => {
      const questionNum = parseInt(index) + 1;

      // Skip question text validation for listening image mode tests
      if (!isListeningImageMode) {
        // Find resource by resourceId OR passageId (legacy fallback)
        const resource = resources.find(r => r.id === question.resourceId || r.id === question.passageId);

        // Determine if text is optional based on resource type
        const isImagePassage = resource?.type === 'image' ||
          (resource?.type === 'text' && !!(resource as any).imageUrl) ||
          (resource?.type === 'audio' && (resource as any).images?.length > 0);

        const isSummaryGroupMember =
          (question.type === 'summary-completion-list' || question.type === 'summary-completion-text') &&
          (!question.question || question.question.trim() === '');

        if (!isImagePassage && !isSummaryGroupMember && (!question.question || question.question.trim() === '')) {
          errors.push(`Question ${questionNum}: Question text is empty`);
        }
      }

      if (question.options) {
        question.options.forEach((opt: any, optIndex: number) => {
          if (typeof opt === 'string' && (!opt || opt.trim() === '')) {
            errors.push(`Question ${questionNum}: Option ${String.fromCharCode(65 + optIndex)} is empty`);
          }
        });
      }

      if (!question.answer) {
        errors.push(`Question ${questionNum}: Correct answer is not set`);
      }
    });

    return errors;
  };

  const handleSave = () => {
    const errors = validateQuestions();

    if (errors.length > 0) {
      setValidationErrors(errors);
      setShowValidationPopup(true);
      return;
    }

    performSave();
  };

  const performSave = async () => {
    // Guard: read-only users must never reach the database write path
    if (isReadOnly) {
      console.warn('[TestEditor] Save blocked — current user is not the test owner.');
      return;
    }

    if (test && test.id) {
      if (Object.keys(editedQuestions).length === 0 && !titleModified && !isPublicModified && resources.length === 0 && !editedDuration) {
        handleClose();
        return;
      }

      setIsSaving(true);

      try {
        // 0. Process any temporary R2 files (move to permanent storage)
        let finalResources = [...resources];
        const tempFiles: { resourceIndex: number; key: 'audioUrl' | 'images'; subIndex?: number; url: string }[] = [];
        const keysToMove: string[] = [];

        finalResources.forEach((res, index) => {
          if (res.audioUrl && r2StorageService.isTempFile(res.audioUrl)) {
            const key = r2StorageService.getKeyFromUrl(res.audioUrl);
            if (key) {
              tempFiles.push({ resourceIndex: index, key: 'audioUrl', url: res.audioUrl });
              keysToMove.push(key);
            }
          }
          if (res.images && res.images.length > 0) {
            res.images.forEach((imgUrl, imgIndex) => {
              if (r2StorageService.isTempFile(imgUrl)) {
                const key = r2StorageService.getKeyFromUrl(imgUrl);
                if (key) {
                  tempFiles.push({ resourceIndex: index, key: 'images', subIndex: imgIndex, url: imgUrl });
                  keysToMove.push(key);
                }
              }
            });
          }
        });

        if (keysToMove.length > 0) {
          console.log(`📦 Moving ${keysToMove.length} temp files to permanent storage...`);
          const moveResults = await r2StorageService.moveMultipleToPermanent(keysToMove);

          tempFiles.forEach((fileInfo, i) => {
            const result = moveResults[i];
            if (result && result.success) {
              const res = finalResources[fileInfo.resourceIndex];
              if (res) {
                if (fileInfo.key === 'audioUrl') {
                  res.audioUrl = result.newUrl;
                } else if (fileInfo.key === 'images' && fileInfo.subIndex !== undefined) {
                  if (res.images) {
                    res.images[fileInfo.subIndex] = result.newUrl;
                  }
                }
              }
            }
          });
          // Update local state to reflect permanent URLs
          setResources(finalResources);
        }

        const updates: Record<string, any> = {};

        // 1. Convert resources to legacy DB format
        const resourceUpdates = adaptResourcesToTest(finalResources);
        if (resourceUpdates.passages) updates[`/tests/${test.id}/passages`] = resourceUpdates.passages;
        if (resourceUpdates.audioSections) updates[`/tests/${test.id}/audioSections`] = resourceUpdates.audioSections;
        if (resourceUpdates.questionImages) updates[`/tests/${test.id}/questionImages`] = resourceUpdates.questionImages;

        // Map resourceId -> sectionNumber for Audio resources
        const audioSectionMap = new Map<string, number>();
        if (resourceUpdates.audioSections) {
          resources.filter(r => r.type === 'audio').forEach((r, idx) => {
            if (resourceUpdates.audioSections && resourceUpdates.audioSections[idx]) {
              audioSectionMap.set(r.id, resourceUpdates.audioSections[idx].number);
            }
          });
        }

        // 2. Update questions
        Object.entries(editedQuestions).forEach(([index, question]) => {
          const qUpdate = { ...question };
          const qNum = parseInt(index) + 1;

          // Find governing resource by range (Source of Truth)
          const governingResource = resources.find(r => qNum >= (r.questionStart || 0) && qNum <= (r.questionEnd || 0));

          if (governingResource) {
            if (governingResource.type === 'text') {
              qUpdate.passageId = governingResource.id;
              if (qUpdate.sectionNumber) delete qUpdate.sectionNumber;
            } else if (governingResource.type === 'audio') {
              const secNum = audioSectionMap.get(governingResource.id);
              if (secNum) qUpdate.sectionNumber = secNum;
              qUpdate.passageId = null;
            }
            // Update internal resourceId for consistency
            qUpdate.resourceId = governingResource.id;
          } else {
            // unlink if no resource covers this question
            qUpdate.passageId = null;
            if (qUpdate.sectionNumber) delete qUpdate.sectionNumber;
            qUpdate.resourceId = null;
          }

          updates[`/tests/${test.id}/questions/${index}`] = qUpdate;
        });

        // Update title if modified
        if (titleModified) {
          updates[`/tests/${test.id}/title`] = editedTitle;
        }

        // Update isPublic if modified
        if (isPublicModified) {
          updates[`/tests/${test.id}/isPublic`] = editedIsPublic;
        }

        // Duration
        if (editedDuration !== test.duration) {
          updates[`/tests/${test.id}/duration`] = editedDuration;
        }

        // Update timestamp
        const updatedAt = Date.now();
        updates[`/tests/${test.id}/updatedAt`] = updatedAt;

        // Recalculate isComplete based on edited questions
        const allQuestions = Object.values(editedQuestions);
        const questionsWithoutAnswers = allQuestions.filter((q: any) =>
          !q.answer ||
          (typeof q.answer === 'string' && q.answer.trim() === '') ||
          (Array.isArray(q.answer) && q.answer.length === 0)
        );
        const isComplete = questionsWithoutAnswers.length === 0;
        const missingAnswerCount = questionsWithoutAnswers.length;

        updates[`/tests/${test.id}/isComplete`] = isComplete;
        updates[`/tests/${test.id}/missingAnswerCount`] = missingAnswerCount;

        const nextTestData = {
          ...test,
          title: titleModified ? editedTitle : test.title,
          isPublic: isPublicModified ? editedIsPublic : test.isPublic,
          duration: editedDuration,
          questions: Object.values(editedQuestions),
          ...(resourceUpdates.passages
            ? { passages: resourceUpdates.passages }
            : {}),
          ...(resourceUpdates.audioSections
            ? { audioSections: resourceUpdates.audioSections }
            : {}),
          ...(resourceUpdates.questionImages
            ? { questionImages: resourceUpdates.questionImages }
            : {}),
          isComplete,
          missingAnswerCount,
          updatedAt,
        };
        Object.entries(buildMaterialSummaryUpdatePayload(
          createLegacyTestMaterialSummary(test.id, nextTestData),
          createLegacyTestMaterialSummary(test.id, test),
        )).forEach(([path, value]) => {
          updates[`/${path}`] = value;
        });

        console.log(`📝 Test save: isComplete=${isComplete}, missingAnswerCount=${missingAnswerCount}`);

        await update(ref(database), updates);

        // Clear localStorage
        const storageKey = getStorageKey();
        localStorage.removeItem(storageKey);

        toast.success('Test saved successfully ✅');

        // Fire-and-forget: propagate title change to homework assignments
        if (titleModified && test.id) {
          propagateTestMetadataToHomework(test.id, { materialTitle: editedTitle });
        }

        handleClose();
      } catch (error) {
        console.error('Error saving test:', error);
        toast.error('Failed to save test changes. Please try again.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleCancel = () => {
    if (modifiedQuestions.size > 0 || titleModified) {
      if (window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        // Clear cached edits so stale modifications don't re-trigger the popup next open
        localStorage.removeItem(getStorageKey());
        handleClose();
      }
    } else {
      handleClose();
    }
  };

  if (!test) return null;

  const handleTabChange = (tab: EditorTab) => {
    setActiveTab(tab);
    // Reset editor states when switching tabs to prevent stale panels
    if (tab !== 'answerKey') {
      setAnswerKeySubMode('none');
    }
    if (tab !== 'questions') {
      setShowSingleCreator(false);
      setShowBulkCreator(false);
      setShowAddOptions(false);
    }
    // Only keep showEditor true for questions tab when a question is selected
    if (tab === 'questions' && selectedQuestionIndex === null) {
      setShowEditor(false);
    }
  };

  const frameProps = {
    title: editedTitle || test.title,
    onTitleChange: handleTitleChange,
    activeTab,
    onTabChange: handleTabChange,
    onSave: handleSave,
    onCancel: handleCancel,
    isSaving,
    questionCount: Object.keys(editedQuestions).length || test.questions.length,
    resourceCount: resources.length,
    duration: editedDuration,
    onDurationChange: (d: number) => {
      setEditedDuration(d);
      setTitleModified(true);
    },
    isPublic: editedIsPublic,
    onIsPublicChange: (val: boolean) => {
      setEditedIsPublic(val);
      setIsPublicModified(true);
    },
    onBulkSetTimer: (timer: number) => {
      const updatedQuestions: Record<number, any> = { ...editedQuestions };
      Object.keys(updatedQuestions).forEach(key => {
        const index = Number(key);
        updatedQuestions[index] = { ...updatedQuestions[index], timer };
      });
      setEditedQuestions(updatedQuestions);
      setModifiedQuestions(new Set(Object.keys(updatedQuestions).map(Number)));
    },
    onOpenPracticeSettings: () => setShowPracticeSettings(true),
    // Ownership enforcement: non-owners see everything but cannot save
    readOnly: isReadOnly,
  };

  // Prepare Panels
  const questionListPanel = (
    <QuestionList
      questions={test.questions}
      editedQuestions={editedQuestions}
      selectedQuestionIndex={selectedQuestionIndex}
      modifiedQuestions={modifiedQuestions}
      onQuestionSelect={handleQuestionSelect}
      onAddQuestion={handleAddQuestion}
      onDeleteQuestion={handleDeleteQuestion}
      onUpdateQuestionTimer={handleQuestionUpdate}
      showAddOptions={showAddOptions}
      onSelectSingle={handleSelectSingleQuestion}
      onSelectBulk={handleSelectBulkQuestions}
      onCancelAdd={handleCancelAdd}
      readOnly={isReadOnly}
    />
  );

  const resourceManagerPanel = (
    <ResourceManager
      resources={resources}
      onUpdateResources={setResources}
      skill={(test as any).skill || 'Reading'}
      totalQuestions={test.questions.length}
      readOnly={isReadOnly}
    />
  );

  const questionEditorPanel = selectedQuestionIndex !== null ? (() => {
    const q = editedQuestions[selectedQuestionIndex] || test.questions[selectedQuestionIndex];
    const canonicalTableGroup =
      q?.groupTaskType === 'table-completion' && q.groupId
        ? canonicalTableGroupMap.get(q.groupId)
        : undefined;
    const resource = resources.find(r => r.id === q?.resourceId || r.id === q?.passageId);
    const isImagePassage =
      resource?.type === 'image' ||
      (resource?.type === 'text' && !!(resource as any).imageUrl) ||
      (resource?.type === 'audio' && (resource as any).images && (resource as any).images.length > 0);

    if (canonicalTableGroup) {
      return (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '1.5rem',
              borderBottom: '1px solid rgba(59, 130, 246, 0.15)',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(14, 165, 233, 0.08) 100%)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b' }}>
                Canonical Table Group
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Questions {canonicalTableGroup.questionRange.start}-{canonicalTableGroup.questionRange.end}
              </div>
            </div>
            <button
              onClick={handleCloseEditor}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '0.5rem',
                borderRadius: '0.375rem',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
            <div
              style={{
                padding: '1rem 1.125rem',
                borderRadius: '0.75rem',
                border: '1px solid #bfdbfe',
                background: '#eff6ff',
                color: '#1e3a8a',
                lineHeight: 1.6,
              }}
            >
              This canonical table-completion group is read-only after publish in Phase 1.
              Use the grouped parse-review flow to change the table structure or member answers.
            </div>
          </div>
        </div>
      );
    }

    // Compute group if this is a summary type
    const isSummaryType =
      q?.type === 'summary-completion-list' || q?.type === 'summary-completion-text';

    let groupQuestions: any[] | null = null;
    if (isSummaryType) {
      const allQsArray = Object.keys(editedQuestions)
        .sort((a, b) => Number(a) - Number(b))
        .map(key => editedQuestions[Number(key)]);
      groupQuestions = getGroupQuestions(allQsArray, selectedQuestionIndex);
    }

    return (
      <QuestionEditorPanel
        isImagePassage={isImagePassage}
        question={q}
        questionIndex={selectedQuestionIndex}
        totalQuestions={test.questions.length}
        onUpdate={(updated: any) => handleQuestionUpdate(selectedQuestionIndex, updated)}
        onClose={handleCloseEditor}
        onReset={() => handleResetQuestion(selectedQuestionIndex)}
        onPrevious={() => {
          if (selectedQuestionIndex > 0) setSelectedQuestionIndex(selectedQuestionIndex - 1);
        }}
        onNext={() => {
          if (selectedQuestionIndex < test.questions.length - 1) setSelectedQuestionIndex(selectedQuestionIndex + 1);
        }}
        groupQuestions={groupQuestions}
        onGroupUpdate={isSummaryType ? handleGroupUpdate : null}
        readOnly={isReadOnly}
      />
    );
  })() : null;

  const answerKeySelector = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem', alignItems: 'center' }}>
      <Button disabled={isReadOnly} onClick={handleManualAnswerEdit} variant="primary" style={{ width: '200px' }}>Manual Edit</Button>
      <Button disabled={isReadOnly} onClick={handleMassImportAnswers} variant="secondary" style={{ width: '200px' }}>Mass Import</Button>
    </div>
  );

  const answerKeyEditor = answerKeySubMode === 'manual' ? (
    <AnswerKeyPanel
      questions={editedQuestions}
      onUpdateAnswer={handleAnswerKeyUpdate}
      onClose={() => {
        setAnswerKeySubMode('none');
        setShowEditor(false);
      }}
      totalQuestions={Object.keys(editedQuestions).length}
      readOnly={isReadOnly}
    />
  ) : (
    <MassAnswerImportPanel
      questions={editedQuestions}
      onApplyAnswers={handleApplyMassImport}
      onClose={() => {
        setAnswerKeySubMode('none');
        setShowEditor(false);
      }}
      totalQuestions={Object.keys(editedQuestions).length || test.questions.length}
      readOnly={isReadOnly}
    />
  );

  const isListening = (test as any).skill === 'Listening';

  return (
    <NativeModal
      opened={show}
      onClose={handleCancel}
      size="auto"
      padding={0}
      withCloseButton={false}
      centered
      styles={{
        body: { padding: 0, background: 'transparent' },
        content: { background: 'transparent', boxShadow: 'none' },
        inner: { padding: 0 }
      }}
    >
      {isListening ? (
        <ListeningEditorLayout
          {...frameProps}
          questionList={questionListPanel}
          resourceManager={resourceManagerPanel}
          questionEditor={questionEditorPanel}
          singleQuestionCreator={
            <SingleQuestionCreator onSave={handleSaveSingleQuestion} onCancel={handleCancelAdd} />
          }
          bulkQuestionCreator={
            <BulkQuestionCreator onSave={handleSaveBulkQuestions} onCancel={handleCancelAdd} />
          }
          answerKeySelector={answerKeySelector}
          answerKeyEditor={answerKeyEditor}
          showEditor={showEditor}
          showSingleCreator={showSingleCreator}
          showBulkCreator={showBulkCreator}
        />
      ) : (
        <ReadingEditorLayout
          {...frameProps}
          questionList={questionListPanel}
          resourceManager={resourceManagerPanel}
          questionEditor={questionEditorPanel}
          singleQuestionCreator={
            <SingleQuestionCreator onSave={handleSaveSingleQuestion} onCancel={handleCancelAdd} />
          }
          bulkQuestionCreator={
            <BulkQuestionCreator onSave={handleSaveBulkQuestions} onCancel={handleCancelAdd} />
          }
          answerKeySelector={answerKeySelector}
          answerKeyEditor={answerKeyEditor}
          showEditor={showEditor}
          showSingleCreator={showSingleCreator}
          showBulkCreator={showBulkCreator}
        />
      )}

      {showValidationPopup && (
        <NativeModal
          opened={showValidationPopup}
          onClose={() => setShowValidationPopup(false)}
          title="Validation Errors"
          size="md"
        >
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
              Please fix the following errors before saving:
            </p>
            <ul style={{ paddingLeft: '1.5rem' }}>
              {validationErrors.map((error, index) => (
                <li key={index} style={{ color: '#ef4444', marginBottom: '0.25rem' }}>
                  {error}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            {/* @ts-ignore */}
            <Button
              variant="glass"
              onClick={() => setShowValidationPopup(false)}
            >
              Close
            </Button>
          </div>
        </NativeModal>
      )}

      {/* PRD-0025 Practice Settings Modal */}
      {showPracticeSettings && (
        <PracticeSettingsModal
          opened={showPracticeSettings}
          onClose={() => setShowPracticeSettings(false)}
          materialId={test?.id}
          readOnly={isReadOnly}
        />
      )}
    </NativeModal>
  );
};

export default TestEditor;
