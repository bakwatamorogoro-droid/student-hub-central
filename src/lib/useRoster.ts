import { useCallback, useEffect, useState } from "react";
import { loadRoster } from "@/lib/groupRoster";
import type { RosterEntry } from "@/lib/groupAssignment";

/**
 * The whole cohort, fetched once per page load and shared by every card that
 * needs it. Grouping cannot be answered from a single row — a group is only
 * complete relative to its classmates — so each of these cards would otherwise
 * pull 1500+ rows on its own.
 */
let cache: RosterEntry[] | null = null;

export function useRoster() {
  const [roster, setRoster] = useState<RosterEntry[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);
  const [error, setError] = useState<Error | null>(null);

  const fetchRoster = useCallback(async (force: boolean) => {
    if (cache && !force) {
      setRoster(cache);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await loadRoster();
      cache = rows;
      setRoster(rows);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRoster(false);
  }, [fetchRoster]);

  return { roster, loading, error, reload: () => fetchRoster(true) };
}
