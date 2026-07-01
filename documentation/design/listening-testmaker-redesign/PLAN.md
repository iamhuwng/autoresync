# IELTS Listening — Test Maker Redesign (Proposal)

**Status:** Proposal for review — _no code changed yet._
**Flow in scope:** Materials → **Create New Test** → **IELTS** → **Listening** → **Details (metadata)** → **Choose mode** → **Builder (Audio → Parse/Images → Questions → Review)**
**Goal (user's words):** _"clean, well-organised, compact within the modal, limit the use of scroll."_

---

## 1. What the user actually sees today

| # | Screen | Component | File |
|---|--------|-----------|------|
| 1 | Modal shell | `TestCreationModal` (purple glass, 640px) | `src/components/test-creation/TestCreationModal.tsx:135` / styles `:527` |
| 2 | Details (metadata) | `MetadataStep` | `src/components/test-creation/MetadataStep.tsx:216` |
| 3 | **Choose mode** | `ListeningModeStep` (text vs image) | `TestCreationModal.tsx:2693` |
| 4 | Builder (opens at 95vw × 90vh) | `ListeningTestBuilder`, `initialStep="audio"` | `src/skills/listening/builders/ListeningTestBuilder.tsx:209` |
| 4a | Audio step | `:1860` |
| 4b | Parse (text mode) / Upload images (image mode) | `:2359` / `:2454` |
| 4c | Questions / Answer key | `:2977` |
| 4d | Review & Publish | `:3149` |

---

## 2. Root-cause problems (why it reads as "ugly / not up to standard")

1. **Three different visual languages in one flow.**
   - Shell + metadata: **purple/lavender glassmorphism** (`#8b5cf6`, `backdrop-filter: blur(20px)`, multi-stop gradients) — `TestCreationModal.tsx:527`, `MetadataStep.tsx:122`.
   - Mode step: **blue** flat-ish cards (`#2563eb`) — `:2704`.
   - Builder: **blue + indigo + green gradients** mixed together (`#2563eb`, `#4f46e5`, `linear-gradient(#10b981…)`) — `:1736`, `:1800`, `:1877`.
2. **Emoji used as product icons** throughout the builder: 🎧 ✅ 💡 📤 ⏳ 🗑️ 🔑 ⚡ 🪄 ✨ 🎛️ 🎵 🤖 🖼️ 📝 ⚠️ ❌ (`:1644`, `:1656`, `:1886`, `:1920`, `:2017`, `:2362`, `:2447`, `:2457`, `:3000`, `:3240`). The wizard shell itself already uses clean inline SVG (`:2572`) — so it's inconsistent even internally.
3. **Banner overload = the main scroll driver.** The Audio step stacks **four** informational blocks before any control: heading → `ListeningUploadGuidance` → green "Ready to Upload" gradient card (`:1876`) → blue "Upload flow" numbered list (`:1911`). Image-upload step repeats the pattern (`:2464`).
4. **Low information density.** Section cards are `1.5rem`-padded blocks with full-size upload buttons, standalone progress bars, and a full audio player stacked vertically (`:1930`–`2100`). Metadata uses 6 field groups at `1.5rem` bottom margin (`MetadataStep.tsx:127`).
5. **Jarring modal resize.** 640px wizard → **95vw × 90vh** full-bleed builder (`TestCreationModal.tsx:2442`). It stops feeling "within the modal."
6. **Native unstyled `<select>`** for Duration / Target band / CEFR (`MetadataStep.tsx:300,316,336`) — inconsistent with the app's custom controls.
7. **Redundant mode descriptions** and a **second, dead mode-select** inside the builder (`:1707`) that never shows in the embedded path (its indigo flat styling is actually the cleanest thing here — worth promoting).

---

## 3. Proposed design system (the "schema")

A single, flat, professional token set for the **whole** listening authoring flow. No glass, no gradients, no emoji.

```
FONT     Inter → fallback -apple-system, "Segoe UI", Roboto, sans-serif

COLOR    ink       #111827   (headings)
         body      #374151   (labels, text)
         muted     #6b7280   (secondary)
         dim       #9ca3af   (hints)
         line      #e5e7eb   (hairline borders / dividers)
         line-2    #d1d5db   (input borders)
         surface   #ffffff   (cards, modal)
         inset     #f8fafc   (wells, headers, footers)
         primary   #4f46e5   indigo   · hover #4338ca
         sel-tint  #eef2ff   indigo-50 · sel-border #c7d2fe
         success   #059669   (used as text/ring only — never a gradient fill)
         danger    #dc2626

RADIUS   card 12 · input 8 · button 999 (pill) · modal 16

ICON     inline SVG, 20–24px, stroke 1.8, currentColor. Zero emoji.

SHADOW   card   0 1px 2px rgba(16,24,40,.06)
         modal  0 12px 32px rgba(16,24,40,.12)

MOTION   120–160ms ease on hover/selection only (already the norm).
```

### Layout rules that kill scroll
- **One controlled modal width per phase.** Wizard steps: **720px**. Builder: **`min(960px, 94vw)`** (enough for image-mode two-pane) — _not_ 95vw.
- **Fixed-height modal body** (`min(680px, 82vh)`) with **pinned header + footer**; scrolling is confined to the inner content region, and each step is designed to fit without it.
- **Collapse info blocks:** at most **one** slim guidance strip per step (single line + optional "?" popover), never a stack of banners.
- **Rows, not cards, for repeated items** (audio sections, answer keys): icon · title/range · status pill · inline action — one line each.
- **2-column grids** for metadata and for label+control pairs.

---

## 4. Per-screen redesign spec

### 4.1 Details (metadata) — `MetadataStep.tsx`
- One compact card, tokenised inputs, **2-column grid**.
- Rows: **Title** (full) · **Format** segmented toggle (full, IELTS only) · **Duration + Target band** (row) · **CEFR + Difficulty** (row) · **Description** (full, 2 rows).
- Replace native `<select>` with the app's styled select (`NativeSelect` from `components/modern`) or a tokenised `.control` select.
- Result: fits 720px modal with **no scroll**.

### 4.2 Choose mode — `ListeningModeStep`
- **Slim summary chip row** (title · minutes · band) instead of the big blue banner (`:2706`).
- **Two equal cards** side-by-side: SVG icon tile → title → one-line description → 3 bullet affordances → primary pill CTA. Selected = indigo ring + `#eef2ff`.
- Unify copy; drop the ASCII `->` (`:2787`) for an SVG chevron.

### 4.3 Builder shell — `ListeningTestBuilder.tsx`
- **Segmented step nav** (pill-in-pill), SVG icons, `done` = success tick, `active` = indigo. Replaces emoji pills (`:1654`).
- Controlled width + fixed body height (see §3). Header shows step title + "Step n of 5"; footer = `Back` / `Continue` / `Publish` pinned (reuse `ListeningSavePublishBar`, restyled, `:3267`).

### 4.4 Audio step (`:1860`)
- Replace 4 stacked banners with **one** guidance strip: `"Upload one audio file per section · re-upload before publish"` + status pill `2 / 4 uploaded`.
- Each section = **one compact row**: `◉ Section 1 · Q1–10` · status pill · `Upload` / `Replace` button. On upload, expand inline to a **slim player** (play · waveform · time · remove) — no separate progress card.

### 4.5 Parse (text) / Upload images (image) — `:2359` / `:2454`
- Text: shorter auto-growing textarea (rows 15 → ~8), tokenised, single "Parse with AI" pill + "Add manually" ghost. Remove 🤖/⏳.
- Image: **two-pane** — left image viewer (zoom), right per-image question-range rows. One "How it works" strip, not a banner.

### 4.6 Questions / Answer key (`:2977`)
- **Compact numbered rows**: `Q1  [answer input]` (image mode) or `Q1  [question] [answer]` (text mode). Bulk-paste in a collapsible, not an always-open well.

### 4.7 Review & Publish (`:3149`)
- Summary as a **two-column definition grid** + section checklist as status-pill rows (replace `✅/❌`, `:3240`). Publish readiness inline.

---

## 5. Component & file change map

| File | Change |
|------|--------|
| `MetadataStep.tsx` | Re-token `styles`, 2-col grid, styled selects, tighter spacing. |
| `TestCreationModal.tsx` | Re-token `modalStyles` (drop glass/gradient); controlled width (`:2442`); restyle `ListeningModeStep` (`:2693`); (optional) align `TypeSelectionStep`/`SkillSelectionStep`. |
| `ListeningTestBuilder.tsx` | Segmented nav (`:1654`); audio rows + single strip (`:1860`); parse/images density (`:2359`,`:2454`); question rows (`:2977`); review grid (`:3149`); restyle save/publish bar (`:3267`). |
| **New** `listeningTheme.ts` (proposed) | Export the token object so modal + builder share one source of truth. |

**No behavioural / data changes** — this is presentation only. Upload, parse, draft, publish logic untouched.

---

## 6. Phasing

1. **Tokens + Metadata + Mode step** (what the user named first) — highest visible win, lowest risk.
2. **Builder shell + Audio step** (biggest scroll reduction).
3. **Parse / Images / Questions / Review** density pass.
4. Optional: align Type/Skill steps for a fully consistent wizard.

---

## 7. Non-goals / open decisions (for sign-off)

- **Non-goals:** no changes to parsing, upload, R2, draft/publish, or the student-facing player.
- **Decision A — Scope:** just Metadata + Mode step, or the entire builder too? (Plan assumes _entire flow_, phased.)
- **Decision B — Direction:** unified **flat indigo/slate** (this proposal, matches app's newer surfaces & the student-view standard) vs. keep a distinct-but-cleaned teacher "pastel."
- **Decision C — Modal width:** controlled `min(960px, 94vw)` for the builder vs. keep today's 95vw full-bleed.

See `mockup.png` for the visual proposal.
