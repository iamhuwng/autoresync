import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { HomeworkConfigPanel } from './HomeworkConfigPanel';
import { HomeworkTagChips } from './HomeworkTagChips';
import { StudentGroupSelector } from './StudentGroupSelector';
import { AntiCheatConfigSection } from './AntiCheatConfigSection';
import { useHomeworkTags } from '../../hooks/useHomeworkTags';
import { createHomework, type CreateHomeworkInput } from '../../services/homeworkManager';
import { createTemplate, getTemplatesByTeacher } from '../../services/homeworkTemplateService';
import {
    createReadingPassageHomeworkSnapshot,
    createReadingPassageSetHomework,
    type ReadingPassageHomeworkCandidate,
} from '../../services/reading-v2/readingV2PassageHomework.service';
import type {
    HomeworkConfig,
    HomeworkContentRef,
    HomeworkMaterialSkill,
    HomeworkMaterialType,
    HomeworkTarget,
    ReadingPassageHomeworkSet,
    ReadingPassageHomeworkSnapshot,
} from '../../types/homework.types';
import type { AntiCheatConfig } from '../../types/integrity.types';
import { resolvePreset, getContextDefaults } from '../../utils/antiCheatPresets';
// @ts-ignore - JS service
import queryOptimizer from '../../services/firebaseQueryOptimizer';
import { getClasses, getClass } from '../../services/classManager';
import { THCSHomeworkAssignDialog } from '../thcs-editor/THCSHomeworkAssignDialog';
import TemplateSaveModal from './TemplateSaveModal';
import ToastNotification from '../modern/ToastNotification';
import './HomeworkCreateModal.css';

interface HomeworkCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    preselectedMaterialId?: string;
    preselectedMaterial?: Material;
    preselectedMaterialFilter?: 'all' | 'quiz' | 'test' | 'thcs-test' | 'reading-passage' | 'reading-passage-set';
    preselectedTarget?: HomeworkTarget;
    preselectedReadingPassage?: ReadingPassageHomeworkCandidate;
    preselectedReadingPassageSet?: {
        title: string;
        passages: readonly ReadingPassageHomeworkCandidate[];
    };
    preselectedContentRef?: HomeworkContentRef;
    createHomeworkAssignment?: (input: CreateHomeworkInput & { contentRef?: HomeworkContentRef }) => Promise<string>;
}

type Step = 'material' | 'target' | 'config' | 'review';

interface Material {
    id: string;
    title: string;
    type: HomeworkMaterialType;
    skill: HomeworkMaterialSkill;
    questionCount?: number;
    duration?: number;
    soloConfig?: {
        timerMinutes?: number;
        maxAttempts?: number;
    };
    timerMinutes?: number;
    maxAttempts?: number;
    // THCS-specific
    testType?: string;
    gradeLevel?: number;
    isPublicLibrary?: boolean;
    readingPassageSnapshot?: ReadingPassageHomeworkSnapshot;
    readingPassageSet?: ReadingPassageHomeworkSet;
}

interface Class {
    id: string;
    name: string;
    studentCount?: number;
}

interface Student {
    id: string;
    name: string;
    email: string;
}

const createDefaultHomeworkAntiCheatConfig = (): AntiCheatConfig => ({
    ...resolvePreset('standard'),
    ...getContextDefaults('homework'),
});

const isOwnedMaterial = (material: any, userId?: string) => (
    material.ownerId === userId ||
    material.createdBy === userId ||
    (!material.ownerId && !material.createdBy)
);

const mapMaterialRecord = (material: any, isPublicLibrary: boolean): Material => ({
    id: material.id,
    title: material.testType === 'THCS-THPT'
        ? (material.metadata?.title || material.title || 'Untitled')
        : (material.title || 'Untitled'),
    type: material.testType === 'THCS-THPT' ? 'thcs-test' as const : (material.type || 'test'),
    skill: material.skill || 'reading',
    questionCount: material.testType === 'THCS-THPT'
        ? (material.sections || []).reduce((sum: number, section: any) => sum + (section.questions?.length || 0), 0)
        : (material.questions?.length || 0),
    duration: material.testType === 'THCS-THPT' ? material.metadata?.duration : material.duration,
    soloConfig: material.soloConfig,
    testType: material.testType,
    gradeLevel: material.metadata?.gradeLevel,
    isPublicLibrary,
});

const READING_PASSAGE_SET_PRESELECTED_ID = 'reading-passage-set:selected';

