import type { Metadata } from 'next';
import { AssistantWorkspace } from '@/components/assistant/assistant-workspace';

export const metadata: Metadata = { title: 'Asistente | Lab Trxckin' };

export default function AssistantPage() {
  return <AssistantWorkspace />;
}
