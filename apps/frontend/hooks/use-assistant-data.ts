'use client';

import { useUIMessages } from '@convex-dev/agent/react';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useAssistant } from '@/components/assistant/assistant-provider';

export function useAssistantData() {
  const assistant = useAssistant();
  const expectedActingUserId = assistant.actingUserId;
  const ready = assistant.enabled && assistant.initialized && assistant.companyIds.length > 0;
  const history = usePaginatedQuery(
    api.assistant.listConversations,
    ready ? { expectedActingUserId, companyIds: assistant.companyIds } : 'skip',
    { initialNumItems: 20 },
  );
  const args =
    ready && assistant.conversationId
      ? { conversationId: assistant.conversationId as Id<'assistantConversations'>, expectedActingUserId }
      : null;
  const conversation = useQuery(api.assistant.getConversation, args ?? 'skip');
  const messages = useUIMessages(
    api.assistant.listMessages,
    args && conversation?.threadId && !conversation.locked ? { ...args, threadId: conversation.threadId } : 'skip',
    { initialNumItems: 20, stream: true },
  );
  const rename = useMutation(api.assistant.renameConversation);
  const remove = useMutation(api.assistant.deleteConversation);
  return {
    ...assistant,
    conversations: history.status === 'LoadingFirstPage' ? undefined : history.results,
    conversationsStatus: history.status,
    loadMoreConversations: () => history.loadMore(20),
    conversation,
    messages,
    rename: (id: string, title: string) =>
      rename({ conversationId: id as Id<'assistantConversations'>, expectedActingUserId, title }),
    remove: (id: string) => remove({ conversationId: id as Id<'assistantConversations'>, expectedActingUserId }),
  };
}
