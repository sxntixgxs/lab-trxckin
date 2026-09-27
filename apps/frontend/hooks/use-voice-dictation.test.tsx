// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ASSISTANT_LIMITS } from '@/lib/assistant/contracts';
import { useVoiceDictation } from './use-voice-dictation';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  static isTypeSupported = vi.fn((type: string) => type === 'audio/webm;codecs=opus');
  state: RecordingState = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void | Promise<void>) | null = null;
  onerror: (() => void) | null = null;
  stopped: Promise<void> = Promise.resolve();

  constructor(readonly media: MediaStream, options: MediaRecorderOptions) {
    this.mimeType = options.mimeType ?? 'audio/webm';
    MockMediaRecorder.instances.push(this);
  }

  start = vi.fn(() => { this.state = 'recording'; });
  stop = vi.fn(() => {
    this.state = 'inactive';
    // Browser recorder events arrive asynchronously, including after cancel/unmount.
    this.stopped = Promise.resolve().then(async () => { await this.onstop?.(); });
  });
  emit(bytes = 24) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)], { type: this.mimeType }) });
  }
}

const getUserMedia = vi.fn<() => Promise<MediaStream>>();
const fetchMock = vi.fn<typeof fetch>();
let stopTrack: ReturnType<typeof vi.fn>;
let media: MediaStream;

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, json: async () => body } as Response;
}
function currentRecorder() {
  const recorder = MockMediaRecorder.instances.at(-1);
  if (!recorder) throw new Error('Recording did not start');
  return recorder;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-25T15:00:00Z'));
  stopTrack = vi.fn();
  media = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  MockMediaRecorder.instances = [];
  MockMediaRecorder.isTypeSupported.mockReset().mockImplementation((type) => type === 'audio/webm;codecs=opus');
  getUserMedia.mockReset().mockResolvedValue(media);
  fetchMock.mockReset().mockResolvedValue(response({ text: 'Consulta dictada' }));
  vi.stubGlobal('MediaRecorder', MockMediaRecorder);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('voice dictation lifecycle', () => {
  test.each(['recorder', 'microphone'] as const)('reports an unsupported %s without requesting access', (missing) => {
    if (missing === 'recorder') vi.stubGlobal('MediaRecorder', undefined);
    else vi.stubGlobal('navigator', {});
    const { result } = renderHook(() => useVoiceDictation(vi.fn()));
    expect(result.current.supported).toBe(false);
    expect(result.current.state).toBe('idle');
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('handles microphone denial and allows a later retry', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
    const { result } = renderHook(() => useVoiceDictation(vi.fn()));
    await act(() => result.current.start());
    expect(result.current.state).toBe('idle');
    expect(result.current.error).toContain('Permite el acceso');
    expect(fetchMock).not.toHaveBeenCalled();

    await act(() => result.current.start());
    expect(result.current.state).toBe('recording');
    expect(result.current.error).toBeNull();
  });

  test('transcribes only after stopping and returns editable text without sending a chat message', async () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceDictation(onTranscript));
    expect(result.current.supported).toBe(true);
    await act(() => result.current.start());
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(result.current.state).toBe('recording');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
    const recorder = currentRecorder();
    await act(async () => {
      recorder.emit();
      await vi.advanceTimersByTimeAsync(1500);
      result.current.stop();
      await recorder.stopped;
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/assistant/transcribe');
    expect(options?.method).toBe('POST');
    const form = options?.body as FormData;
    expect(form.get('durationMs')).toBe('1500');
    expect((form.get('audio') as File).name).toBe('dictado.webm');
    expect((form.get('audio') as File).size).toBe(24);
    expect(form.get('language')).toBeNull();
    expect(onTranscript).toHaveBeenCalledExactlyOnceWith('Consulta dictada');
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('idle');
    expect(result.current.seconds).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('cancels an active recording and ignores its late stop/data callbacks', async () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceDictation(onTranscript));
    await act(() => result.current.start());
    const recorder = currentRecorder();
    await act(async () => {
      recorder.emit();
      result.current.cancel();
      recorder.emit();
      await recorder.stopped;
    });
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('releases permission results that arrive after cancellation', async () => {
    const pending = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useVoiceDictation(vi.fn()));
    let starting!: Promise<void>;
    act(() => { starting = result.current.start(); });
    expect(result.current.state).toBe('requesting');
    act(() => result.current.cancel());
    await act(async () => { pending.resolve(media); await starting; });
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(MockMediaRecorder.instances).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });

  test('aborts transcription on cancel and never applies a stale response over a newer recording', async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceDictation(onTranscript));
    await act(() => result.current.start());
    const first = currentRecorder();
    await act(async () => { first.emit(); result.current.stop(); await Promise.resolve(); });
    expect(result.current.state).toBe('transcribing');
    const signal = fetchMock.mock.calls[0][1]?.signal;
    act(() => result.current.cancel());
    expect(signal?.aborted).toBe(true);
    await act(() => result.current.start());
    const second = currentRecorder();
    expect(second).not.toBe(first);
    await act(async () => { pending.resolve(response({ text: 'Obsolete text' })); await first.stopped; });
    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.state).toBe('recording');
    expect(second.state).toBe('recording');
    await act(async () => { second.emit(); result.current.stop(); await second.stopped; });
    expect(onTranscript).toHaveBeenCalledExactlyOnceWith('Consulta dictada');
  });

  test('unmount stops the microphone and ignores late recorder callbacks', async () => {
    const onTranscript = vi.fn();
    const { result, unmount } = renderHook(() => useVoiceDictation(onTranscript));
    await act(() => result.current.start());
    const recorder = currentRecorder();
    recorder.emit();
    unmount();
    await act(async () => { await recorder.stopped; });
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('unmount aborts transcription and suppresses a provider response delivered afterward', async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const onTranscript = vi.fn();
    const { result, unmount } = renderHook(() => useVoiceDictation(onTranscript));
    await act(() => result.current.start());
    const recorder = currentRecorder();
    await act(async () => { recorder.emit(); result.current.stop(); await Promise.resolve(); });
    const signal = fetchMock.mock.calls[0][1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { pending.resolve(response({ text: 'Late transcript' })); await recorder.stopped; });
    expect(onTranscript).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('voice dictation limits and failures', () => {
  test('automatically stops at two minutes and uploads the capped duration', async () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceDictation(onTranscript));
    await act(() => result.current.start());
    const recorder = currentRecorder();
    recorder.emit();
    await act(() => vi.advanceTimersByTimeAsync(ASSISTANT_LIMITS.recordingDurationMs - 250));
    expect(recorder.state).toBe('recording');
    expect(result.current.seconds).toBe(119);
    await act(() => vi.advanceTimersByTimeAsync(250));
    await act(async () => { await recorder.stopped; });
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1]?.body as FormData).get('durationMs')).toBe('120000');
    expect(onTranscript).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('rejects cumulative audio larger than three MiB without uploading it', async () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceDictation(onTranscript));
    await act(() => result.current.start());
    const recorder = currentRecorder();
    await act(async () => {
      recorder.emit(ASSISTANT_LIMITS.recordingBytes);
      expect(recorder.state).toBe('recording');
      recorder.emit(1);
      await recorder.stopped;
    });
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(result.current.error).toContain('3 MiB');
    expect(result.current.state).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  test('reports empty recordings without calling the transcription endpoint', async () => {
    const { result } = renderHook(() => useVoiceDictation(vi.fn()));
    await act(() => result.current.start());
    const recorder = currentRecorder();
    await act(async () => { recorder.emit(0); result.current.stop(); await recorder.stopped; });
    expect(result.current.error).toContain('No se detectó audio');
    expect(result.current.state).toBe('idle');
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('releases microphone resources when the recorder fails', async () => {
    const { result } = renderHook(() => useVoiceDictation(vi.fn()));
    await act(() => result.current.start());
    const recorder = currentRecorder();
    await act(async () => { recorder.onerror?.(); await recorder.stopped; });
    expect(result.current.error).toContain('No se pudo grabar');
    expect(result.current.state).toBe('idle');
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('reports a transcription failure and preserves the existing draft callback', async () => {
    fetchMock.mockResolvedValueOnce(response({ error: 'Alcanzaste el límite de dictados.' }, 429));
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceDictation(onTranscript));
    await act(() => result.current.start());
    const recorder = currentRecorder();
    await act(async () => { recorder.emit(); result.current.stop(); await recorder.stopped; });
    expect(result.current.error).toBe('Alcanzaste el límite de dictados.');
    expect(result.current.state).toBe('idle');
    expect(onTranscript).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('times out transcription, aborts fetch and restores the composer', async () => {
    fetchMock.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceDictation(onTranscript));
    await act(() => result.current.start());
    const recorder = currentRecorder();
    await act(async () => { recorder.emit(); result.current.stop(); await Promise.resolve(); });
    expect(result.current.state).toBe('transcribing');
    await act(() => vi.advanceTimersByTimeAsync(ASSISTANT_LIMITS.transcriptionTimeoutMs));
    await act(async () => { await recorder.stopped; });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(result.current.error).toContain('tardó demasiado');
    expect(result.current.state).toBe('idle');
    expect(onTranscript).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
