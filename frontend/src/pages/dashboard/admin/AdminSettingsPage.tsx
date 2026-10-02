import { useMemo, useState } from "react";
import { Settings, Save, Lock, AlertTriangle } from "lucide-react";
import { DemoTag } from "../../../components/ui/DemoTag";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "../../../components/ui/AsyncState";
import { useApi } from "../../../hooks/useApi";
import { apiGet, apiPatch, ApiRequestError } from "../../../services/apiClient";
import type { ApiSystemSetting } from "../../../types/api";

/**
 * Shared empty result. A `?? []` literal would be a new array on every render,
 * which defeats the category memoization below.
 */
const NO_SETTINGS: ApiSystemSetting[] = [];

/**
 * Settings whose stored JSON is a string. Anything else is shown as read-only
 * JSON, because a structured value (an SLA map, a threshold object) is not
 * something an administrator should be retyping by hand into a text box.
 */
function isTextValue(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function SettingRow({
  setting,
  onSaved,
}: {
  setting: ApiSystemSetting;
  onSaved: () => void;
}) {
  const editable = !setting.isSecret && isTextValue(setting.value);
  const [draft, setDraft] = useState(String(setting.value));
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const dirty = editable && draft !== String(setting.value);

  async function save() {
    setState("saving");
    setError(null);
    try {
      // A number or boolean is stored back as its JSON type, so a threshold is
      // not silently turned into the string "30".
      const original = setting.value;
      const value: unknown =
        typeof original === "number" || typeof original === "boolean" ? JSON.parse(draft) : draft;
      await apiPatch<ApiSystemSetting>(
        `/admin/settings/${encodeURIComponent(setting.key)}`,
        { value },
      );
      onSaved();
      setState("idle");
    } catch (err) {
      setState("error");
      setError(err instanceof ApiRequestError ? err.message : "Could not save this setting.");
    }
  }

  return (
    <div className="border border-hairline bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[200px] flex-1">
          <p className="flex items-center gap-2 font-mono text-sm text-navy-950">
            {setting.key}
            {setting.isSecret && (
              <span className="inline-flex items-center gap-1 bg-neutral-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral">
                <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                Secret
              </span>
            )}
          </p>
          {setting.description && (
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">{setting.description}</p>
          )}
          <p className="mt-1 text-[11px] text-slate">
            Last updated {new Date(setting.updatedAt).toLocaleString()}
            {setting.updatedByName ? ` by ${setting.updatedByName}` : ""}
          </p>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          {setting.isSecret ? (
            <p className="flex items-center gap-1.5 text-xs text-slate">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Managed outside the application
            </p>
          ) : editable ? (
            <>
              <label htmlFor={`setting-${setting.key}`} className="sr-only">
                Value for {setting.key}
              </label>
              <input
                id={`setting-${setting.key}`}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full min-w-[160px] flex-1 border border-hairline bg-white px-3 py-1.5 text-sm text-navy-900 focus:border-navy-500 focus:outline-none sm:w-56 sm:flex-none"
              />
              <button
                type="button"
                onClick={save}
                disabled={!dirty || state === "saving"}
                className="inline-flex items-center gap-1.5 border border-navy-700 bg-navy-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:border-hairline disabled:bg-hairline disabled:text-slate"
              >
                <Save className="h-3 w-3" aria-hidden="true" />
                {state === "saving" ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <pre className="max-w-[280px] overflow-x-auto bg-paper-dim px-3 py-1.5 font-mono text-xs text-navy-900">
              {JSON.stringify(setting.value, null, 2)}
            </pre>
          )}
        </div>
      </div>

      {state === "error" && error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-danger" role="alert">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

export function AdminSettingsPage() {
  const query = useApi(() => apiGet<ApiSystemSetting[]>("/admin/settings"), []);
  const [category, setCategory] = useState("");

  const settings = query.data ?? NO_SETTINGS;
  const categories = useMemo(
    () => [...new Set(settings.map((s) => s.category))].sort(),
    [settings],
  );
  const visible = category ? settings.filter((s) => s.category === category) : settings;

  /**
   * Refetches after a save so the page shows the value the server actually
   * stored, along with who changed it and when, rather than the local guess.
   */
  function handleSaved() {
    query.refetch();
  }

  return (
    <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-navy-950">
            <Settings className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
            System Settings
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Workflow, SLA, risk, notification, and AI configuration. Every change is written to the audit log.
          </p>
        </div>
        <DemoTag label="Live data · demo dataset" />
      </div>

      {query.loading && <LoadingBlock label="Loading settings…" />}
      {!query.loading && query.error && (
        <div className="mt-6">
          <ErrorBlock message={query.error} onRetry={query.refetch} />
        </div>
      )}

      {!query.loading && !query.error && settings.length === 0 && (
        <div className="mt-6">
          <EmptyBlock message="No settings are configured." />
        </div>
      )}

      {!query.loading && !query.error && settings.length > 0 && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCategory("")}
              className={
                category === ""
                  ? "border border-navy-700 bg-navy-700 px-3 py-1 text-xs font-medium text-white"
                  : "border border-hairline bg-white px-3 py-1 text-xs font-medium text-ink-soft hover:bg-paper-dim"
              }
            >
              All categories
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={
                  category === c
                    ? "border border-navy-700 bg-navy-700 px-3 py-1 text-xs font-medium text-white"
                    : "border border-hairline bg-white px-3 py-1 text-xs font-medium text-ink-soft hover:bg-paper-dim"
                }
              >
                {c}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs text-slate">
            Showing {visible.length} of {settings.length} settings. Secret values are managed through deployment
            configuration and are never readable through this API.
          </p>

          <div className="mt-3 space-y-2">
            {visible.map((setting) => (
              <SettingRow key={setting.key} setting={setting} onSaved={handleSaved} />            ))}
          </div>
        </>
      )}
    </div>
  );
}