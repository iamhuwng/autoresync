import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal } from '@mantine/core';
import { EditorTab } from './test/editor/EditTestFrame';
import { ReadingEditorLayout } from './test/editor/layouts/ReadingEditorLayout';
import { ListeningEditorLayout } from './test/editor/layouts/ListeningEditorLayout';

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
import { refreshStudentSafeTestData } from '../services/testStorage';
import type { TestData, ContextResource } from '../services/testStorage';
import { ResourceManager } from './test/editor/ResourceManager';
import { adaptTestToResources, adaptResourcesToTest, linkQuestionsToResources } from './test/editor/resourceAdapters';
import { getGroupQuestions } from '../utils/summaryGroupUtils';
import { useAuth } from '../hooks/useAuth';
import { PracticeSettingsModal } from './PracticeSettingsModal';
import { storage } from '../core/platform/storage';

interface TestEditorProps {
  test: TestData;
  show: boolean;
  handleClose: () => void;
}

const isStorageQuotaError = (error: unknown): boolean => {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014
    );
  }

  if (error instanceof Error) {
    return /quota/i.test(`${error.name} ${error.message}`);
  }

  return false;
};

const TestEditor: React.FC<TestEditorProps> = ({ test, show, handleClose }) => {
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
  const [resourcesModified, setResourcesModified] = useState(false);
  const disabledDraftStorageKeysRef = useRef(new Set<string>());
  const warnedDraftStorageKeysRef = useRef(new Set<string>());

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
          setResourcesModified(Boolean(parsed.resourcesModified));

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
    setResourcesModified(false);


  };

  useEffect(() => {
    if (test && Object.keys(editedQuestions).length > 0) {
      const storageKey = getStorageKey();
      const hasDraftChanges =
        modifiedQuestions.size > 0 ||
        titleModified ||
        isPublicModified ||
        resourcesModified ||
        editedDuration !== (test.duration || 0);

      if (!hasDraftChanges || disabledDraftStorageKeysRef.current.has(storageKey)) {
        return;
      }

      const dataToSave = {
        timestamp: new Date().toISOString(),
        questions: editedQuestions,
        modified: Array.from(modifiedQuestions),
        title: editedTitle,
        titleModified,
        isPublic: editedIsPublic,
        isPublicModified,
        resourcesModified,
        resources,
        duration: editedDuration,
        activeTab,
      };
      void storage.set(storageKey, dataToSave).catch((error: unknown) => {
        disabledDraftStorageKeysRef.current.add(storageKey);
        void storage.remove(storageKey).catch(() => undefined);

        if (!warnedDraftStorageKeysRef.current.has(storageKey)) {
          warnedDraftStorageKeysRef.current.add(storageKey);
          console.warn('[TestEditor] Local draft persistence disabled:', error);

          const message = isStorageQuotaError(error)
            ? 'Browser storage is full, so local draft backup is paused. You can keep editing; use Save to persist changes.'
            : 'Local draft backup is unavailable. You can keep editing; use Save to persist changes.';

          toast.warning(message);
        }
      });
    }
  }, [editedQuestions, modifiedQuestions, test, editedTitle, titleModified, editedIsPublic, isPublicModified, resourcesModified, resources, editedDuration, activeTab]);

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

  const handleResourcesUpdate = (updatedResources: ContextResource[]) => {
    setResources(updatedResources);
    setResourcesModified(true);
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

      if (index >= 0 && updatedQuestions[index]) {
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
        updates[`/tests/${test.id}/updatedAt`] = Date.now();

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

        console.log(`📝 Test save: isComplete=${isComplete}, missingAnswerCount=${missingAnswerCount}`);

        await update(ref(database), updates);
        const refreshResult = await refreshStudentSafeTestData(test.id);
        if (!refreshResult.success) {
          console.error('Student-safe payload refresh failed after test save:', refreshResult.error);
          toast.error('Test saved, but student delivery cache did not refresh. Please try saving again.');
          return;
        }
        setResourcesModified(false);

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
      onUpdateResources={handleResourcesUpdate}
      skill={(test as any).skill || 'Reading'}
      totalQuestions={test.questions.length}
      readOnly={isReadOnly}
    />
  );

  const questionEditorPanel = selectedQuestionIndex !== null ? (() => {
    const q = editedQuestions[selectedQuestionIndex] || test.questions[selectedQuestionIndex];
    const resource = resources.find(r => r.id === q?.resourceId || r.id === q?.passageId);
    const isImagePassage =
      resource?.type === 'image' ||
      (resource?.type === 'text' && !!(resource as any).imageUrl) ||
      (resource?.type === 'audio' && (resource as any).images && (resource as any).images.length > 0);

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
    <Modal
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
        <Modal
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
        </Modal>
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
    </Modal>
  );
};

export default TestEditor;
