'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEmpresaFilter } from '@/hooks/useEmpresaFilter';
import {
  DEFAULT_ASSISTANT_MODEL,
  type AssistantContext,
  type AssistantLanguage,
  type AssistantModel,
  type AssistantSendRequest,
} from '@/lib/assistant/contracts';
import { IMPERSONATION_CHANGED_EVENT } from '@/lib/impersonate-client';
import { assistantCompanyScope, DOMAIN_PERMISSIONS, pageContext, parseAssistantEvent } from './assistant-helpers';

export interface AssistantConversation {
  id: string;
  title: string;
  companyIds: number[];
  updatedAt: number;
  locked: boolean;
  model: AssistantModel;
  language: AssistantLanguage;
}

function useAssistantState() {
  const pathname = usePathname();
  const { backendUser, hasAccessTo } = useCurrentUser();
  const { empresaActiva, empresasParaFiltro, canAccessAllEmpresas, initialized } = useEmpresaFilter();
  const companyIds = assistantCompanyScope(empresaActiva, canAccessAllEmpresas, empresasParaFiltro);
  const [panelOpen, setPanelOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [model, setModel] = useState<AssistantModel>(DEFAULT_ASSISTANT_MODEL);
  const [language, setLanguage] = useState<AssistantLanguage>('es');
  const [context, setContext] = useState<AssistantContext | null>(null);
  const [sending, setSending] = useState(false);
  const [optimisticText, setOptimisticText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState('');
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const currentId = useRef<string | null>(null);
  const currentRunId = useRef<string | null>(null);
  const cancelMutation = useMutation(api.assistant.cancel);
  const actingUserId = backendUser?.id ?? '';
  const enabled = Boolean(
    backendUser && Object.values(DOMAIN_PERMISSIONS).some((permissions) => permissions.some(hasAccessTo)),
  );
  const scopeKey = `${actingUserId}:${companyIds.join(',')}`;

  const stop = async (activeRunId?: string) => {
    const id = currentId.current;
    const runId = request.current ? currentRunId.current : (activeRunId ?? currentRunId.current);
    try {
      if (id && runId && actingUserId)
        await cancelMutation({
          conversationId: id as Id<'assistantConversations'>,
          runId: runId as Id<'assistantRuns'>,
          expectedActingUserId: actingUserId,
        });
      request.current?.abort();
      setSending(false);
    } catch {
      setError('No se pudo confirmar la detención. Intenta detener de nuevo.');
    }
  };

  useEffect(() => {
    generation.current += 1;
    request.current?.abort();
    request.current = null;
    currentId.current = null;
    currentRunId.current = null;
    setConversationId(null);
    setDraft('');
    setContext(null);
    setOptimisticText(null);
    setError(null);
    setSending(false);
    setLastPrompt('');
  }, [scopeKey]);

  useEffect(() => {
    const reset = () => {
      generation.current += 1;
      request.current?.abort();
      request.current = null;
      currentId.current = null;
      currentRunId.current = null;
      setConversationId(null);
      setDraft('');
      setContext(null);
      setOptimisticText(null);
      setError(null);
      setSending(false);
      setPanelOpen(false);
      setLastPrompt('');
    };
    window.addEventListener(IMPERSONATION_CHANGED_EVENT, reset);
    return () => {
      window.removeEventListener(IMPERSONATION_CHANGED_EVENT, reset);
      generation.current += 1;
      request.current?.abort();
    };
  }, []);

  const newConversation = () => {
    if (sending) return;
    currentId.current = null;
    currentRunId.current = null;
    setConversationId(null);
    setDraft('');
    setError(null);
    setOptimisticText(null);
    setLastPrompt('');
  };

  const selectConversation = (conversation: AssistantConversation) => {
    if (sending) return;
    currentId.current = conversation.id;
    currentRunId.current = null;
    setConversationId(conversation.id);
    setModel(conversation.model);
    setLanguage(conversation.language);
    setError(null);
    setDraft('');
    setOptimisticText(null);
    setContext(null);
    setLastPrompt('');
  };

  const openPanel = () => {
    const next = pageContext(pathname);
    setContext(next && DOMAIN_PERMISSIONS[next.domain].some(hasAccessTo) ? next : null);
    setPanelOpen(true);
  };

  const send = async (override?: string) => {
    const text = (override ?? draft).trim();
    if (!text || request.current || sending || !enabled || !initialized || companyIds.length === 0) return;
    const current = generation.current;
    const controller = new AbortController();
    request.current = controller;
    currentRunId.current = null;
    setError(null);
    setSending(true);
    setOptimisticText(text);
    setLastPrompt(text);
    setDraft('');
    const payload: AssistantSendRequest = {
      text,
      companyId: empresaActiva,
      model,
      language,
      idempotencyKey: crypto.randomUUID(),
      ...(currentId.current ? { conversationId: currentId.current } : {}),
      ...(context ? { context } : {}),
    };
    try {
      const response = await fetch('/api/assistant/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new Error(
          body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
            ? body.error
            : 'No se pudo iniciar la consulta. Intenta de nuevo.',
        );
      }
      if (!response.body) throw new Error('No se recibió la respuesta. Intenta de nuevo.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;
      const handleLine = (line: string) => {
        const event = parseAssistantEvent(line);
        if (!event || current !== generation.current) return;
        if (event.type === 'started' && event.conversationId) {
          currentId.current = event.conversationId;
          currentRunId.current = event.runId ?? null;
          setConversationId(event.conversationId);
        }
        if (event.type === 'error') {
          completed = true;
          setError(event.error ?? 'La consulta no pudo completarse.');
        }
        if (event.type === 'completed') {
          completed = true;
          if (event.status === 'failed') setError('La consulta no pudo completarse. Puedes volver a intentarlo.');
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach(handleLine);
      }
      buffer += decoder.decode();
      if (buffer.trim()) handleLine(buffer);
      if (!completed && current === generation.current)
        setError('La conexión se interrumpió. Revisa la conversación antes de volver a enviar.');
    } catch (failure) {
      if (current === generation.current && !controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : 'No se pudo completar la consulta.');
        if (!currentId.current) setDraft(text);
      }
    } finally {
      if (current === generation.current) {
        request.current = null;
        setSending(false);
      }
    }
  };

  return {
    panelOpen,
    setPanelOpen,
    openPanel,
    conversationId,
    draft,
    setDraft,
    model,
    setModel,
    language,
    setLanguage,
    context,
    setContext,
    sending,
    optimisticText,
    error,
    setError,
    lastPrompt,
    send,
    stop,
    newConversation,
    selectConversation,
    actingUserId,
    enabled,
    companyIds,
    companyId: empresaActiva,
    initialized,
    backendUser,
    hasAccessTo,
  };
}

const AssistantContextState = createContext<ReturnType<typeof useAssistantState> | null>(null);
export function AssistantProvider({ children }: { children: ReactNode }) {
  const value = useAssistantState();
  return <AssistantContextState.Provider value={value}>{children}</AssistantContextState.Provider>;
}
export function useAssistant() {
  const value = useContext(AssistantContextState);
  if (!value) throw new Error('AssistantProvider is required');
  return value;
}
