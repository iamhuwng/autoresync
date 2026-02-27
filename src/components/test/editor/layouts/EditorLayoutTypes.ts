import { ReactNode } from 'react';
import { EditTestFrameProps, EditorTab } from '../EditTestFrame';

export interface EditorLayoutProps extends EditTestFrameProps {
    // Main Panels
    questionList: ReactNode;
    resourceManager: ReactNode;

    // Editor Panels
    questionEditor: ReactNode;
    singleQuestionCreator: ReactNode;
    bulkQuestionCreator: ReactNode;

    // Answer Key
    answerKeySelector: ReactNode; // The buttons (manual/import)
    answerKeyEditor: ReactNode;   // The actual editing panel

    // State flags
    showEditor: boolean;
    showSingleCreator: boolean;
    showBulkCreator: boolean;
}
