'use client';

import React, { useState, useRef, useEffect } from 'react';
import { IconSparkles, IconSend, IconMinus, IconCheck, IconAlertCircle, IconLoader2 } from '@tabler/icons-react';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolTraces?: string[];
  isError?: boolean;
};

export interface ChatWidgetProps {
  projectId: string;
  initialIsOpen?: boolean;
}

export function ChatWidget({ projectId, initialIsOpen = false }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(initialIsOpen);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (customText?: string) => {
    const textToSend = (customText || inputValue).trim();
    if (!textToSend || isSubmitting) return;

    const userMsgId = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const assistantMsgId = `ast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const userMessage: ChatMessage = { id: userMsgId, role: 'user', content: textToSend };
    const assistantMessage: ChatMessage = { id: assistantMsgId, role: 'assistant', content: '', toolTraces: [] };

    const newMessages = [...messages, userMessage];
    setMessages([...newMessages, assistantMessage]);
    if (!customText) setInputValue('');
    setIsSubmitting(true);

    try {
      const apiHistory = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, messages: apiHistory }),
      });

      if (!res.ok) {
        let errText = 'Failed to connect to AI assistant.';
        try {
          const errJson = await res.json();
          errText = errJson.error || errText;
        } catch {
          // ignore
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: `[Error: ${errText}]`, isError: true }
              : m
          )
        );
        setIsSubmitting(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setIsSubmitting(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);
            if (event.type === 'tool_call') {
              const label = event.label || event.name;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, toolTraces: [...(m.toolTraces || []), `Checked ${label}`] }
                    : m
                )
              );
            } else if (event.type === 'content') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + event.delta }
                    : m
                )
              );
            } else if (event.type === 'error') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content: m.content ? `${m.content}\n\n[Error: ${event.message}]` : `[Error: ${event.message}]`,
                        isError: true,
                      }
                    : m
                )
              );
            }
          } catch {
            // Ignore partial/malformed lines
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `[Error: ${err.message || 'Connection failed'}]`, isError: true }
            : m
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <aside
      id="ecms-ai-chat-widget"
      data-state={isOpen ? 'expanded' : 'minimized'}
      aria-label="ECMS AI Chat Assistant Widget"
      className="fixed bottom-5 right-5 z-50 font-sans"
    >
      {/* Minimized Floating Pill */}
      <button
        type="button"
        id="chat-widget-pill-trigger"
        onClick={() => setIsOpen(true)}
        style={{ display: isOpen ? 'none' : 'flex' }}
        className="items-center gap-2 px-4 py-2.5 bg-marble hover:bg-canvas text-ink border border-hairline rounded-pill shadow-lg cursor-pointer text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
      >
        <IconSparkles className="w-4 h-4 text-mint animate-pulse" />
        <span>Ask ECMS Assistant…</span>
      </button>

      {/* Expanded Chat Box */}
      <div
        id="chat-widget-expanded-panel"
        style={{ display: isOpen ? 'flex' : 'none' }}
        className="w-[380px] h-[560px] max-w-[calc(100vw-2.5rem)] max-h-[calc(100vh-2.5rem)] flex-col bg-marble border border-hairline rounded-panels shadow-lg overflow-hidden transition-all duration-200"
      >
        {/* Header */}
        <header className="px-4 py-3 border-b border-hairline flex items-center justify-between bg-marble select-none">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-mint-tint text-mint">
              <IconSparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-ink">ECMS Assistant</span>
                <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-mint-tint text-mint border border-mint/20">
                  PM ONLY
                </span>
              </div>
              <p className="text-[11px] text-steel">Project Intelligence</p>
            </div>
          </div>
          <button
            type="button"
            id="chat-widget-minimize-btn"
            onClick={() => setIsOpen(false)}
            title="Minimize"
            aria-label="Minimize Chat Assistant"
            className="p-1.5 hover:bg-canvas rounded-full text-steel hover:text-ink transition-colors cursor-pointer"
          >
            <IconMinus className="w-4 h-4" />
          </button>
        </header>

        {/* Message Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-canvas/30">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-4">
              <div className="w-12 h-12 rounded-full bg-mint-tint flex items-center justify-center text-mint">
                <IconSparkles className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-ink">Ask anything about this project</h4>
                <p className="text-xs text-steel mt-1 max-w-[240px]">
                  Get instant insights on BOQ overrun, IPC payments, procurement status, or workforce.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full pt-2">
                {[
                  'Summarize project progress and value',
                  'Which BOQ items are near overrun (>90%)?',
                  'What is the current IPC status?',
                  'Show top stock materials by value',
                ].map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className="text-left text-xs p-2.5 rounded-lg bg-marble hover:bg-mint-tint border border-hairline hover:border-mint/30 text-ink transition-all cursor-pointer"
                  >
                    💡 {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                {/* Tool Trace Lines */}
                {msg.role === 'assistant' && msg.toolTraces && msg.toolTraces.length > 0 && (
                  <div className="mb-1.5 space-y-1">
                    {msg.toolTraces.map((trace, idx) => (
                      <div
                        key={idx}
                        className="text-[11px] font-mono text-steel bg-marble/80 px-2 py-0.5 rounded border border-hairline/80 flex items-center gap-1.5"
                      >
                        <IconCheck className="w-3 h-3 text-moss" />
                        <span>{trace}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Content Bubble */}
                {msg.role === 'user' ? (
                  <div className="max-w-[85%] bg-mint text-white px-3.5 py-2.5 rounded-2xl rounded-tr-xs text-sm shadow-xs whitespace-pre-wrap">
                    {msg.content}
                  </div>
                ) : (
                  <div
                    className={`max-w-[88%] p-3.5 rounded-2xl rounded-tl-xs text-sm leading-relaxed shadow-xs ${
                      msg.isError
                        ? 'bg-clay-tint text-clay border border-clay/30 flex items-start gap-2'
                        : 'bg-marble border border-hairline text-ink whitespace-pre-wrap'
                    }`}
                  >
                    {msg.isError && <IconAlertCircle className="w-4 h-4 text-clay shrink-0 mt-0.5" />}
                    <div>
                      {msg.content}
                      {/* Typing / Thinking Indicator */}
                      {!msg.content && isSubmitting && (
                        <div className="flex items-center gap-2 text-xs text-steel">
                          <IconLoader2 className="w-4 h-4 animate-spin text-mint" />
                          <span>Assistant is thinking…</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Footer */}
        <footer className="p-3 border-t border-hairline bg-marble">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              id="chat-widget-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
              placeholder={isSubmitting ? 'Response in progress…' : 'Ask about BOQ, IPC, stock...'}
              className="flex-1 bg-canvas border border-hairline rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ash focus:outline-none focus:border-mint transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              id="chat-widget-send-btn"
              disabled={isSubmitting || !inputValue.trim()}
              aria-label="Send Message"
              className="p-2 bg-mint hover:bg-mint/90 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <IconLoader2 className="w-4 h-4 animate-spin" />
              ) : (
                <IconSend className="w-4 h-4" />
              )}
            </button>
          </form>
        </footer>
      </div>
    </aside>
  );
}

export default ChatWidget;
