---
version: 1
slug: assistant
primary_target: apps/frontend/app/(default)/assistant/page.tsx
related_targets:
  - apps/frontend/components/assistant
  - apps/frontend/components/ui/header.tsx
---

# Asistente

Mode: Operate. Scope: authenticated `/assistant` and the shared app-header panel.
Build path: code-led, explicitly chosen in the approved implementation plan. No generated comp.

## Direction contract

THESIS: A private working conversation sits beside the records that support it. A user can ask who acts next, inspect the actual source, and continue work in its original module.

OWN-WORLD: Extend the incumbent Lab Trxckin interface. Ubuntu, existing company accent variables, navy navigation, Lucide icons, app border/radius conventions, and both light/dark surfaces. No new brand or decorative hero.

FIRST VIEWPORT: On a wide desktop, a quiet conversation-history rail, a generous readable center column with the composer anchored below, and optional evidence at right. The header names the conversation and its frozen company scope. An empty conversation offers specific permitted questions across billing, advances, suppliers, customers and petty cash. Narrow viewports retain the composer and conversation; history and evidence become accessible drawers. The side panel becomes fullscreen on mobile.

SIGNATURE INTERACTION: Follow an answer from human-readable tool progress to a returned record, dataset, or requested chart. Linked records open the app's existing authorized detail views. Opening the header panel or full page preserves conversation, draft, model, and streaming state.

MOTION: Small control transitions and tool-progress feedback; content is visible by default. Respect reduced motion. Automatic scrolling follows new output only while the user remains at the end; provide an explicit return-to-latest control.

STATES: Empty, initial loading, tool execution, streaming, completed, cancelled partial answer, retryable failure, unavailable permissions, revoked-source lock, recording/transcribing/cancelled dictation, conversation rename/delete. Spanish controls; ES/EN answers selectable. Voice inserts a draft, never sends it.

QUALITY BAR: An operational workspace whose hierarchy, spacing, typography, focus states and responsive behavior match the existing app. Evidence stays readable as records, tables and charts; data boundaries and incompleteness stay visible. Long titles and real answers must not displace the composer or create page-level horizontal scrolling.

Constraints: Read-only business tools. Frozen company scope. Histories isolated by real and acting identity. No audio retention, attachment contents, uploads, web search, exports or spoken output. No unrelated entry-page brief or design-system drift repair.

Finish: independent Impeccable review, material fixes, then documentation derived from the implemented surface.

## Implemented surface record — 2026-09-25

The approved code-led path shipped within the incumbent world; no generated comp or global identity change was approved. Implementation-derived tokens and component rules are recorded in `docs/assistant-design.md` at the repository root, with non-token extensions in `apps/frontend/.impeccable/assistant-design.json`. No global `DESIGN.md` was created.

The implementation follows the desktop history/conversation/evidence structure, with independently collapsible rails, shared page/panel state, drawer access below the rail breakpoints, and a fullscreen mobile panel. Light and dark palettes are scoped to the assistant; Ubuntu and the existing company accent indicator remain inherited. The composer and fictional-data notice persist in empty and populated conversations. Evidence includes linked records, expandable returned datasets, accessible chart tables, coverage notes and source timing.

Independent finish review reached **ship within the scored fix-list scope** after the readable business-label/status fixes, persistent fictional-data label, short-landscape composer/fullscreen-panel fixes, and display/copy normalization regression fix. This is the completed review's verdict, not a claim that this documentation pass ran new technical tests.

Retained review artifacts in `.impeccable/review/assistant/`: `desktop-empty.png` and `mobile-empty.png` (light empty states); `desktop.png` and `mobile.png` (populated dark); `desktop-dark.png` (source notes); `desktop-light-response.png` (populated light); `mobile-evidence.png`; `mobile-panel.png`; `landscape.png` (844 × 390); and `user-820.png` (the user's 820px viewport). The documentation pass sampled the populated desktop/mobile captures and checked the implementation sources. The completed live checks also covered shared draft/context, history, rename, Stop and English ERP answers; technical verification belongs to `docs/assistant.md`.

Preserved constraints: read-only business tools; fixed conversation company scope; private histories tied to real and acting identity; no retained audio, attachments, uploads, exports, web search or spoken output. Existing entry-page brief and global design drift were left alone. Compact secondary text and the explicit smooth-scroll return control are described as source limitations, not promoted into reusable system rules.
