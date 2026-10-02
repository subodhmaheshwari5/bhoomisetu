import { useMemo, useState } from "react";
import { Users, Search as SearchIcon } from "lucide-react";
import { DemoTag } from "../../../components/ui/DemoTag";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "../../../components/ui/AsyncState";
import { StatCard } from "../../../components/ui/StatCard";
import { useApi } from "../../../hooks/useApi";
import { apiGet } from "../../../services/apiClient";
import { ROLE_LABELS } from "../../../data/authData";
import type { ApiAdminUser } from "../../../types/api";

/**
 * Shared empty result. A `?? []` literal would be a new array on every render,
 * which defeats the memoization below and re-filters the list each time.
 */
const NO_USERS: ApiAdminUser[] = [];

export function AdminUsersPage() {
  const query = useApi(() => apiGet<ApiAdminUser[]>("/admin/users"), []);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const users = query.data ?? NO_USERS;

  const roles = useMemo(
    () => [...new Set(users.map((u) => u.role))].sort(),
    [users],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (!term) return true;
      return (
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        (u.districtName ?? "").toLowerCase().includes(term)
      );
    });
  }, [users, search, roleFilter]);

  // District-scoped roles are meaningless without a district, so an account that
  // holds one but has none assigned is worth surfacing rather than hiding.
  const unassigned = users.filter((u) => u.districtId === null).length;

  return (
    <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-navy-950">
            <Users className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
            Users
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Accounts, roles, and district assignment. Passwords are never returned by the API.
          </p>
        </div>
        <DemoTag label="Live data · demo dataset" />
      </div>

      {query.loading && <LoadingBlock label="Loading users…" />}
      {!query.loading && query.error && (
        <div className="mt-6">
          <ErrorBlock message={query.error} onRetry={query.refetch} />
        </div>
      )}

      {!query.loading && !query.error && users.length === 0 && (
        <div className="mt-6">
          <EmptyBlock message="No accounts found." />
        </div>
      )}

      {!query.loading && !query.error && users.length > 0 && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Accounts" value={users.length} icon={Users} />
            <StatCard label="Roles in use" value={roles.length} icon={Users} />
            <StatCard label="District-scoped" value={users.length - unassigned} icon={Users} />
            <StatCard
              label="Global scope"
              value={unassigned}
              icon={Users}
              tone={unassigned > 0 ? "warning" : "default"}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <label
                htmlFor="user-search"
                className="block text-[11px] font-medium uppercase tracking-wide text-slate"
              >
                Search
              </label>
              <div className="relative mt-1">
                <SearchIcon
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <input
                  id="user-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, email, or district"
                  className="w-full border border-hairline bg-white py-2 pl-8 pr-3 text-sm text-navy-900 focus:border-navy-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="min-w-[200px]">
              <label
                htmlFor="user-role"
                className="block text-[11px] font-medium uppercase tracking-wide text-slate"
              >
                Role
              </label>
              <select
                id="user-role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="mt-1 w-full border border-hairline bg-white px-3 py-2 text-sm text-navy-900 focus:border-navy-500 focus:outline-none"
              >
                <option value="">All roles</option>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto border border-hairline bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline bg-paper-dim/50 text-xs text-slate">
                  <th scope="col" className="px-4 py-3 font-medium">Name</th>
                  <th scope="col" className="px-4 py-3 font-medium">Email</th>
                  <th scope="col" className="px-4 py-3 font-medium">Role</th>
                  <th scope="col" className="px-4 py-3 font-medium">District scope</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {visible.map((user) => (
                  <tr key={user.id} className="hover:bg-paper-dim/40">
                    <td className="px-4 py-3 text-navy-950">{user.name}</td>
                    <td className="px-4 py-3 text-ink-soft">{user.email}</td>
                    <td className="px-4 py-3 text-ink-soft">{ROLE_LABELS[user.role]}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {user.districtName ?? <span className="text-slate">All districts</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 && (
              <div className="px-4 py-2">
                <EmptyBlock message="No accounts match the current filters." />
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-slate">
            Showing {visible.length} of {users.length} accounts.
          </p>
        </>
      )}
    </div>
  );
}