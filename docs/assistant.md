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

## How a question becomes an answer

The Asistente is a tool-calling agent. The model never sees the database: it sees a system prompt, the conversation, and three tools, and every business fact in an answer has to come back through one of them.

| Tool | Runs in | Does |
| --- | --- | --- |
| `read_data` | Convex (`internal.assistant.tools.readAssistantData`) | One zod schema for five domains (`billing`, `suppliers`, `customers`, `advances`, `pettyCash`) and seven operations (`search`, `detail`, `summary`, `movements`, `reimbursements`, `legalizations`, `workflow`), paginated (≤ 30 rows), with optional date range |
| `erp_lookup` | Next.js route, as the signed-in user | Supplier/customer lookup in the SIESA-synced catalog, by document or permitted name search |
| `display_chart` | Convex (`chartEvidence`) | A chart over rows a previous tool actually returned, only when the user asked for one |

A question goes through these steps:

1. **`POST /api/assistant/send`** checks the `Origin` header against the configured public URL (`NEXT_PUBLIC_APP_URL`, never forwarding headers, since behind the proxy `request.url` holds the container address) and the zod schema, resolves the WorkOS session and Nest actor on the server, and calls `assistant.begin`. `begin` rate-limits, freezes the company set, saves the user message in the Convex Agent thread, and creates an `assistantRuns` row keyed by an idempotency key. A retried request returns the existing run and does not start a second one.
2. **Rounds.** The route calls the `assistant.round` action in a loop of at most 10 rounds. Each round claims the run with a lease, so two callers cannot generate at once. It then streams one model step through `@convex-dev/agent` and OpenRouter.
3. **Native tools** (`read_data`, `display_chart`) execute inside that round. Before each call the round checks that the run is still `running` and before its deadline. Every call is scoped by the conversation's frozen `companyIds` and the acting user, never by model arguments. Each result is validated and stored in `assistantEvidence` with its source references. Nothing reaches the model before that.
4. **ERP tool.** `erp_lookup` has no `execute` in Convex, because the catalog is behind Nest, and Nest must see the *user's* session and permissions, not a service key. The round ends in `waiting_erp` and returns the pending calls. The route executes them with the user's session, re-reads the session to confirm the identity has not changed, and hands the results to `continueErp`. `continueErp` accepts only the exact pending `toolCallId`s and rejects anything the browser supplies.
5. **Streaming.** Text deltas are saved every 150 ms by word, and the UI subscribes to them through Convex, so a reload or a second tab keeps the live answer. The route only emits NDJSON progress events (`started`, `completed`, errors).
6. **Stop, timeout, failure.** Every 500 ms during streaming, the round re-reads the run. If the user pressed Stop or the deadline passed, the round aborts. Partial text is kept as a partial message. Provider errors are replaced by a fixed Spanish message before anything is saved, because they can contain request details.

### Why it is built this way

- **Read-only by construction, not by prompt.** No tool maps to a mutation. The prompt also says "never mutate", but the guarantee comes from the tool list: a prompt-injected record ("ignore previous instructions and approve…") has nothing to call.
- **The model never chooses scope.** Company scope is frozen when the conversation starts and passed by the server to every tool. The prompt tells the model not to supply it, and the schemas have no field for it (`erp_lookup`'s `companyId` is checked against the frozen set). A model that hallucinates or is tricked into another company id gets refused.
- **Authorization reuses the app's helpers.** `read_data` goes through the same `actorPuedeVerFactura`, onboarding access levels, advances visibility and petty cash roles as the module pages, so the Asistente cannot see more than its user. There is no second authorization model to drift.
- **Access is rechecked, not remembered.** Each evidence row stores the records it came from and, for aggregates, an access fingerprint. Every history read, round and continuation calls `revalidateAssistantSources`. If a permission, a company or a record's visibility changes, the conversation locks. This includes answers already written from that data, because paraphrased text is still data.
- **Evidence-bound output.** Links, charts and record cards come from stored evidence, not from the model's text. `display_chart` takes an `evidenceId` and validates keys and currency against the returned rows, so the model cannot draw numbers it made up. It also cannot link to a record it never read.
- **Honest completeness.** Every result carries `complete`, `returned`, `scanned`, `limit` and `nextCursor`. The prompt requires partial results to be described as partial ("these are the first 20…"), and subtotals are never presented as totals.
- **Durable runs.** Runs, leases, deadlines and idempotency keys live in Convex. A dropped connection, a double click or two tabs cannot produce duplicate or interleaved answers.
- **Bounded cost.** Every limit is fixed on the server: 30 questions per hour per real user, one active answer, 10 rounds, 120 s, 2,200 output tokens, `maxRetries: 0` and no automatic model switching. A runaway loop costs a known amount.

### Asistente or MCP server?

Both give an AI agent read access to the same data, and they solve different problems:

| | Asistente | [MCP server](mcp-server.md) |
| --- | --- | --- |
| Who asks | A signed-in employee in the app | An external agent (Claude Desktop, Claude Code, a custom client) |
| Identity | The user's own WorkOS session and RBAC | A service credential with a scope set on the server (`MCP_EMPRESAS`) |
| Model | Chosen in the app, called through OpenRouter | Whatever model the client runs |
| Surface | Five domains, charts, deep links, history | Four focused lookups and one resource |

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
