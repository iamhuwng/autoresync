/**
 * RichContent Component
 *
 * Renders HTML/markdown content through a single abstraction point.
 * On web: uses dangerouslySetInnerHTML (same behavior as today)
 * On React Native (future): swap to react-native-render-html or WebView
 *
 * This is the ONLY place in the codebase that should use dangerouslySetInnerHTML.
 * All other components should use <RichContent> instead.
 *
 * @see documentation/rules/mobile-portability.md — Rule 20
 */

import React from 'react';

interface RichContentProps {
  /** The content string to render */
  content: string;
  /** Content format: 'html' for raw HTML, 'text' for plain text */
  format?: 'html' | 'text';
  /** Optional CSS class name */
  className?: string;
  /** Optional inline styles */
  style?: React.CSSProperties;
  /** HTML element to render as (default: 'div') */
  as?: keyof React.JSX.IntrinsicElements;
}

export const RichContent: React.FC<RichContentProps> = ({
  content,
  format = 'html',
  className,
  style,
  as: Component = 'div',
}) => {
  if (!content) return null;

  if (format === 'text') {
    return React.createElement(Component, { className, style }, content);
  }

  // Web implementation: dangerouslySetInnerHTML
  // React Native: this would be swapped to react-native-render-html
  return React.createElement(Component, {
    className,
    style,
    dangerouslySetInnerHTML: { __html: content },
  });
};
