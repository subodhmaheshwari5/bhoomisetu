import { useCallback, useEffect, useState } from "react";
import { ApiRequestError } from "../services/apiClient";

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  errorStatus: number | null;
}

/**
 * Wraps any API call with the loading/error/data states every connected
 * screen needs (section 13 of the integration brief). `deps` works like
 * useEffect's dependency array — pass the values the fetch depends on.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<UseApiState<T>>({ data: null, loading: true, error: null, errorStatus: null });

  const load = useCallback(() => {
    setState((prev) => ({ data: prev.data, loading: true, error: null, errorStatus: null }));
    fetcher()
      .then((data) => setState({ data, loading: false, error: null, errorStatus: null }))
      .catch((err: unknown) => {
        const message = err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.";
        const status = err instanceof ApiRequestError ? (err.status ?? null) : null;
        setState({ data: null, loading: false, error: message, errorStatus: status });
      });
    // Deliberately spread — `deps` plays the role of a dependency array here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, refetch: load };
}
