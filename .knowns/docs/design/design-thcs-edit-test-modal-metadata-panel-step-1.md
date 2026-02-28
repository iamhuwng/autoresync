---
title: 'Design: THCS Edit Test Modal — Metadata Panel (Step 1)'
createdAt: '2026-02-28T04:17:11.578Z'
updatedAt: '2026-02-28T04:47:43.473Z'
description: >-
  Final UI/UX design specification for the THCS Edit Test Modal's Context tab
  (metadata editing), aligned with the THCSSetupStep wizard Step 1 design
tags:
  - design
  - thcs
  - modal
  - ui-ux
  - pattern
---
# Design: THCS Edit Test Modal — Metadata Panel (Step 1)

> **Status:** Final (Established Feb 27, 2026)
> **Source files:**
> - `src/components/thcs-editor/THCSTestEditorModal.tsx` (Context tab — `metadataPanel`)
> - `src/components/thcs-editor/THCSSetupStep.tsx` (Reference design — wizard Step 1)
> **Related:** @doc/prd/prd-thcs-phase-1

---

## 1. Architecture

```
TestEditor (IELTS)                    THCSTestEditorModal (THCS)
┌─ Modal                             ┌─ Modal
│   └─ EditTestFrame ← SAME FRAME    │   └─ EditTestFrame ← SAME FRAME
│       ├─ Header (title,dur,save)    │       ├─ Header (title,dur,save)
│       ├─ Tabs (Questions, Context)  │       ├─ Tabs (Questions, Context)
│       └─ Content                    │       └─ Content
│           ├─ Questions tab:         │           ├─ Questions tab:
│           │   380px left + 650px R  │           │   380px section list
│           │                         │           │   + 650px THCSSectionBlock
│           └─ Context tab:           │           └─ Context tab:
│               ResourceManager       │               Metadata (THIS DOC)
```

**Key decisions:**
- Uses `EditTestFrame` (shared with IELTS) for consistent chrome
- Tab `'answerKey'` is hidden via `hiddenTabs: ['answerKey']`
- Settings tab reuses `EditTestFrame`'s built-in settings
- Modal width: `75vw`, `maxWidth: 1200px` (responsive proportion)

## 2. Glass Card Container

The entire metadata form is wrapped in a glass card:

```css
background: rgba(255,255,255,0.55);
backdrop-filter: blur(16px);
-webkit-backdrop-filter: blur(16px);
border-radius: 1.25rem;
border: 1px solid rgba(148,163,184,0.2);
padding: 2rem 2.25rem;
box-shadow: 0 8px 32px rgba(0,0,0,0.06);
display: flex;
flex-direction: column;
gap: 1.125rem;
```

- Read-only mode: `opacity: 0.7`
- Container: `maxWidth: 680px; margin: 0 auto` inside `ScrollArea`

## 3. Core Fields (Always Visible)

### 3.1 Test Title
- **Label:** Bold, `0.9375rem`, `fontWeight: 700`, color `#1e293b`
- **Input:** `<input type="text">` with `maxLength={200}`
- **Placeholder:** `"Đề kiểm tra giữa kì 1 — Tiếng Anh 9"`
- **Border style:** `1.5px solid #cbd5e1`, `borderRadius: 0.5rem`
- **Focus effect:** `borderColor → #8b5cf6` (violet)
- **Padding:** `0.625rem 0.875rem`

### 3.2 Divider
`<div style={{ height: 1, background: '#f1f5f9' }} />`

### 3.3 Grade Level + Exam Type (2-column grid)
```css
display: grid;
grid-template-columns: 1fr 1fr;
gap: 1rem;
```

| Field | Component | Props |
|-------|-----------|-------|
| Grade Level | `<Select>` (Mantine) | `data={gradeData}`, placeholder "Select grade" |
| Exam Type | `<Select>` (Mantine) | `data={examTypeData}`, `searchable`, placeholder "giữa kì" |

Both selects: `border: 1.5px solid #cbd5e1; borderRadius: 0.5rem; fontSize: 0.9375rem; padding: 0.625rem 0.875rem; height: auto`

### 3.4 Duration Pill Buttons
- **Preset pills:** Map `DURATION_PRESETS` → `<button>` with pill style
- **Active pill:** `background: #8b5cf6; color: #fff; border: 2px solid #8b5cf6`
- **Inactive pill:** `background: #fff; color: #475569; border: 1.5px solid #cbd5e1`
- **Pill style:** `borderRadius: 2rem; fontSize: 0.8125rem; fontWeight: 600; minWidth: 44px; padding: 0.375rem 0.875rem`
- **Custom input:** `<input type="number">`, `width: 52px`, centered text, same border style
- **Layout:** `display: flex; gap: 0.5rem; flexWrap: wrap; alignItems: center`

## 4. Advanced Settings Accordion

### 4.1 Accordion Toggle
```html
<button>
  <span style="transform: rotate(0|90deg); transition: 0.2s">▶</span>
  Advanced Settings
</button>
```
- Font: `0.9375rem`, `fontWeight: 700`, color `#334155`
- No border, transparent background
- Arrow rotates 90° when open

