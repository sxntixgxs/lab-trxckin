import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@workos-inc/authkit-nextjs', () => ({ withAuth: vi.fn() }));
vi.mock('@/lib/convexServerClient', () => ({ getConvexServerSecret: () => 'test' }));
vi.mock('@/lib/fetch-backend', () => ({ fetchBackend: vi.fn() }));
import { readAudioForm, transcribeAudio } from './transcription';
import { ASSISTANT_LIMITS } from './contracts';

function request(type = 'audio/webm;codecs=opus', duration = '1000', size = 10) {
  const form = new FormData();
  form.set('audio', new File([new Uint8Array(size)], 'recording', { type }));
  form.set('durationMs', duration);
  return new Request('http://localhost/api/assistant/transcribe', { method: 'POST', body: form });
}
afterEach(() => vi.unstubAllGlobals());
describe('dictation', () => {
  it('keeps actual recorder MIME and normalizes supported containers', async () => {
    expect((await readAudioForm(request())).extension).toBe('webm');
    expect((await readAudioForm(request('audio/mp4'))).extension).toBe('m4a');
  });
  it('rejects empty, oversized, long, and unsupported recordings', async () => {
    await expect(readAudioForm(request('audio/webm', '1000', 0))).rejects.toThrow('vacía');
    await expect(readAudioForm(request('audio/webm', '1000', ASSISTANT_LIMITS.recordingBytes + 1))).rejects.toThrow(
      '3 MiB',
    );
    await expect(readAudioForm(request('audio/webm', '999999'))).rejects.toThrow('dos minutos');
    await expect(readAudioForm(request('application/pdf'))).rejects.toThrow('formato');
  });
  it('lets the provider detect language and propagates cancellation', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ text: '  Show pending invoices  ' }));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    expect(
      await transcribeAudio(new File(['voice'], 'a.webm', { type: 'audio/webm' }), 'webm', 'server-key', signal),
    ).toBe('Show pending invoices');
    const init = fetch.mock.calls[0][1];
    expect(init.signal).toBe(signal);
    expect(init.body.get('language')).toBeNull();
    expect(init.body.get('model')).toBe('x-ai/grok-stt-1.0');
  });
  it('reports empty transcripts and provider failures without leaking provider bodies', async () => {
    const audio = new File(['voice'], 'a.webm');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ text: ' ' })));
    await expect(transcribeAudio(audio, 'webm', 'key', new AbortController().signal)).rejects.toThrow(
      'No se detectó voz',
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret provider info', { status: 500 })));
    await expect(transcribeAudio(audio, 'webm', 'key', new AbortController().signal)).rejects.toThrow(
      'No se pudo transcribir',
    );
  });
});
