import React from 'react';
import { EditorLayoutProps } from './EditorLayoutTypes';
import { BaseEditorLayout } from './BaseEditorLayout';

export const ListeningEditorLayout: React.FC<EditorLayoutProps> = (props) => {
    return <BaseEditorLayout {...props} skillTheme="listening" />;
};
