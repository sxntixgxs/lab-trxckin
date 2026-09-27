'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Building2,
  Check,
  FileText,
  History,
  Info,
  LockKeyhole,
  MessageSquare,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Square,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAssistantData } from '@/hooks/use-assistant-data';
import { useVoiceDictation } from '@/hooks/use-voice-dictation';
import {
  ASSISTANT_DOMAIN_LABELS,
  ASSISTANT_LIMITS,
  ASSISTANT_MODELS,
  type AssistantDomain,
  type AssistantLanguage,
  type AssistantModel,
  type AssistantToolResult,
} from '@/lib/assistant/contracts';
import { EMPRESAS_MAP } from '@/lib/empresas';
import { useAssistant, type AssistantConversation } from './assistant-provider';
import { allowsChart, companyLabel, DOMAIN_PERMISSIONS } from './assistant-helpers';
import { AssistantMessage } from './assistant-message';
import { AssistantResults, RecordCard } from './assistant-results';
import './assistant.css';

type Data = ReturnType<typeof useAssistantData>;
const STARTERS: Array<{ domain: AssistantDomain; label: string; prompt: string }> = [
  {
    domain: 'billing',
    label: 'Revisar facturas pendientes',
    prompt: 'Muéstrame las facturas pendientes y quién tiene asignado el siguiente paso.',
  },
  {
    domain: 'advances',
    label: 'Consultar anticipos por legalizar',
    prompt: '¿Qué anticipos tengo pendientes de legalizar? Incluye su estado y fecha límite.',
  },
  {
    domain: 'suppliers',
    label: 'Entender el registro de proveedores',
    prompt: 'Explícame las etapas para registrar un proveedor y qué se necesita en cada paso.',
  },
  {
    domain: 'customers',
    label: 'Consultar el proceso de clientes',
    prompt: '¿Cómo puedo revisar el estado de inscripción de un cliente y su registro en el ERP?',
  },
  {
    domain: 'pettyCash',
    label: 'Revisar mis cajas menores',
    prompt: 'Muéstrame las cajas menores a las que tengo acceso, sus saldos y los reembolsos pendientes.',
  },
];

class AssistantErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(previous: { resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (this.state.failed)
      return (
        <div className="assistant-scope assistant-unavailable">
          <MessageSquare size={30} />
          <h2>No se pudo cargar el asistente</h2>
          <p>La conexión o tus permisos pueden haber cambiado. Vuelve a cargar para intentarlo de nuevo.</p>
          <button className="assistant-primary" onClick={() => this.setState({ failed: false })}>
            Volver a intentar
          </button>
        </div>
      );
    return this.props.children;
  }
}

export function AssistantWorkspace({ compact = false }: { compact?: boolean }) {
  const assistant = useAssistant();
  return (
    <AssistantErrorBoundary resetKey={`${assistant.actingUserId}:${assistant.companyIds.join(',')}`}>
      <WorkspaceBody compact={compact} />
    </AssistantErrorBoundary>
  );
}

function WorkspaceBody({ compact }: { compact: boolean }) {
  const data = useAssistantData();
  return <AssistantWorkspaceView data={data} compact={compact} />;
}

