---
name: Lab Trxckin assistant surface
description: Evidence beside a private working conversation, within the incumbent Lab Trxckin interface.
colors:
  assistant-bg: "#fff"
  assistant-layer: "#f7f9fc"
  assistant-soft: "#edf2f8"
  assistant-text: "#16243c"
  assistant-muted: "#5c6c83"
  assistant-border: "#e2e8f0"
  assistant-action: "#1c355b"
  assistant-action-text: "#fff"
  assistant-bg-dark: "#111d30"
  assistant-layer-dark: "#142238"
  assistant-soft-dark: "#20324b"
  assistant-text-dark: "#e9eff8"
  assistant-muted-dark: "#a5b4ca"
  assistant-border-dark: "#293b54"
  assistant-action-dark: "#b4cced"
  assistant-action-text-dark: "#101e32"
typography:
  headline:
    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "-0.015em"
  body:
    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.8
  label:
    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  control: "8px"
  mark: "10px"
  result: "12px"
  composer: "14px"
spacing:
  inline: "8px"
  content: "12px"
  field: "14px"
  section: "16px"
components:
  button-primary:
    backgroundColor: "{colors.assistant-action}"
    textColor: "{colors.assistant-action-text}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  button-secondary:
    backgroundColor: "{colors.assistant-soft}"
    textColor: "{colors.assistant-text}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  composer:
    backgroundColor: "{colors.assistant-bg}"
    textColor: "{colors.assistant-text}"
    rounded: "{rounded.composer}"
  result:
    backgroundColor: "{colors.assistant-bg}"
    textColor: "{colors.assistant-text}"
    rounded: "{rounded.result}"
---

# Design System: Lab Trxckin assistant surface

## Overview

The assistant extends the existing Ubuntu, navy navigation, company accent and light/dark interface. Its direction is a private working conversation beside the records that support it. It is an operational surface: reading, asking, checking sources and returning to authorized module detail views take precedence over decoration.

This is a scoped implementation record, not a replacement global `DESIGN.md`. The approved workflow was code-led, with no generated or approved image comp and no new visual world. The source is authoritative; retained screenshots document the reviewed result. The three-column composition belongs to this assistant, not to every page in Lab Trxckin.

**Key Characteristics:**

- A readable central answer, with history and evidence as independently collapsible desktop rails.
- Quiet tonal surfaces and thin boundaries; colour indicates company scope, action or state.
- Persistent fictional-data disclosure and visible source scope/completeness.
- One conversation and composer state shared between the full page and header panel.

Evidence: [surface direction](../apps/frontend/.impeccable/surfaces/assistant.md), [PRODUCT.md](../apps/frontend/PRODUCT.md), [assistant styles](../apps/frontend/components/assistant/assistant.css), [workspace](../apps/frontend/components/assistant/assistant-workspace.tsx), [panel](../apps/frontend/components/assistant/assistant-panel.tsx), [results](../apps/frontend/components/assistant/assistant-results.tsx), [messages](../apps/frontend/components/assistant/assistant-message.tsx), [charts](../apps/frontend/components/assistant/assistant-chart.tsx), [provider](../apps/frontend/components/assistant/assistant-provider.tsx), [root fonts](../apps/frontend/app/layout.tsx) and [global styles](../apps/frontend/app/css/style.css). The companion [assistant sidecar](../apps/frontend/.impeccable/assistant-design.json) records motion, breakpoints and depth that do not fit the frontmatter schema.

## Colors

### Primary

The assistant action pair uses deep navy against white in light mode and pale blue against navy in dark mode. The dark suffixes in the frontmatter describe the values assigned to the same scoped CSS properties under the app's dark selector; they are not a separate theme mechanism.

The existing `--empresa-accent-rgb` supplies the company indicator, with the implemented fallback (`99 102 241`). This is a small circular scope marker, not an alternate assistant brand colour.

**The Company Scope Rule.** Keep the company indicator beside the conversation's scope label; do not infer the frozen scope from an action colour.

### Neutral

Background is the reading and composing plane. Layer distinguishes history, evidence and result headings. Soft marks selected history, user messages and quiet controls. Text, muted and border retain the same semantic roles in both themes. Preserve the scoped properties rather than copying light-mode literals into new assistant components.

Error, acting-identity and recording states use their implemented red or amber treatments with text and icons. Charts use a separate five-colour data series in `assistant-chart.tsx`; those colours are not semantic approval, risk or company tokens.

## Typography

Ubuntu is loaded by the app with the CSS variable `--font-ubuntu`; the assistant uses that face for headings, prose and controls. Lucide SVGs supply icons. No new display face, icon font or raster identity asset was introduced.

- **Headline:** the empty-state question uses the frontmatter headline role, balancing its line wraps; it steps down on mobile (25px).
- **Title:** the conversation title uses the title role, one line with ellipsis, limited to a readable length (38ch, then 22ch on mobile); its mobile size is smaller (15px).
- **Body:** answer prose uses the body role with a maximum line length (75ch). Mobile answers and user messages step down (13px); the composer input remains readable at the mobile input size (16px).
- **Label:** result headings, record titles and chart captions use the label role. Markdown headings are a compact intermediate tier (16px, weight 500, line-height 1.45). Summary values use tabular numerals (15px, weight 500).

Smaller secondary text remains in the implementation. Its exact sizes are not promoted into a reusable metadata type scale; the roles above capture the durable hierarchy, not every local declaration. Business labels and coverage messages are normalized for readers by `assistant-labels.ts`; display and copied prose use `assistant-markdown.ts`.

## Layout

The workspace fills the available viewport below the existing app header (`calc(100dvh - 64px)`). Its default grid is a history rail (228px), a shrinking central conversation (`minmax(0, 1fr)`) and an evidence rail (268px). At the large breakpoint (1600px), rails expand (250px and 290px). Each rail has a collapse control; restoring it moves keyboard focus back into the region.

