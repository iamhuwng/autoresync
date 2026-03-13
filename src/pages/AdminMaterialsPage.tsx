/**
 * AdminMaterialsPage
 * 
 * Super admin page for managing all materials (tests, quizzes) in the system.
 * Provides full CRUD functionality including delete, edit, and toggle public/private.
 * 
 * Route: /admin/materials
 * Allowed Roles: super_admin only
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { AdminLayout } from '../components/navigation';
import { Card, Button } from '../components/modern';
import {
    Modal, Text, Group, Badge, Stack, Loader, TextInput, Tabs, Menu, ActionIcon,
    Tooltip, Select
} from '@mantine/core';
import {
    IconSearch, IconPlus, IconEdit, IconTrash, IconPlayerPlay,
    IconDotsVertical, IconRefresh, IconFileText, IconQuestionMark,
    IconWorld, IconLock, IconAlertTriangle, IconCopy, IconNotes, IconFilter
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { ref, set, update } from 'firebase/database';

// @ts-ignore - JS module without type declarations
import firebaseQueryOptimizer, { CacheTypes } from '../services/firebaseQueryOptimizer';
// @ts-ignore - JS module without type declarations  
import { createSession } from '../services/sessionManager';
import { getClasses } from '../services/classManager';
// @ts-ignore - firebase.js doesn't have type declarations
import { database } from '../services/firebase';
import { deleteTestFromFirebase, updateTestInFirebase } from '../services/testStorage';

// Editor modals for editing tests/quizzes
import TestEditor from '../components/TestEditor';
// @ts-ignore - JS module without type declarations
import QuizEditor from '../components/QuizEditor';
// Test Creation Modal for new test flow
import TestCreationModal from '../components/test-creation/TestCreationModal';
import { testDraftService } from '../services/draftCloudService';
// Draft Management Components
import { DraftsListView } from '../components/drafts';

interface Material {
    id: string;
    title: string;
    description?: string;
    type: 'quiz' | 'test';
    testType?: string;
    questionCount?: number;
    isPublic?: boolean;
    createdBy?: string;
    ownerId?: string;
    createdAt?: any;
    updatedAt?: any;
    metadata?: { title?: string; gradeLevel?: string; [key: string]: any };
}

interface ClassOption {
    id: string;
    name: string;
    classCode: string;
}

const AdminMaterialsPage: React.FC = () => {
    const { profile, logout, user } = useAuth();
    const { navigateTo } = useNavigation('admin');

    // State
    const [quizzes, setQuizzes] = useState<Material[]>([]);
    const [tests, setTests] = useState<Material[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<string | null>('all');
    const [visibilityFilter, setVisibilityFilter] = useState<string | null>('all');
    const [classes, setClasses] = useState<ClassOption[]>([]);

    // Session start modal state
    const [sessionModal, setSessionModal] = useState<{
        open: boolean;
        material: Material | null;
        mode: 'quiz' | 'test' | null;
    }>({ open: false, material: null, mode: null });
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [startingSession, setStartingSession] = useState(false);

    // Delete confirmation modal state
    const [deleteModal, setDeleteModal] = useState<{
        open: boolean;
        material: Material | null;
    }>({ open: false, material: null });
    const [deleting, setDeleting] = useState(false);

    // Toggle public action state
    const [togglingPublic, setTogglingPublic] = useState<string | null>(null);

    // Edit modal states
    const [showEditTestModal, setShowEditTestModal] = useState(false);
    const [selectedTest, setSelectedTest] = useState<any>(null);
    const [showEditQuizModal, setShowEditQuizModal] = useState(false);
    const [selectedQuiz, setSelectedQuiz] = useState<any>(null);

    // Test Creation Modal state
    const [showTestCreationModal, setShowTestCreationModal] = useState(false);
    const [draftCount, setDraftCount] = useState(0);
    const [showDraftsView, setShowDraftsView] = useState(false);

    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const isSuperAdmin = profile?.role === 'super_admin';

    // Load data
    useEffect(() => {
        if (isSuperAdmin) {
            loadData();
            loadDraftCount();
        }
    }, [isSuperAdmin]);

    // Handle openCreateModal query param (for redirect from /teacher/test/create)
    useEffect(() => {
        if (searchParams.get('openCreateModal') === 'true') {
            setShowTestCreationModal(true);
            // Clear the query param after opening
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    const loadDraftCount = useCallback(async () => {
        if (!profile?.uid) return;
        try {
            const response = await testDraftService.getUserDrafts(profile.uid);
            if (response.success && response.data) {
                setDraftCount(response.data.length);
            }
        } catch (error) {
            console.error('[AdminMaterials] Error loading draft count:', error);
        }
    }, [profile?.uid]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            // Always skip cache to ensure fresh data on load/refresh
            const [quizzesData, testsData, classesData] = await Promise.all([
                firebaseQueryOptimizer.getAllQuizzes(true).catch(() => []),
                firebaseQueryOptimizer.getAllTests(true).catch(() => []),
                getClasses().catch(() => [])
            ]);

            setQuizzes(quizzesData.map((q: any) => ({
                ...q,
                type: 'quiz' as const,
                questionCount: q.questions?.length || 0
            })));

            setTests(testsData.map((t: any) => ({
                ...t,
                type: 'test' as const,
                // Resolve THCS title from metadata.title
                title: (t.testType === 'THCS-THPT' ? (t.metadata?.title || t.title) : t.title) || 'Untitled',
                questionCount: t.questions?.length || 0
            })));

            setClasses(classesData.map((c: any) => ({
                id: c.id,
                name: c.name,
                classCode: c.classCode
            })));
        } catch (error) {
            console.error('[AdminMaterials] Error loading data:', error);
            notifications.show({ title: 'Error', message: 'Failed to load materials', color: 'red' });
        } finally {
            setLoading(false);
        }
    }, []);

    const handleLogout = async () => {
        await logout();
        sessionStorage.removeItem('isAdmin');
        navigateTo('LOGIN', {}, { reason: 'admin_logout', replace: true });
    };

    const handleSidebarNavigate = (page: string) => {
        const pageRoutes: Record<string, string> = {
            dashboard: 'ADMIN_DASHBOARD',
            materials: 'ADMIN_MATERIALS',
            users: 'ADMIN_USERS',
            courses: 'ADMIN_COURSES',
            classes: 'ADMIN_CLASSES',
            sessions: 'ADMIN_SESSIONS',
            settings: 'ADMIN_SETTINGS',
            backup: 'ADMIN_BACKUP',
        };

        const route = pageRoutes[page];
        if (route) {
            navigateTo(route as any, {}, { reason: `admin_nav_${page}` });
        }
    };

    const handleStartSession = (material: Material, mode: 'quiz' | 'test') => {
        setSessionModal({ open: true, material, mode });
        setSelectedClassId('');
    };

    const confirmStartSession = async () => {
        if (!sessionModal.material || !sessionModal.mode) return;

        setStartingSession(true);
        try {
            const result = await createSession(
                sessionModal.material.id,
                sessionModal.mode,
                selectedClassId || undefined
            );

            if (result.success && result.sessionCode) {
                notifications.show({
                    title: 'Session Started',
                    message: `Session code: ${result.sessionCode}`,
                    color: 'green'
                });

                // Navigate to appropriate waiting room
                if (sessionModal.mode === 'quiz') {
                    navigateTo('TEACHER_WAITING' as any, { gameSessionId: result.sessionCode });
                } else {
                    navigateTo('TEACHER_TEST_MONITOR', { sessionCode: result.sessionCode });
                }
            } else {
                throw new Error(result.error || 'Failed to create session');
            }
        } catch (error: any) {
            console.error('[AdminMaterials] Error starting session:', error);
            notifications.show({
                title: 'Error',
                message: error.message || 'Failed to start session',
                color: 'red'
            });
        } finally {
            setStartingSession(false);
            setSessionModal({ open: false, material: null, mode: null });
        }
    };

    const handleCreateNew = () => {
        setShowTestCreationModal(true);
    };

    const handleTestCreationComplete = (draftId: string) => {
        setShowTestCreationModal(false);
        // Navigate to the review page with the draft ID
        navigate(`/teacher/test/review/${draftId}`);
    };

    const handleTestCreationClose = () => {
        setShowTestCreationModal(false);
        // Refresh draft count in case a draft was saved
        loadDraftCount();
    };

    const handleToggleDraftsView = () => {
        setShowDraftsView(!showDraftsView);
        // Refresh draft count when toggling to drafts view
        if (!showDraftsView) {
            loadDraftCount();
        }
    };

    const handleEdit = (material: Material) => {
        // Open the appropriate editor modal based on material type
        if (material.type === 'test') {
            // Find the full test data from tests array
            const fullTest = tests.find(t => t.id === material.id);
            if (fullTest) {
                setSelectedTest(fullTest);
                setShowEditTestModal(true);
            }
        } else {
            // Find the full quiz data from quizzes array
            const fullQuiz = quizzes.find(q => q.id === material.id);
            if (fullQuiz) {
                setSelectedQuiz(fullQuiz);
                setShowEditQuizModal(true);
            }
        }
    };

    const handleCloseEditTestModal = () => {
        setShowEditTestModal(false);
        setSelectedTest(null);
        // Refresh data to get updated test
        loadData();
    };

    const handleCloseEditQuizModal = () => {
        setShowEditQuizModal(false);
        setSelectedQuiz(null);
        // Refresh data to get updated quiz
        loadData();
    };

    const handleDeleteClick = (material: Material) => {
        setDeleteModal({ open: true, material });
    };

    const confirmDelete = async () => {
        if (!deleteModal.material) return;

        setDeleting(true);
        try {
            const material = deleteModal.material;

            const cacheType = material.type === 'test' ? CacheTypes.TEST : CacheTypes.QUIZ;

            if (material.type === 'test') {
                // Delete test using testStorage service
                const result = await deleteTestFromFirebase(material.id);
                if (!result.success) {
                    throw new Error(result.error || 'Failed to delete test');
                }
            } else {
                // Delete quiz directly from Firebase
                const quizRef = ref(database, `quizzes/${material.id}`);
                await set(quizRef, null);
            }

            notifications.show({
                title: 'Material Deleted',
                message: `"${material.title}" has been permanently deleted`,
                color: 'green'
            });

            // Invalidate cache
            firebaseQueryOptimizer.invalidateAll(cacheType);

            // Refresh the list
            await loadData();

        } catch (error: any) {
            console.error('[AdminMaterials] Error deleting material:', error);
            notifications.show({
                title: 'Delete Failed',
                message: error.message || 'Failed to delete material',
                color: 'red'
            });
        } finally {
            setDeleting(false);
            setDeleteModal({ open: false, material: null });
        }
    };

    const handleTogglePublic = async (material: Material) => {
        setTogglingPublic(material.id);
        try {
            const newIsPublic = !material.isPublic;
            const cacheType = material.type === 'test' ? CacheTypes.TEST : CacheTypes.QUIZ;

            if (material.type === 'test') {
                // Update test using testStorage service
                const result = await updateTestInFirebase(material.id, { isPublic: newIsPublic } as any);
                if (!result.success) {
                    throw new Error(result.error || 'Failed to update test');
                }
            } else {
                // Update quiz directly in Firebase
                const quizRef = ref(database, `quizzes/${material.id}`);
                await update(quizRef, {
                    isPublic: newIsPublic,
                    updatedAt: Date.now()
                });
            }

            notifications.show({
                title: newIsPublic ? 'Made Public' : 'Made Private',
                message: `"${material.title}" is now ${newIsPublic ? 'visible to all teachers' : 'private'}`,
                color: newIsPublic ? 'green' : 'blue'
            });

            // Invalidate cache
            firebaseQueryOptimizer.invalidateAll(cacheType);

            // Refresh the list
            await loadData();

        } catch (error: any) {
            console.error('[AdminMaterials] Error toggling public:', error);
            notifications.show({
                title: 'Update Failed',
                message: error.message || 'Failed to update visibility',
                color: 'red'
            });
        } finally {
            setTogglingPublic(null);
        }
    };

    // ── Visibility filter helper (Task 6.6 / 6.7) ──────────────────────
    const applyVisibilityFilter = useCallback((items: Material[]) => {
        if (visibilityFilter === 'public') {
            return items.filter(m => m.isPublic === true);
        }
        if (visibilityFilter === 'my-content') {
            const uid = user?.uid || profile?.uid;
            return items.filter(m => m.ownerId === uid || m.createdBy === uid);
        }
        return items; // 'all'
    }, [visibilityFilter, user?.uid, profile?.uid]);

    // Filter materials (search + visibility)
    const filteredQuizzes = applyVisibilityFilter(
        quizzes.filter(q => (q.title || '').toLowerCase().includes(searchTerm.toLowerCase()))
    );
    const filteredTests = applyVisibilityFilter(
        tests.filter(t => (t.title || '').toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const allMaterials = [...filteredQuizzes, ...filteredTests].sort((a, b) => {
        const dateA = a.updatedAt?.toDate?.() || a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.updatedAt?.toDate?.() || b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
    });

    const displayMaterials = activeTab === 'quizzes' ? filteredQuizzes :
        activeTab === 'tests' ? filteredTests :
            allMaterials;

    if (!isSuperAdmin) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <h2>Access Denied</h2>
                <p>This page is only accessible to super administrators.</p>
            </div>
        );
    }

    return (
        <AdminLayout
            pageTitle="Materials"
            currentPage="materials"
            onNavigate={handleSidebarNavigate}
            onLogout={handleLogout}
            userRole={profile?.role}
        >
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.5rem',
                    flexWrap: 'wrap',
                    gap: '1rem'
                }}>
                    <div>
                        <h1 style={{
                            fontSize: '1.75rem',
                            fontWeight: '700',
                            color: '#1e293b',
                            marginBottom: '0.25rem'
                        }}>
                            Materials Management
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
                            Create, edit, delete, and manage visibility of quizzes and tests
                        </p>
                    </div>
                    <Group>
                        <Button
                            variant="glass"
                            onClick={loadData}
                            disabled={loading}
                        >
                            <IconRefresh size={16} style={{ marginRight: '0.5rem' }} />
                            Refresh
                        </Button>
                        <Button
                            variant={showDraftsView ? 'primary' : 'glass'}
                            onClick={handleToggleDraftsView}
                            style={{
                                position: 'relative',
                            }}
                        >
                            <IconNotes size={16} style={{ marginRight: '0.5rem' }} />
                            Drafts
                            {draftCount > 0 && (
                                <Badge
                                    size="xs"
                                    variant="filled"
                                    color="red"
                                    style={{
                                        position: 'absolute',
                                        top: '-8px',
                                        right: '-8px',
                                        minWidth: '18px',
                                        height: '18px',
                                        padding: '0 4px',
                                    }}
                                >
                                    {draftCount}
                                </Badge>
                            )}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleCreateNew}
                        >
                            <IconPlus size={16} style={{ marginRight: '0.5rem' }} />
                            Create New Test
                        </Button>
                    </Group>
                </div>

                {/* Search and Filters */}
                <Group mb="md" gap="md">
                    <TextInput
                        placeholder="Search materials..."
                        leftSection={<IconSearch size={16} />}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.currentTarget.value)}
                        style={{ flex: 1, maxWidth: 400 }}
                    />
                    {/* Visibility Filter (Task 6.6) */}
                    <Select
                        data={[
                            { value: 'all', label: '📋 All Materials' },
                            { value: 'public', label: '🌐 Public Library' },
                            { value: 'my-content', label: '👤 My Content' },
                        ]}
                        value={visibilityFilter}
                        onChange={setVisibilityFilter}
                        leftSection={<IconFilter size={16} />}
                        style={{ width: 200 }}
                        allowDeselect={false}
                    />
                    <Group gap="xs">
                        <Badge size="lg" variant="filled" color="blue">
                            {filteredQuizzes.length} Quizzes
                        </Badge>
                        <Badge size="lg" variant="filled" color="teal">
                            {filteredTests.length} Tests
                        </Badge>
                    </Group>
                </Group>

                {/* Tabs */}
                <Tabs value={activeTab} onChange={setActiveTab} mb="lg">
                    <Tabs.List>
                        <Tabs.Tab value="all">All ({allMaterials.length})</Tabs.Tab>
                        <Tabs.Tab value="quizzes">Quizzes ({filteredQuizzes.length})</Tabs.Tab>
                        <Tabs.Tab value="tests">Tests ({filteredTests.length})</Tabs.Tab>
                    </Tabs.List>
                </Tabs>

                {/* Content - Show DraftsListView or Materials based on toggle */}
                {showDraftsView ? (
                    <DraftsListView
                        userId={profile?.uid || ''}
                        onCreateNew={handleCreateNew}
                    />
                ) : loading ? (
                    <Group justify="center" py="xl">
                        <Loader size="lg" />
                    </Group>
                ) : displayMaterials.length === 0 ? (
                    <Card variant="glass" style={{ padding: '3rem', textAlign: 'center' }}>
                        <IconFileText size={48} style={{ color: '#94a3b8', marginBottom: '1rem' }} />
                        <Text size="lg" fw={500} c="dimmed">No materials found</Text>
                        <Text size="sm" c="dimmed" mb="lg">
                            {searchTerm ? 'Try adjusting your search' : 'Create your first material to get started'}
                        </Text>
                        {!searchTerm && (
                            <Button variant="primary" onClick={handleCreateNew}>
                                <IconPlus size={16} style={{ marginRight: '0.5rem' }} />
                                Create Material
                            </Button>
                        )}
                    </Card>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                        gap: '1rem'
                    }}>
                        {displayMaterials.map((material) => (
                            <Card key={material.id} variant="glass" style={{ padding: '1.25rem' }}>
                                <Group justify="space-between" mb="sm">
                                    <Group gap="xs">
                                        <Badge
                                            color={material.type === 'quiz' ? 'blue' : 'teal'}
                                            size="sm"
                                            leftSection={material.type === 'quiz' ?
                                                <IconQuestionMark size={12} /> :
                                                <IconFileText size={12} />
                                            }
                                        >
                                            {material.type === 'quiz' ? 'Quiz' : 'Test'}
                                        </Badge>
                                        {/* Public/Private Toggle */}
                                        <Tooltip label={material.isPublic ? 'Public - Visible to all teachers' : 'Private - Only visible to owner'}>
                                            <ActionIcon
                                                variant="subtle"
                                                color={material.isPublic ? 'green' : 'gray'}
                                                size="sm"
                                                loading={togglingPublic === material.id}
                                                onClick={() => handleTogglePublic(material)}
                                            >
                                                {material.isPublic ? <IconWorld size={14} /> : <IconLock size={14} />}
                                            </ActionIcon>
                                        </Tooltip>
                                    </Group>
                                    <Menu position="bottom-end" shadow="md">
                                        <Menu.Target>
                                            <ActionIcon variant="subtle" color="gray">
                                                <IconDotsVertical size={16} />
                                            </ActionIcon>
                                        </Menu.Target>
                                        <Menu.Dropdown>
                                            <Menu.Item
                                                leftSection={<IconEdit size={14} />}
                                                onClick={() => handleEdit(material)}
                                            >
                                                Edit
                                            </Menu.Item>
                                            <Menu.Item
                                                leftSection={material.isPublic ? <IconLock size={14} /> : <IconWorld size={14} />}
                                                onClick={() => handleTogglePublic(material)}
                                            >
                                                {material.isPublic ? 'Make Private' : 'Make Public'}
                                            </Menu.Item>
                                            <Menu.Divider />
                                            <Menu.Item
                                                color="red"
                                                leftSection={<IconTrash size={14} />}
                                                onClick={() => handleDeleteClick(material)}
                                            >
                                                Delete
                                            </Menu.Item>
                                        </Menu.Dropdown>
                                    </Menu>
                                </Group>

                                <Text fw={600} size="lg" mb="xs" lineClamp={1}>
                                    {material.title || 'Untitled'}
                                </Text>

                                {/* Material ID - Copyable for reference */}
                                <Group gap="xs" mb="xs">
                                    <Text size="xs" c="dimmed" ff="monospace" style={{ fontSize: '0.7rem' }}>
                                        ID: {material.id}
                                    </Text>
                                    <Tooltip label="Copy ID">
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            size="xs"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigator.clipboard.writeText(material.id);
                                                notifications.show({
                                                    title: 'ID Copied',
                                                    message: `"${material.id}" copied to clipboard`,
                                                    color: 'green',
                                                    autoClose: 2000
                                                });
                                            }}
                                        >
                                            <IconCopy size={12} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>

                                {material.description && (
                                    <Text size="sm" c="dimmed" mb="sm" lineClamp={2}>
                                        {material.description}
                                    </Text>
                                )}

                                <Group gap="xs" mb="md">
                                    <Badge variant="light" size="sm">
                                        {material.questionCount || 0} questions
                                    </Badge>
                                    <Badge
                                        variant="light"
                                        color={material.isPublic ? 'green' : 'gray'}
                                        size="sm"
                                        leftSection={material.isPublic ? <IconWorld size={10} /> : <IconLock size={10} />}
                                    >
                                        {material.isPublic ? 'Public' : 'Private'}
                                    </Badge>
                                </Group>

                                <Button
                                    variant="primary"
                                    fullWidth
                                    onClick={() => handleStartSession(material, material.type)}
                                >
                                    <IconPlayerPlay size={16} style={{ marginRight: '0.5rem' }} />
                                    Start Session
                                </Button>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Start Session Modal */}
            <Modal
                opened={sessionModal.open}
                onClose={() => setSessionModal({ open: false, material: null, mode: null })}
                title={`Start ${sessionModal.mode === 'quiz' ? 'Quiz' : 'Test'} Session`}
                centered
            >
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        Starting: <strong>{sessionModal.material?.title}</strong>
                    </Text>

                    {classes.length > 0 && (
                        <>
                            <Text size="sm" fw={500}>Assign to a class (optional):</Text>
                            <select
                                value={selectedClassId}
                                onChange={(e) => setSelectedClassId(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                    fontSize: '0.9rem'
                                }}
                            >
                                <option value="">No class (open session)</option>
                                {classes.map(cls => (
                                    <option key={cls.id} value={cls.id}>
                                        {cls.name} ({cls.classCode})
                                    </option>
                                ))}
                            </select>
                        </>
                    )}

                    <Group justify="flex-end" mt="md">
                        <Button
                            variant="glass"
                            onClick={() => setSessionModal({ open: false, material: null, mode: null })}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={confirmStartSession}
                            loading={startingSession}
                        >
                            Start Session
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                opened={deleteModal.open}
                onClose={() => setDeleteModal({ open: false, material: null })}
                title={
                    <Group gap="xs">
                        <IconAlertTriangle size={20} color="#ef4444" />
                        <Text fw={600}>Delete Material</Text>
                    </Group>
                }
                centered
            >
                <Stack gap="md">
                    <Text size="sm">
                        Are you sure you want to delete <strong>"{deleteModal.material?.title}"</strong>?
                    </Text>
                    <Text size="sm" c="red">
                        This action cannot be undone. All associated data will be permanently removed.
                    </Text>

                    <Group justify="flex-end" mt="md">
                        <Button
                            variant="glass"
                            onClick={() => setDeleteModal({ open: false, material: null })}
                            disabled={deleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={confirmDelete}
                            loading={deleting}
                            style={{ backgroundColor: '#ef4444' }}
                        >
                            <IconTrash size={16} style={{ marginRight: '0.5rem' }} />
                            Delete Permanently
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Test Editor Modal */}
            {selectedTest && (
                <TestEditor
                    show={showEditTestModal}
                    handleClose={handleCloseEditTestModal}
                    test={selectedTest}
                />
            )}

            {/* Quiz Editor Modal */}
            {selectedQuiz && (
                <QuizEditor
                    show={showEditQuizModal}
                    handleClose={handleCloseEditQuizModal}
                    quiz={selectedQuiz}
                />
            )}

            {/* Test Creation Modal */}
            <TestCreationModal
                opened={showTestCreationModal}
                onClose={handleTestCreationClose}
                onComplete={handleTestCreationComplete}
            />
        </AdminLayout>
    );
};

export default AdminMaterialsPage;
