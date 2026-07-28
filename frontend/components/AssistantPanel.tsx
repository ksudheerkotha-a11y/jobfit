"use client";

import { useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { SparkleIcon } from "@/components/icons";

type ChatMessage = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  {
    title: "Why are my recommendations off?",
    subtitle: "Diagnose your feed and fix what's skewing it",
    prompt: "Why are my recommendations off? What's skewing my matches?",
  },
  {
    title: "Apply to my top matches",
    subtitle: "Have the assistant pick your best fits and apply",
    prompt: "Which of my matches should I apply to first, and how do I do it?",
  },
  {
    title: "Where are my applications?",
    subtitle: "Check the status of everything you've applied to",
    prompt: "Where do things stand with my applications?",
  },
];

/** Grounded in the caller's real match/application/resume data — see
 * /api/assistant/chat. Never applies to anything on its own; that's a
 * standing rule across the app, and the assistant is instructed to say so
 * if asked. Chat history is ephemeral (component state only) — there's no
 * chat_messages table, since nothing here needs to persist across visits
 * yet. */
export function AssistantPanel({ session, onClose }: { session: Session; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessages((prev) => [...prev, { role: "assistant", text: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      requestAnimationFrame(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }));
    }
  }

  return (
    <div className="assistant-panel">
      <div className="assistant-panel-header">
        <button type="button" className="ghost" onClick={() => setMessages([])}>
          + New chat
        </button>
        <button type="button" className="ghost icon-btn" onClick={onClose} aria-label="Close assistant">
          ✕
        </button>
      </div>

      {messages.length === 0 ? (
        <div className="assistant-panel-intro">
          <p className="assistant-panel-title">
            <SparkleIcon size={16} /> jobfit Assistant
          </p>
          <p className="hint">
            Ask me anything about your job search: tune your feed, understand your applications, or learn how jobfit
            works. I only ever look at your own data, and I never apply to anything for you.
          </p>
          <div className="assistant-suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s.title} type="button" className="assistant-suggestion-card" onClick={() => send(s.prompt)}>
                <span className="assistant-suggestion-title">{s.title}</span>
                <span className="hint">{s.subtitle}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="assistant-thread" ref={threadRef}>
          {messages.map((m, i) => (
            <div key={i} className={`assistant-bubble assistant-bubble-${m.role}`}>
              {m.text}
            </div>
          ))}
          {loading && <div className="assistant-bubble assistant-bubble-assistant">Thinking...</div>}
          {error && <p className="error">{error}</p>}
        </div>
      )}

      <form
        className="assistant-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your feed, applications, or anything..."
          className="control-input assistant-input"
        />
        <button type="submit" className="primary assistant-send" disabled={loading || !input.trim()} aria-label="Send">
          ↑
        </button>
      </form>
    </div>
  );
}
