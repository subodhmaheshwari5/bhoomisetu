import { useSyncExternalStore } from "react";
import type { AIChatRequest } from "../types/api";

type AIChatContext = NonNullable<AIChatRequest["context"]>;

interface AIChatState {
  isOpen: boolean;
  context: AIChatContext;
}

/**
 * Single source of truth for BhoomiSetu Copilot open/close state and context.
 *
 * The Copilot is opened from the dashboard topbar but must receive page context
 * (case / parcel / ULPIN) from whichever dashboard page is mounted. A plain
 * `useState` hook cannot serve both callers, because each `useAIChat()` call
 * would get its own independent copy. This module therefore keeps one store
 * shared by every caller via `useSyncExternalStore`.
 *
 * The action functions are defined once at module scope, not per render. If
 * they were recreated on each render they would be new references in every
 * `useEffect` dependency array, causing an endless render loop.
 */
let state: AIChatState = { isOpen: false, context: {} };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AIChatState {
  return state;
}

function sameContext(a: AIChatContext, b: AIChatContext): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof AIChatContext>;
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/** Open the Copilot. A context argument replaces the stored context. */
function open(newContext?: AIChatContext) {
  const context = newContext ?? state.context;
  if (state.isOpen && sameContext(state.context, context)) return;
  state = { isOpen: true, context };
  emit();
}

/**
 * Close the Copilot. Context is intentionally preserved so that reopening on the
 * same page still reports the correct case/parcel to the backend.
 */
function close() {
  if (!state.isOpen) return;
  state = { ...state, isOpen: false };
  emit();
}

/** Replace the context, e.g. when navigating to a different dashboard page. */
function setContext(newContext: AIChatContext) {
  if (sameContext(state.context, newContext)) return;
  state = { ...state, context: newContext };
  emit();
}

/** Merge additional fields into the existing context. */
function updateContext(newContext: AIChatContext) {
  const context = { ...state.context, ...newContext };
  if (sameContext(state.context, context)) return;
  state = { ...state, context };
  emit();
}

export function useAIChat() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    isOpen: current.isOpen,
    context: current.context,
    open,
    close,
    setContext,
    updateContext,
  };
}