const mapReadingPassageCandidate = (candidate: ReadingPassageHomeworkCandidate): Material => {
    const snapshot = createReadingPassageHomeworkSnapshot(candidate);

    return {
        id: snapshot.passageMaterialId,
        title: snapshot.titleSnapshot,
        type: 'reading-passage',
        skill: 'reading',
        questionCount: snapshot.questionCount,
        readingPassageSnapshot: snapshot,
    };
};

const mapReadingPassageSet = (input: {
    title: string;
    passages: readonly ReadingPassageHomeworkCandidate[];
}): Material => {
    const readingPassageSet = createReadingPassageSetHomework(input.passages, input.title);

    return {
        id: READING_PASSAGE_SET_PRESELECTED_ID,
        title: readingPassageSet.titleSnapshot,
        type: 'reading-passage-set',
        skill: 'reading',
        questionCount: readingPassageSet.items.reduce((sum, item) => sum + item.questionCount, 0),
        readingPassageSet,
    };
};

export function HomeworkCreateModal({
    isOpen,
    onClose,
    onSuccess,
    preselectedMaterialId,
    preselectedMaterial,
    preselectedMaterialFilter,
    preselectedTarget,
    preselectedReadingPassage,
    preselectedReadingPassageSet,
    preselectedContentRef,
    createHomeworkAssignment,
}: HomeworkCreateModalProps) {
    const { user } = useAuth();
    const { tags: availableTags } = useHomeworkTags();

    // Step management
    const [currentStep, setCurrentStep] = useState<Step>('material');

    // Material selection
    const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [materialSearch, setMaterialSearch] = useState('');
    const [materialFilter, setMaterialFilter] = useState<'all' | 'quiz' | 'test' | 'thcs-test' | 'reading-passage' | 'reading-passage-set'>('all');

    // Phase 3: THCS homework dialog state
    const [showThcsDialog, setShowThcsDialog] = useState(false);
    const [thcsDialogTest, setThcsDialogTest] = useState<Material | null>(null);

    // Target selection
    const [targetType, setTargetType] = useState<'class' | 'students'>('class');
    const [selectedClass, setSelectedClass] = useState<Class | null>(null);
    const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
    const [classes, setClasses] = useState<Class[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [showStudentSelector, setShowStudentSelector] = useState(false);

    // Configuration
    const [config, setConfig] = useState<HomeworkConfig>({
        timerMinutes: null,
        maxAttempts: null,
        feedbackTiming: 'after_completion',
        lateSubmissionAllowed: false,
    });

    // Writing-specific config state
    const [wordMinEnforced, setWordMinEnforced] = useState(true);

    // PRD-0036: Anti-cheat configuration for homework
    const [antiCheatConfig, setAntiCheatConfig] = useState<AntiCheatConfig>(
        createDefaultHomeworkAntiCheatConfig
    );

    const [availableFrom, setAvailableFrom] = useState<string>('');
    const [dueDate, setDueDate] = useState<string>('');
    const [instructions, setInstructions] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // UI state
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showTemplateSaveModal, setShowTemplateSaveModal] = useState(false);
    const [templateSubmitting, setTemplateSubmitting] = useState(false);
    const [templateSaveError, setTemplateSaveError] = useState<string | null>(null);
    const [existingTemplateNames, setExistingTemplateNames] = useState<string[]>([]);
    const [templateToast, setTemplateToast] = useState<{
        title: string;
        message: string;
        tone: 'success' | 'error';
    } | null>(null);

    // Load materials
    useEffect(() => {
        if (isOpen) {
            loadMaterials();
            loadClasses();
            loadStudents();
        }
    }, [isOpen]);

    const effectivePreselectedMaterialId = preselectedMaterial
        ? preselectedMaterial.id
        : preselectedReadingPassage
        ? preselectedReadingPassage.materialId
        : preselectedReadingPassageSet
            ? READING_PASSAGE_SET_PRESELECTED_ID
            : preselectedMaterialId;

    // Handle preselected material
    useEffect(() => {
        if (effectivePreselectedMaterialId && materials.length > 0) {
            const material = materials.find(m => m.id === effectivePreselectedMaterialId);
            if (material) {
                setSelectedMaterial(material);
                setCurrentStep('target');
            }
        }
    }, [effectivePreselectedMaterialId, materials]);

    // Handle preselected target
    useEffect(() => {
        if (!isOpen || !preselectedTarget) {
            return;
        }

        if (preselectedTarget.type === 'class') {
            setTargetType('class');
            setSelectedClass({
                id: preselectedTarget.classId,
                name: preselectedTarget.className || 'Unknown Class',
            });
        }
    }, [isOpen, preselectedTarget]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setMaterialFilter(preselectedMaterialFilter || 'all');
    }, [isOpen, preselectedMaterialFilter]);

    useEffect(() => {
        if (!showTemplateSaveModal || !user?.uid) {
            if (!showTemplateSaveModal) {
                setExistingTemplateNames([]);
            }
            return;
        }

        let isCancelled = false;

        const loadTemplateNames = async () => {
            try {
                const existingTemplates = await getTemplatesByTeacher(user.uid);
                if (!isCancelled) {
                    setExistingTemplateNames(existingTemplates.map((template) => template.name));
                }
            } catch (err) {
                if (!isCancelled) {
                    console.error('Error loading template names:', err);
                    setExistingTemplateNames([]);
                }
            }
        };

        loadTemplateNames();

        return () => {
            isCancelled = true;
        };
    }, [showTemplateSaveModal, user?.uid]);

    const loadMaterials = async () => {
        setLoading(true);
        try {
            if (preselectedReadingPassage) {
                setMaterials([mapReadingPassageCandidate(preselectedReadingPassage)]);
                return;
            }

            if (preselectedReadingPassageSet) {
                setMaterials([mapReadingPassageSet(preselectedReadingPassageSet)]);
                return;
            }

            if (preselectedMaterial) {
                setMaterials([preselectedMaterial]);
                return;
            }

            const [tests, quizzes] = await Promise.all([
                queryOptimizer.getAllTests(),
                queryOptimizer.getAllQuizzes(),
            ]);

            const visibleMaterials = [...tests, ...quizzes]
                .filter((material: any) => material.solo_enabled !== false) // Only show materials enabled for solo
                .filter((material: any) => {
                    const isOwned = isOwnedMaterial(material, user?.uid);
                    const isPublicLibrary = material.isPublic === true && !isOwned;
                    return isOwned || isPublicLibrary;
                })
                .map((material: any) => mapMaterialRecord(
                    material,
                    material.isPublic === true && !isOwnedMaterial(material, user?.uid)
                ));

            setMaterials(visibleMaterials);
        } catch (err) {
            console.error('Error loading materials:', err);
            setError(err instanceof Error ? err.message : 'Failed to load materials');
        } finally {
            setLoading(false);
        }
    };

    const loadClasses = async () => {
        try {
            const classData = await getClasses(user?.uid);
            setClasses(classData.map((c) => ({
                id: c.id,
                name: c.name,
                studentCount: c.studentCount ?? 0,
            })));
        } catch (err) {
            console.error('Error loading classes:', err);
        }
    };

    const loadStudents = async () => {
        try {
            // Derive students from loaded classes
            const teacherClasses = await getClasses(user?.uid);
            const studentMap = new Map<string, { id: string; name: string; email: string }>();

            for (const cls of teacherClasses) {
                const fullClass = await getClass(cls.id);
                if (fullClass?.students) {
                    for (const [studentId, studentData] of Object.entries(fullClass.students)) {
                        if (!studentMap.has(studentId)) {
                            studentMap.set(studentId, {
                                id: studentId,
                                name: studentData.name || studentData.uid || studentId,
                                email: studentData.email || '',
                            });
                        }
                    }
                }
            }

            setStudents(Array.from(studentMap.values()));
        } catch (err) {
            console.error('Error loading students:', err);
        }
    };

    const handleNext = () => {
        if (currentStep === 'material' && selectedMaterial) {
            // Phase 3: If THCS material selected, redirect to THCS dialog
            if (selectedMaterial.type === 'thcs-test') {
                setThcsDialogTest(selectedMaterial);
                setShowThcsDialog(true);
                return;
            }
            setCurrentStep('target');
        } else if (currentStep === 'target' && isTargetValid()) {
            setCurrentStep('config');
        } else if (currentStep === 'config' && isConfigValid()) {
            setCurrentStep('review');
        }
    };

    const handleBack = () => {
        if (currentStep === 'review') setCurrentStep('config');
        else if (currentStep === 'config') setCurrentStep('target');
        else if (currentStep === 'target') setCurrentStep('material');
    };

    const isTargetValid = () => {
        if (targetType === 'class') return selectedClass !== null;
        if (targetType === 'students') return selectedStudents.length > 0;
        return false;
    };

    const isConfigValid = () => {
        return dueDate !== '';
    };

    const handleSubmit = async () => {
        if (!selectedMaterial || !isTargetValid() || !isConfigValid()) {
            setError('Please complete all required fields');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const target: HomeworkTarget = targetType === 'class' && selectedClass
                ? {
                    type: 'class',
                    classId: selectedClass.id,
                    className: selectedClass.name,
                }
                : {
                    type: 'students',
                    studentIds: selectedStudents,
                    // Denormalize student names at creation time so the UI
                    // never needs to re-fetch them (PRD denormalization pattern)
                    studentNames: selectedStudents.map(id => {
                        const student = students.find(s => s.id === id);
                        return student?.name || id;
                    }),
                };

            const homeworkInput: CreateHomeworkInput = {
                materialId: selectedMaterial.id,
                materialTitle: selectedMaterial.title,
                materialType: selectedMaterial.type,
                materialSkill: selectedMaterial.skill,
                teacherId: user!.uid,
                target,
                config,
                availableFrom: availableFrom ? new Date(availableFrom) : new Date(),
                dueDate: new Date(dueDate),
                instructions,
                tags: selectedTags,
                antiCheatConfig,
                readingPassageSnapshot: selectedMaterial.readingPassageSnapshot,
                readingPassageSet: selectedMaterial.readingPassageSet,
            };

            if (createHomeworkAssignment) {
                await createHomeworkAssignment({
                    ...homeworkInput,
                    contentRef: preselectedContentRef,
                });
            } else {
                await createHomework(homeworkInput);
            }

            onSuccess();
            handleClose();
        } catch (err) {
            console.error('Error creating homework:', err);
            setError(err instanceof Error && err.message
                ? err.message
                : 'Failed to create homework. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSaveAsTemplate = () => {
        setTemplateSaveError(null);
        setShowTemplateSaveModal(true);
    };

    const toggleTagSelection = (tagId: string) => {
        setSelectedTags((currentTags) => (
            currentTags.includes(tagId)
                ? currentTags.filter((currentTag) => currentTag !== tagId)
                : [...currentTags, tagId]
        ));
    };

    const handleTemplateSaveSubmit = async ({
        name,
        description,
    }: {
        name: string;
        description: string;
    }) => {
        if (!user?.uid) {
            setTemplateSaveError('You must be signed in to save a template.');
            return;
        }

        setTemplateSubmitting(true);
        setTemplateSaveError(null);

        try {
            const existingTemplates = await getTemplatesByTeacher(user.uid);
            const normalizedName = name.trim().toLocaleLowerCase();
            const duplicate = existingTemplates.some(
                (template) => template.name.trim().toLocaleLowerCase() === normalizedName
            );

            if (duplicate) {
                setTemplateSaveError('A template with this name already exists.');
                return;
            }

            await createTemplate(user.uid, name.trim(), config, description.trim() || undefined);
            setShowTemplateSaveModal(false);
            setExistingTemplateNames((currentNames) => [...currentNames, name.trim()]);
            setTemplateToast({
                title: 'Template saved',
                message: `Template "${name.trim()}" saved successfully.`,
                tone: 'success',
            });
        } catch (err) {
            console.error('Error saving template:', err);
            setTemplateSaveError(err instanceof Error ? err.message : 'Failed to save template');
            setTemplateToast({
                title: 'Save failed',
                message: 'Failed to save template.',
                tone: 'error',
            });
        } finally {
            setTemplateSubmitting(false);
        }
    };

    const resetFormState = () => {
        setCurrentStep('material');
        setSelectedMaterial(null);
        setMaterialFilter('all');
        setMaterialSearch('');
        setTargetType('class');
        setSelectedClass(null);
        setSelectedStudents([]);
        setShowStudentSelector(false);
        setConfig({
            timerMinutes: null,
            maxAttempts: null,
            feedbackTiming: 'after_completion',
            lateSubmissionAllowed: false,
        });
        setWordMinEnforced(true);
        setAntiCheatConfig(createDefaultHomeworkAntiCheatConfig());
        setAvailableFrom('');
        setDueDate('');
        setInstructions('');
        setSelectedTags([]);
        setShowThcsDialog(false);
        setThcsDialogTest(null);
        setShowTemplateSaveModal(false);
        setTemplateSubmitting(false);
        setTemplateSaveError(null);
        setExistingTemplateNames([]);
        setTemplateToast(null);
        setError(null);
    };

    const handleClose = () => {
        resetFormState();
        onClose();
    };

    if (!isOpen) return null;

    const filteredMaterials = materials.filter(m => {
        const matchesSearch = (m.title || '').toLowerCase().includes(materialSearch.toLowerCase());
        const matchesFilter = materialFilter === 'all' || m.type === materialFilter;
        return matchesSearch && matchesFilter;
    });

    return (
        <div className="homework-create-modal-overlay" onClick={handleClose}>
            <div className="homework-create-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header">
                    <h2 className="modal-title">➕ Create Homework Assignment</h2>
                    <button className="close-btn" onClick={handleClose}>✕</button>
                </div>

                {/* Progress Steps */}
                <div className="progress-steps">
                    <div className={`step ${currentStep === 'material' ? 'active' : ''} ${['target', 'config', 'review'].includes(currentStep) ? 'completed' : ''}`}>
                        <div className="step-number">1</div>
                        <div className="step-label">Material</div>
                    </div>
                    <div className="step-line"></div>
                    <div className={`step ${currentStep === 'target' ? 'active' : ''} ${['config', 'review'].includes(currentStep) ? 'completed' : ''}`}>
                        <div className="step-number">2</div>
                        <div className="step-label">Target</div>
                    </div>
                    <div className="step-line"></div>
                    <div className={`step ${currentStep === 'config' ? 'active' : ''} ${currentStep === 'review' ? 'completed' : ''}`}>
                        <div className="step-number">3</div>
                        <div className="step-label">Configure</div>
                    </div>
                    <div className="step-line"></div>
                    <div className={`step ${currentStep === 'review' ? 'active' : ''}`}>
                        <div className="step-number">4</div>
                        <div className="step-label">Review</div>
                    </div>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="error-banner">
                        ⚠️ {error}
                    </div>
                )}

                {/* Step Content */}
                <div className="modal-content">
                    {/* Step 1: Material Selection */}
                    {currentStep === 'material' && (
                        <div className="step-content">
                            <h3 className="step-title">📚 Select Material</h3>

                            <div className="material-filters">
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="🔍 Search materials..."
                                    value={materialSearch}
                                    onChange={(e) => setMaterialSearch(e.target.value)}
                                />
                                <div className="filter-buttons">
                                    <button
                                        className={`filter-btn ${materialFilter === 'all' ? 'active' : ''}`}
                                        onClick={() => setMaterialFilter('all')}
                                    >
                                        All
                                    </button>
                                    <button
                                        className={`filter-btn ${materialFilter === 'quiz' ? 'active' : ''}`}
                                        onClick={() => setMaterialFilter('quiz')}
                                    >
                                        Quizzes
                                    </button>
                                    <button
                                        className={`filter-btn ${materialFilter === 'test' ? 'active' : ''}`}
                                        onClick={() => setMaterialFilter('test')}
                                    >
                                        Tests
                                    </button>
                                    <button
                                        className={`filter-btn ${materialFilter === 'thcs-test' ? 'active' : ''}`}
                                        onClick={() => setMaterialFilter('thcs-test')}
                                        style={materialFilter === 'thcs-test' ? { background: '#7c3aed', color: 'white' } : {}}
                                    >
                                        THCS-THPT
                                    </button>
                                </div>
                            </div>

                            <div className="material-list">
                                {loading ? (
                                    <div className="loading-state">Loading materials...</div>
                                ) : filteredMaterials.length === 0 ? (
                                    <div className="empty-state">No materials found</div>
                                ) : (
                                    filteredMaterials.map((material) => (
                                        <div
                                            key={material.id}
                                            className={`material-card ${selectedMaterial?.id === material.id ? 'selected' : ''}`}
                                            onClick={() => setSelectedMaterial(material)}
                                        >
                                            <div className="material-info">
                                                <h4 className="material-title">{material.title}</h4>
                                                <div className="material-meta">
                                                    <span className="badge">{material.type === 'thcs-test' ? 'THCS-THPT' : material.type}</span>
                                                    {material.isPublicLibrary && (
                                                        <span className="badge" style={{ background: '#ede9fe', color: '#6d28d9' }}>
                                                            Public Library
                                                        </span>
                                                    )}
                                                    {material.type !== 'thcs-test' && (
                                                        <span className="badge">{material.skill}</span>
                                                    )}
                                                    {material.type === 'thcs-test' && material.gradeLevel && (
                                                        <span className="badge" style={{ background: '#f3e8ff', color: '#7c3aed' }}>Grade {material.gradeLevel}</span>
                                                    )}
                                                    {material.questionCount && (
                                                        <span className="meta-text">{material.questionCount} questions</span>
                                                    )}
                                                </div>
                                            </div>
                                            {selectedMaterial?.id === material.id && (
                                                <div className="selected-icon">✓</div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Target Selection */}
                    {currentStep === 'target' && (
                        <div className="step-content">
                            <h3 className="step-title">🎯 Select Target</h3>

                            <div className="target-type-selector">
                                <button
                                    className={`target-type-btn ${targetType === 'class' ? 'active' : ''}`}
                                    onClick={() => setTargetType('class')}
                                >
                                    📚 Assign to Class
                                </button>
                                <button
                                    className={`target-type-btn ${targetType === 'students' ? 'active' : ''}`}
                                    onClick={() => setTargetType('students')}
                                >
                                    👥 Assign to Students
                                </button>
                            </div>

                            {targetType === 'class' && (
                                <div className="class-list">
                                    {classes.length === 0 ? (
                                        <div className="empty-state">No classes found</div>
                                    ) : (
                                        classes.map((cls) => (
                                            <div
                                                key={cls.id}
                                                className={`class-card ${selectedClass?.id === cls.id ? 'selected' : ''}`}
                                                onClick={() => setSelectedClass(cls)}
                                            >
                                                <div className="class-info">
                                                    <h4 className="class-name">{cls.name}</h4>
                                                    <p className="class-meta">{cls.studentCount} students</p>
                                                </div>
                                                {selectedClass?.id === cls.id && (
                                                    <div className="selected-icon">✓</div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {targetType === 'students' && (
                                <div className="students-selection">
                                    <button
                                        className="select-students-btn"
                                        onClick={() => setShowStudentSelector(true)}
                                    >
                                        👥 Select Students ({selectedStudents.length} selected)
                                    </button>
                                    {selectedStudents.length > 0 && (
                                        <div className="selected-count">
                                            {selectedStudents.length} student{selectedStudents.length !== 1 ? 's' : ''} selected
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3: Configuration */}
                    {currentStep === 'config' && (
                        <div className="step-content">
                            <h3 className="step-title">⚙️ Configure Settings</h3>

                            {/* ── Scheduling (all materials) ─────────────── */}
                            <div className="additional-fields">
                                <div className="field-group">
                                    <label className="field-label">📅 Available From</label>
                                    <input
                                        aria-label="Available From"
                                        type="datetime-local"
                                        className="config-input"
                                        value={availableFrom}
                                        onChange={(e) => setAvailableFrom(e.target.value)}
                                    />
                                    <p className="config-hint">Leave empty to make available immediately</p>
                                </div>
                                <div className="field-group">
                                    <label className="field-label">⏰ Due Date *</label>
                                    <input
                                        aria-label="Due Date"
                                        type="datetime-local"
                                        className="config-input"
                                        value={dueDate}
                                        onChange={(e) => setDueDate(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            {/* ── Writing-specific config ────────────────── */}
                            {selectedMaterial?.skill === 'writing' && (
                                <div className="writing-config-section">
                                    <div className="writing-config-header">
                                        <span>✍️ Writing-Specific Settings</span>
                                    </div>

                                    {/* Late Policy Radios */}
                                    <div className="config-section">
                                        <label className="config-label">
                                            <span className="label-text">📋 Late Submission Policy</span>
                                        </label>
                                        <div className="radio-group">
                                            <label className="radio-option">
                                                <input
                                                    type="radio"
                                                    name="latePolicy"
                                                    checked={config.lateSubmissionAllowed}
                                                    onChange={() => setConfig({ ...config, lateSubmissionAllowed: true })}
                                                />
                                                <span className="radio-label">Allow late — mark as late</span>
                                                <span className="radio-hint">Students can still submit after the deadline, but it will be flagged</span>
                                            </label>
                                            <label className="radio-option">
                                                <input
                                                    type="radio"
                                                    name="latePolicy"
                                                    checked={!config.lateSubmissionAllowed}
                                                    onChange={() => setConfig({ ...config, lateSubmissionAllowed: false })}
                                                />
                                                <span className="radio-label">Hard deadline — block submissions</span>
                                                <span className="radio-hint">No submissions accepted after the due date</span>
                                            </label>
                                        </div>
                                    </div>

                                    {/* Word Minimum Toggle */}
                                    <div className="config-section">
                                        <label className="config-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={wordMinEnforced}
                                                onChange={(e) => setWordMinEnforced(e.target.checked)}
                                            />
                                            <span className="checkbox-label">📝 Enforce word minimum</span>
                                        </label>
                                        <p className="config-hint">
                                            {wordMinEnforced
                                                ? 'Students must meet Task 1 (150) / Task 2 (250) word minimums to submit'
                                                : 'Students can submit regardless of word count (warning shown)'}
                                        </p>
                                    </div>

                                    {/* Re-attempt Config */}
                                    <div className="config-section">
                                        <label className="config-label">
                                            <span className="label-text">🔄 Re-attempts</span>
                                        </label>
                                        <select
                                            className="config-select"
                                            value={config.maxAttempts ?? ''}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setConfig({ ...config, maxAttempts: v === '' ? null : parseInt(v, 10) });
                                            }}
                                        >
                                            <option value="1">1 attempt only</option>
                                            <option value="2">2 attempts</option>
                                            <option value="3">3 attempts</option>
                                            <option value="">Unlimited</option>
                                        </select>
                                        <p className="config-hint">
                                            Re-attempts pre-load the student's previous essay for revision
                                        </p>
                                    </div>

                                    {/* Timer (Writing) */}
                                    <div className="config-section">
                                        <label className="config-label">
                                            <span className="label-text">⏱️ Time Limit (minutes)</span>
                                        </label>
                                        <input
                                            type="number"
                                            className="config-input"
                                            value={config.timerMinutes ?? ''}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setConfig({ ...config, timerMinutes: v === '' ? null : parseInt(v, 10) });
                                            }}
                                            placeholder="No time limit (recommended: 60)"
                                            min="1"
                                        />
                                        <p className="config-hint">Recommended: 60 minutes for full-test, 20-40 for single task</p>
                                    </div>
                                </div>
                            )}

                            {/* ── Standard config (non-Writing) ─────────── */}
                            {selectedMaterial?.skill !== 'writing' && (
                                <HomeworkConfigPanel
                                    config={config}
                                    onChange={setConfig}
                                    materialDefaults={selectedMaterial?.soloConfig}
                                    onSaveAsTemplate={handleSaveAsTemplate}
                                />
                            )}

                            <div className="additional-fields">
                                <div className="field-group">
                                    <label className="field-label">📝 Instructions (Optional)</label>
                                    <textarea
                                        className="instructions-textarea"
                                        placeholder="Add instructions for students..."
                                        value={instructions}
                                        onChange={(e) => setInstructions(e.target.value)}
                                        rows={4}
                                    />
                                </div>

                                <div className="field-group">
                                    <label className="field-label">🏷️ Tags (optional)</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {availableTags.map((tag) => {
                                            const isSelected = selectedTags.includes(tag.id);
                                            return (
                                                <button
                                                    key={tag.id}
                                                    type="button"
                                                    aria-label={`Toggle tag ${tag.label}`}
                                                    onClick={() => toggleTagSelection(tag.id)}
                                                    style={{
                                                        borderRadius: '999px',
                                                        padding: '0.45rem 0.85rem',
                                                        border: `1px solid ${isSelected ? (tag.color ?? '#6366f1') : `${tag.color ?? '#cbd5e1'}44`}`,
                                                        background: isSelected ? (tag.color ?? '#6366f1') : `${tag.color ?? '#6366f1'}14`,
                                                        color: isSelected ? '#ffffff' : (tag.color ?? '#475569'),
                                                        fontSize: '0.8rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {tag.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* PRD-0036: Anti-Cheat Config Section */}
                                <AntiCheatConfigSection
                                    config={antiCheatConfig}
                                    onChange={setAntiCheatConfig}
                                />

                                {/* Save as Template (all materials) */}
                                {selectedMaterial?.skill !== 'writing' && (
                                    <button
                                        type="button"
                                        className="save-template-btn"
                                        onClick={handleSaveAsTemplate}
                                        style={{ marginTop: '0.5rem' }}
                                    >
                                        💾 Save as Template
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 4: Review */}
                    {currentStep === 'review' && (
                        <div className="step-content">
                            <h3 className="step-title">👀 Review Assignment</h3>

                            <div className="review-section">
                                <div className="review-item">
                                    <span className="review-label">Material:</span>
                                    <span className="review-value">{selectedMaterial?.title}</span>
                                </div>

                                <div className="review-item">
                                    <span className="review-label">Target:</span>
                                    <span className="review-value">
                                        {targetType === 'class' && selectedClass
                                            ? `Class: ${selectedClass.name}`
                                            : `${selectedStudents.length} student(s)`}
                                    </span>
                                </div>

                                <div className="review-item">
                                    <span className="review-label">Available From:</span>
                                    <span className="review-value">
                                        {availableFrom
                                            ? new Date(availableFrom).toLocaleString()
                                            : 'Immediately'}
                                    </span>
                                </div>

                                <div className="review-item">
                                    <span className="review-label">Due Date:</span>
                                    <span className="review-value">
                                        {new Date(dueDate).toLocaleString()}
                                    </span>
                                </div>

                                <div className="review-item">
                                    <span className="review-label">Time Limit:</span>
                                    <span className="review-value">
                                        {config.timerMinutes ? `${config.timerMinutes} minutes` : 'No limit'}
                                    </span>
                                </div>

                                <div className="review-item">
                                    <span className="review-label">Max Attempts:</span>
                                    <span className="review-value">
                                        {config.maxAttempts || 'Unlimited'}
                                    </span>
                                </div>

                                <div className="review-item">
                                    <span className="review-label">Feedback:</span>
                                    <span className="review-value">
                                        {config.feedbackTiming === 'after_completion' && 'After completion'}
                                        {config.feedbackTiming === 'after_deadline' && 'After deadline'}
                                        {config.feedbackTiming === 'never' && 'Score only'}
                                    </span>
                                </div>

                                {selectedTags.length > 0 ? (
                                    <div className="review-item full-width">
                                        <span className="review-label">Tags:</span>
                                        <div style={{ marginTop: '0.35rem' }}>
                                            <HomeworkTagChips tags={selectedTags} allTags={availableTags} />
                                        </div>
                                    </div>
                                ) : null}

                                {instructions && (
                                    <div className="review-item full-width">
                                        <span className="review-label">Instructions:</span>
                                        <p className="review-instructions">{instructions}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="modal-footer">
                    <button
                        className="cancel-btn"
                        onClick={handleClose}
                        disabled={submitting}
                    >
                        Cancel
                    </button>

                    <div className="footer-actions">
                        {currentStep !== 'material' && (
                            <button
                                className="back-btn"
                                onClick={handleBack}
                                disabled={submitting}
                            >
                                ← Back
                            </button>
                        )}

                        {currentStep !== 'review' ? (
                            <button
                                className="next-btn"
                                onClick={handleNext}
                                disabled={
                                    (currentStep === 'material' && !selectedMaterial) ||
                                    (currentStep === 'target' && !isTargetValid()) ||
                                    (currentStep === 'config' && !isConfigValid())
                                }
                            >
                                Next →
                            </button>
                        ) : (
                            <button
                                className="submit-btn"
                                onClick={handleSubmit}
                                disabled={submitting}
                            >
                                {submitting ? 'Creating...' : '✓ Create Homework'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Student Selector Modal */}
            {showStudentSelector && (
                <StudentGroupSelector
                    teacherId={user!.uid}
                    availableStudents={students}
                    selectedStudentIds={selectedStudents}
                    onSelectionChange={setSelectedStudents}
                    onClose={() => setShowStudentSelector(false)}
                />
            )}

            {/* Phase 3: THCS Homework Assign Dialog */}
            {showThcsDialog && thcsDialogTest && (
                <THCSHomeworkAssignDialog
                    isOpen={showThcsDialog}
                    onClose={() => {
                        setShowThcsDialog(false);
                        setThcsDialogTest(null);
                    }}
                    testId={thcsDialogTest.id}
                    testTitle={thcsDialogTest.title}
                    testMetadata={{
                        duration: thcsDialogTest.duration,
                        gradeLevel: thcsDialogTest.gradeLevel,
                    }}
                    onSuccess={() => {
                        setShowThcsDialog(false);
                        setThcsDialogTest(null);
                        onSuccess();
                        handleClose();
                    }}
                />
            )}

            <TemplateSaveModal
                isOpen={showTemplateSaveModal}
                submitting={templateSubmitting}
                error={templateSaveError}
                existingTemplateNames={existingTemplateNames}
                onClose={() => {
                    if (!templateSubmitting) {
                        setShowTemplateSaveModal(false);
                        setTemplateSaveError(null);
                    }
                }}
                onSubmit={handleTemplateSaveSubmit}
            />

            {templateToast ? (
                <ToastNotification
                    title={templateToast.title}
                    message={templateToast.message}
                    tone={templateToast.tone}
                    onClose={() => setTemplateToast(null)}
                />
            ) : null}
        </div>
    );
}
