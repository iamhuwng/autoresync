import type { WritingSubmission } from '../../types/ielts-writing.types';
import WritingStudentResultSurface from './WritingStudentResultSurface';
import { buildWritingResultSurfaceData } from './writingResultSurface';

interface WritingResultViewProps {
    submission: WritingSubmission;
    canRevealPublishedData?: boolean;
    variant?: 'page' | 'panel';
    forceWidePanelLayout?: boolean;
    releaseNotice?: {
        title: string;
        body: string;
        tone: 'warning' | 'info';
    } | null;
    onMarkupViewChange?: (taskNumber: 1 | 2, mode: 'marked' | 'original') => void;
    onCriteriaToggle?: (expanded: boolean) => void;
}

export default function WritingResultView({
    submission,
    canRevealPublishedData = true,
    variant = 'page',
    forceWidePanelLayout = false,
    releaseNotice = null,
    onMarkupViewChange,
    onCriteriaToggle,
}: WritingResultViewProps) {
    const data = buildWritingResultSurfaceData(submission, {
        viewerMode: 'student',
        canRevealPublishedData,
    });

    return (
        <WritingStudentResultSurface
            data={data}
            variant={variant}
            forceWidePanelLayout={forceWidePanelLayout}
            releaseNotice={releaseNotice}
            onMarkupViewChange={onMarkupViewChange}
            onCriteriaToggle={onCriteriaToggle}
        />
    );
}