export function AssistantWorkspaceView({ data, compact = false }: { data: Data; compact?: boolean }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const historyRegion = useRef<HTMLElement>(null);
  const historyRestore = useRef<HTMLButtonElement>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceCollapsed, setEvidenceCollapsed] = useState(false);
  const evidenceRegion = useRef<HTMLElement>(null);
  const evidenceRestore = useRef<HTMLButtonElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [showScroll, setShowScroll] = useState(false);
  const runStatus = data.conversation?.run?.status;
  const busy = data.sending || runStatus === 'running' || runStatus === 'waiting_erp';
  const locked = data.conversation?.locked === true;
  const messages = locked ? [] : data.messages.results;
  const optimistic =
    data.optimisticText && !messages.some((message) => message.role === 'user' && message.text === data.optimisticText);
  const hasMessages = messages.length > 0 || Boolean(optimistic && data.sending);
  const evidence = locked ? [] : (data.conversation?.evidence ?? []);
  const sourceCount = new Set(
    evidence.flatMap((result) =>
      result.records.map((record) => `${record.companyId}:${record.recordType}:${record.id}`),
    ),
  ).size;
  const scopeLabel = companyLabel(data.conversation?.companyIds ?? data.companyIds, EMPRESAS_MAP);
  const lastMessage = messages[messages.length - 1];
  const retryPrompt =
    data.lastPrompt || (runStatus === 'failed' ? messages.findLast((message) => message.role === 'user')?.text : '');

  useEffect(() => {
    if (follow.current && feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [lastMessage?.text, messages.length, data.sending]);
  useEffect(() => {
    follow.current = true;
    setShowScroll(false);
  }, [data.conversationId]);

  if (!data.backendUser || !data.initialized)
    return (
      <div className="assistant-scope assistant-workspace-loading">
        <div className="assistant-skeleton" />
        <div className="assistant-skeleton" />
        <div className="assistant-skeleton" />
        <span className="sr-only">Cargando asistente</span>
      </div>
    );
  if (!data.enabled)
    return (
      <div className="assistant-scope assistant-unavailable">
        <LockKeyhole size={30} />
        <h2>El asistente necesita acceso a un módulo</h2>
        <p>
          Cuando tengas permisos para facturación, proveedores, clientes, anticipos o cajas menores, podrás consultar su
          información aquí.
        </p>
      </div>
    );

  return (
    <div
      className={`assistant-scope assistant-workspace${compact ? ' is-compact' : ''}${historyCollapsed && !compact ? ' is-history-collapsed' : ''}${evidenceCollapsed && !compact ? ' is-evidence-collapsed' : ''}`}
    >
      {!compact && (
        <aside
          ref={historyRegion}
          tabIndex={-1}
          id="assistant-history-region"
          className="assistant-history-desktop"
          hidden={historyCollapsed}
        >
          <ConversationHistory
            data={data}
            busy={busy}
            onCollapse={() => {
              setHistoryCollapsed(true);
              requestAnimationFrame(() => historyRestore.current?.focus());
            }}
          />
        </aside>
      )}
      <section className="assistant-conversation" aria-label="Conversación con el asistente">
        <header className="assistant-workspace-header">
          <div className="assistant-workspace-title">
            <span className="assistant-brand-mark">
              <MessageSquare size={18} />
            </span>
            <div>
              <h1>{compact ? 'Asistente' : (data.conversation?.title ?? 'Asistente')}</h1>
              <span>
                <i />
                {scopeLabel}
                <span className="assistant-fixed-label"> · empresa fija</span>
              </span>
            </div>
          </div>
          <div className="assistant-header-actions">
            {historyCollapsed && !compact && (
              <button
                ref={historyRestore}
                className="assistant-icon-button assistant-history-restore"
                aria-label="Mostrar historial"
                title="Mostrar historial"
                aria-controls="assistant-history-region"
                aria-expanded={false}
                onClick={() => {
                  setHistoryCollapsed(false);
                  requestAnimationFrame(() => historyRegion.current?.focus());
                }}
              >
                <PanelLeftOpen size={18} />
              </button>
            )}
            <button
              className="assistant-icon-button assistant-history-toggle"
              aria-label="Ver conversaciones"
              title="Conversaciones"
              onClick={() => setHistoryOpen(true)}
            >
              <History size={18} />
            </button>
            <button
              className="assistant-icon-button"
              aria-label="Nueva conversación"
              title="Nueva conversación"
              disabled={busy}
              onClick={data.newConversation}
            >
              <Plus size={19} />
            </button>
            {evidenceCollapsed && !compact && (
              <button
                ref={evidenceRestore}
                className="assistant-icon-button assistant-evidence-restore"
                aria-label="Mostrar fuentes"
                title="Mostrar fuentes"
                aria-controls="assistant-evidence-region"
                aria-expanded={false}
                onClick={() => {
                  setEvidenceCollapsed(false);
                  requestAnimationFrame(() => evidenceRegion.current?.focus());
                }}
              >
                <PanelRightOpen size={18} />
              </button>
            )}
            <button
              className="assistant-icon-button assistant-evidence-toggle"
              aria-label={`Ver fuentes, ${sourceCount} registros`}
              title="Fuentes consultadas"
              onClick={() => setEvidenceOpen(true)}
            >
              <PanelRight size={18} />
            </button>
          </div>
        </header>
        {data.backendUser.isImpersonating && (
          <div className="assistant-acting">
            <ShieldCheck size={14} />
            Actuando como {data.backendUser.nombre}. Esta conversación está separada de tu historial.
          </div>
        )}
        <div
          className="assistant-feed"
          ref={feed}
          onScroll={() => {
            const node = feed.current;
            if (node) {
              follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
              setShowScroll(!follow.current);
            }
          }}
        >
          {locked ? (
            <div className="assistant-locked">
              <LockKeyhole size={26} />
              <h2>Esta conversación está protegida</h2>
              <p>
                Tus permisos cambiaron y alguna de sus fuentes ya no está disponible. El historial se conserva hasta que
                lo elimines.
              </p>
              <button className="assistant-primary" disabled={busy} onClick={data.newConversation}>
                Empezar una nueva conversación
              </button>
            </div>
          ) : !hasMessages && !data.conversationId ? (
            <Welcome data={data} />
          ) : (
            <div className="assistant-message-list">
              {data.messages.status === 'CanLoadMore' && (
                <button
                  className="assistant-load-more"
                  onClick={() => {
                    follow.current = false;
                    data.messages.loadMore(20);
                  }}
                >
                  Cargar mensajes anteriores
                </button>
              )}
              {data.messages.status === 'LoadingFirstPage' && (
                <div className="assistant-message-loading">
                  <div className="assistant-skeleton" />
                  <div className="assistant-skeleton" />
                  <div className="assistant-skeleton" />
                </div>
              )}
              {messages.map((message, index) => {
                const previousPrompt =
                  messages.slice(0, index + 1).findLast((item) => item.role === 'user')?.text ?? '';
                return (
                  <AssistantMessage
                    key={message.key ?? message.id}
                    message={message}
                    references={evidence.flatMap((result) => result.records)}
                    allowChart={allowsChart(previousPrompt)}
                    runActive={busy}
                  />
                );
              })}
              {optimistic && data.sending && (
                <article className="assistant-message is-user">
                  <p className="assistant-user-text">{data.optimisticText}</p>
                </article>
              )}
              {busy && (
                <div className="assistant-run-progress" role="status">
                  <span className="assistant-progress-dot" />
                  {runStatus === 'waiting_erp'
                    ? 'Consultando el catálogo ERP…'
                    : 'El asistente está preparando tu respuesta…'}
                </div>
              )}
              {runStatus === 'cancelled' && !busy && (
                <p className="assistant-stopped" role="status">
                  Respuesta detenida. Puedes continuar la conversación.
                </p>
              )}
            </div>
          )}
        </div>
        {showScroll && (
          <button
            className="assistant-jump"
            aria-label="Ir al último mensaje"
            onClick={() => {
              follow.current = true;
              feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' });
            }}
          >
            <ArrowDown size={17} />
            Último mensaje
          </button>
        )}
        {(data.error || (runStatus === 'failed' && data.conversation?.run?.error)) && (
          <div className="assistant-error" role="alert">
            <Info size={16} />
            <span>{data.error ?? data.conversation?.run?.error}</span>
            {retryPrompt && !busy && !locked && <button onClick={() => void data.send(retryPrompt)}>Reintentar</button>}
          </div>
        )}
        <Composer data={data} busy={busy} locked={locked} />
      </section>
      {!compact && (
        <aside
          ref={evidenceRegion}
          tabIndex={-1}
          id="assistant-evidence-region"
          className="assistant-evidence-desktop"
          hidden={evidenceCollapsed}
        >
          <Evidence
            data={data}
            onCollapse={() => {
              setEvidenceCollapsed(true);
              requestAnimationFrame(() => evidenceRestore.current?.focus());
            }}
          />
        </aside>
      )}
      <Drawer open={historyOpen} onOpenChange={setHistoryOpen} title="Conversaciones" side="left">
        <ConversationHistory data={data} busy={busy} onSelect={() => setHistoryOpen(false)} />
      </Drawer>
      <Drawer open={evidenceOpen} onOpenChange={setEvidenceOpen} title="Fuentes consultadas" side="right">
        <Evidence data={data} />
      </Drawer>
    </div>
  );
}

function Welcome({ data }: { data: Data }) {
  const starters = STARTERS.filter((starter) => DOMAIN_PERMISSIONS[starter.domain].some(data.hasAccessTo));
  return (
    <div className="assistant-welcome">
      <div className="assistant-welcome-mark">
        <MessageSquare size={27} strokeWidth={1.6} />
      </div>
      <h2>¿Qué necesitas resolver?</h2>
      <p>
        Consulta tu operación, encuentra un registro o entiende el siguiente paso. Todo, con la información a la que
        tienes acceso.
      </p>
      <div className="assistant-starters">
        {starters.map((starter) => (
          <button key={starter.domain} onClick={() => data.setDraft(starter.prompt)}>
            <span>
              {starter.domain === 'billing' ? (
                <FileText size={18} />
              ) : starter.domain === 'advances' || starter.domain === 'pettyCash' ? (
                <Wallet size={18} />
              ) : (
                <Search size={18} />
              )}
            </span>
            <span>
              <strong>{starter.label}</strong>
              <small>{ASSISTANT_DOMAIN_LABELS[starter.domain]}</small>
            </span>
            <ArrowUpRight size={17} />
          </button>
        ))}
      </div>
      <p className="assistant-welcome-footnote">
        <ShieldCheck size={14} />
        Solo consulta. Tus registros se mantienen como están.
      </p>
    </div>
  );
}

function Composer({ data, busy, locked }: { data: Data; busy: boolean; locked: boolean }) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const voice = useVoiceDictation((text) => data.setDraft((draft) => `${draft}${draft.trim() ? ' ' : ''}${text}`));
  const recording = voice.state === 'recording';
  const voiceBusy = voice.state !== 'idle';
  useEffect(() => {
    const node = textarea.current;
    if (node) {
      node.style.height = 'auto';
      node.style.height = `${Math.min(node.scrollHeight, 180)}px`;
    }
  }, [data.draft]);
  useEffect(() => {
    voice.cancel(); /* A recording must never cross actors, companies, or conversations. */
  }, [data.actingUserId, data.companyIds.join(','), data.conversationId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="assistant-compose-region">
      {data.context && (
        <div className="assistant-context-chip">
          <FileText size={13} />
          <span>Contexto: {data.context.label}</span>
          <button aria-label="Quitar contexto de página" onClick={() => data.setContext(null)}>
            <X size={13} />
          </button>
        </div>
      )}
      {voice.error && (
        <div className="assistant-error" role="alert">
          <Info size={15} />
          <span>{voice.error}</span>
        </div>
      )}
      <form
        className={`assistant-composer${recording ? ' is-recording' : ''}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (!voiceBusy && !busy) void data.send();
        }}
      >
        <label className="sr-only" htmlFor="assistant-prompt">
          Tu consulta
        </label>
        <textarea
          id="assistant-prompt"
          ref={textarea}
          rows={2}
          value={data.draft}
          maxLength={ASSISTANT_LIMITS.promptCharacters}
          onChange={(event) => data.setDraft(event.target.value)}
          placeholder={
            locked
              ? 'Empieza una nueva conversación para consultar'
              : 'Pregunta por una factura, un proveedor, un anticipo…'
          }
          disabled={locked || busy || voiceBusy}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!busy && !voiceBusy) void data.send();
            }
          }}
        />
        {voiceBusy && (
          <div className="assistant-voice-status" role="status">
            {recording ? (
              <>
                <span className="assistant-recording-dot" />
                Grabando {Math.floor(voice.seconds / 60)}:{String(voice.seconds % 60).padStart(2, '0')} / 2:00
                <button type="button" onClick={voice.stop}>
                  Transcribir
                </button>
              </>
            ) : voice.state === 'requesting' ? (
              'Esperando permiso del micrófono…'
            ) : (
              'Transcribiendo tu audio…'
            )}
            <button type="button" onClick={voice.cancel}>
              Cancelar
            </button>
          </div>
        )}
        <div className="assistant-composer-toolbar">
          <div className="assistant-model-controls">
            <label>
              <span className="sr-only">Modelo de respuesta</span>
              <select
                value={data.model}
                disabled={busy}
                onChange={(event) => data.setModel(event.target.value as AssistantModel)}
              >
                {ASSISTANT_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Idioma de respuesta</span>
              <select
                value={data.language}
                disabled={busy}
                onChange={(event) => data.setLanguage(event.target.value as AssistantLanguage)}
              >
                <option value="es">ES</option>
                <option value="en">EN</option>
              </select>
            </label>
          </div>
          <div className="assistant-send-controls">
            {data.draft.length > 11_000 && <span className="assistant-character-count">{data.draft.length}/12000</span>}
            <button
              type="button"
              className="assistant-icon-button"
              aria-label={recording ? 'Terminar dictado' : 'Dictar consulta'}
              title={
                voice.supported
                  ? 'Dictar consulta (máximo 2 minutos)'
                  : 'El dictado no está disponible en este navegador'
              }
              disabled={!voice.supported || busy || locked || (voiceBusy && !recording)}
              onClick={() => (recording ? voice.stop() : void voice.start())}
            >
              {recording ? <Square size={16} /> : <Mic size={18} />}
            </button>
            {busy ? (
              <button
                type="button"
                className="assistant-send-button"
                onClick={() => void data.stop(data.conversation?.run?.id)}
                aria-label="Detener respuesta"
                title="Detener respuesta"
              >
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                className="assistant-send-button"
                aria-label="Enviar consulta"
                title="Enviar consulta"
                disabled={!data.draft.trim() || voiceBusy || locked || data.companyIds.length === 0}
              >
                <ArrowUp size={20} />
              </button>
            )}
          </div>
        </div>
      </form>
      <p className="assistant-composer-note">
        <span className="assistant-demo-notice">Datos de demostración; empresas y registros ficticios.</span>
        Revisa la respuesta y sus fuentes antes de tomar una decisión.
        {voiceBusy && ' El dictado se añadirá al borrador; no se envía automáticamente.'}
      </p>
    </div>
  );
}

function ConversationHistory({
  data,
  busy,
  onSelect,
  onCollapse,
}: {
  data: Data;
  busy: boolean;
  onSelect?: () => void;
  onCollapse?: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const saveTitle = async () => {
    if (!editing || !title.trim()) return;
    setSaving(true);
    setActionError(null);
    try {
      await data.rename(editing, title.trim());
      setEditing(null);
    } catch {
      setActionError('No se pudo cambiar el nombre de la conversación.');
    } finally {
      setSaving(false);
    }
  };
  const deleteConversation = async () => {
    if (!deleting) return;
    setSaving(true);
    setActionError(null);
    try {
      await data.remove(deleting);
      if (deleting === data.conversationId) data.newConversation();
      setDeleting(null);
    } catch {
      setActionError('No se pudo eliminar la conversación. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };
  const rows = data.conversations?.filter((conversation) =>
    conversation.title.toLocaleLowerCase('es').includes(filter.toLocaleLowerCase('es')),
  );
  const hasMoreHistory = data.conversationsStatus === 'CanLoadMore' || data.conversationsStatus === 'LoadingMore';
  return (
    <div className="assistant-history">
      <div className="assistant-history-heading">
        <strong>Conversaciones</strong>
        <div className="assistant-history-heading-actions">
          <span>{data.conversations ? `${data.conversations.length} cargadas` : ''}</span>
          {onCollapse && (
            <button
              className="assistant-icon-button"
              aria-label="Ocultar historial"
              title="Ocultar historial"
              aria-controls="assistant-history-region"
              aria-expanded={true}
              onClick={onCollapse}
            >
              <PanelLeftClose size={17} />
            </button>
          )}
        </div>
      </div>
      <button
        className="assistant-new-button"
        disabled={busy}
        onClick={() => {
          data.newConversation();
          onSelect?.();
        }}
      >
        <Plus size={17} />
        Nueva conversación
      </button>
      <label className="assistant-history-search">
        <Search size={15} />
        <input
          aria-label="Buscar conversación"
          placeholder="Buscar en el historial"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </label>
      {actionError && !deleting && (
        <p className="assistant-inline-error" role="alert">
          {actionError}
        </p>
      )}
      <div className="assistant-history-list">
        {rows === undefined ? (
          <>
            <div className="assistant-skeleton" />
            <div className="assistant-skeleton" />
          </>
        ) : rows.length === 0 ? (
          <div className="assistant-history-empty">
            <History size={22} />
            <p>
              {filter
                ? 'No hay conversaciones cargadas con ese nombre.'
                : hasMoreHistory
                  ? 'No hay conversaciones de esta empresa en esta parte del historial.'
                  : 'Tus consultas empiezan aquí.'}
            </p>
            <span>
              {hasMoreHistory
                ? 'Carga las conversaciones anteriores para seguir buscando.'
                : !filter && 'Se guardarán en este historial para que puedas retomarlas.'}
            </span>
          </div>
        ) : (
          rows.map((conversation) => (
            <div
              className={`assistant-history-item${conversation.id === data.conversationId ? ' is-selected' : ''}`}
              key={conversation.id}
            >
              {editing === conversation.id ? (
                <form
                  className="assistant-rename"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveTitle();
                  }}
                >
                  <input
                    autoFocus
                    aria-label="Nombre de conversación"
                    value={title}
                    maxLength={100}
                    onChange={(event) => setTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditing(null);
                    }}
                  />
                  <button type="submit" aria-label="Guardar nombre" disabled={saving || !title.trim()}>
                    <Check size={15} />
                  </button>
                  <button type="button" aria-label="Cancelar cambio de nombre" onClick={() => setEditing(null)}>
                    <X size={15} />
                  </button>
                </form>
              ) : (
                <>
                  <button
                    className="assistant-history-select"
                    disabled={busy}
                    onClick={() => {
                      data.selectConversation(conversation as AssistantConversation);
                      onSelect?.();
                    }}
                  >
                    {conversation.locked ? <LockKeyhole size={14} /> : <MessageSquare size={14} />}
                    <span>
                      <strong>{conversation.title}</strong>
                      <small>
                        {new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(
                          conversation.updatedAt,
                        )}
                      </small>
                    </span>
                  </button>
                  <div className="assistant-history-item-actions">
                    <button
                      aria-label={`Renombrar ${conversation.title}`}
                      title="Renombrar"
                      disabled={busy}
                      onClick={() => {
                        setActionError(null);
                        setEditing(conversation.id);
                        setTitle(conversation.title);
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      aria-label={`Eliminar ${conversation.title}`}
                      title="Eliminar"
                      disabled={busy}
                      onClick={() => {
                        setActionError(null);
                        setDeleting(conversation.id);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
        {hasMoreHistory && (
          <button
            className="assistant-load-more"
            disabled={data.conversationsStatus === 'LoadingMore'}
            onClick={data.loadMoreConversations}
          >
            {data.conversationsStatus === 'LoadingMore'
              ? 'Cargando conversaciones…'
              : 'Cargar conversaciones anteriores'}
          </button>
        )}
      </div>
      <div className="assistant-history-privacy">
        <LockKeyhole size={15} />
        <span>
          Historial privado
          <br />
          <small>Se conserva hasta que lo elimines.</small>
        </span>
      </div>
      <Dialog.Root
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !saving) setDeleting(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="assistant-dialog-overlay" />
          <Dialog.Content className="assistant-scope assistant-delete-dialog">
            <Dialog.Title>¿Eliminar esta conversación?</Dialog.Title>
            <Dialog.Description>
              Se eliminarán sus mensajes y resultados guardados. Esta acción no se puede deshacer.
            </Dialog.Description>
            {actionError && (
              <p className="assistant-inline-error" role="alert">
                {actionError}
              </p>
            )}
            <div>
              <button className="assistant-secondary" disabled={saving} onClick={() => setDeleting(null)}>
                Conservar
              </button>
              <button className="assistant-destructive" disabled={saving} onClick={() => void deleteConversation()}>
                {saving ? 'Eliminando…' : 'Eliminar conversación'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function Evidence({ data, onCollapse }: { data: Data; onCollapse?: () => void }) {
  const results = data.conversation?.locked ? [] : (data.conversation?.evidence ?? []);
  const datasets = results.filter((result) => result.rows.length > 0 || result.chart || result.guide);
  const records = [
    ...new Map(
      results
        .flatMap((result) => result.records)
        .map((record) => [`${record.companyId}:${record.recordType}:${record.id}`, record]),
    ).values(),
  ];
  return (
    <div className="assistant-evidence">
      <div className="assistant-evidence-heading">
        <strong>Fuentes consultadas</strong>
        <div className="assistant-evidence-heading-actions">
          <span>{records.length}</span>
          {onCollapse && (
            <button
              className="assistant-icon-button"
              aria-label="Ocultar fuentes"
              title="Ocultar fuentes"
              aria-controls="assistant-evidence-region"
              aria-expanded={true}
              onClick={onCollapse}
            >
              <PanelRightClose size={17} />
            </button>
          )}
        </div>
      </div>
      <p className="assistant-evidence-intro">De la respuesta al registro original.</p>
      {records.length ? (
        <div className="assistant-evidence-records">
          {records.map((record) => (
            <RecordCard key={`${record.companyId}:${record.recordType}:${record.id}`} record={record} compact />
          ))}
        </div>
      ) : !datasets.length ? (
        <div className="assistant-evidence-empty">
          <FileText size={28} strokeWidth={1.4} />
          <p>Los registros aparecerán aquí</p>
          <span>Cuando el asistente consulte información, podrás abrir sus fuentes y verificar el detalle.</span>
        </div>
      ) : null}
      {datasets.length > 0 && (
        <section className="assistant-evidence-datasets" aria-label="Datos de las fuentes">
          <h2>Datos consultados</h2>
          {datasets.map((result, index) => (
            <EvidenceDataset key={result.toolCallId ?? index} result={result} />
          ))}
        </section>
      )}
      <div className="assistant-scope-info">
        <Building2 size={17} />
        <div>
          <strong>{companyLabel(data.conversation?.companyIds ?? data.companyIds, EMPRESAS_MAP)}</strong>
          <p>El alcance de empresa se mantiene durante toda la conversación.</p>
        </div>
      </div>
      <div className="assistant-evidence-help">
        <ShieldCheck size={18} />
        <p>
          Solo se consulta información disponible para tu usuario. El asistente no aprueba, modifica ni elimina
          registros.
        </p>
      </div>
    </div>
  );
}

function EvidenceDataset({ result }: { result: AssistantToolResult }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="assistant-evidence-dataset" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        {result.title}
        <span>
          {result.chart ? 'Gráfico y datos' : result.guide ? 'Guía del proceso' : `${result.rows.length} filas`}
        </span>
      </summary>
      {open && <AssistantResults result={result} allowChart={Boolean(result.chart)} showRecords={false} />}
    </details>
  );
}

function Drawer({
  open,
  onOpenChange,
  title,
  side,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  side: 'left' | 'right';
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="assistant-dialog-overlay" />
        <Dialog.Content className={`assistant-scope assistant-inner-drawer is-${side}`} aria-describedby={undefined}>
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Dialog.Close className="assistant-icon-button assistant-drawer-close" aria-label="Cerrar panel">
            <X size={19} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
