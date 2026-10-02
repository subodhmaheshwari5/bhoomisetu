import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, Send, MessageSquare, Copy } from "lucide-react";
import { apiPost } from "../services/apiClient";
import { useAIChat } from "../hooks/useAIChat";
import type { AIChatResponse, AISuggestedAction, AISource } from "../types/api";

const DISCLAIMER = "BhoomiSetu AI provides informational and decision-support assistance based on available system records. It does not replace statutory authority, legal advice, or official government decisions.";

function formatMessage(content: string): string {
  return content
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

function ActionButton({ action, onClick }: { action: AISuggestedAction; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 border border-hairline px-3 py-1.5 text-xs font-medium text-navy-900 hover:bg-paper-dim"
    >
      {action.type === "VIEW_CASE" && <MessageSquare className="h-3 w-3" strokeWidth={1.75} />}
      {action.type === "VIEW_PARCEL" && <MessageSquare className="h-3 w-3" strokeWidth={1.75} />}
      {action.type === "VIEW_STAGE" && <MessageSquare className="h-3 w-3" strokeWidth={1.75} />}
      {action.type === "VIEW_COMPENSATION" && <MessageSquare className="h-3 w-3" strokeWidth={1.75} />}
      {action.type === "VIEW_GRIEVANCE" && <MessageSquare className="h-3 w-3" strokeWidth={1.75} />}
      {action.type === "VIEW_DOCUMENT" && <MessageSquare className="h-3 w-3" strokeWidth={1.75} />}
      {action.type === "VIEW_REPORT" && <MessageSquare className="h-3 w-3" strokeWidth={1.75} />}
      {action.type === "VIEW_ANALYTICS" && <MessageSquare className="h-3 w-3" strokeWidth={1.75} />}
      {action.label}
    </button>
  );
}

function SourceChip({ source }: { source: AISource }) {
  return (
    <span className="px-2 py-0.5 bg-navy-50 border border-hairline text-[10px] font-medium text-navy-700">
      {source.label}
    </span>
  );
}

export function AIChatDrawer() {
  const { isOpen, close, context } = useAIChat();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string; data?: AIChatResponse; timestamp: string }>>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [showPrompts, setShowPrompts] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const fetchSuggestedPrompts = useCallback(async () => {
    try {
      const res = await apiPost<string[]>("/ai/suggested-prompts", { context });
      // apiPost unwraps the envelope, so res is string[] directly
      setSuggestedPrompts(Array.isArray(res) ? res : []);
    } catch {
      // Suggested prompts are a convenience, not the feature itself, so a
      // failure here leaves the drawer usable with no prompts shown.
      setSuggestedPrompts([]);
    }
  }, [context]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!isOpen) return;

    // The suggested prompts are derived from the page the user is on, so this
    // refetches when the drawer opens and again if the page context changes
    // underneath it.
    void fetchSuggestedPrompts();
    inputRef.current?.focus();

    // Escape closes the Copilot, matching the dialog role on the panel.
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, close, fetchSuggestedPrompts]);

  async function sendMessage(override?: string) {
    const text = (override ?? input).trim();
    if (!text || sending) return;

    const userMessage = text;
    setInput("");
    setError(null);
    setSending(true);
    setShowPrompts(false);

    const userMsg = { role: "user" as const, content: userMessage, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const conversationHistory = messages.slice(-6).map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp }));
      const res = await apiPost<AIChatResponse>("/ai/chat", {
        message: userMessage,
        context,
        conversationHistory,
      });

      // apiPost already unwraps the { success, data } envelope
      // so res is the AIChatResponse directly
      if (res && typeof res.message === "string" && res.message.trim()) {
        setMessages(prev => [...prev, { role: "assistant", content: res.message, data: res, timestamp: new Date().toISOString() }]);
      } else {
        throw new Error("Failed to get response: empty message");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  /**
   * Routes an assistant action to a real page in this app.
   *
   * Navigation goes through the router rather than `window.location.href`: a
   * full page load would tear down the session's loaded data and refetch it all
   * for what is meant to be a jump to another view.
   */
  function handleActionClick(action: AISuggestedAction) {
    if (!action.targetId && action.type !== "VIEW_ANALYTICS") return;

    switch (action.type) {
      case "VIEW_CASE":
        navigate(`/dashboard/cases/${action.targetId}`);
        break;
      case "VIEW_PARCEL":
        navigate(`/dashboard/map?parcel=${encodeURIComponent(action.targetId!)}`);
        break;
      case "VIEW_COMPENSATION":
        navigate(`/dashboard/compensation?case=${encodeURIComponent(action.targetId!)}`);
        break;
      case "VIEW_GRIEVANCE":
        navigate(`/dashboard/grievances?case=${encodeURIComponent(action.targetId!)}`);
        break;
      case "VIEW_DOCUMENT":
        navigate(`/dashboard/cases/${action.targetId}`);
        break;
      case "VIEW_ANALYTICS":
        // Two different actions share this type. "View Analytics" carries no
        // target and belongs on the analytics dashboard. "View Risk Details"
        // carries a case id, so the user wants that case's risk — landing them
        // on the aggregate dashboard instead would throw the context away.
        if (action.targetId) {
          navigate(`/dashboard/cases/${action.targetId}`);
        } else {
          navigate("/dashboard/analytics");
        }
        break;
      default:
        return;
    }
    close();
  }

  function handleSuggestedPrompt(prompt: string) {
    setInput(prompt);
    sendMessage(prompt);
  }

  function copyMessage(content: string) {
    navigator.clipboard.writeText(content);
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex sm:max-w-xl sm:ml-auto"
      role="dialog"
      aria-modal="true"
      aria-label="BhoomiSetu Copilot"
    >
      <div className="absolute inset-0 bg-black/30" onClick={close} aria-hidden="true" />
      
      <div className="relative flex flex-col w-full max-w-xl h-full bg-white shadow-xl border-l border-hairline flex-1">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3 bg-navy-50">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
            <span className="font-display text-lg text-navy-950">BhoomiSetu Copilot</span>
          </div>
          <div className="flex items-center gap-2">
            {context?.caseId && (
              <span className="px-2 py-0.5 bg-navy-100 border border-hairline text-[10px] font-medium text-navy-700">
                Context: Case {context.caseNumber ?? context.caseId}
              </span>
            )}
            {context?.parcelId && (
              <span className="px-2 py-0.5 bg-navy-100 border border-hairline text-[10px] font-medium text-navy-700">
                Context: Parcel {context.parcelId}
              </span>
            )}
            {context?.ulpin && (
              <span className="px-2 py-0.5 bg-navy-100 border border-hairline text-[10px] font-medium text-navy-700">
                Context: ULPIN {context.ulpin}
              </span>
            )}
            <button
              type="button"
              onClick={close}
              className="grid h-8 w-8 place-items-center border border-hairline text-navy-900 hover:bg-paper-dim"
              aria-label="Close BhoomiSetu Copilot"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && showPrompts && suggestedPrompts.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-slate text-center">Suggested questions:</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {suggestedPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSuggestedPrompt(prompt)}
                    className="text-left p-3 border border-hairline bg-white hover:bg-paper-dim text-sm text-navy-900"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
              <div className={`max-w-[80%] ${msg.role === "user" ? "order-2" : ""}`}>
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm ${
                    msg.role === "user"
                      ? "bg-navy-900 text-white"
                      : "bg-paper-dim text-navy-950"
                  }`}
                >
                  <div dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
                  
                  {msg.data && (
                    <>
                      {msg.data.sources && msg.data.sources.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-white/20">
                          <p className="text-[10px] font-medium mb-1 opacity-70">Sources:</p>
                          <div className="flex flex-wrap gap-1">
                            {msg.data.sources.map((s: AISource, i: number) => (
                              <SourceChip key={i} source={s} />
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {msg.data.suggestedActions && msg.data.suggestedActions.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-white/20">
                          <p className="text-[10px] font-medium mb-1 opacity-70">Actions:</p>
                          <div className="flex flex-wrap gap-1">
                            {msg.data.suggestedActions.map((a: AISuggestedAction, i: number) => (
                              <ActionButton key={i} action={a} onClick={() => handleActionClick(a)} />
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {msg.data.disclaimer && (
                        <button
                          type="button"
                          onClick={() => setShowDisclaimer(!showDisclaimer)}
                          className="mt-2 text-[10px] underline decoration-dotted underline-offset-1 opacity-70 hover:opacity-100"
                        >
                          {showDisclaimer ? "Hide disclaimer" : "Show disclaimer"}
                        </button>
                      )}
                    </>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-slate">
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  {msg.role === "assistant" && (
                    <button
                      type="button"
                      onClick={() => copyMessage(msg.content)}
                      className="hover:text-navy-700"
                      aria-label="Copy message"
                    >
                      <Copy className="h-3 w-3" strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {sending && (
            <div className="flex gap-3 justify-start">
              <div className="max-w-[80%] px-4 py-2.5 bg-paper-dim text-navy-950 rounded-2xl text-sm animate-pulse">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-navy-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-navy-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-navy-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="border-t border-danger/30 bg-danger-bg px-4 py-2">
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-hairline p-4 bg-white">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              placeholder="Ask about cases, parcels, stages, compensation, grievances..."
              rows={1}
              className="flex-1 border border-hairline px-3 py-2 text-sm text-navy-900 placeholder:text-slate focus:border-navy-500 focus:outline-none resize-none min-h-[44px] max-h-32"
              aria-label="Chat message"
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={sending || !input.trim()}
              className="flex-shrink-0 grid h-10 w-10 place-items-center bg-navy-900 text-white hover:bg-navy-800 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          <p className="mt-2 text-[10px] text-slate text-center">
            {DISCLAIMER}
          </p>
        </div>
      </div>
    </div>
  );
}