At and below the evidence breakpoint (1350px), evidence moves to a right drawer and the history rail narrows (220px). At and below the history breakpoint (1000px), history moves to a left drawer and conversation occupies the available width. These are viewport breakpoints, not container queries. Drawers have bounded width (310px, at most 90vw).

The header panel is fixed at the right with bounded width (720px or the viewport), and uses the same workspace in compact mode. Its rails are drawers at all widths. At the mobile breakpoint (600px), it fills the viewport height (100dvh); controls for sending and opening rails grow to touch size (44px square). The persistent composer includes bottom safe-area padding, and the mobile panel bar includes top safe-area padding.

The feed scrolls independently. Message content is centered inside a bounded region (800px); the composer is separately bounded (780px). The composer does not shrink out of view. Draft content grows the textarea up to its maximum (180px). For short viewports (at most 500px high), the header and textarea compress, and the composer region can scroll within the remaining height. This preserves its controls at the reviewed landscape size (844 × 390).

Tables scroll inside their own wrapper. Long message and record text wrap; title truncation is reserved for navigation and headers. The source uses a compact rhythm of inline, content, field and section gaps, with larger separation between messages and page regions; it does not establish a new universal app spacing scale.

**The Composer Continuity Rule.** Moving between panel and page preserves the selected conversation, draft, model, response language and current run; choosing another conversation or actor follows the provider's explicit reset rules.

## Elevation & Depth

The resting workspace uses tonal planes and one-pixel borders. Result groups and the composer do not require shadows to establish hierarchy. Modal surfaces use the source's diffuse shadows: side panel, nested drawers and delete confirmation. Scrims separate those temporary surfaces from the underlying workspace. The exact shadow and scrim vocabulary is recorded in the sidecar, not added to the token schema.

**The Temporary Depth Rule.** Reuse the existing modal elevation for overlays; use tone and borders for ordinary conversation and evidence content.

## Shapes

Controls use gently rounded corners, result groups are more open, and the composer is the broadest recurring input enclosure. User messages use an asymmetric bubble (14px, 14px, 3px, 14px); assistant answers remain open prose. The company indicator and activity dots are circles. Thin dividers organize starters, history, result records and source details without making every row an independent card.

## Components

### Conversation and history

The history rail combines search, a new-conversation action, selected-row tone, and rename/delete controls. Secondary actions appear on hover or focus on desktop and remain visible at narrow widths. Rename is an inline input; deletion uses a Radix confirmation dialog. Empty and loading states explain the next action. Starters are permission-filtered, separated rows with specific workflow questions.

### Composer and controls

The composer groups a multiline field, model and answer-language selectors, dictation and send/stop. Enter sends; Shift+Enter adds a line, and composition events are respected. While a response runs, Stop replaces Send. Dictation adds editable text to the draft and never submits it; recording and transcription expose status and cancellation. A removable current-page context label sits above the composer when applicable.

The fictional-data sentence remains below the composer in empty and populated states, alongside the reminder to check sources. It is part of the working surface, not a welcome-only notice. Spanish controls remain stable while answers may be Spanish or English.

Icon buttons change tone on hover; primary send and new-conversation actions brighten. Controls carry visible focus treatment (2px outline, 3px offset), with the composer using a border change on focus within. Disabled buttons and selectors lower opacity (0.45) and show their disabled cursor. Accessible names accompany icon-only controls.

### Answers and evidence

Assistant answers use prose, permitted links, lists, tables and returned result groups. User prompts use the soft bubble. Tool progress has a human-readable label and status icon; failures and partial answers retain actionable feedback. Copy uses displayed normalized prose and retains only returned record links.

Evidence combines compact linked records with expandable datasets. Record links lead to authorized existing module routes. Results preserve returned counts, company scope, source time and incomplete-query messages. Small tables can open by default; larger tables stay available through details controls. Charts are created from returned evidence, expose a data table and have animation disabled. Their canvas is decorative to assistive technology; the textual table supplies values.

### Motion and scrolling

Motion is small and functional: button colour changes (160ms), composer border feedback (180ms), record hover feedback (150ms), activity/recording pulses, and a loading spinner. There is no entrance sequence hiding the initial content. Reduced-motion CSS disables animations and transitions within the assistant scope. Charts also disable their own animation.

Streaming follows the feed only when the reader is near its end (within 100px). Scrolling away exposes a return-to-latest control. Automatic streaming follows by direct scroll position; the explicit return control currently requests a smooth JavaScript scroll. That explicit request is an implementation limitation, not an inherited reduced-motion rule.

## Do's and Don'ts

### Do:

- **Do** reuse the scoped light/dark colour roles and the incumbent Ubuntu face.
- **Do** preserve the composer, reachable rail controls and internal table scrolling at narrow widths and short heights.
- **Do** show source scope, incomplete coverage, accessible state text and the persistent fictional-data label.
- **Do** use human-readable business labels and evidence-backed links in both displayed and copied answers.

### Don't:

- **Don't** turn this assistant's three-column composition or local tokens into an unapproved global app system.
- **Don't** imply that a partial query covers every record or that a fictional demonstration represents a real company.
- **Don't** add business mutation, attachment content, upload, export, web-search or spoken-answer controls to this read-only surface without a new feature decision.
- **Don't** promote existing small metadata declarations or the explicit smooth-scroll limitation into rules for future components.

Not canonized or repaired: unrelated entry-page/global documentation drift, compact metadata sizes, and the explicit smooth-scroll reduced-motion limitation. This pass records the assistant extension; it does not revise incumbent global decisions or reopen the completed finish-review scope.
