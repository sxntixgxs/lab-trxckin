import { ASSISTANT_LIMITS } from './contracts';
import { AssistantHttpError } from './server-session';

const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

/** Bound multipart parsing too, including chunked requests without a Content-Length. */
export async function readAudioForm(request: Request) {
  const maxBytes = ASSISTANT_LIMITS.recordingBytes + 64 * 1024;
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new AssistantHttpError(413, 'La grabación supera el límite de 3 MiB.');
  const reader = request.body?.getReader();
  if (!reader) throw new AssistantHttpError(400, 'No recibimos una grabación.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new AssistantHttpError(413, 'La grabación supera el límite de 3 MiB.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let form: FormData;
  try {
    form = await new Response(bytes, {
      headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
    }).formData();
  } catch {
    throw new AssistantHttpError(400, 'La grabación no tiene un formato válido.');
  }
  const audio = form.get('audio');
  if (!(audio instanceof File) || !audio.size) throw new AssistantHttpError(400, 'La grabación está vacía.');
  if (audio.size > ASSISTANT_LIMITS.recordingBytes)
    throw new AssistantHttpError(413, 'La grabación supera el límite de 3 MiB.');
  const duration = Number(form.get('durationMs'));
  if (!Number.isFinite(duration) || duration <= 0 || duration > ASSISTANT_LIMITS.recordingDurationMs + 1000) {
    throw new AssistantHttpError(400, 'Graba un mensaje de hasta dos minutos.');
  }
  const mime = audio.type.split(';')[0].trim().toLowerCase();
  const extension = AUDIO_EXTENSIONS[mime];
  if (!extension) throw new AssistantHttpError(415, 'Este formato de audio no es compatible. Intenta grabar de nuevo.');
  return { audio, extension };
}

export async function transcribeAudio(
  audio: File,
  extension: string,
  key: string,
  signal: AbortSignal,
): Promise<string> {
  const form = new FormData();
  form.set('model', 'x-ai/grok-stt-1.0');
  form.set('file', audio, `dictado.${extension}`);
  // Omit language so speech detection stays independent of the answer-language selector.
  const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal,
  });
  if (!response.ok) throw new AssistantHttpError(502, 'No se pudo transcribir la grabación. Inténtalo de nuevo.');
  const data: unknown = await response.json();
  const text =
    data && typeof data === 'object' && 'text' in data && typeof data.text === 'string' ? data.text.trim() : '';
  if (!text) throw new AssistantHttpError(422, 'No se detectó voz. Intenta grabar de nuevo.');
  if (text.length > ASSISTANT_LIMITS.promptCharacters)
    throw new AssistantHttpError(422, 'El dictado es demasiado largo. Divide tu pregunta en mensajes más cortos.');
  return text;
}
