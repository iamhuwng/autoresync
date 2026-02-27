$banner = Get-Content 'src/styles/_student-legacy-banner.txt' -Raw
$files = @(
    'src/pages/StudentClassDetailPage.jsx',
    'src/pages/StudentCoursesPage.tsx',
    'src/pages/StudentCourseDetailPage.tsx',
    'src/pages/StudentFeedbackPage.jsx',
    'src/pages/StudentHomeworkDetailPage.tsx',
    'src/pages/StudentHomeworkListPage.tsx',
    'src/pages/StudentLibraryPage.tsx',
    'src/pages/StudentQuizPage.jsx',
    'src/pages/StudentQuizPageNew.jsx',
    'src/pages/StudentResultsPage.jsx',
    'src/pages/StudentResultsHistoryPage.tsx',
    'src/pages/StudentWaitingRoomPage.jsx',
    'src/components/profile/ProfilePage.tsx'
)

foreach ($f in $files) {
    $content = Get-Content $f -Raw
    if ($content -notmatch 'STUDENT VIEW DESIGN STANDARD') {
        $newContent = $banner + "`n" + $content
        Set-Content $f $newContent -NoNewline
        Write-Host "Added banner to $f"
    } else {
        Write-Host "SKIP $f (banner exists)"
    }
}
