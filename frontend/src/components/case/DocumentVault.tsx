import { FolderKanban, Eye, Download, Check, X, Upload } from "lucide-react";
import type { ApiDocument } from "../../types/api";
import { DocumentStatusBadge } from "../ui/StatusBadge";

function ActionButton({ icon: Icon, label }: { icon: typeof Eye; label: string }) {
  return (
    <button
      type="button"
      title={`${label} — prototype only, not wired to storage`}
      className="grid h-7 w-7 place-items-center border border-hairline text-navy-900 hover:bg-paper-dim"
      aria-label={label}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
    </button>
  );
}

function DocumentRow({ document }: { document: ApiDocument }) {
  return (
    <li className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-mono text-sm text-navy-950">{document.fileName}</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {document.category} · uploaded by {document.uploadedBy} on {document.uploadedAt}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <DocumentStatusBadge status={document.status} />
        <div className="flex gap-1.5">
          <ActionButton icon={Eye} label="Preview" />
          <ActionButton icon={Download} label="Download" />
          {document.status === "pending_verification" && (
            <>
              <ActionButton icon={Check} label="Verify" />
              <ActionButton icon={X} label="Reject" />
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export function DocumentVault({ documents }: { documents: ApiDocument[] }) {
  return (
    <section id="documents" className="scroll-mt-6 border border-hairline bg-white" aria-labelledby="document-vault-heading">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <h2 id="document-vault-heading" className="flex items-center gap-2 font-display text-lg text-navy-950">
          <FolderKanban className="h-4 w-4 text-navy-700" strokeWidth={1.75} aria-hidden="true" />
          Digital Document Vault
        </h2>
        <button
          type="button"
          title="Upload — prototype only, not wired to storage"
          className="flex items-center gap-1.5 border border-hairline px-3 py-1.5 text-xs font-medium text-navy-900 hover:bg-paper-dim"
        >
          <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />
          Upload Document
        </button>
      </div>

      {documents.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-soft">
          No documents uploaded for this case yet.
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {documents.map((document) => (
            <DocumentRow key={document.id} document={document} />
          ))}
        </ul>
      )}

      <p className="border-t border-hairline px-5 py-3 text-xs text-slate">
        Prototype vault — actions are illustrative only; no files are stored or transmitted.
      </p>
    </section>
  );
}
