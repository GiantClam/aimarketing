import { useEffect, useMemo } from "react";
import { Chat, useChat } from "@ai-sdk/react";
import type { ChatTransport } from "ai";
import type { DesktopUIMessage } from "@aimarketing/workbench-client";

export type DesktopChatHookOptions = {
  readonly chatId: string | null;
  readonly transport: ChatTransport<DesktopUIMessage>;
  readonly initialMessages?: readonly DesktopUIMessage[];
  readonly resume?: boolean;
};

/** Keeps the AI SDK chat state stable while the desktop route changes around it. */
export function useDesktopChat({ chatId, transport, initialMessages = [], resume = true }: DesktopChatHookOptions) {
  const resolvedChatId = useMemo(() => chatId ?? `desktop-draft-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`, [chatId]);
  const stableMessages = useMemo(() => [...initialMessages], [initialMessages]);
  const chat = useMemo(() => new Chat<DesktopUIMessage>({
    id: resolvedChatId,
    transport,
    messages: stableMessages,
  }), [resolvedChatId, stableMessages, transport]);
  const helpers = useChat<DesktopUIMessage>({ chat, resume: resume && Boolean(chatId) });

  useEffect(() => {
    if (stableMessages.length) helpers.setMessages(stableMessages);
  }, [helpers.setMessages, stableMessages]);

  return { ...helpers, chatId: resolvedChatId };
}
