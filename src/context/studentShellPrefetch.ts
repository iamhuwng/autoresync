interface PrefetchStudentCoursesRouteDataOptions {
    studentId: string;
    studentClasses?: unknown[];
}

export async function prefetchStudentCoursesRouteData({
    studentId,
    studentClasses = [],
}: PrefetchStudentCoursesRouteDataOptions): Promise<void> {
    if (!studentId) return;

    const module = await import('../pages/StudentCoursesPage.tsx');
    await module.preloadStudentCoursesPageData(studentId, studentClasses);
}

export async function prefetchStudentLibraryRouteData(studentId: string): Promise<void> {
    if (!studentId) return;

    const module = await import('../pages/StudentLibraryPage.tsx');
    await module.preloadStudentLibraryPageData(studentId, { source: 'my_courses' });
}

export async function prefetchStudentAcademicRecordRouteData(studentId: string): Promise<void> {
    if (!studentId) return;

    const module = await import('../pages/AcademicRecordPage.tsx');
    await module.preloadAcademicRecordPageData(studentId);
}
