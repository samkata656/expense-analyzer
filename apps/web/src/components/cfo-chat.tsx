"use client";
import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { messageFor } from "@/lib/errors";
import { IdentityCard } from "./identity-card";
import { Alert, Button, Card, Eyebrow, H2 } from "./ui";
import { useIdentity } from "./use-identity";

type Msg = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "Колко са общите разходи този месец?",
  "Кои разходи чакат ръчен преглед?",
  "Покажи отказаните разходи и причините.",
  "Колко е похарчил Иван Петров (EMP-001)?",
];

/** Renders the model's **bold** markers as <strong> without ever injecting HTML. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

function newSessionId() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function CfoChat() {
  const id = useIdentity("techcorp.cfo", { requireCfo: true });
  const verified = id.state === "verified";
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- random id must be created client-side
    setSessionId(newSessionId());
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", text: message }]);
    setBusy(true);
    try {
      const res = await fetch("/api/cfo/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...id.value, message, sessionId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        setError(body.message ?? messageFor(body.code));
        return;
      }
      setMessages((m) => [...m, { role: "assistant", text: body.reply || "—" }]);
    } catch {
      setError(messageFor("UPSTREAM_ERROR"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <IdentityCard id={id} eyebrow="Достъп" title="Финансов директор" />
      <Card className={verified ? "" : "opacity-60"}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <Eyebrow>AI асистент</Eyebrow>
            <H2>Попитайте за разходите</H2>
          </div>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => {
                setMessages([]);
                setSessionId(newSessionId());
              }}
            >
              Нов разговор
            </Button>
          )}
        </div>

        {!verified && <p className="text-sm text-c300">Въведете имената и ID номера на финансовия директор.</p>}

        {verified && (
          <>
            <div className="grid gap-3 max-h-[55dvh] overflow-y-auto pr-1" aria-live="polite">
              {messages.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="text-left text-sm px-3 py-2 rounded-lg border border-c700 hover:border-c500 hover:bg-c800 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-4 py-3 text-[15px] whitespace-pre-wrap max-w-[90%] ${
                    m.role === "user" ? "justify-self-end bg-c700" : "justify-self-start bg-c800 border border-c700"
                  }`}
                >
                  {m.role === "assistant" ? <RichText text={m.text} /> : m.text}
                </div>
              ))}
              {busy && <p className="font-mono text-xs text-c300">Асистентът търси в базата…</p>}
              <div ref={endRef} />
            </div>
            {error && (
              <div className="mt-3">
                <Alert tone="error">{error}</Alert>
              </div>
            )}
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <label htmlFor="cfo-input" className="sr-only">
                Въпрос към асистента
              </label>
              <input
                id="cfo-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={2000}
                placeholder="напр. Кой има най-много отказани разходи?"
                className="flex-1 min-w-0 h-11 rounded-lg bg-core border border-c700 hover:border-c500 focus:border-info outline-none px-3 text-[15px] font-normal placeholder:text-c500"
              />
              <Button type="submit" busy={busy} disabled={!input.trim()} aria-label="Изпрати въпроса">
                {!busy && <Send className="size-4" strokeWidth={2} aria-hidden />}
                <span className="hidden sm:inline">Изпрати</span>
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
