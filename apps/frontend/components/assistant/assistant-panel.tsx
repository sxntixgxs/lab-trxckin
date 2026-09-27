'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, MessageSquare, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAssistant } from './assistant-provider';
import './assistant.css';

const Workspace = dynamic(() => import('./assistant-workspace').then((module) => module.AssistantWorkspace), {
  loading: () => (
    <div className="assistant-workspace-loading">
      <div className="assistant-skeleton" />
      <span className="sr-only">Cargando asistente</span>
    </div>
  ),
});

export function AssistantTrigger() {
  const assistant = useAssistant();
  const pathname = usePathname();
  if (!assistant.enabled || pathname === '/assistant') return null;
  return (
    <button
      type="button"
      className="assistant-trigger"
      onClick={assistant.openPanel}
      aria-label="Abrir asistente"
      title="Abrir asistente"
    >
      <MessageSquare size={17} />
      <span>Asistente</span>
    </button>
  );
}

export function AssistantPanel() {
  const assistant = useAssistant();
  const pathname = usePathname();
  const open = assistant.panelOpen && pathname !== '/assistant' && assistant.enabled;
  return (
    <Dialog.Root open={open} onOpenChange={assistant.setPanelOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="assistant-panel-overlay" />
        <Dialog.Content className="assistant-scope assistant-panel" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Asistente de Lab Trxckin</Dialog.Title>
          <div className="assistant-panel-bar">
            <Link href="/assistant" onClick={() => assistant.setPanelOpen(false)}>
              Abrir espacio completo
              <ArrowUpRight size={14} />
            </Link>
            <Dialog.Close className="assistant-icon-button" aria-label="Cerrar asistente">
              <X size={19} />
            </Dialog.Close>
          </div>
          {open && <Workspace compact />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
