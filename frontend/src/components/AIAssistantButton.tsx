import { MessageSquare } from "lucide-react";
import { useAIChat } from "../hooks/useAIChat";
import { AIChatDrawer } from "./AIChatDrawer";

export function AIAssistantButton() {
  const { isOpen, open } = useAIChat();

  return (
    <>
      <button
        type="button"
        onClick={() => open()}
        className="relative flex items-center gap-2 px-3 py-2 bg-navy-900 text-white text-sm font-medium hover:bg-navy-800 border border-hairline"
        aria-label="Ask BhoomiSetu"
        aria-expanded={isOpen}
      >
        <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
        <span className="hidden sm:inline">Ask BhoomiSetu</span>
      </button>

      {/* Single Copilot instance for the whole dashboard. Context is supplied by
          whichever page is mounted via useAIChat().setContext(). */}
      <AIChatDrawer />
    </>
  );
}
