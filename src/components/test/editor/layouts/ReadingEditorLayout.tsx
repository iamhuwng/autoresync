import React from 'react';
import { EditorLayoutProps } from './EditorLayoutTypes';
import { BaseEditorLayout } from './BaseEditorLayout';

export const ReadingEditorLayout: React.FC<EditorLayoutProps> = (props) => {
    return <BaseEditorLayout {...props} skillTheme="reading" />;
};
