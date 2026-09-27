import { api } from '@/convex/_generated/api';
import { ASSISTANT_LIMITS } from '@/lib/assistant/contracts';
import {
  assistantErrorResponse,
  assistantSession,
  assertSameOrigin,
  AssistantHttpError,
} from '@/lib/assistant/server-session';
import { readAudioForm, transcribeAudio } from '@/lib/assistant/transcription';

export const runtime = 'nodejs';
export const maxDuration = 70;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new AssistantHttpError(503, 'El dictado todavía no está configurado.');
    const session = await assistantSession(request.signal);
    const { audio, extension } = await readAudioForm(request);
    await session.client.mutation(api.assistant.consumeDictation, {
      secret: session.secret,
      expectedActingUserId: session.expectedActingUserId,
    });
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(ASSISTANT_LIMITS.transcriptionTimeoutMs)]);
    const text = await transcribeAudio(audio, extension, key, signal);
    return Response.json({ text }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return assistantErrorResponse(
        new AssistantHttpError(408, 'El dictado se interrumpió o tardó demasiado. Puedes volver a grabar.'),
      );
    }
    return assistantErrorResponse(error);
  }
}
