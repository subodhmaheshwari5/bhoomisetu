import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { MapPin, Banknote, MessageSquareWarning, UserRound, X } from "lucide-react";
import { PublicLayout } from "../layouts/PublicLayout";
import { DemoTag } from "../components/ui/DemoTag";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "../components/ui/AsyncState";
import { CaseProgressChecklist } from "../components/landowner/CaseProgressChecklist";
import { useAuth } from "../features/auth/useAuth";
import { useApi } from "../hooks/useApi";
import { apiGet, apiPost, ApiRequestError } from "../services/apiClient";
import type { ApiCase, ApiCompensation, ApiGrievance, ApiParcel } from "../types/api";

const CATEGORIES = [
  "Compensation",
  "Ownership",
  "Survey",
  "Documentation",
  "Rehabilitation",
  "Consent/Dispute",
  "Other",
] as const;

function formatAmount(value: string | null): string {
  if (value === null) return "Not yet assessed";
  const amount = Number(value);
  return Number.isNaN(amount) ? "Not yet assessed" : `₹${amount.toLocaleString("en-IN")}`;
}

function LandingHero() {
  return (
    <section className="border-b border-hairline bg-navy-950 text-white">
      <div className="mx-auto max-w-(--container-content) px-5 py-20 sm:px-8 sm:py-28">
        <div className="max-w-2xl">
          <p className="font-mono text-xs tracking-wide text-gold-400">Landowner Portal</p>
          <h1 className="mt-4 font-display text-4xl leading-tight text-white">
            Track Your Land Acquisition Case
          </h1>
          <p className="mt-4 text-base leading-relaxed text-navy-100/75">
            See exactly where your case stands, what your compensation status
            is, and raise a grievance directly — without visiting an office.
          </p>
          <Link
            to="/login"
            className="mt-8 inline-flex items-center justify-center gap-2 bg-gold-400 px-6 py-3 text-sm font-medium text-navy-950 hover:bg-gold-500"
          >
            <UserRound className="h-4 w-4" strokeWidth={1.75} />
            Sign In
          </Link>
          <p className="mt-4 text-xs text-navy-100/50">
            Demo account: landowner@bhoomisetu.demo / demo1234
          </p>
        </div>
      </div>
    </section>
  );
}

