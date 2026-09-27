import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  ASSISTANT_LIMITS,
  assistantSendSchema,
  type AssistantPendingTool,
  type AssistantRunStatus,
} from '@/lib/assistant/contracts';
import { assistantToolError, executeAssistantErp } from '@/lib/assistant/erp';
import {
  assistantCompanyIds,
  assistantErrorResponse,
  assistantSession,
  assertSameOrigin,
  AssistantHttpError,
} from '@/lib/assistant/server-session';

export const runtime = 'nodejs';
export const maxDuration = 150;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const raw: unknown = await request.json().catch(() => null);
    const parsed = assistantSendSchema.safeParse(raw);
    if (!parsed.success) throw new AssistantHttpError(400, 'Revisa tu mensaje, modelo y empresa antes de enviarlo.');
    const input = parsed.data;
    const initial = await assistantSession(request.signal);
    const companyIds = assistantCompanyIds(initial.user, input.companyId);
    const begun = await initial.client.mutation(api.assistant.begin, {
      secret: initial.secret,
      expectedActingUserId: initial.expectedActingUserId,
      companyIds,
      ...(input.conversationId ? { conversationId: input.conversationId as Id<'assistantConversations'> } : {}),
      text: input.text,
      model: input.model,
      language: input.language,
      context: input.context,
      idempotencyKey: input.idempotencyKey,
    });
    const encoder = new TextEncoder();
    const disconnect = new AbortController();
    const signal = AbortSignal.any([
      request.signal,
      disconnect.signal,
      AbortSignal.timeout(ASSISTANT_LIMITS.answerTimeoutMs),
    ]);
    const cancelRun = () => {
      void initial.client
        .mutation(api.assistant.cancel, {
          conversationId: begun.conversationId,
          runId: begun.runId,
          expectedActingUserId: initial.expectedActingUserId,
        })
        .catch(() => undefined);
    };
    if (!begun.duplicate) signal.addEventListener('abort', cancelRun, { once: true });
    let open = true;
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (value: unknown) => {
          if (open) {
            try {
              controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
            } catch {
              open = false;
              disconnect.abort();
            }
          }
        };
        emit({ type: 'started', conversationId: begun.conversationId, runId: begun.runId });
        let status: AssistantRunStatus = begun.status;
        try {
          for (
            let round = 0;
            !begun.duplicate &&
            (status === 'running' || status === 'waiting_erp') &&
            round < ASSISTANT_LIMITS.toolRounds + 1;
            round++
          ) {
            signal.throwIfAborted();
            const session = await assistantSession(signal);
            if (
              session.realUserId !== initial.realUserId ||
              session.expectedActingUserId !== initial.expectedActingUserId
            ) {
              throw new AssistantHttpError(403, 'La identidad de la sesión cambió. Inicia una conversación nueva.');
            }
            const step: { status: AssistantRunStatus; pendingTools?: AssistantPendingTool[] } =
              await session.client.action(api.assistant.round, {
                secret: session.secret,
                expectedActingUserId: session.expectedActingUserId,
                runId: begun.runId,
              });
            status = step.status;
            if (step.pendingTools?.length) {
              const results = [];
              for (const tool of step.pendingTools) {
                signal.throwIfAborted();
                if (tool.toolName !== 'erp_lookup')
                  throw new AssistantHttpError(400, 'Herramienta externa no permitida.');
                let result;
                try {
                  result = await executeAssistantErp(tool.args, session.user, begun.companyIds, signal);
                } catch (error) {
                  if (signal.aborted) throw error;
                  result = assistantToolError(error, tool.args);
                }
                results.push({ toolCallId: tool.toolCallId, resultJson: JSON.stringify(result) });
              }
              signal.throwIfAborted();
              const refreshed = await assistantSession(signal);
              if (
                refreshed.realUserId !== initial.realUserId ||
                refreshed.expectedActingUserId !== initial.expectedActingUserId
              )
                throw new AssistantHttpError(403, 'La identidad de la sesión cambió.');
              const continued = await refreshed.client.mutation(api.assistant.continueErp, {
                secret: refreshed.secret,
                expectedActingUserId: refreshed.expectedActingUserId,
                runId: begun.runId,
                results,
              });
              status = continued.status;
            }
          }
          if (!begun.duplicate && (status === 'running' || status === 'waiting_erp'))
            throw new AssistantHttpError(
              408,
              'La consulta alcanzó su límite de pasos. Prueba una pregunta más específica.',
            );
          emit({ type: 'completed', conversationId: begun.conversationId, runId: begun.runId, status });
        } catch (error) {
          const message = signal.aborted
            ? 'La respuesta se interrumpió. Puedes volver a intentarlo.'
            : error instanceof AssistantHttpError
              ? error.message
              : 'No se pudo completar la respuesta. Inténtalo de nuevo.';
          try {
            if (signal.aborted)
              await initial.client.mutation(api.assistant.cancel, {
                conversationId: begun.conversationId,
                runId: begun.runId,
                expectedActingUserId: initial.expectedActingUserId,
              });
            else
              await initial.client.mutation(api.assistant.fail, {
                secret: initial.secret,
                expectedActingUserId: initial.expectedActingUserId,
                runId: begun.runId,
                error: message,
              });
          } catch {
            /* Runtime lease expiry recovers if the identity changed or the connection is gone. */
          }
          emit({ type: 'error', error: message });
        } finally {
          signal.removeEventListener('abort', cancelRun);
          if (open) {
            open = false;
            controller.close();
          }
        }
      },
      cancel() {
        open = false;
        disconnect.abort();
      },
    });
    return new Response(body, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    return assistantErrorResponse(error);
  }
}
