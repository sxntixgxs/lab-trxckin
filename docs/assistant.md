# Asistente

The authenticated `/assistant` workspace and header panel share a conversation, draft, model, response language and streaming state. Controls are Spanish; answers support Spanish and English. Business tools are read-only.

## Data and access

`convex/assistant/tools.ts` searches, retrieves and summarizes billing, supplier/customer onboarding, advances and petty cash through the existing authorization helpers. Workflow help is curated from the repository module guides and phase definitions in `convex/assistant/knowledge.ts`. Update those excerpts when the workflows change.

ERP lookups use the existing authenticated Next-to-Nest route. Customer name search requires the ERP catalog permission; onboarding users retain document-based existence lookups. Catalog continuations accept a bounded cursor; nonpaginated supplier search requires a narrower query when capped. Returned metadata distinguishes complete results, bounded scans and replicated ERP data.

Conversations freeze an explicit company set and belong to the real WorkOS identity plus the effective Nest actor. Impersonation histories are separate. Every history read, tool call, generation round and ERP continuation rechecks access. Source manifests lock and redact a conversation when access to its evidence is lost. A trusted `actorEmail` is separate from the real identity email for assignment checks.

## Runtime

Convex Agent owns messages, tool calls and resumable streams. Assistant tables only hold ownership, frozen scope, source/evidence references and run coordination. `/api/assistant/send` validates input, obtains identity and permissions server-side, starts an idempotent run and coordinates generation rounds. Its NDJSON events identify the run; the UI reads live message streams through Convex.

Native tools execute in Convex. ERP continuation requires authentication, the server secret and exact pending tool-call IDs. Browser-supplied results are rejected. Chart specifications reference returned evidence, validate numeric keys/currency, and require a chart request. Mixed-currency monetary charts are rejected; counts can be graphed without currency.

Limits per real signed-in user: 30 questions/hour, 10 dictations/hour, one active answer across acting identities, 10 rounds and 120 seconds. Cancellation targets the initiating run, and interrupted text remains a partial Agent message after reload. Provider failures persist safe user-facing errors.

## Development setup

Use the repository's existing frontend, backend, database and ERP development services. Configure the ignored frontend `.env.local` with the existing WorkOS, Convex and Nest settings; set `NEXT_PUBLIC_APP_URL=http://localhost:3000` and the matching local WorkOS callback. The BFF uses `CONVEX_SERVER_SECRET` as existing server-to-Convex calls do.

Set `OPENROUTER_API_KEY` separately in the frontend environment (dictation) and the development Convex environment (generation). Never commit it. Register the Agent and rate-limiter components via `convex/convex.config.ts`, then run `pnpm exec convex dev --once` from `apps/frontend`. Use only a development deployment for local validation.

The allowlist is `google/gemini-3.5-flash-lite` (default), `openai/gpt-5.6-luna`, and `deepseek/deepseek-v4-flash`. There is no fallback substitution or embedded price claim.

## Dictation

`/api/assistant/transcribe` sends an in-memory recording to OpenRouter `x-ai/grok-stt-1.0`, omitting a language hint for automatic detection. The browser stops after two minutes or 3 MiB; multipart parsing is also byte-bounded. Audio is never stored by this app. The server checks the declared duration and MIME type; it does not independently decode media duration. The transcript is editable and is never automatically submitted.

## Validation

Run `pnpm test`, `pnpm lint`, `pnpm typecheck` and `pnpm build` from `apps/frontend`. Assistant tests cover authorization/ownership, fixed scope, source revocation, impersonation, idempotency, quotas, cancellation, partial persistence, mocked Agent rounds, ERP continuation, chart evidence, language, native domains and transcription boundaries. Live development checks and design evidence are recorded in the assistant surface brief and review artifacts.

This feature excludes business mutations, attachment contents, uploads, external web search, conversation export and spoken answers. No production deployment is part of its development delivery.

### Development verification (2026-09-25)

- 958 tests pass across 115 files with `vitest run --maxWorkers=1`. An existing storage test timed out when the suite and production build competed for resources; its 112-test file and the final complete suite passed when run separately.
- Frontend and Convex TypeScript checks pass. Repository ESLint reports zero errors (48 existing warnings); the assistant's changed files pass scoped lint without warnings. The production build passes.
- Authenticated live checks on localhost and the development Convex deployment covered workflow tool calling, invoice summaries and requested charts, authorized invoice deep links, English ERP continuation, page/panel draft continuity, removable invoice context, saved history after reload, rename, retry, and Stop.
- Render checks covered 1440×900 desktop, 390×844 mobile, the user's 820px viewport, 844×390 landscape, light/dark themes, evidence drawers and the fullscreen mobile panel. Keyboard dismissal and desktop rail controls were checked.
- Dictation has 15 mocked browser integration tests plus server parsing/provider boundary tests. A physical microphone recording was not made during automated verification.
- Conversation links and displayed technical values are constrained to returned evidence. History pagination retains access to older conversations, including across pages without matches for the current company scope.

Design decisions are recorded in [assistant-design.md](assistant-design.md); the independent finish-review verdict is in the [assistant surface brief](../apps/frontend/.impeccable/surfaces/assistant.md). Credentials remain in ignored development configuration.