function GrievanceForm({ cases, onSubmitted }: { cases: ApiCase[]; onSubmitted: () => void }) {
  const [caseId, setCaseId] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Compensation");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await apiPost<ApiGrievance>("/grievances", {
        caseId: caseId || undefined,
        category,
        description,
      });
      setConfirmation(`Grievance ${created.grievanceNumber} submitted. You can track its status below.`);
      setDescription("");
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not submit the grievance.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return <p className="text-sm text-success">{confirmation}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {cases.length > 0 && (
        <div>
          <label htmlFor="grievance-case" className="block text-xs font-medium text-ink-soft">
            Related case (optional)
          </label>
          <select
            id="grievance-case"
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            className="mt-1 w-full border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
          >
            <option value="">Not linked to a specific case</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="grievance-category" className="block text-xs font-medium text-ink-soft">
          Category
        </label>
        <select
          id="grievance-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
          className="mt-1 w-full border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="grievance-description" className="block text-xs font-medium text-ink-soft">
          Describe the issue
        </label>
        <textarea
          id="grievance-description"
          required
          minLength={10}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="At least 10 characters…"
          className="mt-1 w-full border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-slate focus:border-navy-500 focus:outline-none"
        />
      </div>
      {error && (
        <p role="alert" className="border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Submit Grievance"}
      </button>
    </form>
  );
}

function MyLandDashboard() {
  const parcelsQuery = useApi(() => apiGet<ApiParcel[]>("/landowner/me/parcels"), []);
  const casesQuery = useApi(() => apiGet<ApiCase[]>("/landowner/me/cases"), []);
  const compensationQuery = useApi(() => apiGet<ApiCompensation[]>("/landowner/me/compensation"), []);
  const grievancesQuery = useApi(() => apiGet<ApiGrievance[]>("/landowner/me/grievances"), []);
  const [showGrievanceForm, setShowGrievanceForm] = useState(false);

  const loading = parcelsQuery.loading || casesQuery.loading || compensationQuery.loading || grievancesQuery.loading;
  const error = parcelsQuery.error ?? casesQuery.error ?? compensationQuery.error ?? grievancesQuery.error;

  if (loading) return <LoadingBlock label="Loading your land records…" />;

  if (error) {
    return (
      <ErrorBlock
        message={error}
        onRetry={() => {
          parcelsQuery.refetch();
          casesQuery.refetch();
          compensationQuery.refetch();
          grievancesQuery.refetch();
        }}
      />
    );
  }

  const parcels = parcelsQuery.data ?? [];
  const cases = casesQuery.data ?? [];
  const compensation = compensationQuery.data ?? [];
  const grievances = grievancesQuery.data ?? [];

  return (
    <div className="space-y-8">
      <section>
        <h2 className="flex items-center gap-2 font-display text-xl text-navy-950">
          <MapPin className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
          My Land
        </h2>

        {parcels.length === 0 ? (
          <div className="mt-4">
            <EmptyBlock message="No land parcels are linked to your account yet." />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {parcels.map((parcel) => {
              const linkedCase = cases.find((c) => c.parcelId === parcel.id);
              return (
                <div key={parcel.id} className="border border-hairline bg-white p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-mono text-sm text-navy-950">{parcel.ulpin}</p>
                    <p className="text-xs text-ink-soft">
                      {Number(parcel.areaHectares).toFixed(1)} ha · {parcel.districtName}
                    </p>
                  </div>
                  {linkedCase ? (
                    <div className="mt-4 border-t border-hairline pt-4">
                      <p className="text-xs text-ink-soft">
                        Project: <span className="text-navy-950">{linkedCase.projectName}</span> · Case{" "}
                        <span className="font-mono text-navy-950">{linkedCase.caseNumber}</span>
                      </p>
                      <div className="mt-3">
                        <CaseProgressChecklist acquisitionCase={linkedCase} />
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-ink-soft">Status: Compensation Pending</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="flex items-center gap-2 font-display text-xl text-navy-950">
          <Banknote className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
          Compensation
        </h2>
        {compensation.length === 0 ? (
          <div className="mt-4">
            <EmptyBlock message="No compensation records yet." />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto border border-hairline bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline bg-paper-dim/50 text-xs text-slate">
                  <th className="px-4 py-3 font-mono font-medium">Case</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Approval</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {compensation.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-mono text-navy-950">{c.caseNumber}</td>
                    <td className="px-4 py-3 text-ink-soft">{formatAmount(c.assessmentAmount)}</td>
                    <td className="px-4 py-3 text-ink-soft capitalize">{c.approvalStatus.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-ink-soft capitalize">{c.disbursementStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-slate">
          Demo values — not real financial or legal figures.
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-xl text-navy-950">
            <MessageSquareWarning className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
            My Grievances
          </h2>
          <button
            type="button"
            onClick={() => setShowGrievanceForm((v) => !v)}
            className="border border-hairline px-3 py-1.5 text-xs font-medium text-navy-900 hover:bg-paper-dim"
          >
            {showGrievanceForm ? "Cancel" : "Submit Grievance"}
          </button>
        </div>

        {showGrievanceForm && (
          <div className="relative mt-4 border border-hairline bg-white p-5">
            <button
              type="button"
              onClick={() => setShowGrievanceForm(false)}
              aria-label="Close"
              className="absolute right-3 top-3 text-slate hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
            <GrievanceForm cases={cases} onSubmitted={() => grievancesQuery.refetch()} />
          </div>
        )}

        {grievances.length === 0 ? (
          <div className="mt-4">
            <EmptyBlock message="No grievances found. Once you submit one, it will appear here." />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-hairline border border-hairline bg-white">
            {grievances.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-mono text-sm text-navy-950">{g.grievanceNumber}</p>
                  <p className="text-xs text-ink-soft">{g.category}</p>
                </div>
                <span className="text-xs font-medium capitalize text-ink-soft">{g.status.replace("_", " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function LandownerPortalPage() {
  const { isAuthenticated } = useAuth();

  return (
    <PublicLayout>
      {!isAuthenticated ? (
        <LandingHero />
      ) : (
        <div className="mx-auto max-w-(--container-content) px-5 py-10 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-2xl text-navy-950">My Land Acquisition</h1>
            <DemoTag label="Live data · demo dataset" />
          </div>
          <div className="mt-8">
            <MyLandDashboard />
          </div>
        </div>
      )}
    </PublicLayout>
  );
}
