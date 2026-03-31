interface PrefetchStudentCoursesRouteDataOptions {
    studentId: string;
    studentClasses?: unknown[];
}

let studentCoursesModulePromise: Promise<typeof import('../pages/StudentCoursesPage.tsx')> | null = null;
let studentLibraryModulePromise: Promise<typeof import('../pages/StudentLibraryPage.tsx')> | null = null;
let studentAcademicRecordModulePromise: Promise<typeof import('../pages/AcademicRecordPage.tsx')> | null = null;

function loadStudentCoursesModule() {
    if (!studentCoursesModulePromise) {
        studentCoursesModulePromise = import('../pages/StudentCoursesPage.tsx');
    }

    return studentCoursesModulePromise;
}

function loadStudentLibraryModule() {
    if (!studentLibraryModulePromise) {
        studentLibraryModulePromise = import('../pages/StudentLibraryPage.tsx');
    }

    return studentLibraryModulePromise;
}

function loadStudentAcademicRecordModule() {
    if (!studentAcademicRecordModulePromise) {
        studentAcademicRecordModulePromise = import('../pages/AcademicRecordPage.tsx');
    }

    return studentAcademicRecordModulePromise;
}

export async function preloadStudentCoursesRouteModule(): Promise<void> {
    await loadStudentCoursesModule();
}

export async function preloadStudentLibraryRouteModule(): Promise<void> {
    await loadStudentLibraryModule();
}

export async function preloadStudentAcademicRecordRouteModule(): Promise<void> {
    await loadStudentAcademicRecordModule();
}

export async function prefetchStudentCoursesRouteData({
    studentId,
    studentClasses = [],
}: PrefetchStudentCoursesRouteDataOptions): Promise<void> {
    if (!studentId) return;

    const module = await loadStudentCoursesModule();
    await module.preloadStudentCoursesPageData(studentId, studentClasses);
}

export async function prefetchStudentLibraryRouteData(studentId: string): Promise<void> {
    if (!studentId) return;

    const module = await loadStudentLibraryModule();
    await module.preloadStudentLibraryPageData(studentId, { source: 'my_courses' });
}

export async function prefetchStudentAcademicRecordRouteData(studentId: string): Promise<void> {
    if (!studentId) return;

    const module = await loadStudentAcademicRecordModule();
    await module.preloadAcademicRecordPageData(studentId);
}
