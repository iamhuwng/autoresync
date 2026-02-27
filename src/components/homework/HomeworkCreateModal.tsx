import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { HomeworkConfigPanel } from './HomeworkConfigPanel';
import { StudentGroupSelector } from './StudentGroupSelector';
import { createHomework } from '../../services/homeworkManager';
import { createTemplate } from '../../services/homeworkTemplateService';
import type { HomeworkConfig, HomeworkTarget } from '../../types/homework.types';
// @ts-ignore - JS service
import queryOptimizer from '../../services/firebaseQueryOptimizer';
import { THCSHomeworkAssignDialog } from '../thcs-editor/THCSHomeworkAssignDialog';
import './HomeworkCreateModal.css';

interface HomeworkCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    preselectedMaterialId?: string;
    preselectedTarget?: HomeworkTarget;
}

type Step = 'material' | 'target' | 'config' | 'review';

interface Material {
    id: string;
    title: string;
    type: 'quiz' | 'test' | 'thcs-test';
    skill: 'reading' | 'listening' | 'writing' | 'speaking';
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

export function HomeworkCreateModal({
    isOpen,
    onClose,
    onSuccess,
    preselectedMaterialId,
    preselectedTarget,
}: HomeworkCreateModalProps) {
    const { user } = useAuth();

    // Step management
    const [currentStep, setCurrentStep] = useState<Step>('material');

    // Material selection
    const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [materialSearch, setMaterialSearch] = useState('');
    const [materialFilter, setMaterialFilter] = useState<'all' | 'quiz' | 'test' | 'thcs-test'>('all');

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

    const [availableFrom, setAvailableFrom] = useState<string>('');
    const [dueDate, setDueDate] = useState<string>('');
    const [instructions, setInstructions] = useState('');

    // UI state
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load materials
    useEffect(() => {
        if (isOpen) {
            loadMaterials();
            loadClasses();
            loadStudents();
        }
    }, [isOpen]);

    // Handle preselected material
    useEffect(() => {
        if (preselectedMaterialId && materials.length > 0) {
            const material = materials.find(m => m.id === preselectedMaterialId);
            if (material) {
                setSelectedMaterial(material);
                setCurrentStep('target');
            }
        }
    }, [preselectedMaterialId, materials]);

    // Handle preselected target
    useEffect(() => {
        if (preselectedTarget) {
            if (preselectedTarget.type === 'class') {
                setTargetType('class');
                setSelectedClass({
                    id: preselectedTarget.classId,
                    name: preselectedTarget.className || 'Unknown Class',
                });
            }
        }
    }, [preselectedTarget]);

    const loadMaterials = async () => {
        setLoading(true);
        try {
            const [tests, quizzes] = await Promise.all([
                queryOptimizer.getAllTests(),
                queryOptimizer.getAllQuizzes(),
            ]);

            const myMaterials = [...tests, ...quizzes]
                .filter((m: any) => m.ownerId === user?.uid || m.createdBy === user?.uid)
                .filter((m: any) => m.solo_enabled !== false) // Only show materials enabled for solo
                .map((m: any) => ({
                    id: m.id,
                    title: m.title,
                    type: m.testType === 'THCS-THPT' ? 'thcs-test' as const : (m.type || 'test'),
                    skill: m.skill || 'reading',
                    questionCount: m.testType === 'THCS-THPT'
                        ? (m.sections || []).reduce((sum: number, s: any) => sum + (s.questions?.length || 0), 0)
                        : (m.questions?.length || 0),
                    duration: m.testType === 'THCS-THPT' ? m.metadata?.duration : m.duration,
                    soloConfig: m.soloConfig,
                    testType: m.testType,
                    gradeLevel: m.metadata?.gradeLevel,
                }));

            setMaterials(myMaterials);
        } catch (err) {
            console.error('Error loading materials:', err);
            setError('Failed to load materials');
        } finally {
            setLoading(false);
        }
    };

    const loadClasses = async () => {
        try {
            // TODO: Replace with actual class loading service
            const classData = await queryOptimizer.getClassesByTeacher(user?.uid);
            setClasses(classData.map((c: any) => ({
                id: c.id,
                name: c.name,
                studentCount: c.studentIds?.length || 0,
            })));
        } catch (err) {
            console.error('Error loading classes:', err);
        }
    };

    const loadStudents = async () => {
        try {
            // TODO: Replace with actual student loading service
            const studentData = await queryOptimizer.getAssignedStudents(user?.uid);
            setStudents(studentData.map((s: any) => ({
                id: s.id,
                name: s.name || s.displayName,
                email: s.email,
            })));
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
                };

            await createHomework({
                materialId: selectedMaterial.id,
                materialTitle: selectedMaterial.title,
                teacherId: user!.uid,
                target,
                config,
                availableFrom: availableFrom ? new Date(availableFrom) : new Date(),
                dueDate: new Date(dueDate),
                instructions,
            });

            onSuccess();
            handleClose();
        } catch (err) {
            console.error('Error creating homework:', err);
            setError('Failed to create homework. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSaveAsTemplate = async () => {
        const templateName = prompt('Enter a name for this template:');
        if (!templateName) return;

        try {
            await createTemplate(user!.uid, templateName, config);
            alert('Template saved successfully!');
        } catch (err) {
            console.error('Error saving template:', err);
            alert('Failed to save template');
        }
    };

    const handleClose = () => {
        setCurrentStep('material');
        setSelectedMaterial(null);
        setSelectedClass(null);
        setSelectedStudents([]);
        setConfig({
            timerMinutes: null,
            maxAttempts: null,
            feedbackTiming: 'after_completion',
            lateSubmissionAllowed: false,
        });
        setAvailableFrom('');
        setDueDate('');
        setInstructions('');
        setError(null);
        onClose();
    };

    if (!isOpen) return null;

    const filteredMaterials = materials.filter(m => {
        const matchesSearch = m.title.toLowerCase().includes(materialSearch.toLowerCase());
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

                            <HomeworkConfigPanel
                                config={config}
                                onChange={setConfig}
                                materialDefaults={selectedMaterial?.soloConfig}
                                onSaveAsTemplate={handleSaveAsTemplate}
                            />

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
        </div>
    );
}
