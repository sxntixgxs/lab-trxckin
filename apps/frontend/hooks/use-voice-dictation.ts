'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ASSISTANT_LIMITS } from '@/lib/assistant/contracts';

export function recordingExtension(mime: string) {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export function useVoiceDictation(onTranscript: (text: string) => void) {
  const [state, setState] = useState<'idle' | 'requesting' | 'recording' | 'transcribing'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const transcript = useRef(onTranscript);
  useEffect(() => {
    transcript.current = onTranscript;
  }, [onTranscript]);

  const release = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  const cancel = useCallback(() => {
    generation.current += 1;
    request.current?.abort();
    request.current = null;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    recorder.current = null;
    release();
    setState('idle');
    setSeconds(0);
  }, [release]);

  useEffect(() => {
    setSupported(typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia));
    return () => {
      generation.current += 1;
      request.current?.abort();
      if (recorder.current?.state === 'recording') recorder.current.stop();
      release();
    };
  }, [release]);

  const start = useCallback(async () => {
    if (recorder.current?.state === 'recording' || request.current) return;
    const current = ++generation.current;
    setError(null);
    setState('requesting');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation.current !== current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((mime) =>
        MediaRecorder.isTypeSupported(mime),
      );
      const capture = new MediaRecorder(media, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 96_000 });
      recorder.current = capture;
      const chunks: Blob[] = [];
      let bytes = 0;
      let tooLarge = false;
      const beganAt = Date.now();
      capture.ondataavailable = (event) => {
        if (!event.data.size) return;
        bytes += event.data.size;
        if (bytes > ASSISTANT_LIMITS.recordingBytes) {
          tooLarge = true;
          if (capture.state === 'recording') capture.stop();
          return;
        }
        chunks.push(event.data);
      };
      capture.onerror = () => {
        if (current !== generation.current) return;
        cancel();
        setError('No se pudo grabar. Revisa el micrófono e inténtalo de nuevo.');
      };
      capture.onstop = async () => {
        if (current !== generation.current) return;
        release();
        recorder.current = null;
        if (tooLarge) {
          setError('El audio superó 3 MiB. Prueba con un dictado más corto.');
          setState('idle');
          return;
        }
        const durationMs = Math.min(Date.now() - beganAt, ASSISTANT_LIMITS.recordingDurationMs);
        const audio = new Blob(chunks, { type: capture.mimeType || chunks[0]?.type || 'audio/webm' });
        if (audio.size === 0) {
          setError('No se detectó audio. Intenta grabar otra vez.');
          setState('idle');
          return;
        }
        const controller = new AbortController();
        request.current = controller;
        const timeout = setTimeout(() => controller.abort(), ASSISTANT_LIMITS.transcriptionTimeoutMs);
        setState('transcribing');
        try {
          const form = new FormData();
          form.append('audio', audio, `dictado.${recordingExtension(audio.type)}`);
          form.append('durationMs', String(durationMs));
          const response = await fetch('/api/assistant/transcribe', {
            method: 'POST',
            body: form,
            signal: controller.signal,
          });
          const body: unknown = await response.json().catch(() => null);
          if (!response.ok)
            throw new Error(
              body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
                ? body.error
                : 'No se pudo transcribir. Intenta de nuevo.',
            );
          if (!body || typeof body !== 'object' || !('text' in body) || typeof body.text !== 'string')
            throw new Error('La transcripción no devolvió texto.');
          if (current === generation.current) transcript.current(body.text);
        } catch (failure) {
          if (current === generation.current)
            setError(
              controller.signal.aborted
                ? 'La transcripción tardó demasiado. Intenta un dictado más corto.'
                : failure instanceof Error
                  ? failure.message
                  : 'No se pudo transcribir.',
            );
        } finally {
          clearTimeout(timeout);
          if (current === generation.current) {
            request.current = null;
            setState('idle');
            setSeconds(0);
          }
        }
      };
      capture.start(250);
      setSeconds(0);
      setState('recording');
      timer.current = setInterval(() => {
        const elapsed = Date.now() - beganAt;
        setSeconds(Math.min(120, Math.floor(elapsed / 1000)));
        if (elapsed >= ASSISTANT_LIMITS.recordingDurationMs && capture.state === 'recording') capture.stop();
      }, 250);
    } catch (failure) {
      if (current !== generation.current) return;
      release();
      setState('idle');
      setError(
        failure instanceof DOMException && failure.name === 'NotAllowedError'
          ? 'Permite el acceso al micrófono para dictar. También puedes escribir tu consulta.'
          : 'El micrófono no está disponible. Puedes escribir tu consulta.',
      );
    }
  }, [cancel, release]);

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);
  return { state, seconds, error, supported, start, stop, cancel };
}