### 4.2 Timer Mode (SVG Icon Card Grid)
```css
display: grid;
grid-template-columns: repeat(3, 1fr);
gap: 0.5rem;
```

| Mode | SVG Icon | Description |
|------|----------|-------------|
| **Strict** | Clock with hands + alarm marker (violet `#8b5cf6`) | "Auto-submit at 0:00" |
| **Informational** | Info circle (violet `#8b5cf6`) | "Timer shown, no auto-submit" |
| **None** | Dashed clock + red strikethrough (`#94a3b8` + `#ef4444`) | "No timer displayed" |

**Card style:**
- **Active:** `border: 2px solid #8b5cf6; background: rgba(139,92,246,0.06)`
- **Inactive:** `border: 1px solid rgba(148,163,184,0.2); background: rgba(255,255,255,0.5)`
- Icon: `28×28px` rendered via `dangerouslySetInnerHTML`
- Title: `0.8125rem`, `fontWeight: 700`, active=`#8b5cf6` / inactive=`#1e293b`
- Description: `0.6875rem`, `color: #94a3b8`, `lineHeight: 1.2`
- Padding: `0.875rem 0.5rem`
- `borderRadius: 0.75rem`

### 4.3 Subject Variant + Province (2-column)
```css
display: grid;
grid-template-columns: 1fr 1fr;
gap: 1rem;
```

| Field | Placeholder |
|-------|-------------|
| Subject Variant | "e.g., Global Success" |
| Province | "e.g., Hà Nội" |

Input style: `padding: 0.5rem 0.75rem; border: 1.5px solid #cbd5e1; borderRadius: 0.5rem; fontSize: 0.875rem`

### 4.4 School (full-width)
- Placeholder: `"e.g., THCS Nguyễn Du"`
- Same input style as Province/Subject

### 4.5 Description
- `<Textarea>` (Mantine), `autosize`, `minRows={2}`
- Border: `1.5px solid #cbd5e1; borderRadius: 0.5rem`

### 4.6 Tags
- `<TagsInput>` (Mantine), placeholder "Press Enter to add"
- Same border style

### 4.7 Public Toggle
- `<Switch>` (Mantine), `color="violet"`
- Label: "Share in Public Library"
- Description: "Allow other teachers to use this test"

## 5. Footer Info

```css
margin-top: 1.5rem;
padding: 0.75rem 1rem;
background: rgba(0,0,0,0.02);
border-radius: 0.5rem;
border: 1px dashed rgba(0,0,0,0.1);
```

Shows: Test ID (monospace), Created date, Updated date.

## 6. Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| Violet primary | `#8b5cf6` | Active states, focus borders, THCS brand |
| Violet light bg | `rgba(139,92,246,0.06)` | Active card backgrounds |
| Label text | `#1e293b` | Primary labels |
| Secondary text | `#334155` | Advanced section label |
| Muted text | `#94a3b8` | Descriptions, inactive icons |
| Input text | `#475569` | Input values, pill text |
| Border default | `#cbd5e1` | Input/select borders |
| Divider | `#f1f5f9` | Section dividers |
| Red accent | `#ef4444` | Timer "None" strikethrough |

## 7. Design Decisions Log

| Decision | Why |
|----------|-----|
| Glass card with `backdrop-filter: blur(16px)` | Matches wizard Step 1 — premium feel |
| Duration pills instead of slider/number-only | Quick common-value selection + custom fallback |
| Advanced collapsed by default | Clean first impression — most teachers only need Title/Grade/Duration |
| SVG icons for timer modes (not emoji) | Consistent with THCSSetupStep's `TimerModeCard`; emojis render differently cross-platform |
| Subject Variant next to Province | Follows THCSSetupStep layout; related metadata grouped |
| School on its own row | Full-width for long school names (e.g., "THCS-THPT Nguyễn Tất Thành") |
| `maxWidth: 680px` centered | Prevents fields from stretching too wide in the 75vw modal |

## 8. Iteration History

1. **v1 (§27):** Custom 1200px card wrapper — wrong frame, studied QuizEditor instead of TestEditor
2. **v2 (§29):** Rewritten to use `EditTestFrame` — correct architecture
3. **v3 (§30):** Context tab upgraded — emoji timer → SVG icons, added Subject Variant, School full-width
4. **v4 (§32-36):** Width fixes (75vw responsive), double-border fix, unsaved-changes fix, answerKey tab removed



## 8. Implementations Using This Design

| Component | File | Notes |
|-----------|------|-------|
| `THCSSetupStep` | `src/pages/THCSTestEditorPage.tsx` | Original THCS wizard Step 1 |
| `WritingMetadataStep` | `src/components/test-creation/WritingStepsContent.tsx` | Writing modal Step 3 — reuses glass card, duration pills, accordion |
| `WritingFormatStep` | `src/components/test-creation/WritingStepsContent.tsx` | Writing modal Step 4 — glass card with selection cards |
| `WritingContentStep` | `src/components/test-creation/WritingStepsContent.tsx` | Writing modal Step 5 — glass card task panels |

See also: @doc/patterns/pattern-dynamic-step-order-wizard
