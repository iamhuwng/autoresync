---
name: Academic Precision
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3e4947'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#6e7977'
  outline-variant: '#bdc9c6'
  surface-tint: '#006a63'
  primary: '#005c55'
  on-primary: '#ffffff'
  primary-container: '#0f766e'
  on-primary-container: '#a3faef'
  inverse-primary: '#80d5cb'
  secondary: '#545f73'
  on-secondary: '#ffffff'
  secondary-container: '#d5e0f8'
  on-secondary-container: '#586377'
  tertiary: '#4f5254'
  on-tertiary: '#ffffff'
  tertiary-container: '#676a6c'
  on-tertiary-container: '#e9ebed'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9cf2e8'
  primary-fixed-dim: '#80d5cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#00504a'
  secondary-fixed: '#d8e3fb'
  secondary-fixed-dim: '#bcc7de'
  on-secondary-fixed: '#111c2d'
  on-secondary-fixed-variant: '#3c475a'
  tertiary-fixed: '#e0e3e5'
  tertiary-fixed-dim: '#c4c7c9'
  on-tertiary-fixed: '#191c1e'
  on-tertiary-fixed-variant: '#444749'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  h1:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  h3:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  body-ui:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-reading:
    fontFamily: Georgia
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  label-bold:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1'
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.02em
  code:
    fontFamily: monospace
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  container-max: 1280px
  gutter: 24px
---

## Brand & Style

This design system balances the authoritative structure of academic management with the focused fluidity of a modern document editor. The brand personality is scholarly, reliable, and efficient. It avoids excessive ornamentation to minimize cognitive load during high-stakes exam taking and complex content authoring.

The aesthetic follows a **Corporate / Modern** style with a focus on editorial clarity. It utilizes high-quality typography and generous white space to create a "sanctuary for focus," ensuring that students can engage with complex passages and teachers can build assessments without visual distraction. The interface feels like a professional tool—precise, intentional, and robust.

## Colors

The palette is anchored by **Teal (#0F766E)**, used strategically as the primary accent for teacher-facing authoring tools, primary actions, and progress indicators. This color evokes a sense of calm authority and professional growth.

The background uses a tiered system of off-whites and cool greys to define workspace boundaries without the harshness of pure white. Text is rendered in deep slates to maintain high legibility while reducing eye strain during long reading or grading sessions. Accent colors for feedback (success, error) are slightly muted to align with the professional academic tone.

## Typography

The typography system is bifurcated to serve two distinct functions: **Navigation** and **Consumption**.

**Inter** is the workhorse for the UI. It provides a systematic, utilitarian feel for navigation, sidebars, and data-heavy tables. It is used in bold weights for headings to create a clear information hierarchy.

**Georgia** is reserved exclusively for the "Reading Passage" and "Question Prompt" areas. As a transitional serif, it offers superior legibility for long-form text, creating a mental shift for the student from "using an app" to "reading and analyzing."

## Layout & Spacing

This design system employs a **Fixed Grid** for main content areas to mimic the feel of a physical document or exam paper. The workspace is centered with a maximum width of 1280px, while teacher authoring sidebars utilize a fluid model to maximize the utility of wider displays.

The spacing rhythm is based on a 4px baseline, but defaults to 16px (md) and 24px (lg) for most component gaps to ensure the UI feels airy and un-cramped. Large vertical margins (32px+) are used to separate logical sections of an exam (e.g., separating Multiple Choice from Essay portions).

## Elevation & Depth

Elevation is conveyed through **Tonal Layers** and **Low-contrast Outlines** rather than heavy shadows.

1.  **Level 0 (Canvas):** The base background, typically a very light grey (#F8FAFC).
2.  **Level 1 (Card/Sheet):** Pure white surfaces with a 1px border (#E2E8F0). This is where the primary interaction occurs (the "paper" of the exam).
3.  **Level 2 (Popovers/Modals):** These use a soft, ambient shadow (0px 10px 15px -3px rgba(0,0,0,0.05)) to suggest they are floating above the workspace.

This flat, layered approach ensures that the interface remains "quiet" and doesn't compete with the academic content for the user's attention.

## Shapes

The shape language is strictly **Soft Rectangular**. Standard components like input fields, buttons, and small cards use a 6px radius. Larger containers, such as the main exam workspace or grading panels, use a 12px radius.

This modest softness provides a modern, approachable feel while maintaining the structural discipline expected in an academic environment. Completely circular elements are avoided, except for user avatars and specific radio-button indicators.

## Components

-   **Buttons:** Primary buttons use the Teal accent with white text and a 6px radius. Secondary buttons use a slate outline.
-   **Input Fields:** Ghost-style inputs with 1px borders that thicken and turn Teal on focus. Labels are consistently placed above the input in `label-bold` Inter.
-   **Cards:** Used for exam modules and student records. They feature a white background, 1px border, and no shadow to maintain the "document" feel.
-   **Authoring Canvas:** A specialized component for teachers that mimics a word processor. It features a sticky toolbar at the top and drag-and-drop handles for reordering question blocks.
-   **Question Chips:** Used for quick navigation during exams. They change from "Outline" (unanswered) to "Solid Teal" (answered) to provide immediate progress feedback.
-   **Reading Panels:** Wide-margin containers specifically for Georgia text, ensuring a maximum of 75 characters per line for optimal reading speed.
-   **Checkboxes/Radios:** Square for multiple-choice (checkbox) and round for single-choice (radio), using Teal for the selected state to signify "active participation."
